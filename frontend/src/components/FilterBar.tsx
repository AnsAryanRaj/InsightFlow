"use client";

import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useFilters } from "@/lib/hooks";
import { CATEGORY_SHORT, SENTIMENT_COLOR, SENTIMENT_LABEL } from "@/lib/format";

const CATEGORIES = ["Operational Issues", "Fraud and Scam", "Product Feedback", "Customer Service"];
const SENTIMENTS = ["negative", "mixed", "positive"] as const;
const RANGES = [
  { days: 0, label: "All time" },
  { days: 90, label: "90 days" },
  { days: 30, label: "30 days" },
  { days: 14, label: "14 days" },
];

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function FilterBar({ search = false, sentiment = true }: { search?: boolean; sentiment?: boolean }) {
  const { filters, setFilters, clear, active } = useFilters();
  const [q, setQ] = useState(filters.q ?? "");

  useEffect(() => setQ(filters.q ?? ""), [filters.q]);
  useEffect(() => {
    if (!search) return;
    const t = setTimeout(() => {
      if ((filters.q ?? "") !== q) setFilters({ q });
    }, 300);
    return () => clearTimeout(t);
  }, [q, search, filters.q, setFilters]);

  const toggle = (key: "category" | "sentiment", value: string) => {
    const current = new Set((filters[key] ?? "").split(",").filter(Boolean));
    if (current.has(value)) current.delete(value);
    else current.add(value);
    setFilters({ [key]: [...current].join(",") });
  };
  const has = (key: "category" | "sentiment", value: string) =>
    (filters[key] ?? "").split(",").includes(value);
  const activeRange = RANGES.find((r) => (r.days ? filters.date_from === isoDaysAgo(r.days) : !filters.date_from));

  return (
    <div className="no-print flex flex-col gap-4 rounded-2xl border border-rule bg-paper/80 p-4 md:flex-row md:flex-wrap md:items-center md:gap-x-6">
      {search && (
        <label className="relative flex min-w-[240px] flex-1 items-center">
          <span className="sr-only">Search feedback</span>
          <Search className="pointer-events-none absolute left-3.5 size-4 text-ink-soft" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the words customers used"
            className="w-full rounded-full border border-ink/20 bg-white/60 py-2.5 pl-10 pr-4 text-[0.95rem] placeholder:text-ink-faint focus:border-cobalt focus:outline-none"
          />
        </label>
      )}

      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">Category</legend>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={has("category", c)}
            onClick={() => toggle("category", c)}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
              has("category", c) ? "border-cobalt bg-cobalt text-cream" : "border-ink/20 hover:border-ink/50"
            }`}
          >
            {CATEGORY_SHORT[c]}
          </button>
        ))}
      </fieldset>

      {sentiment && (
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="sr-only">Sentiment</legend>
          {SENTIMENTS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={has("sentiment", s)}
              onClick={() => toggle("sentiment", s)}
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                has("sentiment", s) ? "border-ink bg-ink text-cream" : "border-ink/20 hover:border-ink/50"
              }`}
            >
              <span
                aria-hidden
                className={`size-2.5 ${s === "mixed" ? "rotate-45" : "rounded-full"}`}
                style={{ background: SENTIMENT_COLOR[s] }}
              />
              {SENTIMENT_LABEL[s]}
            </button>
          ))}
        </fieldset>
      )}

      <label className="flex items-center gap-2 text-sm">
        <span className="text-ink-soft">Period</span>
        <select
          value={activeRange?.days ?? "custom"}
          onChange={(e) => {
            const days = Number(e.target.value);
            setFilters({ date_from: days ? isoDaysAgo(days) : undefined, date_to: undefined });
          }}
          className="rounded-full border border-ink/20 bg-white/60 px-3 py-1.5 focus:border-cobalt focus:outline-none"
        >
          {RANGES.map((r) => (
            <option key={r.days} value={r.days}>
              {r.label}
            </option>
          ))}
          {!activeRange && <option value="custom">Custom</option>}
        </select>
      </label>

      {active > 0 && (
        <button type="button" onClick={clear} className="inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline md:ml-auto">
          <X className="size-3.5" aria-hidden /> Clear filters
        </button>
      )}
    </div>
  );
}

export function SimulatedNote() {
  return (
    <p className="text-sm text-ink-soft">
      The dataset has no dates, so its rows carry simulated timestamps spread over 90 days. New feedback you submit uses
      the real time.
    </p>
  );
}
