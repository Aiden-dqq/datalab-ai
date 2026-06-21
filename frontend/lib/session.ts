// ============================================================
// lib/session.ts — 统一的会话数据结构与存取函数
// ============================================================
//
// TypeScript 的 type / interface 类似 C++ 的 struct，定义数据的"形状"。
// "?" 表示该字段可选，相当于 C++ 里用指针并允许 nullptr。
// string[]  ← 字符串数组，等价于 C++ 的 vector<string>
// Array<T>  ← T 类型的数组，等价于 vector<T>
// Record<K,V> ← 键值对映射，等价于 map<K, V>
// "A" | "B" ← 枚举字符串，只能是其中一个值，等价于 enum { A, B }
// ============================================================


// ─────────────────────────────────────────────────────────────
// ProtocolOutput — 实验方案
// 由 AI 根据用户描述生成，描述整个实验的设计
// C++ 类比：struct ProtocolOutput { ... };
// ─────────────────────────────────────────────────────────────
export type ProtocolOutput = {
  // 实验标题，例如 "温度对淀粉酶活性的影响"
  title: string;

  // 实验目标，描述"想要验证什么"
  objective: string;

  // 前提假设列表，例如 ["环境湿度恒定", "试剂纯度 ≥ 99%"]
  // C++ 类比：vector<string> assumptions;
  assumptions: string[];

  // 实验所需设备清单，例如 ["温度计", "计时器", "分光光度计"]
  equipment: string[];

  // 变量列表，每个变量是一个小 struct
  // C++ 类比：vector<Variable> variables;
  variables: Array<{
    name: string;                           // 变量名，例如 "temperature"
    unit: string;                           // 单位，例如 "°C"
    type: "numeric" | "string" | "time";   // 数据类型（数值 / 字符串 / 时间）
    required: boolean;                      // 是否必填（true/false）
  }>;

  // 采样频率描述，例如 "每 30 秒记录一次"
  sampling_frequency: string;

  // 预期采样间隔（分钟），可选。"?" 表示可以不填
  // C++ 类比：optional<double> expected_interval_minutes;
  expected_interval_minutes?: number;

  // 预期实验总时长（分钟），可选
  expected_duration_minutes?: number;

  // 实验步骤列表，按顺序排列
  // C++ 类比：vector<string> procedure_steps;
  procedure_steps: string[];

  // 控制条件列表，例如 ["保持室温 25°C", "每次使用新鲜试剂"]
  control_conditions: string[];

  // 可能的误差来源，例如 ["人为计时误差", "设备精度限制"]
  possible_errors: string[];

  // CSV 模板表头，例如 "time,temperature,absorbance"
  // 用于告诉用户数据应该按什么格式上传
  csv_template: string;
};


// ─────────────────────────────────────────────────────────────
// AnalysisOutput — 数据分析结果
// AI 对用户上传的 CSV 数据进行质量检查和统计分析后返回的结果
// ─────────────────────────────────────────────────────────────
export type AnalysisOutput = {
  // 数据集文件名，例如 "experiment_2025_01.csv"
  dataset_name: string;

  // 数据行数（不含表头）
  // C++ 类比：int row_count;
  row_count: number;

  // 数据列数
  column_count: number;

  // 数据质量综合评分，0（最差）到 100（最好）
  quality_score: number;

  // 数据质量等级，只能是这四个值之一
  // "Excellent" 优秀 | "Good" 良好 | "Risky" 有风险 | "Poor" 较差
  // C++ 类比：enum QualityLevel { Excellent, Good, Risky, Poor };
  quality_level: "Excellent" | "Good" | "Risky" | "Poor";

  // 数据问题列表，每个问题是一个 struct
  issues: Array<{
    // 问题类型：
    //   "missing"     → 缺失值（某格为空）
    //   "duplicate"   → 重复行
    //   "non_numeric" → 应该是数字但不是
    //   "time_gap"    → 时间序列中有异常跳跃
    //   "outlier"     → 统计离群值
    type: "missing" | "duplicate" | "non_numeric" | "time_gap" | "outlier";

    // 严重程度：低 / 中 / 高
    severity: "low" | "medium" | "high";

    // 出问题的行索引（可选，从 0 开始）
    row_index?: number;

    // 出问题的列名（可选），例如 "temperature"
    column?: string;

    // 人类可读的问题描述，例如 "第 5 行 temperature 列为空"
    message: string;

    // 有问题的具体值（可选），例如 "N/A" 或 999
    // string | number 表示可以是字符串或数字（类似 C++ 的 union）
    value?: string | number;
  }>;

  // 各列的统计数据
  // Record<string, {...}> 相当于 C++ 的 map<string, Stats>
  // 键是列名，值是该列的统计指标
  statistics: Record<string, {
    min?: number;     // 最小值
    max?: number;     // 最大值
    mean?: number;    // 平均值
    median?: number;  // 中位数
  }>;

  // 用于前端绘图的数据数组
  // 每个元素是一行数据，键是列名，值是该行的值
  // C++ 类比：vector<map<string, variant<string, double>>> chart_data;
  chart_data: Array<Record<string, string | number>>;

  // AI 对数据的文字解读
  ai_explanation: {
    // 可能的原因列表，例如 ["设备在高温下精度下降"]
    possible_causes: string[];

    // 建议操作列表，例如 ["过滤离群值后重新分析"]
    suggested_actions: string[];

    // 对最终结论的影响描述
    impact_on_conclusion: string;

    // AI 自身对这份解读的置信度
    confidence: "low" | "medium" | "high";
  };

  // 逐个问题的"错误诊断"（与 issues 一一对应，由 issue_index 关联）
  // 判断每个问题是"自然波动"还是"操作/设备/记录失误"，并定位到具体实验步骤
  // 可选（"?"）：后端旧版本或某些情况下可能没有此字段
  error_diagnosis?: Array<{
    issue_index: number;     // 对应 issues 数组的下标（从 0 开始）
    is_acceptable: boolean;  // 是否属于可接受的自然波动
    // 错误归类：自然波动 / 操作失误 / 设备误差 / 记录错误
    error_type:
      | "natural_variation"
      | "operation_error"
      | "equipment_error"
      | "recording_error";
    related_step: string;    // 关联的实验步骤（情况一能定位，情况二未填步骤时为提示语）
    suggestion: string;      // 针对该问题的具体改进建议
  }>;
};


// ─────────────────────────────────────────────────────────────
// ReportOutput — 生成的实验报告
// ─────────────────────────────────────────────────────────────
export type ReportOutput = {
  // 报告标题
  title: string;

  // 完整的 Markdown 格式报告正文（一整个字符串）
  // 可以直接渲染成 HTML 给用户看，或导出为 PDF
  markdown: string;

  // 报告各章节内容（结构化，方便单独访问某一节）
  sections: {
    introduction: string;   // 引言
    method: string;         // 实验方法
    results: string;        // 实验结果
    discussion: string;     // 讨论分析
    conclusion: string;     // 结论
  };

  // 记录报告是基于哪些数据生成的（用于显示"数据完整性"提示）
  generated_from: {
    has_protocol: boolean;     // 是否有实验方案
    has_analysis: boolean;     // 是否有分析结果
    dataset_name?: string;     // 数据集文件名（如果有）
  };

  // 生成时发现的警告，例如 ["缺少实验方案，报告可能不完整"]
  warnings: string[];
};


// ─────────────────────────────────────────────────────────────
// ProjectSession — 全局会话容器
// 三个步骤的数据都存在这里，所有字段都是可选的
//
// C++ 类比：
//   struct ProjectSession {
//     ProtocolOutput* protocol = nullptr;
//     AnalysisOutput* analysis = nullptr;
//     ReportOutput*   report   = nullptr;
//   };
// ─────────────────────────────────────────────────────────────
export interface ProjectSession {
  protocol?: ProtocolOutput;
  analysis?: AnalysisOutput;
  report?:   ReportOutput;
}


// ─────────────────────────────────────────────────────────────
// localStorage 工具函数
// localStorage 是浏览器内置的"小型数据库"，以 key-value 存字符串
// 关掉浏览器数据也不会丢失（类似写文件），容量约 5MB
// ─────────────────────────────────────────────────────────────

const SESSION_KEY = "datalab_session";

// 从 localStorage 读取会话。找不到时返回 null
// C++ 类比：ProjectSession* loadSession()
export function loadSession(): ProjectSession | null {
  // Next.js 会在服务器端渲染，服务器没有 localStorage，需要提前检查
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as ProjectSession;
}

// 把会话数据保存到 localStorage
// C++ 类比：void saveSession(const ProjectSession& session)
export function saveSession(session: ProjectSession): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

// 清空会话数据，从头开始
// C++ 类比：void clearSession() { delete session; session = nullptr; }
export function clearSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
}
