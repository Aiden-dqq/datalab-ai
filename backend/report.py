# ============================================================
# backend/report.py — 实验报告生成（功能 C：Report Generator）
# ============================================================
#
# 这个文件负责：综合"实验方案(protocol)"与"数据分析结果(analysis)"，
# 调用 Claude 生成五章节学术报告（Introduction / Method / Results /
# Discussion / Conclusion），返回完整 Markdown。
#
# 设计原则（这次重写的重点）：
#   1. 接口简单：generate_report(protocol, analysis, user_requirements)
#      —— protocol / analysis 都是"普通字典或 None"，不做严格类型校验，
#         所以前端缺字段也不会 422（用 .get() 防御式读取）。
#   2. 结构化输出：用 json_schema 强制 Claude 只能返回合法 JSON，
#      根治旧版"Claude 偶尔返回坏 JSON → json.loads 崩 → 500"的问题。
#   3. 永不崩：没 Key / 调用失败 / 拒答，都回退到本地模板报告，
#      始终返回 {"ok": True, ...}，前端永远能拿到一份报告。
#   4. Results 只引用 analysis 里的真实统计数值，不编造。
#
# Python 语法小抄（给只懂 C++ 的你）：
#   dict.get("k")  ≈ map 里取值，键不存在返回 None（不会抛异常）
#   Optional[dict] ≈ 可能是字典，也可能是 None（≈ 可空指针）
#   None           ≈ nullptr
# ============================================================

import os
import json
import math
from datetime import datetime, timezone
from typing import Optional, Any


# ─────────────────────────────────────────────────────────────
# 1. 五章节的结构化输出"模具"
# ─────────────────────────────────────────────────────────────
# 强制 Claude 返回恰好这五个字符串字段，杜绝格式跑偏。
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
4. 全程使用中文，语言客观严谨。
5. 每个章节只输出正文，不要包含章节标题（标题由系统自动添加）。
   正文可用 Markdown 内联格式（**加粗**、- 列表）。"""


# ─────────────────────────────────────────────────────────────
# 2. 防御式小工具：从 dict 安全取值 / 格式化
# ─────────────────────────────────────────────────────────────

def _g(d: Optional[dict], key: str, default: Any = None) -> Any:
    """从可能为 None 的字典里安全取值（d 为 None 时返回 default）。"""
    if not isinstance(d, dict):
        return default
    val = d.get(key, default)
    return default if val is None else val


def _join(items: Any, sep: str) -> str:
    """
    安全地把列表拼成字符串——这是防 TypeError 的关键。

    直接用 str.join(列表) 时，只要列表里有一个非字符串元素（数字、numpy
    标量、NaN、None 等），就会抛 TypeError: sequence item N: expected str。
    这里逐个元素处理：
      - None / NaN / Infinity → 跳过（这些值进 prompt 没有意义）
      - 其它一律 str() 强制转成字符串（numpy 类型也能正确转成 "40.0" 这种）
    """
    if not isinstance(items, list):
        return ""
    out: list[str] = []
    for x in items:
        if x is None:
            continue
        # 跳过浮点 NaN / Infinity（含 numpy 的浮点，它们是 float 子类）
        if isinstance(x, float) and (math.isnan(x) or math.isinf(x)):
            continue
        out.append(str(x))
    return sep.join(out)


def _num(v: Any) -> Optional[float]:
    """
    把统计数值转成"普通 Python float"，喂给 Claude 前清洗：
      - numpy 标量（np.float64 / np.int64 等）→ 原生 float
      - None / 非数字 / NaN / Infinity → 返回 None（不让它进入 prompt）
    这样 prompt 里的数值永远是干净的有限数，不会出现 numpy repr 或 'nan'/'inf'。
    """
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
    """把 analysis.statistics 格式化成供 Claude 读取的文字块（只列真实数值）。"""
    stats = _g(analysis, "statistics", {})
    if not isinstance(stats, dict) or not stats:
        return "  （无统计数据）"
    lines = []
    for col, s in stats.items():
        if not isinstance(s, dict):
            continue
        parts = []
        for label, k in (("最小", "min"), ("最大", "max"), ("均值", "mean"), ("中位", "median")):
            nv = _num(s.get(k))          # numpy/NaN/inf → 清洗成原生 float 或 None
            if nv is not None:
                parts.append(f"{label}={nv}")
        if parts:
            lines.append(f"  - {col}: {', '.join(parts)}")
    return "\n".join(lines) if lines else "  （无统计数据）"


def _fmt_issues(analysis: dict) -> str:
    """把数据质量问题格式化成文字块（最多 10 条，防止 prompt 过长）。"""
    issues = _g(analysis, "issues", [])
    if not isinstance(issues, list) or not issues:
        return "  （无质量问题）"
    out = []
    for it in issues[:10]:
        if isinstance(it, dict):
            out.append(f"  - [{it.get('severity', '?')}] {it.get('message', '')}")
    return "\n".join(out) if out else "  （无质量问题）"


def _assemble_markdown(title: str, sections: dict, footer: str) -> str:
    """把五章节正文拼成完整 Markdown 字符串。"""
    return f"""# {title}

## 1. Introduction（引言）

{sections['introduction']}

## 2. Method（实验方法）

{sections['method']}

## 3. Results（实验结果）

{sections['results']}

## 4. Discussion（讨论）

{sections['discussion']}

## 5. Conclusion（结论）

{sections['conclusion']}

---

*{footer}*
"""


# ─────────────────────────────────────────────────────────────
# 3. 本地模板报告（无 Key / API 失败时的兜底，保证永不崩）
# ─────────────────────────────────────────────────────────────

def _fallback_sections(protocol: Optional[dict], analysis: Optional[dict]) -> dict:
    """不调用 Claude 的本地模板五章节。Results 只用真实 statistics，不编造。"""
    has_p = isinstance(protocol, dict)
    has_a = isinstance(analysis, dict)

    # Introduction
    if has_p:
        assum = _g(protocol, "assumptions", [])
        intro = (
            f"本实验旨在{_g(protocol, 'objective', '探究目标变量之间的关系')}。"
            + (f"实验前提假设包括：{_join(assum[:3], '; ')}。" if assum else "")
        )
    else:
        intro = "本报告由 DataLab AI 自动生成。由于未提供实验方案（Protocol），引言内容有限，建议补充后重新生成。"

    # Method
    if has_p:
        variables = _g(protocol, "variables", [])
        vars_desc = "、".join(
            f"{v.get('name', '')}（{v.get('unit', '')}）"
            for v in variables if isinstance(v, dict)
        )
        steps = _g(protocol, "procedure_steps", [])
        steps_desc = "\n".join(f"{i + 1}. {s}" for i, s in enumerate(steps))
        method = (
            f"**实验设备**：{_join(_g(protocol, 'equipment', []), ', ')}。\n\n"
            f"**记录变量**：{vars_desc}。\n\n"
            f"**采样频率**：{_g(protocol, 'sampling_frequency', '未指定')}。\n\n"
            f"**实验步骤**：\n{steps_desc}\n\n"
            f"**控制条件**：{_join(_g(protocol, 'control_conditions', []), '; ')}。"
        )
    else:
        method = "未提供实验方案，方法章节无法自动生成。请完成方案设计后重新生成报告。"

    # Results（只引用真实 statistics）
    if has_a:
        results = (
            f"数据集 **{_g(analysis, 'dataset_name', '未命名')}** 共 "
            f"{_g(analysis, 'row_count', '—')} 行 {_g(analysis, 'column_count', '—')} 列，"
            f"数据质量评分 **{_g(analysis, 'quality_score', '—')} / 100**"
            f"（等级：{_g(analysis, 'quality_level', '—')}）。\n\n"
            f"**各变量统计概况**：\n{_fmt_stats(analysis)}\n\n"
            f"数据质量检查共发现 **{len(_g(analysis, 'issues', []))}** 个问题。"
        )
    else:
        results = (
            "由于未提供数据分析结果（Analysis），本节无法给出具体实验数值。"
            "请完成数据分析步骤后重新生成，以获得包含真实统计数值的 Results 章节。"
        )

    # Discussion
    ai = _g(analysis, "ai_explanation", {})
    if has_a and isinstance(ai, dict) and ai.get("possible_causes"):
        causes = _join(ai.get("possible_causes", [])[:3], "；")
        actions = _join(ai.get("suggested_actions", [])[:3], "；")
        discussion = f"**数据异常可能原因**：{causes}。\n\n**建议改进措施**：{actions}。"
    elif has_p and _g(protocol, "possible_errors", []):
        errs = _join(_g(protocol, "possible_errors", [])[:4], "、")
        discussion = f"本实验的潜在误差来源包括：{errs}。建议在后续实验中针对性地加以控制。"
    else:
        discussion = "由于数据有限，讨论部分无法提供深入分析。建议补充实验数据后重新生成。"

    # Conclusion
    if has_a:
        q = _g(analysis, "quality_level", "未知")
        if q in ("Excellent", "Good"):
            note = "实验结果具有较高可信度，可作为后续研究的参考依据。"
        else:
            note = f"⚠️ 注意：本次数据质量等级为 {q}，结论存在不确定性，建议清理数据质量问题后重新分析再得出定论。"
        conclusion = (
            f"综合以上分析，数据质量评分为 {_g(analysis, 'quality_score', '—')}/100（{q}）。{note}"
            " 后续研究可在此基础上扩大样本量，进一步验证实验假设。"
        )
    else:
        conclusion = (
            "由于缺乏完整实验数据，目前无法给出确定性结论。"
            "请在完成数据采集与分析后重新生成报告，以获得有数据支撑的结论。"
        )

    return {
        "introduction": intro,
        "method": method,
        "results": results,
        "discussion": discussion,
        "conclusion": conclusion,
    }


# ─────────────────────────────────────────────────────────────
# 4. 调用 Claude 生成五章节
# ─────────────────────────────────────────────────────────────

def _build_user_prompt(
    protocol: Optional[dict],
    analysis: Optional[dict],
    user_requirements: Optional[str],
) -> str:
    """把 protocol + analysis 拼成给 Claude 的数据上下文。"""
    parts: list[str] = []

    if isinstance(protocol, dict):
        variables = _g(protocol, "variables", [])
        vars_str = ", ".join(
            f"{v.get('name', '')}({v.get('unit', '')})"
            for v in variables if isinstance(v, dict)
        )
        steps = _g(protocol, "procedure_steps", [])
        steps_str = "\n".join(f"  {i + 1}. {s}" for i, s in enumerate(steps))
        parts.append(f"""=== 实验方案（Protocol）===
标题：{_g(protocol, 'title', '')}
目标：{_g(protocol, 'objective', '')}
假设：{_join(_g(protocol, 'assumptions', []), '; ')}
设备：{_join(_g(protocol, 'equipment', []), ', ')}
变量：{vars_str}
采样频率：{_g(protocol, 'sampling_frequency', '')}
实验步骤：
{steps_str}
控制条件：{_join(_g(protocol, 'control_conditions', []), '; ')}
潜在误差：{_join(_g(protocol, 'possible_errors', []), '; ')}""")

    if isinstance(analysis, dict):
        ai = _g(analysis, "ai_explanation", {})
        parts.append(f"""=== 真实实验数据（Analysis）— Results 只能引用以下数值，不得编造 ===
数据集：{_g(analysis, 'dataset_name', '')}
行数：{_g(analysis, 'row_count', '—')}，列数：{_g(analysis, 'column_count', '—')}
质量评分：{_g(analysis, 'quality_score', '—')}/100（{_g(analysis, 'quality_level', '—')}）
各列统计数值（真实数据）：
{_fmt_stats(analysis)}
数据质量问题（共 {len(_g(analysis, 'issues', []))} 个）：
{_fmt_issues(analysis)}
AI 解读：
  可能原因：{_join(ai.get('possible_causes', []) if isinstance(ai, dict) else [], '; ')}
  建议措施：{_join(ai.get('suggested_actions', []) if isinstance(ai, dict) else [], '; ')}
  对结论的影响：{ai.get('impact_on_conclusion', '') if isinstance(ai, dict) else ''}""")

    if not parts:
        parts.append("（未提供任何实验数据，请基于通用科学写作规范生成框架，并在 Results 注明缺少数据）")

    user_req = f"\n\n用户额外格式要求：{user_requirements}" if user_requirements else ""
    return "请根据以下数据生成实验报告的五个章节：\n\n" + "\n\n".join(parts) + user_req


def _call_claude(
    protocol: Optional[dict],
    analysis: Optional[dict],
    user_requirements: Optional[str],
) -> dict:
    """
    调用 Claude（结构化输出）生成五章节 dict。
    失败/拒答时抛异常，由 generate_report 捕获后回退模板。
    """
    import anthropic
    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

    response = client.messages.create(
        model="claude-opus-4-8",          # 默认使用最新、最强的 Opus 模型
        max_tokens=8000,                  # 足够装下完整五章节
        system=REPORT_SYSTEM_PROMPT,
        thinking={"type": "adaptive"},
        output_config={                   # 结构化输出：强制返回符合 schema 的合法 JSON
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

    # 取出文本块（开 thinking 后 content 里会先有思考块）
    text = next(
        (block.text for block in response.content if block.type == "text"),
        None,
    )
    if not text:
        raise ValueError("响应中没有找到文本内容")

    sections = json.loads(text)   # 结构化输出保证这里是合法 JSON
    # 兜底校验五个字段都在
    for k in ("introduction", "method", "results", "discussion", "conclusion"):
        if k not in sections:
            raise ValueError(f"返回缺少字段：{k}")
    return sections


# ─────────────────────────────────────────────────────────────
# 5. 主函数：生成报告
# ─────────────────────────────────────────────────────────────

def generate_report(
    protocol: Optional[dict] = None,
    analysis: Optional[dict] = None,
    user_requirements: Optional[str] = None,
) -> dict:
    """
    报告生成主入口。

    参数（都是普通字典或 None，不做严格校验）：
      protocol          : 实验方案（对应前端 ProtocolOutput）
      analysis          : 数据分析结果（对应前端 AnalysisOutput）
      user_requirements : 用户自定义格式要求（可选）

    返回（始终 ok=True，前端直接读这些字段）：
      {
        "ok": True,
        "title": str,
        "markdown": str,
        "sections": {introduction, method, results, discussion, conclusion},
        "generated_from": {has_protocol, has_analysis, dataset_name?},
        "warnings": [str, ...]
      }
    """
    warnings: list[str] = []
    has_p = isinstance(protocol, dict)
    has_a = isinstance(analysis, dict)

    if not has_p:
        warnings.append("未提供实验方案（Protocol）—— Introduction / Method 章节内容将有限")
    if not has_a:
        warnings.append("未提供数据分析结果（Analysis）—— Results 章节将无法给出具体实验数值")

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    title = _g(protocol, "title", "实验报告") if has_p else "实验报告"

    # ── 尝试用 Claude；任何问题都回退模板，保证 ok=True ──────
    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if api_key:
        try:
            sections = _call_claude(protocol, analysis, user_requirements)
            footer = f"DataLab AI · Claude 自动生成 · {now}"
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
        except Exception as e:  # noqa: BLE001  任何异常都降级到模板，绝不 500
            warnings.append(f"AI 生成失败（{type(e).__name__}），已使用本地模板报告")
    else:
        warnings.append("未配置 ANTHROPIC_API_KEY，使用本地模板报告（功能完整，数值来自真实数据）")

    # ── 回退：本地模板报告 ─────────────────────────────────
    sections = _fallback_sections(protocol, analysis)
    footer = f"DataLab AI 自动生成（模板模式） · {now}"
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
