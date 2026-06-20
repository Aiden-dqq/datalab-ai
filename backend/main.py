# ============================================================
# backend/main.py — FastAPI 后端主文件
# ============================================================
#
# Python 的 import 类似 C++ 的 #include，导入外部库
# FastAPI 是一个现代的 Python Web 框架，类似 C++ 里的 HTTP 服务器库
#
# Python 语法快速对照：
#   C++: int add(int a, int b) { return a + b; }
#   Py:  def add(a: int, b: int) -> int: return a + b
#
#   C++: // 单行注释
#   Py:  # 单行注释
#
#   C++: { ... }  用花括号划定代码块
#   Py:  用缩进划定代码块（4个空格），没有花括号
# ============================================================

import os                                         # 读取系统环境变量（存 API Key 用）
import json                                        # JSON 序列化/反序列化，类似 C++ 的 nlohmann/json
from fastapi import FastAPI                        # 核心框架类
from fastapi.middleware.cors import CORSMiddleware # 跨域资源共享中间件
from pydantic import BaseModel                     # 数据验证库（类似 C++ 的 struct + 验证）
from datetime import datetime, timezone            # 日期时间处理
from typing import Optional, Any                   # Optional<T> 对应 C++ 的 std::optional<T>
import uvicorn                                     # ASGI 服务器（类似 C++ 里的 HTTP 服务器）

# 加载 .env 文件里的环境变量（如 ANTHROPIC_API_KEY=sk-ant-xxx）
# C++ 类比：读取配置文件，把 key=value 存到 std::getenv() 可查的地方
from dotenv import load_dotenv
load_dotenv()

# ─── 创建 FastAPI 应用实例 ────────────────────────────────
app = FastAPI(
    title="DataLab AI Backend",
    description="DataLab AI 实验工作流平台后端 API",
    version="0.1.0",
)

# ─── 配置 CORS（跨域资源共享）────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# 数据模型定义（Pydantic BaseModel）
# 相当于 C++ 的 struct，但会自动验证类型并在出错时返回 422 错误
# ============================================================

class HealthResponse(BaseModel):
    status: str
    message: str
    timestamp: str
    version: str


# ── 报告请求体中的"分析数据"子结构 ─────────────────────────
# 对应 TypeScript 的 AnalysisOutput（session.ts 第 72 行）
# C++ 类比：struct AnalysisInput { ... };
class StatColumn(BaseModel):
    """单列统计数据（最小/最大/平均/中位数）"""
    min: Optional[float] = None
    max: Optional[float] = None
    mean: Optional[float] = None
    median: Optional[float] = None

class IssueItem(BaseModel):
    """数据质量问题条目"""
    type: str              # "missing" | "duplicate" | "non_numeric" | "time_gap" | "outlier"
    severity: str          # "low" | "medium" | "high"
    row_index: Optional[int] = None
    column: Optional[str] = None
    message: str
    value: Optional[Any] = None

class AIExplanation(BaseModel):
    """AI 对数据问题的解释"""
    possible_causes: list[str]
    suggested_actions: list[str]
    impact_on_conclusion: str
    confidence: str        # "low" | "medium" | "high"

class AnalysisInput(BaseModel):
    """完整分析结果（对应 AnalysisOutput）"""
    dataset_name: str
    row_count: int
    column_count: int
    quality_score: float   # 0 ~ 100
    quality_level: str     # "Excellent" | "Good" | "Risky" | "Poor"
    issues: list[IssueItem]
    statistics: dict[str, StatColumn]   # 列名 → 统计数据
    ai_explanation: AIExplanation


# ── 报告请求体中的"实验方案"子结构 ─────────────────────────
# 对应 TypeScript 的 ProtocolOutput（session.ts 第 19 行）
class VariableItem(BaseModel):
    """实验变量"""
    name: str
    unit: str
    type: str              # "numeric" | "string" | "time"
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


# ── 报告生成的请求体和响应体 ───────────────────────────────
class ReportRequest(BaseModel):
    """
    前端 POST /api/report 时发送的请求体
    protocol 和 analysis 都是可选的，没有任何数据也能生成（但会有 warnings）
    C++ 类比：struct ReportRequest { ProtocolInput* protocol; AnalysisInput* analysis; };
    """
    protocol: Optional[ProtocolInput] = None
    analysis: Optional[AnalysisInput] = None

class ReportSections(BaseModel):
    """报告的五个章节（纯文字，不含 Markdown 标题）"""
    introduction: str   # 引言
    method: str         # 实验方法
    results: str        # 实验结果（★ 所有数值必须来自真实 analysis 数据）
    discussion: str     # 讨论分析
    conclusion: str     # 结论

class ReportResponse(BaseModel):
    """
    /api/report 的响应体，对应 TypeScript 的 ReportOutput（session.ts 第 153 行）
    C++ 类比：struct ReportResponse { string title; string markdown; ... };
    """
    title: str
    markdown: str                        # 完整 Markdown 报告（可直接展示或导出）
    sections: ReportSections             # 五章节结构化内容
    generated_from: dict                 # {"has_protocol": bool, "has_analysis": bool, ...}
    warnings: list[str]                  # 生成时的警告信息


# ============================================================
# 工具函数
# ============================================================

def _build_statistics_text(analysis: AnalysisInput) -> str:
    """
    把 analysis.statistics 里的真实数值格式化成文字块，
    后续直接嵌入给 Claude 的 prompt，确保 Claude 只用真实数值
    C++ 类比：std::string buildStatisticsText(const AnalysisInput& a)
    """
    lines = []
    for col_name, stat in analysis.statistics.items():
        parts = []
        if stat.min is not None:
            parts.append(f"最小值={stat.min:.4g}")
        if stat.max is not None:
            parts.append(f"最大值={stat.max:.4g}")
        if stat.mean is not None:
            parts.append(f"平均值={stat.mean:.4g}")
        if stat.median is not None:
            parts.append(f"中位数={stat.median:.4g}")
        if parts:
            lines.append(f"  - {col_name}: {', '.join(parts)}")
    return "\n".join(lines) if lines else "  （无列统计数据）"


def _build_issues_text(analysis: AnalysisInput) -> str:
    """把数据质量问题格式化成文字块"""
    if not analysis.issues:
        return "  （无数据质量问题）"
    lines = []
    for issue in analysis.issues[:10]:  # 最多显示前 10 条，避免 prompt 过长
        lines.append(f"  - [{issue.severity}] {issue.message}")
    return "\n".join(lines)


def _build_fallback_report(
    protocol: Optional[ProtocolInput],
    analysis: Optional[AnalysisInput],
    warnings: list[str],
) -> ReportResponse:
    """
    API 调用失败时返回的本地模板报告
    ★ 本地模板中，Results 节也只引用真实数据；如果没有数据则说明无法提供具体数值
    C++ 类比：ReportResponse buildFallbackReport(...) { ... }
    """
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    # ── 确定报告标题 ──────────────────────────────────────
    title = protocol.title if protocol else "实验报告（模板）"

    # ── 引言 ──────────────────────────────────────────────
    if protocol:
        intro = (
            f"本实验旨在{protocol.objective}。"
            f"实验使用以下设备：{', '.join(protocol.equipment[:5])}。"
            f"实验设定的前提假设包括：{'; '.join(protocol.assumptions[:3])}。"
        )
    else:
        intro = "本实验报告由 DataLab AI 自动生成。由于未提供实验方案，引言部分内容有限。"

    # ── 方法 ──────────────────────────────────────────────
    if protocol:
        steps_text = "\n".join(
            f"{i+1}. {step}" for i, step in enumerate(protocol.procedure_steps)
        )
        vars_text = "、".join(
            f"{v.name}（{v.unit}）" for v in protocol.variables
        )
        method = (
            f"实验记录变量：{vars_text}。\n"
            f"采样频率：{protocol.sampling_frequency}。\n"
            f"实验步骤：\n{steps_text}\n"
            f"控制条件：{'; '.join(protocol.control_conditions)}。"
        )
    else:
        method = "由于未提供实验方案，实验方法部分无法自动生成。请在方案设计步骤填写后重新生成报告。"

    # ── 结果（★ 关键：只写真实数值，没有数据则明确说明）──────
    if analysis:
        stats_lines = []
        for col_name, stat in analysis.statistics.items():
            parts = []
            if stat.mean is not None:
                parts.append(f"均值 {stat.mean:.4g}")
            if stat.min is not None and stat.max is not None:
                parts.append(f"范围 [{stat.min:.4g}, {stat.max:.4g}]")
            if parts:
                stats_lines.append(f"- **{col_name}**：{', '.join(parts)}")

        stats_block = "\n".join(stats_lines) if stats_lines else "（暂无列统计数据）"
        issue_count = len(analysis.issues)
        high_issues = sum(1 for i in analysis.issues if i.severity == "high")

        results = (
            f"数据集 **{analysis.dataset_name}** 共 {analysis.row_count} 行 "
            f"{analysis.column_count} 列，数据质量评分 **{analysis.quality_score:.1f}/100**"
            f"（{analysis.quality_level}）。\n\n"
            f"各变量统计概况：\n{stats_block}\n\n"
            f"数据质量检查共发现 {issue_count} 个问题"
            + (f"，其中高严重性问题 {high_issues} 个。" if high_issues else "，均为低/中严重性。")
            + f"\n\nAI 解读置信度：{analysis.ai_explanation.confidence}。"
            + f"对结论的影响：{analysis.ai_explanation.impact_on_conclusion}"
        )
    else:
        results = "由于未提供数据分析结果，本节无法提供具体实验数值。请在数据分析步骤完成后重新生成报告。"

    # ── 讨论 ──────────────────────────────────────────────
    if analysis and analysis.ai_explanation.possible_causes:
        causes = "；".join(analysis.ai_explanation.possible_causes[:3])
        actions = "；".join(analysis.ai_explanation.suggested_actions[:3])
        discussion = (
            f"数据异常的可能原因：{causes}。\n"
            f"建议后续采取以下措施：{actions}。"
        )
    elif protocol and protocol.possible_errors:
        errors = "、".join(protocol.possible_errors[:3])
        discussion = f"本实验的潜在误差来源包括：{errors}。建议在后续实验中针对性地加以控制。"
    else:
        discussion = "由于数据有限，讨论部分无法提供深入分析。建议补充完整实验数据后重新生成。"

    # ── 结论 ──────────────────────────────────────────────
    if analysis:
        q = analysis.quality_level
        conclusion = (
            f"综合以上分析，本次实验数据质量等级为 {q}，"
            + ("实验结果具有较高可信度。" if q in ("Excellent", "Good") else "建议排除质量问题后再做定论。")
            + " 后续实验可在此基础上扩大样本量，以进一步验证实验结论。"
        )
    else:
        conclusion = "由于缺乏完整数据，暂无法给出确定性结论。请完善实验数据后重新生成报告。"

    # ── 拼装完整 Markdown ─────────────────────────────────
    markdown = f"""# {title}

## 1. 引言（Introduction）

{intro}

## 2. 实验方法（Method）

{method}

## 3. 实验结果（Results）

{results}

## 4. 讨论（Discussion）

{discussion}

## 5. 结论（Conclusion）

{conclusion}

---

*本报告由 DataLab AI 自动生成（模板模式） · {now_str}*
"""

    return ReportResponse(
        title=title,
        markdown=markdown,
        sections=ReportSections(
            introduction=intro,
            method=method,
            results=results,
            discussion=discussion,
            conclusion=conclusion,
        ),
        generated_from={
            "has_protocol": protocol is not None,
            "has_analysis": analysis is not None,
            "dataset_name": analysis.dataset_name if analysis else None,
        },
        warnings=warnings,
    )


def _call_claude_for_report(
    protocol: Optional[ProtocolInput],
    analysis: Optional[AnalysisInput],
) -> dict:
    """
    调用 Claude API 生成报告的五个章节，返回 dict{"introduction":..., ...}
    如果调用失败会抛出异常，由外层 try/except 捕获后回退到本地模板

    ★ 关键安全措施：把所有真实统计数值直接嵌入 prompt，
       并明确禁止 Claude 编造任何数值，只允许使用 prompt 中给出的数据
    C++ 类比：map<string, string> callClaudeForReport(...)
    """
    from anthropic import Anthropic

    client = Anthropic()  # 自动读取 ANTHROPIC_API_KEY 环境变量

    # ── 构建"数据上下文"文字块（嵌入真实数值）──────────────
    data_context_parts = []

    if protocol:
        data_context_parts.append(f"""
【实验方案】
- 标题：{protocol.title}
- 目标：{protocol.objective}
- 设备：{', '.join(protocol.equipment)}
- 变量：{', '.join(f"{v.name}({v.unit})" for v in protocol.variables)}
- 采样频率：{protocol.sampling_frequency}
- 预计时长：{protocol.expected_duration_minutes} 分钟（如有）
- 实验步骤（共 {len(protocol.procedure_steps)} 步）：
{chr(10).join(f"  {i+1}. {s}" for i, s in enumerate(protocol.procedure_steps))}
- 控制条件：{'; '.join(protocol.control_conditions)}
- 潜在误差：{'; '.join(protocol.possible_errors)}
""")

    if analysis:
        data_context_parts.append(f"""
【真实实验数据（Results 章节必须且只能引用这些数值，不得编造）】
- 数据集名：{analysis.dataset_name}
- 行数：{analysis.row_count}，列数：{analysis.column_count}
- 质量评分：{analysis.quality_score:.1f}/100（{analysis.quality_level}）
- 各列真实统计数值：
{_build_statistics_text(analysis)}
- 数据质量问题（共 {len(analysis.issues)} 个）：
{_build_issues_text(analysis)}
- AI 解读：
  - 可能原因：{'; '.join(analysis.ai_explanation.possible_causes)}
  - 建议措施：{'; '.join(analysis.ai_explanation.suggested_actions)}
  - 对结论影响：{analysis.ai_explanation.impact_on_conclusion}
  - 置信度：{analysis.ai_explanation.confidence}
""")

    data_context = "\n".join(data_context_parts) if data_context_parts else "（未提供任何实验数据）"

    # ── 构建给 Claude 的 prompt ───────────────────────────
    system_prompt = """你是一个严谨的科学报告写作助手。
你的任务是根据提供的真实实验数据，生成一份结构化的实验报告。

【铁则，违反将导致报告无效】
1. Results（实验结果）章节中出现的所有数值，必须且只能来自用户提供的"真实实验数据"。
2. 严格禁止编造、估算或伪造任何实验数值、统计数据或实验结论。
3. 如果某项数据缺失，必须明确说明"由于缺少相关数据，此处无法给出具体数值"，而不是编造。
4. 报告使用中文撰写，语言严谨、客观、简洁。
5. 不要在输出中包含任何章节标题（标题由系统自动添加）。

【输出格式】
请以 JSON 对象回复，结构如下，每个字段的值是纯文字（可含 Markdown 内联格式如 **加粗**，但不含 # 标题）：
{
  "introduction": "引言正文...",
  "method": "方法正文...",
  "results": "结果正文（仅使用真实数值）...",
  "discussion": "讨论正文...",
  "conclusion": "结论正文..."
}"""

    user_message = f"""请根据以下实验数据，生成一份正式实验报告的五个章节：

{data_context}

要求：
- Introduction（引言）：说明实验背景、目的和假设
- Method（方法）：描述实验设计、设备、变量和步骤
- Results（结果）：★ 必须且只能使用上方"真实实验数据"中给出的具体数值，逐列描述统计结果
- Discussion（讨论）：结合数据质量和 AI 解读，分析可能原因和局限性
- Conclusion（结论）：给出基于真实数据的客观结论

请直接返回 JSON，不要包含 markdown 代码块标记。"""

    # ── 调用 Claude API ───────────────────────────────────
    # Anthropic() 的 messages.create 类似 C++ 里发一个 HTTP POST 请求并等待响应
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    )

    # 从响应中取出纯文字内容
    raw_text = message.content[0].text.strip()

    # 解析 JSON 响应（C++ 类比：nlohmann::json::parse）
    # Claude 有时会包裹在 ```json ... ``` 里，需要剥掉
    if raw_text.startswith("```"):
        raw_text = raw_text.split("\n", 1)[1]           # 去掉第一行 ```json
        raw_text = raw_text.rsplit("```", 1)[0].strip() # 去掉最后的 ```

    sections_dict = json.loads(raw_text)

    # 验证五个章节都存在
    required_keys = {"introduction", "method", "results", "discussion", "conclusion"}
    missing = required_keys - set(sections_dict.keys())
    if missing:
        raise ValueError(f"Claude 返回的 JSON 缺少字段：{missing}")

    return sections_dict


# ============================================================
# 路由定义
# ============================================================

@app.get(
    "/api/health",
    response_model=HealthResponse,
    summary="健康检查接口",
)
async def health_check() -> HealthResponse:
    return HealthResponse(
        status="ok",
        message="DataLab AI 后端服务运行正常",
        timestamp=datetime.now(timezone.utc).isoformat(),
        version="0.1.0",
    )


@app.get("/", summary="根路径")
async def root() -> dict:
    return {
        "name": "DataLab AI Backend",
        "docs": "/docs",
        "health": "/api/health",
    }


@app.post(
    "/api/report",
    response_model=ReportResponse,
    summary="生成实验报告",
    description="接收实验方案和分析结果，调用 Claude 生成五章节 Markdown 报告。API 不可用时自动回退本地模板。",
)
async def generate_report(req: ReportRequest) -> ReportResponse:
    """
    报告生成主接口

    流程：
    1. 收集 warnings（数据不完整时告知用户）
    2. 尝试调用 Claude API 生成五章节内容
    3. 若 API 失败（无 Key / 网络错误 / 解析失败），回退到本地模板
    4. 拼装成完整 Markdown 并返回

    ★ 核心保证：Results 中的数值来自 req.analysis.statistics，绝不编造
    """

    # ── 收集 warnings ─────────────────────────────────────
    # C++ 类比：vector<string> warnings;
    warnings: list[str] = []
    if req.protocol is None:
        warnings.append("未提供实验方案（Protocol），引言和方法章节内容可能不完整")
    if req.analysis is None:
        warnings.append("未提供数据分析结果（Analysis），Results 章节将无法提供具体实验数值")

    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    title = req.protocol.title if req.protocol else "实验报告"

    # ── 尝试调用 Claude ───────────────────────────────────
    # C++ 类比：try { ... } catch (std::exception& e) { ... }
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    use_claude = bool(api_key)  # 没有 Key 时直接用本地模板，避免等待超时

    if use_claude:
        try:
            sections_dict = _call_claude_for_report(req.protocol, req.analysis)

            intro      = sections_dict["introduction"]
            method     = sections_dict["method"]
            results    = sections_dict["results"]
            discussion = sections_dict["discussion"]
            conclusion = sections_dict["conclusion"]

            # 拼装 Markdown（五章节 + 页脚）
            markdown = f"""# {title}

## 1. 引言（Introduction）

{intro}

## 2. 实验方法（Method）

{method}

## 3. 实验结果（Results）

{results}

## 4. 讨论（Discussion）

{discussion}

## 5. 结论（Conclusion）

{conclusion}

---

*本报告由 DataLab AI · Claude 自动生成 · {now_str}*
"""

            return ReportResponse(
                title=title,
                markdown=markdown,
                sections=ReportSections(
                    introduction=intro,
                    method=method,
                    results=results,
                    discussion=discussion,
                    conclusion=conclusion,
                ),
                generated_from={
                    "has_protocol": req.protocol is not None,
                    "has_analysis": req.analysis is not None,
                    "dataset_name": req.analysis.dataset_name if req.analysis else None,
                },
                warnings=warnings,
            )

        except Exception as e:
            # API 调用失败：记录错误并回退到本地模板
            # C++ 类比：std::cerr << "Claude API failed: " << e.what() << std::endl;
            print(f"[WARN] Claude API 调用失败，回退到本地模板：{e}")
            warnings.append(f"AI 生成失败（{type(e).__name__}），已使用本地模板报告")

    else:
        # 没有 API Key，直接用本地模板
        warnings.append("未配置 ANTHROPIC_API_KEY，使用本地模板报告")

    # ── 回退：返回本地模板报告 ────────────────────────────
    return _build_fallback_report(req.protocol, req.analysis, warnings)


# ─── 直接运行此文件时启动服务器 ───────────────────────────
if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
