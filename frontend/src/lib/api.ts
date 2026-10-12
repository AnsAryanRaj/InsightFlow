export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

export type Sentiment = "positive" | "mixed" | "negative";

export type FilterState = {
  category?: string;
  sentiment?: string;
  topic?: string;
  q?: string;
  date_from?: string;
  date_to?: string;
};

export type TrendPoint = {
  week: string;
  positive: number;
  mixed: number;
  negative: number;
  total: number;
  negative_share: number;
  partial: boolean;
};

export type Overview = {
  total: number;
  empty?: boolean;
  unique_texts: number;
  duplicate_share: number;
  sentiment: Record<Sentiment, number>;
  negative_share: number;
  positive_share: number;
  complaints: number;
  avg_complaint_severity: number;
  negative_share_last_30d: number;
  negative_share_prev_30d: number;
  categories: { category: string; total: number; positive: number; mixed: number; negative: number }[];
  top_issues: { topic: string; label: string; category: string; count: number; share_of_complaints: number }[];
  trend: TrendPoint[];
  date_range: [string, string];
  simulated_time: boolean;
  engines: Record<string, number>;
};

export type TopicRow = {
  topic: string;
  label: string;
  category: string;
  polarity: "complaint" | "praise" | "other";
  count: number;
  share: number;
  phrasings: number;
  positive: number;
  mixed: number;
  negative: number;
  avg_severity: number;
  examples: { text: string; count: number }[];
  weekly: number[];
};

export type Priority = {
  rank: number;
  topic: string;
  label: string;
  category: string;
  owner: string;
  score: number;
  tier: "Critical" | "High" | "Medium" | "Low";
  count: number;
  share_of_complaints: number;
  negative: number;
  mixed: number;
  avg_severity: number;
  recent_14d: number;
  previous_14d: number;
  growth: number;
  components: Record<"volume" | "negativity" | "severity" | "growth", number>;
  weights: Record<"volume" | "negativity" | "severity" | "growth", number>;
  confidence: number;
  reasons: string[];
  actions: string[];
  examples: { text: string; count: number }[];
  tracked_issue_id?: number | null;
};

export type FeedbackItem = {
  id?: number;
  text: string;
  category: string;
  source?: string;
  created_at?: string;
  last_seen?: string;
  simulated_time?: boolean;
  sentiment: Sentiment;
  topic: string;
  topic_label: string;
  severity: number;
  engine: string;
  count?: number;
};

export type Issue = {
  id: number;
  topic: string;
  title: string;
  status: "open" | "in_progress" | "resolved";
  owner: string;
  notes: string;
  priority_score: number;
  evidence: { count?: number; avg_severity?: number; tier?: string; reasons?: string[]; actions?: string[]; growth?: number };
  created_at: string;
  updated_at: string;
};

export type ImportHealth = {
  import_id: number;
  filename: string;
  rows_in_file: number;
  rows_imported: number;
  unique_texts: number;
  duplicate_rows: number;
  duplicate_share: number;
  empty_rows: number;
  too_short_rows: number;
  non_english_rows: number;
  text_column: string;
  category_column: string | null;
  date_column: string | null;
  missing_category: number;
  categories_found: string[];
  unknown_categories: string[];
  simulated_timestamps: boolean;
  analysis_engines: Record<string, number>;
  created_at?: string;
};

export type AdaptionStatus = {
  configured: boolean;
  is_active?: boolean;
  mode: "adaption" | "ready" | "local";
  blueprint: string;
  state: { status: string; step?: string; error?: string | null; dataset_id?: string; estimate?: { credits: number; minutes: number } };
  cached: {
    available: boolean;
    dataset_id: string | null;
    created_at: string | null;
    applied_at?: string | null;
    enriched: number;
    fallback_count?: number;
    db_applied?: number;
    evaluation: null | {
      status?: string;
      grade_before?: string | null;
      grade_after?: string | null;
      score_before?: number | null;
      score_after?: number | null;
      improvement_percent?: number | null;
      percentile_after?: number | null;
    };
    estimate: { credits: number; minutes: number } | null;
  };
};

export type ReportPayload = {
  generated_at: string;
  filters: FilterState;
  summary: string[];
  overview: Overview;
  priorities: Priority[];
  praise: TopicRow[];
  issues: Issue[];
};

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  }
  const str = s.toString();
  return str ? `?${str}` : "";
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: init?.body instanceof FormData ? init?.headers : { "content-type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.detail) message = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* not JSON */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}
