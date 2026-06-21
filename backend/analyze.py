import os
import io
import json
import math
import base64
import re
from typing import Optional, Any

import pandas as pd
import numpy as np
import sentry_sdk


def _num(x: Any) -> Optional[float]:
    if x is None:
        return None
    try:
        f = float(x)
    except (TypeError, ValueError):
        return None
    if math.isnan(f) or math.isinf(f):
        return None
    return round(f, 4)


def _quality_level(score: float) -> str:
    if score >= 90:
        return "Excellent"
    if score >= 75:
        return "Good"
    if score >= 50:
        return "Risky"
    return "Poor"


def _finalize_df(df: pd.DataFrame) -> pd.DataFrame:
    df = df.reset_index(drop=True)
    if df.shape[0] == 0 or df.shape[1] == 0:
        raise ValueError("No valid data rows or columns")
    return df


def _parse_table(text: str) -> pd.DataFrame:
    df = pd.read_csv(io.StringIO(text), sep=None, engine="python")
    return _finalize_df(df)


def _read_excel(file_bytes: bytes) -> pd.DataFrame:
    df = pd.read_excel(io.BytesIO(file_bytes), engine="openpyxl")
    return _finalize_df(df)


def _image_to_table_text(file_base64: str, media_type: str) -> str:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("Recognizing images requires ANTHROPIC_API_KEY, which is not configured")

    import anthropic
    client = anthropic.Anthropic(api_key=api_key)

    response = client.messages.create(
        model="claude-opus-4-8",
        max_tokens=4000,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": file_base64,
                    },
                },
                {
                    "type": "text",
                    "text": (
                        "This is a photo or screenshot of an experiment data table. Convert the table into CSV: "
                        "the first row is the column names, each following row is one record, and cells are separated by commas. "
                        "Output only the CSV itself, with no explanatory text and no ``` code fences. "
                        "IMPORTANT: All output must be in English only. Do not use any Chinese characters."
                    ),
                },
            ],
        }],
    )

    text = next(
        (block.text for block in response.content if block.type == "text"),
        "",
    ).strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text
        text = text.rsplit("```", 1)[0].strip()
    if not text:
        raise ValueError("Could not extract any table content from the image")
    return text


def _load_dataframe(
    input_kind: str,
    csv_text: Optional[str],
    file_base64: Optional[str],
    media_type: Optional[str],
) -> pd.DataFrame:
    kind = (input_kind or "text").lower()

    if kind == "xlsx":
        if not file_base64:
            raise ValueError("Missing Excel file content")
        return _read_excel(base64.b64decode(file_base64))

    if kind == "image":
        if not file_base64:
            raise ValueError("Missing image content")
        table_text = _image_to_table_text(file_base64, media_type or "image/png")
        return _parse_table(table_text)

    if not (csv_text and csv_text.strip()):
        raise ValueError("No data text provided")
    return _parse_table(csv_text)


def _numeric_frame(df: pd.DataFrame) -> pd.DataFrame:
    return df.apply(pd.to_numeric, errors="coerce")


def _numeric_columns(df: pd.DataFrame, num_df: pd.DataFrame) -> list[str]:
    cols = []
    n = len(df)
    for col in df.columns:
        valid = int(num_df[col].notna().sum())
        if n > 0 and valid >= 0.5 * n:
            cols.append(col)
    return cols


def _classify_bad_cell(raw: Any) -> str:
    s = str(raw).strip()
    cleaned = (s.replace(",", "").replace("，", "")
                .replace("%", "").replace("$", "").replace("¥", "")
                .replace(" ", "").replace("　", ""))
    try:
        float(cleaned)
        return "format"
    except ValueError:
        pass
    m = re.match(r"^[-+]?\d*\.?\d+", cleaned)
    if m:
        try:
            float(m.group())
            return "format"
        except ValueError:
            pass
    return "non_numeric"


def _bad_numeric_cells(
    df: pd.DataFrame, num_df: pd.DataFrame, numeric_cols: list[str],
) -> list[tuple]:
    out: list[tuple] = []
    for col in numeric_cols:
        bad_mask = df[col].notna() & num_df[col].isna()
        for r in df.index[bad_mask].tolist():
            raw = df[col].loc[r]
            out.append((int(r), str(col), raw, _classify_bad_cell(raw)))
    return out


_TIME_COL_HINTS = ("time", "时间", "timestamp", "date", "日期", "datetime")


def _find_time_column(df: pd.DataFrame) -> Optional[str]:
    for col in df.columns:
        name = str(col).strip().lower()
        if any(h in name for h in _TIME_COL_HINTS):
            return col
    return None


def _time_gap_anomalies(df: pd.DataFrame) -> list[tuple]:
    col = _find_time_column(df)
    if col is None:
        return []
    series = pd.to_numeric(df[col], errors="coerce")
    if series.notna().sum() < 3:
        dt = pd.to_datetime(df[col], errors="coerce")
        if dt.notna().sum() < 3:
            return []
        series = dt.astype("int64") / 1e9
    diffs = series.diff()
    nonzero = diffs.dropna()
    nonzero = nonzero[nonzero != 0]
    if len(nonzero) < 2:
        return []
    step = float(nonzero.median())
    if step == 0:
        return []
    out: list[tuple] = []
    for r in df.index[1:]:
        d = diffs.loc[r]
        if pd.isna(d):
            continue
        d = float(d)
        if d <= 0:
            out.append((int(r), str(col),
                        f"Row {int(r)}: time is not increasing (gap from previous row is {_num(d)}, likely a duplicate or out-of-order record)",
                        "high"))
        elif abs(d - step) > 0.5 * abs(step):
            out.append((int(r), str(col),
                        f"Row {int(r)}: time interval {_num(d)} deviates from the normal step {_num(step)} (likely a missed or extra sample)",
                        "medium"))
    return out


def _detect_issues(
    df: pd.DataFrame,
    num_df: pd.DataFrame,
    numeric_cols: list[str],
) -> list[dict]:
    issues: list[dict] = []

    for col in df.columns:
        null_rows = df.index[df[col].isna()].tolist()
        for r in null_rows:
            issues.append({
                "type": "missing",
                "severity": "medium",
                "row_index": int(r),
                "column": str(col),
                "message": f"Row {int(r)}: column '{col}' has a missing value (empty)",
            })

    dup_mask = df.duplicated()
    for r in df.index[dup_mask].tolist():
        issues.append({
            "type": "duplicate",
            "severity": "low",
            "row_index": int(r),
            "message": f"Row {int(r)} is an exact duplicate of an earlier row",
        })

    for col in numeric_cols:
        series = num_df[col].dropna()
        if len(series) < 4:
            continue
        q1 = series.quantile(0.25)
        q3 = series.quantile(0.75)
        iqr = q3 - q1
        if iqr <= 0:
            continue
        lower_1_5, upper_1_5 = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        lower_3, upper_3 = q1 - 3.0 * iqr, q3 + 3.0 * iqr

        out_mask = (num_df[col] < lower_1_5) | (num_df[col] > upper_1_5)
        for r in df.index[out_mask].tolist():
            val = num_df[col].loc[r]
            extreme = (val < lower_3) or (val > upper_3)
            issues.append({
                "type": "outlier",
                "severity": "high" if extreme else "medium",
                "row_index": int(r),
                "column": str(col),
                "message": (
                    f"Row {int(r)}: column '{col}' value {_num(val)} "
                    f"is outside the normal range [{_num(lower_1_5)}, {_num(upper_1_5)}]"
                    + (" (extreme outlier)" if extreme else "")
                ),
                "value": _num(val),
            })

    for r, col, raw, kind in _bad_numeric_cells(df, num_df, numeric_cols):
        if kind == "format":
            issues.append({
                "type": "format",
                "severity": "medium",
                "row_index": r,
                "column": col,
                "message": f"Row {r}: column '{col}' value \"{raw}\" has a formatting issue (thousands separators / units / symbols, etc.; can be converted to a number after cleaning)",
                "value": str(raw),
            })
        else:
            issues.append({
                "type": "non_numeric",
                "severity": "medium",
                "row_index": r,
                "column": col,
                "message": f"Row {r}: column '{col}' value \"{raw}\" is not a number (this column should be numeric)",
                "value": str(raw),
            })

    for r, col, msg, sev in _time_gap_anomalies(df):
        issues.append({
            "type": "time_gap",
            "severity": sev,
            "row_index": r,
            "column": col,
            "message": msg,
        })

    severity_rank = {"high": 0, "medium": 1, "low": 2}
    issues.sort(key=lambda it: severity_rank.get(it["severity"], 3))
    return issues[:100]


def _compute_statistics(num_df: pd.DataFrame, numeric_cols: list[str]) -> dict:
    stats: dict[str, dict] = {}
    for col in numeric_cols:
        series = num_df[col].dropna()
        if series.empty:
            continue
        stats[str(col)] = {
            "min": _num(series.min()),
            "max": _num(series.max()),
            "mean": _num(series.mean()),
            "median": _num(series.median()),
        }
    return stats


def _quality_score(
    df: pd.DataFrame,
    num_df: pd.DataFrame,
    numeric_cols: list[str],
) -> float:
    n_rows, n_cols = df.shape
    total_cells = n_rows * n_cols

    missing_count = int(df.isna().sum().sum())
    missing_ratio = missing_count / total_cells if total_cells else 0.0

    dup_count = int(df.duplicated().sum())
    dup_ratio = dup_count / n_rows if n_rows else 0.0

    outlier_count = 0
    for col in numeric_cols:
        series = num_df[col].dropna()
        if len(series) < 4:
            continue
        q1, q3 = series.quantile(0.25), series.quantile(0.75)
        iqr = q3 - q1
        if iqr <= 0:
            continue
        lower, upper = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        outlier_count += int(((num_df[col] < lower) | (num_df[col] > upper)).sum())
    numeric_cells = n_rows * len(numeric_cols)
    outlier_ratio = outlier_count / numeric_cells if numeric_cells else 0.0

    bad_ratio = len(_bad_numeric_cells(df, num_df, numeric_cols)) / total_cells if total_cells else 0.0

    timegap_ratio = len(_time_gap_anomalies(df)) / n_rows if n_rows else 0.0

    score = (100.0
             - 40.0 * missing_ratio
             - 30.0 * dup_ratio
             - 30.0 * outlier_ratio
             - 30.0 * bad_ratio
             - 20.0 * timegap_ratio)
    score = max(0.0, min(100.0, score))
    return round(score, 1)


def _build_chart_data(
    df: pd.DataFrame,
    num_df: pd.DataFrame,
    numeric_cols: list[str],
) -> list[dict]:
    numeric_set = set(numeric_cols)
    rows: list[dict] = []
    for r in df.index[:500]:
        row_obj: dict[str, Any] = {}
        for col in df.columns:
            if col in numeric_set:
                row_obj[str(col)] = _num(num_df[col].loc[r])
            else:
                raw = df[col].loc[r]
                row_obj[str(col)] = None if pd.isna(raw) else str(raw)
        rows.append(row_obj)
    return rows


AI_EXPLANATION_SCHEMA = {
    "type": "object",
    "properties": {
        "possible_causes": {"type": "array", "items": {"type": "string"}},
        "suggested_actions": {"type": "array", "items": {"type": "string"}},
        "impact_on_conclusion": {"type": "string"},
        "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
    },
    "required": [
        "possible_causes",
        "suggested_actions",
        "impact_on_conclusion",
        "confidence",
    ],
    "additionalProperties": False,
}

ERROR_DIAGNOSIS_SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "issue_index": {"type": "integer"},
            "is_acceptable": {"type": "boolean"},
            "error_type": {
                "type": "string",
                "enum": [
                    "natural_variation",
                    "operation_error",
                    "equipment_error",
                    "recording_error",
                ],
            },
            "related_step": {"type": "string"},
            "suggestion": {"type": "string"},
        },
        "required": [
            "issue_index",
            "is_acceptable",
            "error_type",
            "related_step",
            "suggestion",
        ],
        "additionalProperties": False,
    },
}

AI_COMBINED_SCHEMA = {
    "type": "object",
    "properties": {
        "ai_explanation": AI_EXPLANATION_SCHEMA,
        "error_diagnosis": ERROR_DIAGNOSIS_SCHEMA,
    },
    "required": ["ai_explanation", "error_diagnosis"],
    "additionalProperties": False,
}

AI_SYSTEM_PROMPT = """你是一位严谨的实验数据分析师。用户已经用程序对一份实验数据做了
确定性的质量检测（缺失值、重复行、离群点、各列统计）。你的任务有两部分：

【任务一：整体解读 ai_explanation】
1. 只解读已提供的统计结果与问题，不要编造任何新的数值。
2. possible_causes：从实验/测量角度推测异常的可能成因（具体、可操作）。
3. suggested_actions：给出针对性的数据清洗或后续实验改进建议。
4. impact_on_conclusion：说明这些数据问题会如何影响最终实验结论的可信度。
5. confidence：你对本次解读的置信度（数据越完整、问题越清晰，置信度越高）。

【任务二：逐个错误诊断 error_diagnosis】
对每一个检测到的问题（按它在列表中的序号 issue_index）逐条判断：
- is_acceptable：这个问题是"可接受的自然波动"(true) 还是"需要处理的失误"(false)。
  · 轻微、孤立、符合物理/化学预期的波动 → 通常可接受。
  · 明显偏离、缺失、重复 → 通常不可接受。
- error_type：把不可接受的错误进一步归类（可接受的一般归为 natural_variation）：
  · natural_variation 自然波动（测量本身的随机性，可接受）
  · operation_error  操作失误（如加样错误、计时不准、未控温）
  · equipment_error  设备误差（如仪器未校准、精度不足、污染）
  · recording_error  记录错误（如漏记、重复导出、写错单位）
- related_step：
  · 如果用户提供了"实验步骤/设备清单"，请指出最可能导致该问题的【具体步骤】，
    并简述为什么是这一步。
  · 如果没有提供步骤信息，请直接写"未提供实验步骤，无法定位具体环节"。
- suggestion：针对该问题、该环节的具体改进建议（要可执行）。

【通用铁律】
- error_diagnosis 必须为每一个问题都给出一条，issue_index 与问题列表序号严格对应。
- 所有输出字段（possible_causes、suggested_actions、impact_on_conclusion、related_step、suggestion 等）请使用英文（English）输出，语言客观，不夸大。
- Please respond entirely in English. All content must be in English.
- IMPORTANT: All output must be in English only. Do not use any Chinese characters."""


def _fallback_ai_explanation(
    issues: list[dict],
    quality_level: str,
) -> dict:
    types = {it["type"] for it in issues}

    causes: list[str] = []
    actions: list[str] = []
    if "missing" in types:
        causes.append("Some data collection failed or records were omitted, resulting in missing values")
        actions.append("Check where the missing values occur; re-measure if needed, or interpolate/remove them before analysis")
    if "duplicate" in types:
        causes.append("Duplicate records may have occurred during data export or entry")
        actions.append("Remove fully duplicated rows before running statistical analysis")
    if "outlier" in types:
        causes.append("Instrument reading fluctuations, operational mistakes, or genuine extreme events produced outliers")
        actions.append("Check each outlier to see whether it is a data-entry error; remove only if it is genuinely anomalous")
    if not causes:
        causes.append("No obvious data quality issues were detected")
        actions.append("The data is fairly clean and can proceed directly to the next analysis step")

    if quality_level in ("Excellent", "Good"):
        impact = "Overall data quality is good, so conclusions drawn from it are fairly reliable."
    elif quality_level == "Risky":
        impact = "The data carries some quality risk; conclusions should be treated with caution and re-checked after cleaning."
    else:
        impact = "Data quality is poor and the current conclusion is highly uncertain; cleaning the data and re-analyzing is strongly recommended."

    return {
        "possible_causes": causes,
        "suggested_actions": actions,
        "impact_on_conclusion": impact,
        "confidence": "low",
    }


def _fallback_error_diagnosis(issues: list[dict], has_steps: bool) -> list[dict]:
    related_default = (
        "(Steps were provided, but the local fallback cannot pinpoint the specific stage; an online AI diagnosis is recommended)"
        if has_steps else "No experiment steps provided, so the specific stage cannot be located"
    )

    out: list[dict] = []
    for i, it in enumerate(issues):
        t = it.get("type")
        sev = it.get("severity")
        if t == "missing":
            etype, acc = "recording_error", False
            sug = "Check the original record and fill in the value; if it cannot be recovered, drop the row during analysis"
        elif t == "duplicate":
            etype, acc = "recording_error", False
            sug = "Review the data export/entry process and remove fully duplicated rows"
        elif t == "outlier":
            if sev == "high":
                etype, acc = "operation_error", False
                sug = "Check whether this point is an operational or reading error; remove it before analysis if it is genuinely anomalous"
            else:
                etype, acc = "natural_variation", True
                sug = "The fluctuation is limited and may be within the normal range; keep it for now and continue observing"
        else:
            etype, acc = "natural_variation", True
            sug = "No special handling needed for now"
        out.append({
            "issue_index": i,
            "is_acceptable": acc,
            "error_type": etype,
            "related_step": related_default,
            "suggestion": sug,
        })
    return out


def _normalize_diagnosis(raw: Any, issues: list[dict], has_steps: bool) -> list[dict]:
    fallback = _fallback_error_diagnosis(issues, has_steps)
    by_index = {d["issue_index"]: d for d in fallback}
    if isinstance(raw, list):
        for d in raw:
            try:
                idx = int(d.get("issue_index"))
            except (TypeError, ValueError):
                continue
            if 0 <= idx < len(issues):
                by_index[idx] = {
                    "issue_index": idx,
                    "is_acceptable": bool(d.get("is_acceptable", False)),
                    "error_type": d.get("error_type", "natural_variation"),
                    "related_step": str(d.get("related_step", "")),
                    "suggestion": str(d.get("suggestion", "")),
                }
    return [by_index[i] for i in range(len(issues))]


def _ai_diagnose(
    dataset_name: str,
    n_rows: int,
    n_cols: int,
    quality_score: float,
    quality_level: str,
    statistics: dict,
    issues: list[dict],
    steps_context: Optional[str],
) -> dict:
    has_steps = bool(steps_context and steps_context.strip())

    def _fallback_both() -> dict:
        return {
            "ai_explanation": _fallback_ai_explanation(issues, quality_level),
            "error_diagnosis": _fallback_error_diagnosis(issues, has_steps),
        }

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return _fallback_both()

    try:
        import anthropic

        client = anthropic.Anthropic(api_key=api_key)

        stat_lines = []
        for col, s in statistics.items():
            stat_lines.append(
                f"  - {col}: min={s.get('min')}, max={s.get('max')}, "
                f"mean={s.get('mean')}, median={s.get('median')}"
            )
        stat_block = "\n".join(stat_lines) if stat_lines else "  (no numeric-column statistics)"

        issue_lines = "\n".join(
            f"  [{i}] ({it.get('type')}, {it.get('severity')}) {it.get('message')}"
            for i, it in enumerate(issues[:40])
        ) or "  (no issues)"

        if has_steps:
            steps_block = (
                f"\nExperiment steps / equipment provided by the user (use this to locate which step caused each problem):\n"
                f"{steps_context}\n"
            )
        else:
            steps_block = (
                "\n(The user did not provide experiment steps; for related_step, always write "
                "\"No experiment steps provided, so the specific stage cannot be located\")\n"
            )

        user_msg = f"""Provide an overall interpretation and a per-issue error diagnosis for the following data-quality check results:
{steps_block}
Dataset: {dataset_name}
Size: {n_rows} rows x {n_cols} columns
Data quality score: {quality_score}/100 (level: {quality_level})

Per-column statistics:
{stat_block}

Detected issues (issue_index starts at 0, {len(issues)} total):
{issue_lines}

Output ai_explanation (overall interpretation) and error_diagnosis (one entry per issue_index above).
IMPORTANT: All output must be in English only. Do not use any Chinese characters."""

        response = client.messages.create(
            model="claude-opus-4-8",
            max_tokens=6000,
            system=AI_SYSTEM_PROMPT,
            thinking={"type": "adaptive"},
            output_config={
                "format": {
                    "type": "json_schema",
                    "schema": AI_COMBINED_SCHEMA,
                }
            },
            messages=[{"role": "user", "content": user_msg}],
        )

        if response.stop_reason == "refusal":
            return _fallback_both()

        text = next(
            (block.text for block in response.content if block.type == "text"),
            None,
        )
        if not text:
            return _fallback_both()

        parsed = json.loads(text)
        return {
            "ai_explanation": parsed.get("ai_explanation")
                or _fallback_ai_explanation(issues, quality_level),
            "error_diagnosis": _normalize_diagnosis(
                parsed.get("error_diagnosis"), issues, has_steps
            ),
        }

    except Exception:  # noqa: BLE001
        with sentry_sdk.new_scope() as scope:
            scope.set_tag("feature", "analyze")
            scope.set_tag("stage", "ai_diagnose")
            sentry_sdk.capture_exception()
        return _fallback_both()


def analyze_dataset(
    csv_text: str = "",
    dataset_name: str = "data.csv",
    protocol_context: Optional[str] = None,
    input_kind: str = "text",
    file_base64: Optional[str] = None,
    media_type: Optional[str] = None,
    experiment_steps: Optional[str] = None,
) -> dict:
    try:
        df = _load_dataframe(input_kind, csv_text, file_base64, media_type)
    except Exception as exc:  # noqa: BLE001
        with sentry_sdk.new_scope() as scope:
            scope.set_tag("feature", "analyze")
            scope.set_tag("stage", "load_dataframe")
            scope.set_tag("input_kind", input_kind)
            sentry_sdk.capture_exception(exc)
        return {
            "ok": False,
            "data": None,
            "error": f"Failed to parse data: {exc}. Please check that the file/format is correct.",
        }

    num_df = _numeric_frame(df)
    numeric_cols = _numeric_columns(df, num_df)

    issues = _detect_issues(df, num_df, numeric_cols)
    statistics = _compute_statistics(num_df, numeric_cols)
    score = _quality_score(df, num_df, numeric_cols)
    level = _quality_level(score)
    chart_data = _build_chart_data(df, num_df, numeric_cols)

    n_rows, n_cols = int(df.shape[0]), int(df.shape[1])

    steps_context = (
        experiment_steps if (experiment_steps and experiment_steps.strip())
        else protocol_context
    )

    ai = _ai_diagnose(
        dataset_name=dataset_name,
        n_rows=n_rows,
        n_cols=n_cols,
        quality_score=score,
        quality_level=level,
        statistics=statistics,
        issues=issues,
        steps_context=steps_context,
    )

    data = {
        "dataset_name": dataset_name,
        "row_count": n_rows,
        "column_count": n_cols,
        "quality_score": score,
        "quality_level": level,
        "issues": issues,
        "statistics": statistics,
        "chart_data": chart_data,
        "ai_explanation": ai["ai_explanation"],
        "error_diagnosis": ai["error_diagnosis"],
    }
    return {"ok": True, "data": data, "error": None}
