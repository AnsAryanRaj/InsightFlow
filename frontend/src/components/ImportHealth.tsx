"use client";

import type { ImportHealth } from "@/lib/api";
import { fmt, pct } from "@/lib/format";

function Row({ label, value, warn }: { label: string; value: React.ReactNode; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-rule py-2 text-sm last:border-b-0">
      <dt className="text-ink-soft">{label}</dt>
      <dd className={`num text-right ${warn ? "font-semibold text-neg" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

export default function ImportHealthPanel({ health }: { health: ImportHealth }) {
  const dup = health.duplicate_share;
  return (
    <section className="grid gap-6 rounded-2xl border border-rule bg-paper p-6 md:grid-cols-[1fr_1.2fr]" aria-labelledby="health-title">
      <div>
        <p className="text-sm text-ink-soft">Last import: {health.filename}</p>
        <h2 id="health-title" className="display mt-1 text-2xl">
          Import health
        </h2>
        <p className="mt-4 leading-relaxed text-ink-soft">
          {dup > 0.5 ? (
            <>
              <span className="font-semibold text-ink">
                Only {fmt.format(health.unique_texts)} of {fmt.format(health.rows_imported)} rows are unique.
              </span>{" "}
              Each unique message was analyzed once and its result reused for every repeat, and the repeat count is kept as a
              signal of how often a problem comes up.
            </>
          ) : (
            <>
              {fmt.format(health.unique_texts)} unique messages out of {fmt.format(health.rows_imported)} rows. Each unique
              message was analyzed once.
            </>
          )}
        </p>
        <div className="mt-5 h-3 overflow-hidden rounded-full bg-ink/10" role="img" aria-label={`${pct(1 - dup)} unique, ${pct(dup)} repeats`}>
          <div className="h-3 bg-cobalt" style={{ width: `${Math.max(1.5, (1 - dup) * 100)}%` }} />
        </div>
        <p className="mt-2 text-xs text-ink-soft">
          Unique {pct(1 - dup, 1)} · repeats {pct(dup, 1)}
        </p>
      </div>
      <dl>
        <Row label="Rows in file" value={fmt.format(health.rows_in_file)} />
        <Row label="Empty or too short, skipped" value={fmt.format(health.empty_rows + health.too_short_rows)} warn={health.empty_rows + health.too_short_rows > 0} />
        <Row label="Feedback column" value={health.text_column} />
        <Row label="Category column" value={health.category_column ?? "None, detected from text"} />
        <Row label="Dates" value={health.simulated_timestamps ? "None in file, simulated" : `From "${health.date_column}"`} />
        <Row label="Mostly non-English rows" value={fmt.format(health.non_english_rows)} />
        <Row
          label="Analyzed by"
          value={Object.entries(health.analysis_engines)
            .map(([k, v]) => `${k === "rules" ? "topic rules" : k} ${fmt.format(v)}`)
            .join(", ")}
        />
      </dl>
    </section>
  );
}
