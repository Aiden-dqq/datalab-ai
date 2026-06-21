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
import sys
import json
import logging

# ─── 修复 Windows 控制台中文打印崩溃 ──────────────────────
# Windows 默认控制台编码是 cp1252（或 gbk），无法编码中文字符，
# 导致任何含中文的 print() 抛 UnicodeEncodeError —— 这会把本应优雅
# 降级的逻辑（如 Claude 调用失败回退模板）直接变成 500 错误。
# 这里把标准输出/错误流统一重配成 UTF-8，从根上避免该问题。
# C++ 类比：相当于把 std::cout 的 locale 设成 UTF-8。
for _stream in (sys.stdout, sys.stderr):
    # reconfigure 是 Python 3.7+ 文本流的方法；某些环境下流可能没有该方法，故加保护
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8")

from pathlib import Path
from dotenv import load_dotenv                 # 从 .env 文件加载环境变量
# 优先加载与本文件同目录的 backend/.env（不依赖启动时的工作目录）；
# 找不到再退回 python-dotenv 的默认搜索（向上层目录找）。
# 这样无论从 backend/ 还是项目根启动，都能稳定读到 KEY。
_env_path = Path(__file__).with_name(".env")
if _env_path.exists():
    load_dotenv(_env_path)
else:
    load_dotenv()

# ─── Sentry 错误监控（功能2 等模块的异常会上报到 Sentry）──────
# 只有在 .env 里配了 SENTRY_DSN 时才启用：没配就完全跳过，本地开发照常跑。
# 这里在创建 FastAPI app 之前 init，sentry-sdk 会自动挂上 FastAPI 集成，
# 路由里未捕获的异常会自动上报；功能2 内部"吞掉"的异常则在 analyze.py 里
# 手动 capture_exception 上报（否则它们被优雅降级后就永远看不到了）。
import sentry_sdk
_sentry_dsn = os.getenv("SENTRY_DSN", "").strip()
if _sentry_dsn:
    sentry_sdk.init(
        dsn=_sentry_dsn,
        # 环境标识：方便在 Sentry 里区分本地 / 生产
        environment=os.getenv("SENTRY_ENVIRONMENT", "development"),
        send_default_pii=False,        # 不收集用户身份信息（隐私安全）
        traces_sample_rate=0.0,        # 只做错误监控，不开性能追踪（省额度）
    )
    print("[Sentry] 已启用错误监控")
else:
    print("[Sentry] 未配置 SENTRY_DSN，跳过（仅本地日志）")

from fastapi import FastAPI, HTTPException     # 核心框架类 + HTTP 异常（用于返回 4xx 错误）
from fastapi.middleware.cors import CORSMiddleware  # 跨域资源共享中间件
from pydantic import BaseModel                 # 数据验证库（类似 C++ 的 struct + 验证）
from datetime import datetime, timezone        # 日期时间处理
from typing import Optional, Any               # 类型注解：可选值 / 任意类型
import uvicorn                                 # ASGI 服务器（类似 C++ 里的 HTTP 服务器）

# 导入功能 A（Protocol Builder）的生成函数
# from protocol import generate_protocol ≈ C++ 的 #include "protocol.h" 后调用其中的函数
from protocol import generate_protocol

# 导入功能 B（Data Analyzer）的分析函数
from analyze import analyze_dataset

# 导入功能 C（Report Generator）的报告生成函数
from report import generate_report as build_report

# ─── 创建 FastAPI 应用实例 ────────────────────────────────
# C++ 类比：FastAPI app;  相当于 new FastAPI()
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

    ★ 这里故意用"普通字典(dict)"而不是严格的 ProtocolInput/AnalysisInput：
      前端传来的 protocol/analysis 可能带额外字段（chart_data、error_diagnosis）
      或偶尔缺字段。用严格模型会触发 422（前端就会看到"后端服务不可用"）。
      改成宽松 dict 后，报告逻辑在 report.py 里用 .get() 防御式读取，
      缺字段也不会报错，从根上消除 422。
    """
    protocol: Optional[dict] = None
    analysis: Optional[dict] = None
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

    # ── Introduction：来自 protocol.objective ────────────
    if protocol:
        intro = (
            f"本实验旨在{protocol.objective}。"
            f"实验前提假设包括：{'; '.join(protocol.assumptions[:3])}。"
        )
    else:
        intro = (
            "本报告由 DataLab AI 自动生成。"
            "由于未提供实验方案（Protocol），引言内容有限，建议补充后重新生成。"
        )

    # ── Method：来自 equipment / variables / procedure_steps ──
    if protocol:
        vars_desc = "、".join(f"{v.name}（{v.unit}）" for v in protocol.variables)
        steps_desc = "\n".join(
            f"{i+1}. {step}" for i, step in enumerate(protocol.procedure_steps)
        )
        method = (
            f"**实验设备**：{', '.join(protocol.equipment)}。\n\n"
            f"**记录变量**：{vars_desc}。\n\n"
            f"**采样频率**：{protocol.sampling_frequency}。\n\n"
            f"**实验步骤**：\n{steps_desc}\n\n"
            f"**控制条件**：{'; '.join(protocol.control_conditions)}。"
        )
    else:
        method = "未提供实验方案，方法章节无法自动生成。请完成方案设计后重新生成报告。"

    # ── Results：只引用 analysis.statistics，不编造数值 ──
    if analysis:
        stat_lines = []
        for col, s in analysis.statistics.items():
            parts = []
            if s.mean is not None: parts.append(f"均值 **{s.mean:.4g}**")
            if s.min is not None and s.max is not None:
                parts.append(f"范围 [{s.min:.4g}, {s.max:.4g}]")
            if s.median is not None: parts.append(f"中位数 {s.median:.4g}")
            if parts:
                stat_lines.append(f"- **{col}**：{', '.join(parts)}")

        stat_block = "\n".join(stat_lines) if stat_lines else "（暂无列统计数据）"
        high_cnt = sum(1 for i in analysis.issues if i.severity == "high")
        issue_note = (
            f"其中高严重性问题 {high_cnt} 个" if high_cnt else "严重性均为低/中级别"
        )

        results = (
            f"数据集 **{analysis.dataset_name}** 共 {analysis.row_count} 行 "
            f"{analysis.column_count} 列，数据质量评分 **{analysis.quality_score:.1f} / 100**"
            f"（等级：{analysis.quality_level}）。\n\n"
            f"**各变量统计概况**：\n{stat_block}\n\n"
            f"数据质量检查共发现 **{len(analysis.issues)}** 个问题，{issue_note}。\n\n"
            f"AI 解读置信度：**{analysis.ai_explanation.confidence}**。"
            f"数据质量对结论的影响：{analysis.ai_explanation.impact_on_conclusion}"
        )
    else:
        results = (
            "由于未提供数据分析结果（Analysis），本节无法给出具体实验数值。"
            "请完成数据分析步骤后重新生成，以获得包含真实统计数值的 Results 章节。"
        )

    # ── Discussion：来自 possible_errors / issues / ai_explanation ──
    if analysis and analysis.ai_explanation.possible_causes:
        causes  = "；".join(analysis.ai_explanation.possible_causes[:3])
        actions = "；".join(analysis.ai_explanation.suggested_actions[:3])
        discussion = (
            f"**数据异常可能原因**：{causes}。\n\n"
            f"**建议改进措施**：{actions}。"
        )
    elif protocol and protocol.possible_errors:
        errs = "、".join(protocol.possible_errors[:4])
        discussion = (
            f"本实验的潜在误差来源包括：{errs}。"
            "建议在后续实验中针对性地加以控制，以提高数据可靠性。"
        )
    else:
        discussion = "由于数据有限，讨论部分无法提供深入分析。建议补充实验数据后重新生成。"

    # ── Conclusion：只总结数据能支持的，质量低时注明限制 ──
    if analysis:
        q = analysis.quality_level
        if q in ("Excellent", "Good"):
            qual_note = "实验结果具有较高可信度，可作为后续研究的参考依据。"
        else:
            qual_note = (
                f"⚠️ 注意：本次数据质量等级为 {q}，结论存在不确定性，"
                "建议清理数据质量问题后重新分析再得出定论。"
            )
        conclusion = (
            f"综合以上分析，数据质量评分为 {analysis.quality_score:.1f}/100（{q}）。"
            f"{qual_note}"
            " 后续研究可在此基础上扩大样本量，进一步验证实验假设。"
        )
    else:
        conclusion = (
            "由于缺乏完整实验数据，目前无法给出确定性结论。"
            "请在完成数据采集与分析后重新生成报告，以获得有数据支撑的结论。"
        )

    sections = ReportSections(
        introduction=intro,
        method=method,
        results=results,
        discussion=discussion,
        conclusion=conclusion,
    )
    footer = f"DataLab AI 自动生成（模板模式） · {now}"

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
    system = """你是一名严谨的科学实验报告写作助手，负责根据真实实验数据生成五章节学术报告。

【铁律 — 违反则报告无效】
1. Results 章节出现的所有具体数值（均值、最小值、最大值、中位数、行数、质量评分等），
   必须且只能来自用户提供的"真实实验数据"区块中的数字，不得估算、推断或编造。
2. 若 analysis 数据缺失，Results 章节必须明确写"由于缺少分析数据，无法给出具体数值"，
   而不是编造任何数字。
3. Conclusion 只能总结 Results 已展示数据所能支持的结论。
   若 quality_level 为 Risky 或 Poor，必须在 Conclusion 中注明数据质量限制。
4. 全程使用中文，语言客观严谨。
5. 每个章节只输出正文，不要包含章节标题（标题由系统自动添加）。

【章节写作规则】
- Introduction：基于 protocol.objective 和用户目标，说明实验背景、目的与科学假设。
- Method：基于 protocol.equipment、variables、sampling_frequency、procedure_steps，描述实验设计。
- Results：基于 analysis.quality_score、analysis.statistics、analysis.issues，
          逐变量列出统计数值（格式：变量名 均值/范围/中位数），并说明数据质量情况。
- Discussion：基于 protocol.possible_errors、analysis.issues、ai_explanation，
             分析数据异常原因与实验局限性。
- Conclusion：只总结数据已支持的结论；质量低时须注明限制。

【输出格式】
返回纯 JSON 对象，字段值为含 Markdown 内联格式（**加粗**、- 列表）的文字，不含 # 标题：
{
  "introduction": "...",
  "method": "...",
  "results": "...",
  "discussion": "...",
  "conclusion": "..."
}
不要包含任何 ```json``` 代码块标记，直接输出 JSON。"""

    user_msg = f"""请根据以下数据生成实验报告五个章节：

{data_ctx}{user_req_block}

请严格遵守铁律，直接返回 JSON。"""

    # ── 调用 Claude API ───────────────────────────────────
    resp = client.messages.create(
        model="claude-sonnet-4-6",
        # max_tokens 必须大到能装下完整的五章节报告。原值 2500 在"有完整
        # protocol+analysis 数据"时会把 JSON 输出截断，导致后面 json.loads
        # 解析失败 → 报告接口 500。8000 对五章节中文报告足够。
        max_tokens=8000,
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


# ─── 功能 A：Protocol Builder（实验方案生成）────────────────
# 请求体模型：前端 POST 过来的 JSON 会被自动解析成这个对象
# C++ 类比：
#   struct ProtocolRequest {
#     string goal;                 // 实验目标（必填）
#     optional<string> constraints; // 限制条件（可选）
#   };
class ProtocolRequest(BaseModel):
    goal: str                              # 实验目标（必填）
    constraints: Optional[str] = None      # 限制条件（可选，默认 None）


# @app.post 注册一个 POST 接口（生成类操作通常用 POST，因为要提交数据）
@app.post(
    "/api/protocol",
    summary="生成实验方案",
    description="接收实验目标，调用 Claude 生成符合 ProtocolOutput 结构的方案",
)
async def create_protocol(req: ProtocolRequest) -> dict:
    """
    实验方案生成接口

    前端发来 { "goal": "...", "constraints": "..." }，
    后端调用 generate_protocol() 生成方案，统一返回：
      { "ok": bool, "data": <方案或mock>, "error": <错误说明或null> }

    无论成功失败，data 里都有一份可用的方案，前端不会白屏。
    """
    # FastAPI 已经把请求 JSON 解析成 req 对象，直接取字段调用即可
    return generate_protocol(goal=req.goal, constraints=req.constraints)


# ─── 功能 B：Data Analyzer（数据质量分析 + 错误诊断）──────────
# 请求体模型：前端 analyze 页面 POST 过来的 JSON
# C++ 类比：
#   struct AnalyzeRequest {
#     string csv_text = "";                 // 文本表格内容（CSV/tab/分号）
#     string dataset_name = "experiment.csv";
#     optional<string> protocol_context;    // 情况一：方案上下文（含步骤/设备）
#     string input_kind = "text";           // "text" | "xlsx" | "image"
#     optional<string> file_base64;         // xlsx/image 的二进制(base64)
#     optional<string> media_type;          // 图片 MIME，如 image/png
#     optional<string> experiment_steps;    // 情况二：用户后补的实验步骤
#   };
class AnalyzeRequest(BaseModel):
    csv_text: str = ""                                 # 文本表格内容（可空，xlsx/image 时不用）
    dataset_name: str = "experiment.csv"               # 数据集名（可选）
    protocol_context: Optional[str] = None             # 实验方案上下文（情况一，可选）
    input_kind: str = "text"                           # 输入类型：text/xlsx/image
    file_base64: Optional[str] = None                  # xlsx/image 的 base64 内容
    media_type: Optional[str] = None                   # 图片 MIME 类型（image 时用）
    experiment_steps: Optional[str] = None             # 用户后补的实验步骤（情况二）


@app.post(
    "/api/analyze",
    summary="数据质量分析",
    description=(
        "接收 CSV 文本，用 pandas 做确定性检测（缺失值/重复行/IQR离群点），"
        "计算各列统计与 0~100 质量分，再调用 Claude 解读异常。"
        "Claude 失败时只返回程序分析结果，保证不崩。"
    ),
)
async def create_analysis(req: AnalyzeRequest) -> dict:
    """
    数据分析接口

    前端发来 { csv_text, dataset_name, protocol_context }。
    analyze_dataset() 内部返回 { ok, data, error }，这里做一层适配：

    ★ 注意契约：队友 B 的前端（analyze/page.tsx）直接把 200 响应体当成
      AnalysisOutput 使用，并在非 200 时读 errBody.detail。所以这里：
        - 成功 → 直接返回 data（即纯 AnalysisOutput，HTTP 200）
        - CSV 解析失败 → 抛 HTTPException(400, detail=...)，正好对上前端的错误处理

    Claude API 失败不会走到这里的错误分支——它在 analyze_dataset 内部已被
    兜底（ai_explanation 用本地文字），ok 仍为 True。
    """
    result = analyze_dataset(
        csv_text=req.csv_text,
        dataset_name=req.dataset_name,
        protocol_context=req.protocol_context,
        input_kind=req.input_kind,
        file_base64=req.file_base64,
        media_type=req.media_type,
        experiment_steps=req.experiment_steps,
    )
    # 唯一的硬错误：数据解析失败 → 返回 400，前端 errBody.detail 显示提示
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result["error"])
    # 成功：直接返回 AnalysisOutput（前端 setResult(data) 直接用）
    return result["data"]


# ─── 根路径路由 ────────────────────────────────────────────
@app.get("/", summary="根路径")
async def root() -> dict:
    return {"name": "DataLab AI Backend", "docs": "/docs", "health": "/api/health"}


@app.post(
    "/api/report",
    summary="生成实验报告",
    description=(
        "接收实验方案（protocol）、分析结果（analysis）和用户格式要求，"
        "委托 report.py 调用 Claude 生成五章节 Markdown 报告。"
        "API 不可用时自动回退本地模板，始终返回 ok=True，保证 demo 不崩。"
    ),
)
async def generate_report(req: ReportRequest) -> dict:
    """
    报告生成接口（逻辑已抽到 report.py，这里只做转发）。

    前端发来 { protocol, analysis, user_requirements }，
    build_report() 内部：
      - 用结构化输出调用 Claude（强制合法 JSON，杜绝坏 JSON 崩溃）
      - 任何失败都回退本地模板
      - 始终返回 { ok: True, title, markdown, sections, generated_from, warnings }

    ★ 不再用严格 pydantic 校验请求体 → 不会 422；report.py 内部不抛异常 → 不会 500。
    """
    return build_report(
        protocol=req.protocol,
        analysis=req.analysis,
        user_requirements=req.user_requirements,
    )


# ─── 入口 ────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
