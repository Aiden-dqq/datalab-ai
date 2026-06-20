// ============================================================
// components/Navbar.tsx — 顶部导航栏组件
// ============================================================
//
// React 组件类似 C++ 里的"可复用函数"，返回一段 UI（HTML）。
// 在 Next.js App Router 中，不写 "use client" 的组件默认在服务器渲染，
// 写了 "use client" 才能使用浏览器 API（如 localStorage、点击事件）。
// 导航栏需要知道"当前在哪个页面"，所以要用客户端组件。
"use client";

import Link from "next/link";      // Next.js 的路由跳转组件，相当于 <a> 但不会刷新页面
import { usePathname } from "next/navigation"; // 获取当前 URL 路径的 Hook

// ─── 导航项配置 ───────────────────────────────────────────
// 把导航链接写成数组，方便循环渲染，避免重复代码
// C++ 类比：const vector<NavItem> NAV_ITEMS = {...};
const NAV_ITEMS = [
  { href: "/protocol", label: "① 实验方案" },
  { href: "/analyze",  label: "② 数据分析" },
  { href: "/report",   label: "③ 生成报告" },
];

// ─── Navbar 组件 ──────────────────────────────────────────
// React 函数组件：接收 props（可以理解为函数参数），返回 JSX（HTML 描述）
// 这个组件不需要任何参数，所以 props 为空
export default function Navbar() {
  // usePathname() 是 React Hook，返回当前 URL 路径（如 "/protocol"）
  // C++ 类比：string currentPath = getCurrentURL();
  const pathname = usePathname();

  return (
    // <nav> 是 HTML 语义化标签，表示导航区域
    // Tailwind 类说明：
    //   bg-slate-900    → 深色背景
    //   text-white      → 白色文字
    //   px-6 py-3       → 左右内边距 24px，上下内边距 12px
    //   flex            → 使用 flexbox 布局（类似 C++ 里的水平排列容器）
    //   items-center    → 垂直居中
    //   justify-between → 两端对齐（Logo 靠左，链接靠右）
    //   shadow-md       → 底部阴影
    <nav className="bg-slate-900 text-white px-6 py-3 flex items-center justify-between shadow-md">
      {/* ── Logo 区域 ── */}
      <Link href="/" className="text-xl font-bold tracking-tight hover:text-blue-400 transition-colors">
        🧪 DataLab AI
      </Link>

      {/* ── 右侧导航链接区域 ── */}
      {/* flex gap-1 → 水平排列，各链接间距 4px */}
      <div className="flex gap-1">
        {/* 循环渲染导航项，类似 C++ 的 for (auto& item : NAV_ITEMS) */}
        {/* item.href 是 React 要求的唯一标识符（key），用于高效更新 DOM */}
        {NAV_ITEMS.map((item) => {
          // 判断当前页面是否是这个链接对应的页面
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                // 所有链接共用的基础样式
                "px-4 py-2 rounded-md text-sm font-medium transition-colors",
                // 根据是否是当前页面，切换不同样式
                // C++ 类比：isActive ? "active-style" : "normal-style"
                isActive
                  ? "bg-blue-600 text-white"           // 当前页：蓝色高亮
                  : "text-slate-300 hover:bg-slate-700", // 其他页：悬停变深
              ].join(" ")}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
