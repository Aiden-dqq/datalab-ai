// ============================================================
// lib/session.ts — 统一的会话数据结构与存取函数
// ============================================================
//
// TypeScript 的 interface 类似 C++ 的 struct，用来定义数据形状。
// "?" 表示该字段可选（optional），相当于 C++ 中用 nullptr 表示"没有值"。
// ============================================================

// 实验方案（Protocol）的数据结构
// 目前只放一个描述字段，后续可以扩展
export interface Protocol {
  description: string;   // 实验方案描述
  createdAt: string;     // 创建时间（ISO 日期字符串）
}

// 数据分析（Analysis）的数据结构
export interface Analysis {
  result: string;        // 分析结果文本
  analyzedAt: string;    // 分析时间
}

// 报告（Report）的数据结构
export interface Report {
  content: string;       // 报告内容
  generatedAt: string;   // 生成时间
}

// ─── 主数据结构 ───────────────────────────────────────────
// ProjectSession 是整个应用的"全局状态容器"
// 类比 C++：相当于一个带有三个可选成员的 struct
//
// struct ProjectSession {
//   Protocol*  protocol;   // nullptr = 还没填写
//   Analysis*  analysis;   // nullptr = 还没分析
//   Report*    report;     // nullptr = 还没生成报告
// };
export interface ProjectSession {
  protocol?: Protocol;   // 实验方案（可选）
  analysis?: Analysis;   // 分析结果（可选）
  report?: Report;       // 生成报告（可选）
}

// ─── localStorage 存取 ────────────────────────────────────
// localStorage 是浏览器内置的"小型数据库"，以 key-value 形式存字符串
// 关掉浏览器数据也不会丢失（类似写文件），但容量约 5MB

// 所有数据都存在这个 key 下面，统一管理
const SESSION_KEY = "datalab_session";

// ─── loadSession ─────────────────────────────────────────
// 从 localStorage 读取会话数据
// 返回类型：ProjectSession（找到数据）或 null（第一次使用，还没有数据）
//
// C++ 类比：
//   ProjectSession* loadSession() {
//     string raw = readFile("datalab_session");
//     if (raw.empty()) return nullptr;
//     return deserialize(raw);
//   }
export function loadSession(): ProjectSession | null {
  // 检查是否在浏览器环境（Next.js 会在服务器端渲染，服务器没有 localStorage）
  if (typeof window === "undefined") return null;

  // getItem 找不到 key 时返回 null
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  // JSON.parse 把 JSON 字符串反序列化成 JavaScript 对象
  // 相当于 C++ 的 deserialize()
  // "as ProjectSession" 是 TypeScript 的类型断言，告诉编译器"我知道这是什么类型"
  return JSON.parse(raw) as ProjectSession;
}

// ─── saveSession ─────────────────────────────────────────
// 把会话数据保存到 localStorage
// 参数 session: ProjectSession — 要保存的数据对象
// 返回 void（无返回值，和 C++ 一样）
//
// C++ 类比：
//   void saveSession(const ProjectSession& session) {
//     string raw = serialize(session);
//     writeFile("datalab_session", raw);
//   }
export function saveSession(session: ProjectSession): void {
  if (typeof window === "undefined") return;

  // JSON.stringify 把对象序列化成 JSON 字符串，相当于 C++ 的 serialize()
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

// ─── clearSession ────────────────────────────────────────
// 清空会话数据（相当于 delete session; session = nullptr;）
export function clearSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
}
