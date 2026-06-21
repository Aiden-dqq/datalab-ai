# ============================================================
# backend/analyze.py — 数据质量分析（功能 B：Data Analyzer）
# ============================================================
#
# 这个文件负责：接收用户上传/粘贴的 CSV 文本，用 pandas 做"确定性"
# 的数据质量检测，再调用 Claude 对异常做文字解读，最终返回一份
# 与前端 session.ts 里 AnalysisOutput 类型完全一致的结果。
#
# 设计要点（对应你提出的要求）：
#   1. pandas 做确定性检测：缺失值 / 重复行 / IQR 离群点
#   2. 每个数值列计算 min / max / mean / median
#   3. 算一个 0~100 的数据质量分（纯程序规则，可复现）
#   4. 调用 Claude 解释异常（API Key 从环境变量 ANTHROPIC_API_KEY 读取）
#   5. ★ 关键：Claude 失败时只返回"程序分析结果"，绝不崩——
#      此时 ai_explanation 用一份本地兜底文字，其余统计/问题照常返回
#
# Python / pandas 语法小抄（给只懂 C++ 的你）：
#   DataFrame   ≈ 一张二维表（行 × 列），像 C++ 的 vector<vector<cell>> + 列名
#   Series      ≈ 表里的一列，像 vector<cell> + 索引
#   df.isna()   ≈ 返回一张同样大小的"布尔表"，True 表示该格为空
#   NaN         ≈ "Not a Number"，pandas 里表示缺失值（≈ 空/null）
#   io.StringIO ≈ 把一个字符串"当成文件"来读（pandas 只会从文件/路径读）
#   dict/list   ≈ C++ 的 map / vector
# ============================================================

import os                       # 读取环境变量
import io                       # 把字符串当文件读（给 pandas）
import json                     # JSON 字符串 <-> Python 对象
import math                     # isnan / isinf 判断
from typing import Optional, Any

import pandas as pd             # 数据分析主库（这一步的核心）
import numpy as np              # 数值计算（pandas 底层依赖）


# ─────────────────────────────────────────────────────────────
# 0. 一些小工具
# ─────────────────────────────────────────────────────────────

def _num(x: Any) -> Optional[float]:
    """
    把任意值转成"JSON 安全的 Python float"，失败/缺失返回 None。

    为什么必须有这个函数：
      - pandas 给的是 numpy 类型（np.int64 / np.float64），其中 np.int64
        不是 Python int 的子类，json.dumps 会直接报错；
      - 缺失值是 NaN，json.dumps 默认会写成字面量 NaN，而 NaN 不是合法
        JSON，前端 JSON.parse 会失败。
    所以所有要塞进返回结果的数字，都先过一遍这个函数：统一成原生 float
    或 None（None 序列化成 JSON 的 null）。

    C++ 类比：相当于一个 optional<double> 的安全转换器。
    """
    if x is None:
        return None
    try:
        f = float(x)
    except (TypeError, ValueError):
        return None
    if math.isnan(f) or math.isinf(f):
        return None
    return round(f, 4)   # 统一保留 4 位小数，避免浮点数一长串


def _quality_level(score: float) -> str:
    """把 0~100 的分数映射成四个等级之一（和前端的枚举一致）。"""
    if score >= 90:
        return "Excellent"
    if score >= 75:
        return "Good"
    if score >= 50:
        return "Risky"
    return "Poor"


# ─────────────────────────────────────────────────────────────
# 1. 解析 CSV 文本 -> DataFrame
# ─────────────────────────────────────────────────────────────

def _parse_csv(csv_text: str) -> pd.DataFrame:
    """
    把 CSV 文本解析成 DataFrame。

    解析失败（空内容 / 格式错乱）会抛异常，由外层 analyze_dataset 捕获，
    转成 {ok: False, error: ...} 返回。

    reset_index(drop=True) 让行号从 0 连续重排，保证后面所有 row_index
    与 chart_data 的下标一一对应（前端靠这个下标在折线图上标红离群点）。
    """
    df = pd.read_csv(io.StringIO(csv_text))
    df = df.reset_index(drop=True)
    # 去掉完全空白的列名/空列这种边界情况不强求；这里只做最基本的校验
    if df.shape[0] == 0 or df.shape[1] == 0:
        raise ValueError("CSV 没有有效数据行或列")
    return df


def _numeric_frame(df: pd.DataFrame) -> pd.DataFrame:
    """
    返回一份"全部尝试转成数字"的副本：每一格能转成数字就转，转不了变 NaN。

    为什么要这步：CSV 里某列本该是数字，但只要有一格是 "N/A" 之类的脏值，
    pandas 读进来整列就会变成 object(字符串) 类型，导致 min/max 算不了。
    用 pd.to_numeric(errors="coerce") 逐列强制转换（coerce=转不了就填 NaN），
    就能稳定拿到"数值视图"，统计和离群检测都基于它。

    C++ 类比：对每个 cell 做 try{ stod(s) } catch{ NaN }。
    """
    return df.apply(pd.to_numeric, errors="coerce")


def _numeric_columns(df: pd.DataFrame, num_df: pd.DataFrame) -> list[str]:
    """
    判定哪些列算"数值列"：在数值视图里，非空数字的占比 ≥ 50% 就算。

    这样纯文本列（转换后整列 NaN）会被排除，而"大部分是数字、个别脏值"
    的列仍被当作数值列处理。
    """
    cols = []
    n = len(df)
    for col in df.columns:
        valid = int(num_df[col].notna().sum())   # 该列能转成数字的格子数
        if n > 0 and valid >= 0.5 * n:
            cols.append(col)
    return cols


# ─────────────────────────────────────────────────────────────
# 2. 确定性检测：缺失值 / 重复行 / IQR 离群点
# ─────────────────────────────────────────────────────────────

def _detect_issues(
    df: pd.DataFrame,
    num_df: pd.DataFrame,
    numeric_cols: list[str],
) -> list[dict]:
    """
    跑三类纯程序检测，返回 issues 列表（每个元素对应前端的一条问题）。

    返回的每条形如：
      {"type": "...", "severity": "...", "row_index": i,
       "column": "...", "message": "...", "value": ...}
    """
    issues: list[dict] = []
    n_rows = len(df)

    # ── (a) 缺失值：逐格找 NaN ───────────────────────────────
    # df.isna() 返回同尺寸布尔表；这里遍历每一列，再找出该列为空的行号。
    for col in df.columns:
        # null_rows = 该列里所有为空的行号（numpy 数组）
        null_rows = df.index[df[col].isna()].tolist()
        for r in null_rows:
            issues.append({
                "type": "missing",
                "severity": "medium",    # 缺失会影响统计，定为中等
                "row_index": int(r),
                "column": str(col),
                "message": f"第 {int(r)} 行 {col} 列存在缺失值（空）",
            })

    # ── (b) 重复行：整行与之前某行完全相同 ───────────────────
    # df.duplicated() 标记"第二次及以后出现"的重复行为 True（首次出现不算）。
    dup_mask = df.duplicated()
    for r in df.index[dup_mask].tolist():
        issues.append({
            "type": "duplicate",
            "severity": "low",          # 重复行影响相对小，定为低
            "row_index": int(r),
            "message": f"第 {int(r)} 行与前面的某一行内容完全重复",
        })

    # ── (c) IQR 离群点：逐数值列用四分位距法 ──────────────────
    # IQR 法（箱线图原理）：
    #   Q1 = 25% 分位数，Q3 = 75% 分位数，IQR = Q3 - Q1
    #   正常范围 = [Q1 - 1.5*IQR, Q3 + 1.5*IQR]
    #   超出 1.5 倍 → 离群（中等）；超出 3 倍 → 极端离群（高）
    for col in numeric_cols:
        series = num_df[col].dropna()         # 只看能转成数字、且非空的值
        if len(series) < 4:                   # 数据太少，分位数没意义，跳过
            continue
        q1 = series.quantile(0.25)
        q3 = series.quantile(0.75)
        iqr = q3 - q1
        if iqr <= 0:                          # 整列几乎是同一个值，没有离群可言
            continue
        lower_1_5, upper_1_5 = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        lower_3, upper_3 = q1 - 3.0 * iqr, q3 + 3.0 * iqr

        # 找出超出 1.5 倍范围的所有行
        out_mask = (num_df[col] < lower_1_5) | (num_df[col] > upper_1_5)
        for r in df.index[out_mask].tolist():
            val = num_df[col].loc[r]
            extreme = (val < lower_3) or (val > upper_3)   # 是否极端
            issues.append({
                "type": "outlier",
                "severity": "high" if extreme else "medium",
                "row_index": int(r),
                "column": str(col),
                "message": (
                    f"第 {int(r)} 行 {col} 列值 {_num(val)} "
                    f"超出正常范围 [{_num(lower_1_5)}, {_num(upper_1_5)}]"
                    + ("（极端离群）" if extreme else "")
                ),
                "value": _num(val),
            })

    # ── 排序 + 截断：高严重度优先，最多返回 100 条（保护响应体大小）──
    # 质量分用的是"完整计数"（在 _quality_score 里另算），这里只控制展示数量。
    severity_rank = {"high": 0, "medium": 1, "low": 2}
    issues.sort(key=lambda it: severity_rank.get(it["severity"], 3))
    return issues[:100]


# ─────────────────────────────────────────────────────────────
# 3. 各数值列统计：min / max / mean / median
# ─────────────────────────────────────────────────────────────

def _compute_statistics(num_df: pd.DataFrame, numeric_cols: list[str]) -> dict:
    """
    对每个数值列算 4 个指标，返回 {列名: {min,max,mean,median}}。
    所有数值都过 _num() 转成 JSON 安全的 float（缺失返回 None）。
    """
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


# ─────────────────────────────────────────────────────────────
# 4. 数据质量分（0~100，纯程序规则）
# ─────────────────────────────────────────────────────────────

def _quality_score(
    df: pd.DataFrame,
    num_df: pd.DataFrame,
    numeric_cols: list[str],
) -> float:
    """
    从 100 分开始，按三类问题的"比例"扣分（比例越高扣越多）：
      - 缺失值：占全部格子的比例   × 40 分权重
      - 重复行：占全部行的比例     × 30 分权重
      - 离群点：占数值格子的比例   × 30 分权重
    最后夹到 [0, 100]，保留 1 位小数。

    用"比例"而不是"绝对条数"，保证大小数据集打分口径一致、可复现。
    """
    n_rows, n_cols = df.shape
    total_cells = n_rows * n_cols

    # (a) 缺失比例
    missing_count = int(df.isna().sum().sum())
    missing_ratio = missing_count / total_cells if total_cells else 0.0

    # (b) 重复行比例
    dup_count = int(df.duplicated().sum())
    dup_ratio = dup_count / n_rows if n_rows else 0.0

    # (c) 离群比例（基于数值格子数）
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

    score = 100.0 - 40.0 * missing_ratio - 30.0 * dup_ratio - 30.0 * outlier_ratio
    score = max(0.0, min(100.0, score))     # 夹到 [0,100]
    return round(score, 1)


# ─────────────────────────────────────────────────────────────
# 5. 绘图数据：把表格转成前端折线图要的行数组
# ─────────────────────────────────────────────────────────────

def _build_chart_data(
    df: pd.DataFrame,
    num_df: pd.DataFrame,
    numeric_cols: list[str],
) -> list[dict]:
    """
    转成 [{列名: 值, ...}, ...]，数值列输出数字、文本列输出字符串。
    缺失值输出 None（前端画图时自然跳过）。

    为防止超大 CSV 撑爆响应，最多输出前 500 行（折线图展示足够）。
    行下标与原 df 一致，保证离群点的 row_index 能对上。
    """
    numeric_set = set(numeric_cols)
    rows: list[dict] = []
    for r in df.index[:500]:
        row_obj: dict[str, Any] = {}
        for col in df.columns:
            if col in numeric_set:
                row_obj[str(col)] = _num(num_df[col].loc[r])     # 数字或 None
            else:
                raw = df[col].loc[r]
                # 文本列：缺失给 None，否则转字符串
                row_obj[str(col)] = None if pd.isna(raw) else str(raw)
        rows.append(row_obj)
    return rows


# ─────────────────────────────────────────────────────────────
# 6. AI 解读：调用 Claude，失败时本地兜底
# ─────────────────────────────────────────────────────────────

# 给 Claude 的结构化输出"模具"，对应前端 ai_explanation 的形状
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

AI_SYSTEM_PROMPT = """你是一位严谨的实验数据分析师。用户已经用程序对一份实验数据做了
确定性的质量检测（缺失值、重复行、离群点、各列统计）。你的任务是：基于这些"已经算好的
事实"，对数据质量问题给出专业、克制的解读。

铁律：
1. 只解读已提供的统计结果与问题，不要编造任何新的数值。
2. possible_causes：从实验/测量角度推测异常的可能成因（具体、可操作）。
3. suggested_actions：给出针对性的数据清洗或后续实验改进建议。
4. impact_on_conclusion：说明这些数据问题会如何影响最终实验结论的可信度。
5. confidence：你对本次解读的置信度（数据越完整、问题越清晰，置信度越高）。
6. 全部使用中文，语言客观。"""


def _fallback_ai_explanation(
    issues: list[dict],
    quality_level: str,
) -> dict:
    """
    没有 API Key 或 Claude 调用失败时的本地兜底解读（纯程序生成，不编造数值）。
    保证 ai_explanation 字段永远存在且结构正确，前端不白屏。
    """
    # 统计出现了哪几类问题
    types = {it["type"] for it in issues}

    causes: list[str] = []
    actions: list[str] = []
    if "missing" in types:
        causes.append("部分数据采集失败或记录遗漏，导致存在缺失值")
        actions.append("检查缺失值出现的位置，必要时补测或在分析前做插值/剔除")
    if "duplicate" in types:
        causes.append("数据导出或录入时可能发生了重复记录")
        actions.append("去除完全重复的行后再做统计分析")
    if "outlier" in types:
        causes.append("仪器读数波动、操作失误或真实极端事件，导致出现离群值")
        actions.append("逐一核对离群点是否为录入错误；确属异常再决定是否剔除")
    if not causes:
        causes.append("未检测到明显的数据质量问题")
        actions.append("数据较干净，可直接进入下一步分析")

    # 质量等级 -> 对结论影响的措辞
    if quality_level in ("Excellent", "Good"):
        impact = "数据整体质量良好，基于此得出的结论具有较高可信度。"
    elif quality_level == "Risky":
        impact = "数据存在一定质量风险，结论需谨慎对待，建议清洗后复核。"
    else:
        impact = "数据质量较差，当前结论不确定性很高，强烈建议清洗数据后重新分析。"

    return {
        "possible_causes": causes,
        "suggested_actions": actions,
        "impact_on_conclusion": impact,
        "confidence": "low",   # 兜底是程序规则推断，置信度标记为低
    }


def _ai_explain(
    dataset_name: str,
    n_rows: int,
    n_cols: int,
    quality_score: float,
    quality_level: str,
    statistics: dict,
    issues: list[dict],
    protocol_context: Optional[str],
) -> dict:
    """
    调用 Claude 生成 ai_explanation。任何失败都回退到 _fallback_ai_explanation。

    ★ 这里就是你要求的"API 失败时只返回程序分析结果、不崩"的关键：
      本函数内部 try/except 包住整段网络调用，出错就返回兜底解读，
      上层 analyze_dataset 拿到的永远是一份结构正确的 ai_explanation。
    """
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return _fallback_ai_explanation(issues, quality_level)

    try:
        import anthropic

        client = anthropic.Anthropic(api_key=api_key)

        # ── 把"已算好的事实"拼成给模型读的上下文 ──────────────
        # 统计摘要：每行一列
        stat_lines = []
        for col, s in statistics.items():
            stat_lines.append(
                f"  - {col}: 最小={s.get('min')}, 最大={s.get('max')}, "
                f"均值={s.get('mean')}, 中位={s.get('median')}"
            )
        stat_block = "\n".join(stat_lines) if stat_lines else "  （无数值列统计）"

        # 问题摘要：按类型计数 + 最多列 8 条示例（避免 prompt 过长）
        type_count: dict[str, int] = {}
        for it in issues:
            type_count[it["type"]] = type_count.get(it["type"], 0) + 1
        count_line = ", ".join(f"{k}×{v}" for k, v in type_count.items()) or "无"
        sample_lines = "\n".join(f"  - {it['message']}" for it in issues[:8]) or "  （无）"

        ctx = ""
        if protocol_context and protocol_context.strip():
            ctx = f"\n实验背景（来自上一步的方案）：\n{protocol_context}\n"

        user_msg = f"""请解读以下实验数据的质量检测结果：
{ctx}
数据集：{dataset_name}
规模：{n_rows} 行 × {n_cols} 列
数据质量评分：{quality_score}/100（等级：{quality_level}）

各数值列统计：
{stat_block}

检测到的问题（共 {len(issues)} 条，按类型：{count_line}）：
{sample_lines}

请基于以上事实给出你的专业解读。"""

        response = client.messages.create(
            model="claude-opus-4-8",       # 默认使用最新、最强的 Opus 模型
            max_tokens=4000,
            system=AI_SYSTEM_PROMPT,
            thinking={"type": "adaptive"}, # 自适应思考
            output_config={                # 结构化输出，强制返回符合 schema 的 JSON
                "format": {
                    "type": "json_schema",
                    "schema": AI_EXPLANATION_SCHEMA,
                }
            },
            messages=[{"role": "user", "content": user_msg}],
        )

        # 模型拒答 → 兜底
        if response.stop_reason == "refusal":
            return _fallback_ai_explanation(issues, quality_level)

        # 取出文本块（开 thinking 后 content 里会先有思考块）
        text = next(
            (block.text for block in response.content if block.type == "text"),
            None,
        )
        if not text:
            return _fallback_ai_explanation(issues, quality_level)

        return json.loads(text)

    except Exception:  # noqa: BLE001  任何异常都安静降级，绝不让接口崩
        return _fallback_ai_explanation(issues, quality_level)


# ─────────────────────────────────────────────────────────────
# 7. 主函数：完整分析流程
# ─────────────────────────────────────────────────────────────

def analyze_dataset(
    csv_text: str,
    dataset_name: str = "data.csv",
    protocol_context: Optional[str] = None,
) -> dict:
    """
    数据分析主入口。

    参数：
      csv_text         : CSV 文本内容（必填）
      dataset_name     : 数据集名（用于展示）
      protocol_context : 上一步实验方案的简要上下文（可选，喂给 AI）

    返回：统一格式的字典
      {"ok": True,  "data": <AnalysisOutput>, "error": None}   成功
      {"ok": False, "data": None,             "error": "..."}  CSV 无法解析

    说明：
      - "CSV 解析失败"是唯一的硬错误（data 为 None），由路由转成 HTTP 400。
      - Claude API 失败不算失败：ai_explanation 走本地兜底，data 照常返回。
    """
    # ── 第 1 步：解析 CSV（失败=硬错误）──────────────────────
    try:
        df = _parse_csv(csv_text)
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "data": None,
            "error": f"CSV 解析失败：{exc}。请检查数据格式是否正确。",
        }

    # ── 第 2 步：构建数值视图、识别数值列 ────────────────────
    num_df = _numeric_frame(df)
    numeric_cols = _numeric_columns(df, num_df)

    # ── 第 3 步：确定性检测 + 统计 + 质量分 ──────────────────
    issues = _detect_issues(df, num_df, numeric_cols)
    statistics = _compute_statistics(num_df, numeric_cols)
    score = _quality_score(df, num_df, numeric_cols)
    level = _quality_level(score)
    chart_data = _build_chart_data(df, num_df, numeric_cols)

    n_rows, n_cols = int(df.shape[0]), int(df.shape[1])

    # ── 第 4 步：AI 解读（失败自动兜底，不影响上面的程序结果）─
    ai_explanation = _ai_explain(
        dataset_name=dataset_name,
        n_rows=n_rows,
        n_cols=n_cols,
        quality_score=score,
        quality_level=level,
        statistics=statistics,
        issues=issues,
        protocol_context=protocol_context,
    )

    # ── 第 5 步：组装成 AnalysisOutput ───────────────────────
    data = {
        "dataset_name": dataset_name,
        "row_count": n_rows,
        "column_count": n_cols,
        "quality_score": score,
        "quality_level": level,
        "issues": issues,
        "statistics": statistics,
        "chart_data": chart_data,
        "ai_explanation": ai_explanation,
    }
    return {"ok": True, "data": data, "error": None}
