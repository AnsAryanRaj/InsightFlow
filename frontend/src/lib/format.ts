export const fmt = new Intl.NumberFormat("en-US");

export const pct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`;

export function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function relative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return shortDate(iso);
}

export const SENTIMENT_LABEL = { positive: "Positive", mixed: "Mixed", negative: "Negative" } as const;

export const SENTIMENT_COLOR = {
  positive: "var(--color-pos)",
  mixed: "var(--color-mix)",
  negative: "var(--color-neg)",
} as const;

export const CATEGORY_SHORT: Record<string, string> = {
  "Operational Issues": "Operations",
  "Fraud and Scam": "Fraud and scam",
  "Product Feedback": "Product",
  "Customer Service": "Customer service",
};
