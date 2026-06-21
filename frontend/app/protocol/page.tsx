// ============================================================
// app/protocol/page.tsx — 实验方案页（路由：/protocol）功能 A：Protocol Builder
// ============================================================
//
// "use client" 声明这是客户端组件，允许：
//   1. 使用 React 状态（useState）—— 类似 C++ 的局部变量，但改变时会触发重渲染
//   2. 调用浏览器 API（fetch / localStorage / clipboard）
//   3. 处理用户事件（按钮点击、输入）
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";              // 用于编程式跳转页面
import { loadSession, saveSession } from "@/lib/session";  // 会话存取函数
import type { ProtocolOutput } from "@/lib/session";       // 方案的数据类型（import type 只导入类型，不产生运行时代码）

export default function ProtocolPage() {
  // ── 状态变量（useState）──────────────────────────────────
  // useState(初始值) 返回 [当前值, 修改函数]；修改后页面自动重渲染。
  // C++ 类比：成员变量 + 每次 set 都会触发一次"重画"。
  const [goal, setGoal] = useState("");              // 左侧：实验目标 / 实验想法（必填）

  // 输入模式："idea" = 只有想法（只填一个大文本框）；"detailed" = 已有部分条件（额外填设备/预算/时间）
  const [mode, setMode] = useState<"idea" | "detailed">("idea");

  // 情况二专用的三个额外条件输入框（只有 detailed 模式才显示、才会拼进 constraints）
  const [equipment, setEquipment] = useState(""); // 设备 / 可用器材
  const [budget, setBudget] = useState("");       // 预算
  const [timeLimit, setTimeLimit] = useState(""); // 时间限制

  const [loading, setLoading] = useState(false);     // 是否正在请求后端（控制按钮文字/禁用）
  const [result, setResult] = useState<ProtocolOutput | null>(null); // 右侧：生成出来的方案；null 表示还没有
  const [warning, setWarning] = useState<string | null>(null);       // 后端降级为 mock 时的提示文字
  const [copied, setCopied] = useState(false);       // "复制CSV模板"点击后的短暂成功提示

  const router = useRouter(); // router.push("/analyze") 可跳转页面

  // ── 调用后端生成方案 ──────────────────────────────────────
  // async 函数 ≈ 可以"等待"耗时操作（网络请求）的函数；await 处暂停直到结果返回。
  async function handleGenerate() {
    setLoading(true);
    setWarning(null);
    setResult(null);
    setCopied(false);

    // ── 拼装 constraints 字段 ──────────────────────────────
    // 情况一（idea）：没有额外条件，constraints 传 null。
    // 情况二（detailed）：把填了的设备/预算/时间三项拼成一段文字。
    // 只收集"非空"的项，再用换行连起来；三项都空则仍是 null。
    let constraints: string | null = null;
    if (mode === "detailed") {
      const parts: string[] = [];                                    // 临时收集已填写的条件
      if (equipment.trim()) parts.push(`可用设备：${equipment.trim()}`);
      if (budget.trim()) parts.push(`预算限制：${budget.trim()}`);
      if (timeLimit.trim()) parts.push(`时间限制：${timeLimit.trim()}`);
      constraints = parts.length > 0 ? parts.join("\n") : null;      // 拼成多行文本
    }

    try {
      // fetch 发起 HTTP 请求。这里请求 /api/protocol，
      // 经 next.config.js 的 rewrite 转发到后端 http://localhost:8000/api/protocol。
      const resp = await fetch("/api/protocol", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // body 必须是字符串，用 JSON.stringify 把对象序列化（≈ C++ 的序列化为 JSON 文本）
        body: JSON.stringify({
          goal,
          constraints, // 上面拼好的条件文本（情况一为 null）
        }),
      });

      // 后端统一返回 { ok, data, error }
      // data 里永远有一份方案（成功是真方案，失败是 mock），所以一定能展示。
      const json = await resp.json();

      // 把方案存进右侧状态用于显示
      setResult(json.data as ProtocolOutput);

      // ok=false 表示后端降级成了 mock（没配 Key / 调用失败 / 模型拒答等），给个温和提示
      if (!json.ok) {
        setWarning(json.error ?? "后端返回了示例方案（mock）。");
      }
    } catch (err) {
      // 网络层面就失败了（后端没启动、端口不通等），fetch 会直接抛异常
      setWarning(`请求失败：${String(err)}。请确认后端已在 8000 端口启动。`);
    } finally {
      // 无论成功失败，都要把 loading 关掉（finally ≈ C++ 的 RAII 收尾）
      setLoading(false);
    }
  }

  // ── 复制 CSV 模板到剪贴板 ─────────────────────────────────
  async function handleCopyCsv() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.csv_template);
      setCopied(true);
      // 2 秒后把"已复制"提示复原
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 某些浏览器/非 https 环境下 clipboard 不可用，给个降级提示
      setWarning("浏览器不允许自动复制，请手动选中下面的 CSV 模板复制。");
    }
  }

  // ── 保存方案并跳转到数据分析页 ────────────────────────────
  function handleContinue() {
    if (!result) return;
    // 读取已有会话（可能已有 analysis/report），只更新 protocol 字段，其余保留。
    // ?? {} ：loadSession 返回 null 时用空对象兜底。
    const session = loadSession() ?? {};
    saveSession({
      ...session,        // 展开运算符 ≈ 拷贝旧字段
      protocol: result,  // 覆盖/写入 protocol
    });
    router.push("/analyze"); // 跳转到下一步
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-3xl font-bold text-slate-800">📋 实验方案生成</h1>
        <p className="text-slate-500 mt-1">描述实验目标，AI 自动生成结构化实验方案</p>
      </div>

      {/* 两列布局：左侧输入，右侧结果。grid-cols-2 在中等屏幕及以上分两列。 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ── 左侧：输入区 ── */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          {/* 模式切换按钮：两个按钮二选一，选中的高亮（蓝底白字），未选的灰字 */}
          <div className="flex gap-2">
            <button
              onClick={() => setMode("idea")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === "idea"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              💡 只有想法
            </button>
            <button
              onClick={() => setMode("detailed")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === "detailed"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              🔧 已有部分条件
            </button>
          </div>

          {/* 实验想法 / 目标：两种模式都显示的大文本框 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {mode === "idea" ? "实验想法" : "实验目标"} <span className="text-red-500">*</span>
            </label>
            <textarea
              className="w-full h-40 p-3 border border-slate-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="例如：研究不同温度（20/37/60°C）对淀粉酶催化活性的影响"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
          </div>

          {/* 情况二专属：已有部分条件时才展开设备/预算/时间三个输入框 */}
          {mode === "detailed" && (
            <div className="space-y-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-xs text-slate-500">补充你已有的条件（可只填部分）：</p>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">设备 / 可用器材</label>
                <input
                  type="text"
                  className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="例如：恒温水浴锅、分光光度计"
                  value={equipment}
                  onChange={(e) => setEquipment(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">预算</label>
                <input
                  type="text"
                  className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="例如：500 元以内"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">时间限制</label>
                <input
                  type="text"
                  className="w-full p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="例如：实验需在 2 小时内完成"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(e.target.value)}
                />
              </div>
            </div>
          )}

          <button
            onClick={handleGenerate}
            // 目标为空 或 正在加载时禁用按钮
            disabled={!goal.trim() || loading}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "🤖 生成中..." : "生成方案"}
          </button>
        </div>

        {/* ── 右侧：结果区 ── */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4 min-h-[200px]">
          {/* 还没有结果时的占位提示 */}
          {!result && !loading && (
            <p className="text-slate-400 text-sm text-center pt-16">
              ← 在左侧填写实验目标，点击「生成方案」后这里会显示结果
            </p>
          )}

          {/* 加载中提示 */}
          {loading && (
            <p className="text-slate-500 text-sm text-center pt-16">
              正在调用 AI 生成实验方案，请稍候...
            </p>
          )}

          {/* mock 降级提示（result 有了但 ok=false 时显示）*/}
          {warning && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
              ⚠️ {warning}
            </div>
          )}

          {/* 有结果时展示方案内容。&& 左侧为真才渲染右侧，类似 C++ 的 if(result){...} */}
          {result && (
            <div className="space-y-4">
              {/* 标题 + 目标 */}
              <div>
                <h2 className="text-xl font-bold text-slate-800">{result.title}</h2>
                <p className="text-sm text-slate-600 mt-1">{result.objective}</p>
              </div>

              {/* 变量表 */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">📊 变量</h3>
                <table className="w-full text-xs border border-slate-200">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-2 py-1 text-left border-b border-slate-200">变量名</th>
                      <th className="px-2 py-1 text-left border-b border-slate-200">单位</th>
                      <th className="px-2 py-1 text-left border-b border-slate-200">类型</th>
                      <th className="px-2 py-1 text-left border-b border-slate-200">必填</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* map 遍历数组生成多行 ≈ C++ 的 for 循环 push 每个 <tr> */}
                    {/* key 是 React 用来区分列表项的唯一标识，用下标 i 即可 */}
                    {result.variables.map((v, i) => (
                      <tr key={i} className="text-slate-700">
                        <td className="px-2 py-1 border-b border-slate-100 font-mono">{v.name}</td>
                        <td className="px-2 py-1 border-b border-slate-100">{v.unit}</td>
                        <td className="px-2 py-1 border-b border-slate-100">{v.type}</td>
                        <td className="px-2 py-1 border-b border-slate-100">{v.required ? "✓" : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 实验步骤 */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">🧪 实验步骤</h3>
                {/* ol 有序列表，list-decimal 显示 1. 2. 3. 序号 */}
                <ol className="list-decimal list-inside space-y-1 text-xs text-slate-700">
                  {result.procedure_steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>

              {/* CSV 模板 */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">📄 CSV 模板表头</h3>
                {/* pre 保留原始格式，适合显示代码/逗号分隔的列名 */}
                <pre className="p-2 bg-slate-50 border border-slate-200 rounded text-xs font-mono text-slate-700 whitespace-pre-wrap break-all">
                  {result.csv_template}
                </pre>
              </div>

              {/* ── 底部按钮：复制 CSV + 继续到分析 ── */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleCopyCsv}
                  className="flex-1 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  {copied ? "✅ 已复制" : "📋 复制CSV模板"}
                </button>
                <button
                  onClick={handleContinue}
                  className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                >
                  继续到数据分析 →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
