// ============================================================
// app/layout.tsx — 根布局文件（Root Layout）
// ============================================================
//
// 这是 Next.js App Router 的核心文件。
// 所有页面都会"套"在这个布局里，就像 C++ 里的 main() 函数包裹其他逻辑。
//
// 类比：
//   // C++ 主函数包裹所有逻辑
//   int main() {
//     renderNavbar();
//     renderProgressBar();
//     renderCurrentPage();  ← 这就是 {children}
//   }
// ============================================================

import type { Metadata } from "next"; // TypeScript 类型导入，不影响运行时
import "./globals.css";               // 全局样式（Tailwind 入口）
import Navbar from "@/components/Navbar";
import ProgressBar from "@/components/ProgressBar";

// metadata 是 Next.js 特殊导出对象，用来设置网页标签栏的标题和描述
// 类比：HTML 的 <title> 和 <meta name="description">
export const metadata: Metadata = {
  title: "DataLab AI",
  description: "智能实验工作流平台",
};

// ─── RootLayout 组件 ──────────────────────────────────────
// children 是 TypeScript 中的特殊 prop，代表"被包裹的子内容"
// React.ReactNode 是"任意可渲染内容"的类型（文字、组件、null 都算）
//
// C++ 类比：
//   void RootLayout(Widget* children) {
//     // 把导航栏、进度条、子页面组合在一起显示
//   }
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // <html lang="zh"> 设置页面语言，对搜索引擎和屏幕阅读器友好
    <html lang="zh">
      {/* <body> 是页面主体，min-h-screen 让页面最少占满整个屏幕高度 */}
      <body className="min-h-screen bg-slate-50 text-slate-900">
        {/* 顶部导航栏：固定在所有页面顶部 */}
        <Navbar />

        {/* 三步进度条：固定在导航栏下方 */}
        <ProgressBar />

        {/* 主内容区域：每个页面的具体内容渲染在这里 */}
        {/* max-w-5xl mx-auto → 最大宽度限制 + 水平居中 */}
        {/* px-6 py-8 → 内边距 */}
        <main className="max-w-5xl mx-auto px-6 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
