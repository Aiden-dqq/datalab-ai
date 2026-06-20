// ============================================================
// app/protocol/page.tsx — 实验方案页（路由：/protocol）
// ============================================================
//
// "use client" 声明这是客户端组件，允许：
//   1. 使用 React 状态（useState）—— 类似 C++ 的局部变量，但改变时会触发重渲染
//   2. 调用浏览器 API（localStorage）
//   3. 处理用户事件（按钮点击、表单提交）
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";             // 用于编程式跳转页面
import { loadSession, saveSession } from "@/lib/session"; // 我们自己写的存取函数

export default function ProtocolPage() {
  // useState 是 React Hook，用于在组件内存储可变状态
  // C++ 类比：string description = "";  → 但修改它会自动刷新页面
  // useState("") 的括号里是初始值，返回 [当前值, 修改函数]
  const [description, setDescription] = useState("");
  const [saved, setSaved] = useState(false); // 是否已保存成功

  // useRouter 提供页面跳转功能
  // C++ 类比：Router router; → router.push("/analyze") 相当于跳转
  const router = useRouter();

  // ── 处理表单提交 ──────────────────────────────────────────
  // 这是一个事件处理函数，相当于 C++ 的回调函数（callback）
  function handleSave() {
    // 1. 读取已有的会话数据（可能已经有 analysis 或 report 数据）
    const session = loadSession() ?? {}; // ?? 是空值合并运算符：null 时用 {}

    // 2. 更新 protocol 字段，保留其他字段不变
    // "..." 是展开运算符，类似 C++ 的 memcpy/copy constructor
    saveSession({
      ...session,
      protocol: {
        description,
        createdAt: new Date().toISOString(), // ISO 日期字符串，如 "2025-01-01T00:00:00Z"
      },
    });

    // 3. 显示成功提示
    setSaved(true);

    // 4. 1.5 秒后自动跳转到分析页
    setTimeout(() => router.push("/analyze"), 1500);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-3xl font-bold text-slate-800">📋 Experiment Protocol</h1>
        <p className="text-slate-500 mt-1">Describe your experiment objectives, hypotheses, and methods</p>
      </div>

      {/* 表单卡片 */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Protocol Description
          </label>
          {/* textarea：多行文本输入框 */}
          {/* onChange 事件：每次用户输入时调用 setDescription 更新状态 */}
          {/* C++ 类比：每次键盘输入触发回调，description = e.target.value */}
          <textarea
            className="w-full h-40 p-3 border border-slate-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            placeholder="e.g. This experiment investigates the effect of temperature on enzyme activity using a controlled variable approach..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* 提交按钮 */}
        <button
          onClick={handleSave}
          disabled={!description.trim()} // 空内容时禁用按钮
          className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
        >
          Save & Continue →
        </button>

        {/* 成功提示（只有 saved=true 时才显示）*/}
        {/* C++ 类比：if (saved) { render success message; } */}
        {saved && (
          <p className="text-center text-green-600 text-sm font-medium">
            ✅ Saved! Redirecting to data analysis...
          </p>
        )}
      </div>

      {/* 占位提示 */}
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
        🚧 Coming soon: AI-assisted protocol generation and literature search
      </div>
    </div>
  );
}
