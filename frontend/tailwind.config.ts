import type { Config } from "tailwindcss";

// Tailwind CSS 配置文件
// Tailwind 类似 C++ 的 #include，但针对样式：
// 你在 HTML/JSX 里写 className="bg-blue-500 text-white p-4"
// Tailwind 会自动生成对应的 CSS，不需要手写 .css 文件
const config: Config = {
  // content 告诉 Tailwind 扫描哪些文件，只把用到的样式类打包进去（减小体积）
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
