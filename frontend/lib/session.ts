export type ProtocolOutput = {
  title: string;
  objective: string;
  assumptions: string[];
  equipment: string[];
  variables: Array<{
    name: string;
    unit: string;
    type: "numeric" | "string" | "time";
    required: boolean;
  }>;
  sampling_frequency: string;
  expected_interval_minutes?: number;
  expected_duration_minutes?: number;
  procedure_steps: string[];
  control_conditions: string[];
  possible_errors: string[];
  csv_template: string;
};

export type AnalysisOutput = {
  dataset_name: string;
  row_count: number;
  column_count: number;
  quality_score: number;
  quality_level: "Excellent" | "Good" | "Risky" | "Poor";
  issues: Array<{
    type: "missing" | "duplicate" | "non_numeric" | "format" | "time_gap" | "outlier";
    severity: "low" | "medium" | "high";
    row_index?: number;
    column?: string;
    message: string;
    value?: string | number;
  }>;
  statistics: Record<string, {
    min?: number;
    max?: number;
    mean?: number;
    median?: number;
  }>;
  chart_data: Array<Record<string, string | number>>;
  ai_explanation: {
    possible_causes: string[];
    suggested_actions: string[];
    impact_on_conclusion: string;
    confidence: "low" | "medium" | "high";
  };
  error_diagnosis?: Array<{
    issue_index: number;
    is_acceptable: boolean;
    error_type:
      | "natural_variation"
      | "operation_error"
      | "equipment_error"
      | "recording_error";
    related_step: string;
    suggestion: string;
  }>;
};

export type ReportOutput = {
  title: string;
  markdown: string;
  sections: {
    introduction: string;
    method: string;
    results: string;
    discussion: string;
    conclusion: string;
  };
  generated_from: {
    has_protocol: boolean;
    has_analysis: boolean;
    dataset_name?: string;
  };
  warnings: string[];
};

export interface ProjectSession {
  protocol?: ProtocolOutput;
  analysis?: AnalysisOutput;
  report?:   ReportOutput;
}

const SESSION_KEY = "datalab_session";

export function loadSession(): ProjectSession | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as ProjectSession;
}

export function saveSession(session: ProjectSession): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
}
