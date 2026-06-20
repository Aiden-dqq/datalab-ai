// ============================================================
// app/report/page.tsx — 报告生成页（路由：/report）
// ============================================================
//
// 功能概述：
//   1. 从 localStorage 读取前两步的 ProtocolOutput + AnalysisOutput
//   2. 点击"生成报告"→ POST /api/report，Claude 生成五章节 Markdown
//   3. 渲染 Markdown 报告，并提供"复制报告"按钮
//   4. 如果 API 失败，后端自动返回本地模板报告，前端无感知
//
// TypeScript 语法快速对照（假设你懂 C++）：
//   useState<T>(初始值)  ← 类似 T 类型的成员变量，值改变时自动触发重渲染
//   useEffect(fn, [])    ← 组件挂载时执行一次，相当于构造函数里的初始化
//   interface / type     ← 等价于 C++ 的 struct
//   string | null        ← 类似 C++ 的 std::optional<std::string>
// ============================================================
"use client";

import { useState, useEffect, useCallback } from "react";
import { loadSession, saveSession, ReportOutput, ProtocolOutput, AnalysisOutput } from "@/lib/session";

// ── 把 Markdown 文本转成带基础格式的 HTML ─────────────────
// 不引入外部库，用正则表达式处理最常见的 Markdown 语法
// C++ 类比：std::string markdownToHtml(const std::string& md)
function renderMarkdown(md: string): string {
  return md
    // 代码块（不做修改，直接保留）—— 需要先处理，避免后续规则误触
    .replace(/```[\s\S]*?```/g, (m) => `<pre class="md-code">${m.replace(/```\w*\n?/g, "")}</pre>`)
    // H1 标题 (#)
    .replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>')
    // H2 标题 (##)
    .replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>')
    // H3 标题 (###)
    .replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>')
    // 分隔线 ---
    .replace(/^---$/gm, '<hr class="md-hr" />')
    // 粗体 **text**
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // 斜体 *text*
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // 无序列表 - item（只处理简单单行）
    .replace(/^- (.+)$/gm, '<li class="md-li">$1</li>')
    // 有序列表 1. item
    .replace(/^\d+\. (.+)$/gm, '<li class="md-li md-oli">$1</li>')
    // 把连续的换行转成段落分隔（两个换行 → 段落间距）
    .replace(/\n\n/g, '</p><p class="md-p">')
    // 单换行转 <br>
    .replace(/\n/g, "<br />");
}

// ── 数据来源状态组件（显示绿色/灰色徽章）────────────────
// C++ 类比：void renderStatusBadge(bool ok, const char* label)
function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={ok ? "text-green-500" : "text-slate-400"}>
        {ok ? "✅" : "⭕"}
      </span>
      <span className="text-slate-600">{label}</span>
    </div>
  );
}

// ── 主页面组件 ────────────────────────────────────────────
export default function ReportPage() {
  // ── 状态变量（类似 C++ 类的成员变量）────────────────────
  const [isGenerating, setIsGenerating] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);   // 复制成功提示
  const [report, setReport] = useState<ReportOutput | null>(null); // 当前报告
  const [warnings, setWarnings] = useState<string[]>([]);          // 后端返回的警告

  // 记录 session 中是否有 protocol / analysis（用于显示数据来源状态）
  const [hasProtocol, setHasProtocol] = useState(false);
  const [hasAnalysis, setHasAnalysis] = useState(false);
  const [datasetName, setDatasetName] = useState<string | null>(null);

  // ── 初始化：从 localStorage 读取已有数据 ─────────────────
  // useEffect 里的 [] 表示"只在组件首次加载时执行一次"
  // C++ 类比：构造函数里读取配置文件
  useEffect(() => {
    const session = loadSession();
    const proto = session?.protocol as ProtocolOutput | undefined;
    const analysis = session?.analysis as AnalysisOutput | undefined;

    // 判断 analysis 是否是真正的 AnalysisOutput（有 statistics 字段）
    // 旧版 analyze 页面保存的是简化数据，不含 statistics
    const hasRealAnalysis = Boolean(analysis && "statistics" in analysis);

    setHasProtocol(Boolean(proto));
    setHasAnalysis(hasRealAnalysis);
    setDatasetName(analysis?.dataset_name ?? null);

    // 如果 localStorage 里已有保存的报告，直接展示
    if (session?.report) {
      setReport(session.report);
    }
  }, []);

  // ── 生成报告 ──────────────────────────────────────────────
  // async 函数 = C++ 的 std::future<void>，可以 await 异步操作
  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setWarnings([]);

    // 从 localStorage 取原始数据，准备发给后端
    const session = loadSession();
    const proto = session?.protocol as ProtocolOutput | undefined;
    const analysis = session?.analysis as AnalysisOutput | undefined;

    // 只有在 analysis 有 statistics 字段时才认为是完整的 AnalysisOutput
    // C++ 类比：dynamic_cast<AnalysisOutput*>(analysis)
    const hasRealAnalysis = Boolean(analysis && "statistics" in analysis);

    try {
      // POST /api/report（Next.js 的 rewrites 会把这个请求转发到 FastAPI:8000）
      // C++ 类比：libcurl 发 HTTP POST 请求
      const response = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // 只在数据存在且格式正确时才传给后端，否则传 null
          protocol: proto ?? null,
          analysis: hasRealAnalysis ? analysis : null,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // JSON.parse 把响应字符串转成对象
      // C++ 类比：nlohmann::json j = json::parse(response_body);
      const data = await response.json();

      // 把后端返回的数据映射到 ReportOutput 结构
      const newReport: ReportOutput = {
        title: data.title,
        markdown: data.markdown,
        sections: data.sections,
        generated_from: data.generated_from,
        warnings: data.warnings ?? [],
      };

      setReport(newReport);
      setWarnings(data.warnings ?? []);

      // 持久化到 localStorage，下次打开页面直接显示
      // C++ 类比：writeToFile(session)
      const currentSession = loadSession() ?? {};
      saveSession({ ...currentSession, report: newReport });

    } catch (err) {
      // 前端网络层也可能出错（后端未启动等），这里做最后兜底
      // C++ 类比：catch (std::exception& e) { cerr << e.what(); }
      console.error("报告生成失败:", err);
      setWarnings(["网络请求失败，请确认后端服务是否启动（localhost:8000）"]);

      // 生成一个极简本地兜底报告，确保 demo 不崩
      const fallback: ReportOutput = {
        title: proto?.title ?? "实验报告",
        markdown: `# ${proto?.title ?? "实验报告"}\n\n> ⚠️ 后端服务无法访问，以下为本地兜底报告。\n\n## 1. 引言\n\n${proto?.objective ?? "（未提供实验目标）"}\n\n## 2. 实验方法\n\n${proto ? `实验步骤共 ${proto.procedure_steps.length} 步。` : "（未提供方案）"}\n\n## 3. 实验结果\n\n${hasRealAnalysis ? `数据集 ${analysis!.dataset_name}，共 ${(analysis as AnalysisOutput).row_count} 行。` : "（未提供分析数据，无法给出具体数值）"}\n\n## 4. 讨论\n\n请在后端服务正常后重新生成。\n\n## 5. 结论\n\n本次报告为本地兜底版本，仅供展示。`,
        sections: {
          introduction: proto?.objective ?? "（未提供）",
          method: "（后端服务不可用）",
          results: hasRealAnalysis ? `数据集 ${analysis!.dataset_name}，共 ${(analysis as AnalysisOutput).row_count} 行。` : "（无分析数据）",
          discussion: "（后端服务不可用）",
          conclusion: "（后端服务不可用）",
        },
        generated_from: {
          has_protocol: Boolean(proto),
          has_analysis: hasRealAnalysis,
          dataset_name: analysis?.dataset_name,
        },
        warnings: ["后端服务无法访问，以下为本地兜底报告"],
      };

      setReport(fallback);
    } finally {
      // finally 块不管成功还是失败都会执行，类似 C++ 的析构函数
      setIsGenerating(false);
    }
  }, []);

  // ── 复制报告到剪贴板 ──────────────────────────────────────
  async function handleCopy() {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report.markdown);
      setCopySuccess(true);
      // 2 秒后把"已复制"提示恢复为"复制报告"
      // C++ 类比：std::this_thread::sleep_for(2s); copySuccess = false;
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      // 某些浏览器不允许访问剪贴板（非 HTTPS 环境）
      alert("复制失败，请手动选中报告文字后复制");
    }
  }

  // ── 重置：清除当前报告（不清除 protocol/analysis）───────
  function handleReset() {
    setReport(null);
    setWarnings([]);
    // 只删除 report 字段，保留 protocol 和 analysis
    const session = loadSession() ?? {};
    const { report: _removed, ...rest } = session;
    saveSession(rest);
  }

  // ── JSX 渲染（类比 C++ 里 cout << generateHtml()）────────
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-3xl font-bold text-slate-800">📄 生成报告</h1>
        <p className="text-slate-500 mt-1">
          基于实验方案与分析结果，由 Claude 自动生成五章节学术报告
        </p>
      </div>

      {/* 数据来源汇总卡片 */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-2 text-sm">
        <h2 className="font-semibold text-slate-700 mb-3">数据来源汇总</h2>
        <StatusBadge
          ok={hasProtocol}
          label={hasProtocol ? "实验方案：已加载" : "实验方案：未填写（报告引言/方法章节会缺少内容）"}
        />
        <StatusBadge
          ok={hasAnalysis}
          label={
            hasAnalysis
              ? `分析结果：已加载（${datasetName ?? ""}）`
              : "分析结果：未完成（Results 章节将无法提供具体数值）"
          }
        />
      </div>

      {/* 未生成时：显示生成按钮 */}
      {!report && (
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold
                     hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed
                     transition-colors text-base"
        >
          {isGenerating ? "🤖 Claude 正在生成报告..." : "生成实验报告"}
        </button>
      )}

      {/* 加载中动画 */}
      {isGenerating && (
        <div className="flex items-center gap-3 text-slate-500 text-sm">
          {/* 旋转圆圈：CSS animation-spin */}
          <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          正在调用 Claude API 生成五章节报告，请稍候（约 10-20 秒）...
        </div>
      )}

      {/* 警告列表（API 失败 / 数据不完整时显示）*/}
      {warnings.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-1">
          {warnings.map((w, i) => (
            <p key={i} className="text-sm text-amber-700">
              ⚠️ {w}
            </p>
          ))}
        </div>
      )}

      {/* 报告内容区 */}
      {report && (
        <div className="space-y-4">
          {/* 操作按钮行 */}
          <div className="flex gap-3">
            <button
              onClick={handleCopy}
              className="flex-1 py-2.5 bg-slate-800 text-white rounded-lg font-medium
                         hover:bg-slate-700 transition-colors"
            >
              {copySuccess ? "✅ 已复制！" : "📋 复制报告（Markdown）"}
            </button>
            <button
              onClick={handleReset}
              className="py-2.5 px-5 bg-red-50 text-red-600 border border-red-200
                         rounded-lg font-medium hover:bg-red-100 transition-colors"
            >
              🔄 重新生成
            </button>
          </div>

          {/* 报告渲染区 */}
          <div className="bg-white rounded-xl border border-slate-200 p-8 overflow-hidden">
            {/* 用内联样式渲染基础 Markdown，避免引入外部库 */}
            {/* C++ 类比：cout << parseMarkdown(report.markdown) */}
            <style>{`
              .md-h1 { font-size: 1.6rem; font-weight: 700; margin: 0 0 1.2rem; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: .5rem; }
              .md-h2 { font-size: 1.2rem; font-weight: 700; margin: 1.8rem 0 .8rem; color: #334155; }
              .md-h3 { font-size: 1rem; font-weight: 600; margin: 1.2rem 0 .5rem; color: #475569; }
              .md-p  { margin: .75rem 0; line-height: 1.75; color: #374151; }
              .md-li { margin: .3rem 0 .3rem 1.5rem; list-style-type: disc; line-height: 1.7; color: #374151; }
              .md-oli { list-style-type: decimal; }
              .md-hr { border: none; border-top: 1px solid #e2e8f0; margin: 1.5rem 0; }
              .md-code { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: .375rem; padding: 1rem; font-size: .8rem; overflow-x: auto; margin: 1rem 0; }
              strong { color: #1e293b; }
            `}</style>
            {/* dangerouslySetInnerHTML：把 HTML 字符串直接注入 DOM */}
            {/* 因为内容来自受控的 Claude API 或本地模板，XSS 风险低 */}
            <div
              dangerouslySetInnerHTML={{
                __html: `<p class="md-p">${renderMarkdown(report.markdown)}</p>`,
              }}
            />
          </div>

          {/* 报告元数据（数据完整性说明）*/}
          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="px-2 py-1 bg-slate-100 rounded-full">
              {report.generated_from.has_protocol ? "✓ 含方案" : "✗ 无方案"}
            </span>
            <span className="px-2 py-1 bg-slate-100 rounded-full">
              {report.generated_from.has_analysis ? `✓ 含分析（${report.generated_from.dataset_name ?? ""}）` : "✗ 无分析数据"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
