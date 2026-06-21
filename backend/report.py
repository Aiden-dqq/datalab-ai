import os
import json
import math
from datetime import datetime, timezone
from typing import Optional, Any


REPORT_SECTIONS_SCHEMA = {
    "type": "object",
    "properties": {
        "introduction": {"type": "string"},
        "method": {"type": "string"},
        "results": {"type": "string"},
        "discussion": {"type": "string"},
        "conclusion": {"type": "string"},
    },
    "required": ["introduction", "method", "results", "discussion", "conclusion"],
    "additionalProperties": False,
}

REPORT_SYSTEM_PROMPT = """你是一名严谨的科学实验报告写作助手，根据真实实验数据生成五章节学术报告。

【铁律 — 违反则报告无效】
1. Results 章节出现的所有具体数值（均值、最小/最大值、中位数、行数、质量评分等），
   必须且只能来自用户提供的"真实实验数据"区块中的数字，不得估算、推断或编造。
2. 若缺少 analysis 数据，Results 必须明确写"由于缺少分析数据，无法给出具体数值"，
   而不是编造任何数字。
3. Conclusion 只能总结 Results 已展示数据所能支持的结论；
   若数据质量等级为 Risky 或 Poor，必须在 Conclusion 中注明数据质量限制。
4. 五个章节（Introduction / Method / Results / Discussion / Conclusion）全程使用英文（English）输出，语言客观严谨。
   Please respond entirely in English. All content must be in English.
   IMPORTANT: All output must be in English only. Do not use any Chinese characters.
5. 每个章节只输出正文，不要包含章节标题（标题由系统自动添加）。
   正文可用 Markdown 内联格式（**加粗**、- 列表）。"""


def _g(d: Optional[dict], key: str, default: Any = None) -> Any:
    if not isinstance(d, dict):
        return default
    val = d.get(key, default)
    return default if val is None else val


def _join(items: Any, sep: str) -> str:
    if not isinstance(items, list):
        return ""
    out: list[str] = []
    for x in items:
        if x is None:
            continue
        if isinstance(x, float) and (math.isnan(x) or math.isinf(x)):
            continue
        out.append(str(x))
    return sep.join(out)


def _num(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if math.isnan(f) or math.isinf(f):
        return None
    return f


def _fmt_stats(analysis: dict) -> str:
    stats = _g(analysis, "statistics", {})
    if not isinstance(stats, dict) or not stats:
        return "  (no statistics)"
    lines = []
    for col, s in stats.items():
        if not isinstance(s, dict):
            continue
        parts = []
        for label, k in (("min", "min"), ("max", "max"), ("mean", "mean"), ("median", "median")):
            nv = _num(s.get(k))
            if nv is not None:
                parts.append(f"{label}={nv}")
        if parts:
            lines.append(f"  - {col}: {', '.join(parts)}")
    return "\n".join(lines) if lines else "  (no statistics)"


def _fmt_issues(analysis: dict) -> str:
    issues = _g(analysis, "issues", [])
    if not isinstance(issues, list) or not issues:
        return "  (no quality issues)"
    out = []
    for it in issues[:10]:
        if isinstance(it, dict):
            out.append(f"  - [{it.get('severity', '?')}] {it.get('message', '')}")
    return "\n".join(out) if out else "  (no quality issues)"


def _assemble_markdown(title: str, sections: dict, footer: str) -> str:
    return f"""# {title}

## 1. Introduction

{sections['introduction']}

## 2. Method

{sections['method']}

## 3. Results

{sections['results']}

## 4. Discussion

{sections['discussion']}

## 5. Conclusion

{sections['conclusion']}

---

*{footer}*
"""


def _fallback_sections(protocol: Optional[dict], analysis: Optional[dict]) -> dict:
    has_p = isinstance(protocol, dict)
    has_a = isinstance(analysis, dict)

    if has_p:
        assum = _g(protocol, "assumptions", [])
        intro = (
            f"This experiment aims to {_g(protocol, 'objective', 'investigate the relationships between the target variables')}. "
            + (f"Key assumptions include: {_join(assum[:3], '; ')}. " if assum else "")
        )
    else:
        intro = "This report was generated automatically by DataLab AI. Because no protocol was provided, the introduction is limited; please add a protocol and regenerate."

    if has_p:
        variables = _g(protocol, "variables", [])
        vars_desc = ", ".join(
            f"{v.get('name', '')} ({v.get('unit', '')})"
            for v in variables if isinstance(v, dict)
        )
        steps = _g(protocol, "procedure_steps", [])
        steps_desc = "\n".join(f"{i + 1}. {s}" for i, s in enumerate(steps))
        method = (
            f"**Equipment**: {_join(_g(protocol, 'equipment', []), ', ')}.\n\n"
            f"**Recorded variables**: {vars_desc}.\n\n"
            f"**Sampling frequency**: {_g(protocol, 'sampling_frequency', 'unspecified')}.\n\n"
            f"**Procedure steps**:\n{steps_desc}\n\n"
            f"**Control conditions**: {_join(_g(protocol, 'control_conditions', []), '; ')}."
        )
    else:
        method = "No protocol was provided, so the Method section cannot be generated automatically. Please complete the protocol design and regenerate the report."

    if has_a:
        results = (
            f"Dataset **{_g(analysis, 'dataset_name', 'unnamed')}** has "
            f"{_g(analysis, 'row_count', '—')} rows and {_g(analysis, 'column_count', '—')} columns, "
            f"with a data quality score of **{_g(analysis, 'quality_score', '—')} / 100** "
            f"(level: {_g(analysis, 'quality_level', '—')}).\n\n"
            f"**Per-variable statistics**:\n{_fmt_stats(analysis)}\n\n"
            f"The data quality check found **{len(_g(analysis, 'issues', []))}** issues in total."
        )
    else:
        results = (
            "Because no data analysis was provided, this section cannot give specific experimental values. "
            "Please complete the data analysis step and regenerate to obtain a Results section with real statistics."
        )

    ai = _g(analysis, "ai_explanation", {})
    if has_a and isinstance(ai, dict) and ai.get("possible_causes"):
        causes = _join(ai.get("possible_causes", [])[:3], "; ")
        actions = _join(ai.get("suggested_actions", [])[:3], "; ")
        discussion = f"**Possible causes of data anomalies**: {causes}.\n\n**Suggested improvements**: {actions}."
    elif has_p and _g(protocol, "possible_errors", []):
        errs = _join(_g(protocol, "possible_errors", [])[:4], ", ")
        discussion = f"Potential sources of error in this experiment include: {errs}. It is recommended to control for these specifically in future experiments."
    else:
        discussion = "Because the data is limited, the Discussion section cannot provide in-depth analysis. Please add more experimental data and regenerate."

    if has_a:
        q = _g(analysis, "quality_level", "Unknown")
        if q in ("Excellent", "Good"):
            note = "The experimental results have relatively high reliability and can serve as a reference for further research."
        else:
            note = f"⚠️ Note: the data quality level is {q}, so the conclusion carries uncertainty; it is recommended to clean up the data quality issues and re-analyze before drawing firm conclusions."
        conclusion = (
            f"Taking the analysis together, the data quality score is {_g(analysis, 'quality_score', '—')}/100 ({q}). {note}"
            " Future research can build on this by increasing the sample size to further validate the experimental hypothesis."
        )
    else:
        conclusion = (
            "Because complete experimental data is lacking, no definitive conclusion can be drawn at this time. "
            "Please complete data collection and analysis, then regenerate the report to obtain a data-backed conclusion."
        )

    return {
        "introduction": intro,
        "method": method,
        "results": results,
        "discussion": discussion,
        "conclusion": conclusion,
    }


def _build_user_prompt(
    protocol: Optional[dict],
    analysis: Optional[dict],
    user_requirements: Optional[str],
) -> str:
    parts: list[str] = []

    if isinstance(protocol, dict):
        variables = _g(protocol, "variables", [])
        vars_str = ", ".join(
            f"{v.get('name', '')}({v.get('unit', '')})"
            for v in variables if isinstance(v, dict)
        )
        steps = _g(protocol, "procedure_steps", [])
        steps_str = "\n".join(f"  {i + 1}. {s}" for i, s in enumerate(steps))
        parts.append(f"""=== Protocol ===
Title: {_g(protocol, 'title', '')}
Objective: {_g(protocol, 'objective', '')}
Assumptions: {_join(_g(protocol, 'assumptions', []), '; ')}
Equipment: {_join(_g(protocol, 'equipment', []), ', ')}
Variables: {vars_str}
Sampling frequency: {_g(protocol, 'sampling_frequency', '')}
Procedure steps:
{steps_str}
Control conditions: {_join(_g(protocol, 'control_conditions', []), '; ')}
Potential errors: {_join(_g(protocol, 'possible_errors', []), '; ')}""")

    if isinstance(analysis, dict):
        ai = _g(analysis, "ai_explanation", {})
        parts.append(f"""=== Real experiment data (Analysis) — Results may only cite the values below and must not fabricate any ===
Dataset: {_g(analysis, 'dataset_name', '')}
Rows: {_g(analysis, 'row_count', '—')}, Columns: {_g(analysis, 'column_count', '—')}
Quality score: {_g(analysis, 'quality_score', '—')}/100 ({_g(analysis, 'quality_level', '—')})
Per-column statistics (real data):
{_fmt_stats(analysis)}
Data quality issues ({len(_g(analysis, 'issues', []))} total):
{_fmt_issues(analysis)}
AI interpretation:
  Possible causes: {_join(ai.get('possible_causes', []) if isinstance(ai, dict) else [], '; ')}
  Suggested actions: {_join(ai.get('suggested_actions', []) if isinstance(ai, dict) else [], '; ')}
  Impact on conclusion: {ai.get('impact_on_conclusion', '') if isinstance(ai, dict) else ''}""")

    if not parts:
        parts.append("(No experiment data provided. Generate a framework based on general scientific writing conventions, and note the missing data in Results.)")

    user_req = f"\n\nAdditional user format requirements: {user_requirements}" if user_requirements else ""
    return ("Generate the five sections of an experiment report based on the following data:\n\n"
            + "\n\n".join(parts) + user_req
            + "\n\nIMPORTANT: All output must be in English only. Do not use any Chinese characters.")


def _call_claude(
    protocol: Optional[dict],
    analysis: Optional[dict],
    user_requirements: Optional[str],
) -> dict:
    import anthropic
    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

    response = client.messages.create(
        model="claude-opus-4-8",
        max_tokens=8000,
        system=REPORT_SYSTEM_PROMPT,
        thinking={"type": "adaptive"},
        output_config={
            "format": {
                "type": "json_schema",
                "schema": REPORT_SECTIONS_SCHEMA,
            }
        },
        messages=[{
            "role": "user",
            "content": _build_user_prompt(protocol, analysis, user_requirements),
        }],
    )

    if response.stop_reason == "refusal":
        raise ValueError("模型拒绝了本次请求")

    text = next(
        (block.text for block in response.content if block.type == "text"),
        None,
    )
    if not text:
        raise ValueError("响应中没有找到文本内容")

    sections = json.loads(text)
    for k in ("introduction", "method", "results", "discussion", "conclusion"):
        if k not in sections:
            raise ValueError(f"返回缺少字段：{k}")
    return sections


def generate_report(
    protocol: Optional[dict] = None,
    analysis: Optional[dict] = None,
    user_requirements: Optional[str] = None,
) -> dict:
    warnings: list[str] = []
    has_p = isinstance(protocol, dict)
    has_a = isinstance(analysis, dict)

    if not has_p:
        warnings.append("No protocol provided — the Introduction / Method sections will be limited")
    if not has_a:
        warnings.append("No data analysis provided — the Results section cannot give specific experimental values")

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    title = _g(protocol, "title", "Experiment Report") if has_p else "Experiment Report"

    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if api_key:
        try:
            sections = _call_claude(protocol, analysis, user_requirements)
            footer = f"DataLab AI · Generated by Claude · {now}"
            return {
                "ok": True,
                "title": title,
                "markdown": _assemble_markdown(title, sections, footer),
                "sections": sections,
                "generated_from": {
                    "has_protocol": has_p,
                    "has_analysis": has_a,
                    "dataset_name": _g(analysis, "dataset_name") if has_a else None,
                },
                "warnings": warnings,
            }
        except Exception as e:  # noqa: BLE001
            warnings.append(f"AI generation failed ({type(e).__name__}); used the local template report instead")
    else:
        warnings.append("ANTHROPIC_API_KEY is not configured; using the local template report (fully functional, values come from real data)")

    sections = _fallback_sections(protocol, analysis)
    footer = f"Generated by DataLab AI (template mode) · {now}"
    return {
        "ok": True,
        "title": title,
        "markdown": _assemble_markdown(title, sections, footer),
        "sections": sections,
        "generated_from": {
            "has_protocol": has_p,
            "has_analysis": has_a,
            "dataset_name": _g(analysis, "dataset_name") if has_a else None,
        },
        "warnings": warnings,
    }
