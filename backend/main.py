# ============================================================
# backend/main.py — FastAPI 后端主文件
# ============================================================
#
# Python 语法快速对照（假设你懂 C++）：
#   def fn(a: int) -> str:   ←  C++ 的  string fn(int a)
#   Optional[str]            ←  C++ 的  std::optional<std::string>
#   dict[str, float]         ←  C++ 的  map<string, float>
#   f"hello {name}"          ←  C++ 的  "hello " + name  或 std::format
#   # 单行注释               ←  C++ 的  // 单行注释
#   缩进代码块               ←  C++ 的  { } 花括号代码块
# ============================================================

import os
import json
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime, timezone
from typing import Optional, Any
import uvicorn
from dotenv import load_dotenv

# 从 .env 文件读取 ANTHROPIC_API_KEY 等环境变量
load_dotenv()

# ─── FastAPI 应用实例 ─────────────────────────────────────
app = FastAPI(
    title="DataLab AI Backend",
    description="DataLab AI 实验工作流平台后端 API",
    version="0.2.0",
)

# ─── CORS：允许前端 localhost:3000 访问 ──────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# Pydantic 数据模型（C++ 类比：带类型校验的 struct）
# ============================================================

class HealthResponse(BaseModel):
    status: str
    message: str
    timestamp: str
    version: str


# ── 分析数据子模型（对应 TypeScript AnalysisOutput）────────

class StatColumn(BaseModel):
    """单列统计数据"""
    min: Optional[float] = None
    max: Optional[float] = None
    mean: Optional[float] = None
    median: Optional[float] = None

class IssueItem(BaseModel):
    """数据质量问题条目"""
    type: str       # "missing" | "duplicate" | "non_numeric" | "time_gap" | "outlier"
    severity: str   # "low" | "medium" | "high"
    row_index: Optional[int] = None
    column: Optional[str] = None
    message: str
    value: Optional[Any] = None

class AIExplanation(BaseModel):
    """AI 对数据问题的解释"""
    possible_causes: list[str]
    suggested_actions: list[str]
    impact_on_conclusion: str
    confidence: str   # "low" | "medium" | "high"

class AnalysisInput(BaseModel):
    """完整分析结果（对应 AnalysisOutput）"""
    dataset_name: str
    row_count: int
    column_count: int
    quality_score: float    # 0 ~ 100
    quality_level: str      # "Excellent" | "Good" | "Risky" | "Poor"
    issues: list[IssueItem]
    statistics: dict[str, StatColumn]  # 列名 → 统计指标
    ai_explanation: AIExplanation


# ── 实验方案子模型（对应 TypeScript ProtocolOutput）────────

class VariableItem(BaseModel):
    """实验变量"""
    name: str
    unit: str
    type: str      # "numeric" | "string" | "time"
    required: bool

class ProtocolInput(BaseModel):
    """完整实验方案（对应 ProtocolOutput）"""
    title: str
    objective: str
    assumptions: list[str]
    equipment: list[str]
    variables: list[VariableItem]
    sampling_frequency: str
    expected_interval_minutes: Optional[float] = None
    expected_duration_minutes: Optional[float] = None
    procedure_steps: list[str]
    control_conditions: list[str]
    possible_errors: list[str]
    csv_template: str


# ── 报告请求 / 响应模型 ───────────────────────────────────

class ReportRequest(BaseModel):
    """
    POST /api/report 的请求体。
    protocol 和 analysis 均可选，但缺少时会在 warnings 里说明。
    user_requirements 是用户填写的自定义格式要求（可选）。
    """
    protocol: Optional[ProtocolInput] = None
    analysis: Optional[AnalysisInput] = None
    user_requirements: Optional[str] = None  # 用户自定义格式/关注点

class ReportSections(BaseModel):
    """五章节正文（不含 Markdown 标题，由拼装函数加）"""
    introduction: str
    method: str
    results: str
    discussion: str
    conclusion: str

class ReportResponse(BaseModel):
    """
    /api/report 响应体，与 TypeScript ReportOutput 对应
    """
    title: str
    markdown: str
    sections: ReportSections
    generated_from: dict     # {has_protocol, has_analysis, dataset_name?}
    warnings: list[str]


# ============================================================
# 内部工具函数
# ============================================================

def _fmt_stats(analysis: AnalysisInput) -> str:
    """
    把 analysis.statistics 格式化成供 Claude 读取的文字块。
    每一行形如：  - temperature: 最小=20, 最大=60, 均值=39, 中位=37
    ★ 这段文字会直接嵌入 prompt，确保 Claude 只引用真实数值。
    """
    lines = []
    for col, s in analysis.statistics.items():
        parts = []
        if s.min  is not None: parts.append(f"最小={s.min:.4g}")
        if s.max  is not None: parts.append(f"最大={s.max:.4g}")
        if s.mean is not None: parts.append(f"均值={s.mean:.4g}")
        if s.median is not None: parts.append(f"中位={s.median:.4g}")
        if parts:
            lines.append(f"  - {col}: {', '.join(parts)}")
    return "\n".join(lines) if lines else "  （无统计数据）"


def _fmt_issues(analysis: AnalysisInput) -> str:
    """把数据质量问题格式化成文字块（最多 10 条，防止 prompt 过长）"""
    if not analysis.issues:
        return "  （无质量问题）"
    return "\n".join(
        f"  - [{i.severity}] {i.message}"
        for i in analysis.issues[:10]
    )


def _assemble_markdown(title: str, s: ReportSections, footer: str) -> str:
    """把五章节正文拼成完整 Markdown 字符串"""
    return f"""# {title}

## 1. Introduction（引言）

{s.introduction}

## 2. Method（实验方法）

{s.method}

## 3. Results（实验结果）

{s.results}

## 4. Discussion（讨论）

{s.discussion}

## 5. Conclusion（结论）

{s.conclusion}

---

*{footer}*
"""


# ============================================================
# 本地模板报告（API 失败 / 无 Key 时的兜底）
# ============================================================

def _fallback_report(
    protocol: Optional[ProtocolInput],
    analysis: Optional[AnalysisInput],
    warnings: list[str],
) -> ReportResponse:
    """
    不调用 Claude 的本地模板报告。
    规则与 Claude 版完全相同：Results 只用真实 statistics 数值，没有数据时明确说明。
    """
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    title = protocol.title if protocol else "实验报告（Demo 模板）"

    # ── Introduction: from protocol.objective ────────────
    if protocol:
        intro = (
            f"This experiment aimed to {protocol.objective}. "
            f"Key assumptions included: {'; '.join(protocol.assumptions[:3])}."
        )
    else:
        intro = (
            "This report was generated automatically by DataLab AI. "
            "No experiment protocol was provided; introduction content is limited. "
            "Please complete Step 1 (Protocol) and regenerate for a full report."
        )

    # ── Method: from equipment / variables / procedure_steps ──
    if protocol:
        vars_desc = ", ".join(f"{v.name} ({v.unit})" for v in protocol.variables)
        steps_desc = "\n".join(
            f"{i+1}. {step}" for i, step in enumerate(protocol.procedure_steps)
        )
        method = (
            f"**Equipment**: {', '.join(protocol.equipment)}.\n\n"
            f"**Recorded variables**: {vars_desc}.\n\n"
            f"**Sampling frequency**: {protocol.sampling_frequency}.\n\n"
            f"**Procedure**:\n{steps_desc}\n\n"
            f"**Control conditions**: {'; '.join(protocol.control_conditions)}."
        )
    else:
        method = (
            "No experiment protocol was provided; the Method section cannot be generated automatically. "
            "Please complete Step 1 (Protocol) and regenerate."
        )

    # ── Results: only cite real analysis.statistics values ──
    if analysis:
        stat_lines = []
        for col, s in analysis.statistics.items():
            parts = []
            if s.mean is not None: parts.append(f"mean **{s.mean:.4g}**")
            if s.min is not None and s.max is not None:
                parts.append(f"range [{s.min:.4g}, {s.max:.4g}]")
            if s.median is not None: parts.append(f"median {s.median:.4g}")
            if parts:
                stat_lines.append(f"- **{col}**: {', '.join(parts)}")

        stat_block = "\n".join(stat_lines) if stat_lines else "(no column statistics available)"
        high_cnt = sum(1 for i in analysis.issues if i.severity == "high")
        issue_note = (
            f"including {high_cnt} high-severity issue(s)" if high_cnt
            else "all of low or medium severity"
        )

        results = (
            f"Dataset **{analysis.dataset_name}** contains {analysis.row_count} rows "
            f"and {analysis.column_count} columns. "
            f"Overall data quality score: **{analysis.quality_score:.1f} / 100** ({analysis.quality_level}).\n\n"
            f"**Variable statistics**:\n{stat_block}\n\n"
            f"Quality check identified **{len(analysis.issues)}** issue(s), {issue_note}.\n\n"
            f"AI interpretation confidence: **{analysis.ai_explanation.confidence}**. "
            f"Impact on conclusion: {analysis.ai_explanation.impact_on_conclusion}"
        )
    else:
        results = (
            "No analysis data was provided. "
            "This section cannot report any specific numerical values. "
            "Please complete Step 2 (Analyze) and regenerate to obtain a Results section with real statistics."
        )

    # ── Discussion: from possible_errors / issues / ai_explanation ──
    if analysis and analysis.ai_explanation.possible_causes:
        causes  = "; ".join(analysis.ai_explanation.possible_causes[:3])
        actions = "; ".join(analysis.ai_explanation.suggested_actions[:3])
        discussion = (
            f"**Possible causes of data anomalies**: {causes}.\n\n"
            f"**Recommended follow-up actions**: {actions}."
        )
    elif protocol and protocol.possible_errors:
        errs = "; ".join(protocol.possible_errors[:4])
        discussion = (
            f"Potential sources of error in this experiment include: {errs}. "
            "These should be minimised in future trials to improve data reliability."
        )
    else:
        discussion = (
            "Insufficient data to provide in-depth discussion. "
            "Please supply complete experimental data and regenerate."
        )

    # ── Conclusion: summarise only what data supports; note quality limits ──
    if analysis:
        q = analysis.quality_level
        if q in ("Excellent", "Good"):
            qual_note = "The results carry a high degree of credibility and can serve as a reliable reference for future research."
        else:
            qual_note = (
                f"⚠️ Note: the data quality level is {q}. "
                "Conclusions carry uncertainty; it is recommended to resolve the identified quality issues "
                "and re-analyse before drawing definitive conclusions."
            )
        conclusion = (
            f"In summary, the dataset achieved a quality score of {analysis.quality_score:.1f}/100 ({q}). "
            f"{qual_note} "
            "Future studies should expand the sample size to further validate the experimental hypothesis."
        )
    else:
        conclusion = (
            "A definitive conclusion cannot be drawn due to the absence of experimental data. "
            "Please complete data collection and analysis, then regenerate the report."
        )

    sections = ReportSections(
        introduction=intro,
        method=method,
        results=results,
        discussion=discussion,
        conclusion=conclusion,
    )
    footer = f"DataLab AI — auto-generated (template mode) · {now}"

    return ReportResponse(
        title=title,
        markdown=_assemble_markdown(title, sections, footer),
        sections=sections,
        generated_from={
            "has_protocol": protocol is not None,
            "has_analysis": analysis is not None,
            "dataset_name": analysis.dataset_name if analysis else None,
        },
        warnings=warnings,
    )


# ============================================================
# Claude API 调用
# ============================================================

def _call_claude(
    protocol: Optional[ProtocolInput],
    analysis: Optional[AnalysisInput],
    user_requirements: Optional[str],
) -> dict:
    """
    调用 Claude 生成五章节内容，返回 dict 格式。
    失败时抛异常，由外层 try/except 捕获后回退到 _fallback_report。

    ★ 安全保证：
      - 所有真实数值（statistics）都明文嵌入 prompt
      - system prompt 明确禁止 Claude 在 Results 中编造任何数值
    """
    from anthropic import Anthropic
    client = Anthropic()

    # ── 构建数据上下文字符串 ──────────────────────────────
    ctx_parts: list[str] = []

    if protocol:
        vars_str = ", ".join(f"{v.name}({v.unit})" for v in protocol.variables)
        steps_str = "\n".join(
            f"  {i+1}. {s}" for i, s in enumerate(protocol.procedure_steps)
        )
        ctx_parts.append(f"""
=== 实验方案（Protocol）===
标题：{protocol.title}
目标：{protocol.objective}
假设：{'; '.join(protocol.assumptions)}
设备：{', '.join(protocol.equipment)}
变量：{vars_str}
采样频率：{protocol.sampling_frequency}
预计时长：{protocol.expected_duration_minutes} 分钟
实验步骤：
{steps_str}
控制条件：{'; '.join(protocol.control_conditions)}
潜在误差：{'; '.join(protocol.possible_errors)}
""")

    if analysis:
        ctx_parts.append(f"""
=== 真实实验数据（Analysis）— Results 只能引用以下数值，不得编造 ===
数据集：{analysis.dataset_name}
行数：{analysis.row_count}，列数：{analysis.column_count}
质量评分：{analysis.quality_score:.1f}/100（{analysis.quality_level}）
各列统计数值（真实数据）：
{_fmt_stats(analysis)}
数据质量问题（共 {len(analysis.issues)} 个）：
{_fmt_issues(analysis)}
AI 解读：
  可能原因：{'; '.join(analysis.ai_explanation.possible_causes)}
  建议措施：{'; '.join(analysis.ai_explanation.suggested_actions)}
  对结论的影响：{analysis.ai_explanation.impact_on_conclusion}
  置信度：{analysis.ai_explanation.confidence}
""")

    if not ctx_parts:
        ctx_parts.append("（未提供任何实验数据，请尽量基于通用科学写作规范生成框架）")

    data_ctx = "\n".join(ctx_parts)

    # 用户自定义格式要求（可选）
    user_req_block = (
        f"\n用户额外格式要求：{user_requirements}" if user_requirements else ""
    )

    # ── System Prompt ─────────────────────────────────────
    system = """You are a rigorous scientific report writing assistant. Your task is to generate a five-section academic lab report based on real experimental data.

[ABSOLUTE RULES — violation renders the report invalid]
1. Every specific numerical value in the Results section (mean, min, max, median, row count, quality score, etc.)
   must come exclusively from the "Real Experimental Data" block provided by the user.
   Do NOT estimate, infer, or fabricate any number.
2. If analysis data is absent, the Results section MUST explicitly state
   "Analysis data not available — no specific numerical values can be reported."
   Do not invent any figures.
3. Conclusion may only summarise what the Results data already supports.
   If quality_level is Risky or Poor, the Conclusion MUST note the data quality limitation.
4. Write entirely in English, in an objective and formal academic tone.
5. Output only the body of each section — do NOT include section headings (they are added automatically).

[Section writing rules]
- Introduction: Based on protocol.objective and the user's stated goal; explain the experimental background, purpose, and scientific hypothesis.
- Method: Based on protocol.equipment, variables, sampling_frequency, and procedure_steps; describe the experimental design.
- Results: Based on analysis.quality_score, analysis.statistics, and analysis.issues;
           list each variable's statistics (mean / range / median) and describe data quality.
- Discussion: Based on protocol.possible_errors, analysis.issues, and ai_explanation;
              analyse the causes of data anomalies and experimental limitations.
- Conclusion: Summarise only what the data already supports; note quality limitations when applicable.

[Output format]
Return a plain JSON object. Values may use inline Markdown (**bold**, - lists) but must NOT contain # headings:
{
  "introduction": "...",
  "method": "...",
  "results": "...",
  "discussion": "...",
  "conclusion": "..."
}
Do NOT wrap the JSON in ```json``` fences — output the raw JSON directly."""

    user_msg = f"""Please generate the five sections of a lab report based on the following data:

{data_ctx}{user_req_block}

Strictly follow the absolute rules above and return the JSON directly."""

    # ── 调用 Claude API ───────────────────────────────────
    resp = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2500,
        system=system,
        messages=[{"role": "user", "content": user_msg}],
    )

    raw = resp.content[0].text.strip()

    # 剥掉 Claude 可能加的 ```json ... ``` 包装
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1]
        raw = raw.rsplit("```", 1)[0].strip()

    result = json.loads(raw)

    # 验证五个字段都存在
    required = {"introduction", "method", "results", "discussion", "conclusion"}
    missing = required - set(result.keys())
    if missing:
        raise ValueError(f"Claude 返回 JSON 缺少字段：{missing}")

    return result


# ============================================================
# 路由定义
# ============================================================

@app.get("/api/health", response_model=HealthResponse, summary="健康检查")
async def health_check() -> HealthResponse:
    return HealthResponse(
        status="ok",
        message="DataLab AI 后端服务运行正常",
        timestamp=datetime.now(timezone.utc).isoformat(),
        version="0.2.0",
    )


@app.get("/", summary="根路径")
async def root() -> dict:
    return {"name": "DataLab AI Backend", "docs": "/docs", "health": "/api/health"}


@app.post(
    "/api/report",
    response_model=ReportResponse,
    summary="生成实验报告",
    description=(
        "接收实验方案（protocol）、分析结果（analysis）和用户格式要求，"
        "调用 Claude 生成五章节 Markdown 报告。"
        "API 不可用时自动回退本地模板，保证 demo 不崩。"
    ),
)
async def generate_report(req: ReportRequest) -> ReportResponse:
    """
    报告生成主流程：
    1. 收集 warnings（数据不完整时说明）
    2. 若有 ANTHROPIC_API_KEY：调用 Claude
    3. 若 Claude 失败（无 Key / 网络错误 / JSON 解析失败）：回退本地模板
    4. 拼装 Markdown 并返回

    ★ 核心保证：Results 中的数值来自 req.analysis.statistics，不编造
    """
    warnings: list[str] = []

    # 数据完整性检查 → 填充 warnings
    if req.protocol is None:
        warnings.append(
            "No protocol provided — Introduction and Method sections will have limited content"
        )
    if req.analysis is None:
        warnings.append(
            "No analysis data provided — the Results section cannot report specific experimental values"
        )

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    title = req.protocol.title if req.protocol else "实验报告"

    # ── 尝试调用 Claude ───────────────────────────────────
    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()

    if api_key:
        try:
            d = _call_claude(req.protocol, req.analysis, req.user_requirements)

            sections = ReportSections(
                introduction=d["introduction"],
                method=d["method"],
                results=d["results"],
                discussion=d["discussion"],
                conclusion=d["conclusion"],
            )
            footer = f"DataLab AI · Generated by Claude · {now}"

            return ReportResponse(
                title=title,
                markdown=_assemble_markdown(title, sections, footer),
                sections=sections,
                generated_from={
                    "has_protocol": req.protocol is not None,
                    "has_analysis": req.analysis is not None,
                    "dataset_name": req.analysis.dataset_name if req.analysis else None,
                },
                warnings=warnings,
            )

        except Exception as e:
            # Claude 调用失败 → 追加 warning，继续走 fallback
            print(f"[WARN] Claude API 失败，回退模板：{type(e).__name__}: {e}")
            warnings.append(f"AI generation failed ({type(e).__name__}) — falling back to local template report")
    else:
        warnings.append("ANTHROPIC_API_KEY not set — using local template report (values sourced from real data)")

    # ── 回退：本地模板 ─────────────────────────────────────
    return _fallback_report(req.protocol, req.analysis, warnings)


# ─── 入口 ────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
