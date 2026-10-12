"use client";

import Link from "next/link";
import { useCallback, useMemo } from "react";
import AdaptionPanel from "@/components/AdaptionPanel";
import FilterBar from "@/components/FilterBar";
import { Sparkline } from "@/components/charts";
import { Empty, ErrorNote, PageHeader, SeverityDots, Skeleton } from "@/components/ui";
import { qs, TopicRow } from "@/lib/api";
import { useApi, useFilters } from "@/lib/hooks";
import { CATEGORY_SHORT, fmt, SENTIMENT_COLOR } from "@/lib/format";

const CATEGORY_ORDER = ["Fraud and Scam", "Operational Issues", "Customer Service", "Product Feedback", "Other"];

function MiniSplit({ t }: { t: TopicRow }) {
  return (
    <div className="flex h-2.5 w-28 gap-[2px]" aria-label={`${t.negative} negative, ${t.mixed} mixed, ${t.positive} positive`} role="img">
      {(["negative", "mixed", "positive"] as const).map((s) =>
        t[s] ? (
          <span key={s} className="first:rounded-l last:rounded-r" style={{ width: `${(t[s] / t.count) * 100}%`, background: SENTIMENT_COLOR[s] }} />
        ) : null,
      )}
    </div>
  );
}

export default function InsightsPage() {
  const { filters } = useFilters();
  const query = qs(filters);
  const { data, error, loading, reload } = useApi<TopicRow[]>(`/api/topics${query}`);
  const onDone = useCallback(() => reload(), [reload]);

  const grouped = useMemo(() => {
    const m = new Map<string, TopicRow[]>();
    for (const t of data ?? []) {
      if (!m.has(t.category)) m.set(t.category, []);
      m.get(t.category)!.push(t);
    }
    for (const rows of m.values()) rows.sort((a, b) => (a.polarity === b.polarity ? b.count - a.count : a.polarity === "complaint" ? -1 : 1));
    return CATEGORY_ORDER.filter((c) => m.has(c)).map((c) => [c, m.get(c)!] as const);
  }, [data]);

  return (
    <div className="space-y-10">
      <PageHeader
        title="Insights"
        intro="The recurring topics behind the numbers. Similar reviews are grouped into one topic, so twenty ways of saying the same thing count as one problem."
      />

      <AdaptionPanel onDone={onDone} />

      <FilterBar />

      {error && <ErrorNote message={error} onRetry={reload} />}
      {loading && !data && <Skeleton className="h-96" />}
      {data && !data.length && <Empty title="No topics for these filters">Try a wider period or remove a filter.</Empty>}

      {grouped.map(([category, rows]) => (
        <section key={category} aria-labelledby={`cat-${category}`}>
          <div className="flex items-baseline justify-between border-b-2 border-ink pb-2">
            <h2 id={`cat-${category}`} className="display text-3xl">
              {CATEGORY_SHORT[category] ?? category}
            </h2>
            <span className="num text-sm text-ink-soft">{fmt.format(rows.reduce((s, r) => s + r.count, 0))} reviews</span>
          </div>
          <ul>
            {rows.map((t) => (
              <li key={t.topic} className="border-b border-rule">
                <details className="group">
                  <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto] items-center gap-x-6 gap-y-2 py-4 md:grid-cols-[minmax(0,2.4fr)_90px_130px_130px_90px]">
                    <span>
                      <span className="block font-semibold group-open:underline">{t.label}</span>
                      <span className="text-sm text-ink-soft">
                        {t.polarity === "complaint" ? "Complaint" : t.polarity === "praise" ? "Praise" : "Other"},{" "}
                        {t.phrasings} {t.phrasings === 1 ? "phrasing" : "phrasings"} grouped
                      </span>
                    </span>
                    <span className="num text-right text-lg md:text-left">{fmt.format(t.count)}</span>
                    <span className="hidden md:block">
                      <MiniSplit t={t} />
                    </span>
                    <span className="hidden md:block" title="Weekly reports, last 12 weeks">
                      <Sparkline values={t.weekly} color={t.polarity === "complaint" ? "#d9482b" : "#1f8a70"} width={110} height={28} />
                    </span>
                    <span className="hidden md:block">{t.avg_severity > 0 ? <SeverityDots value={Math.round(t.avg_severity)} /> : null}</span>
                  </summary>
                  <div className="grid gap-6 pb-6 md:grid-cols-[2fr_1fr]">
                    <ul className="space-y-2">
                      {t.examples.map((ex) => (
                        <li key={ex.text} className="flex gap-3 rounded-xl bg-paper-deep/50 px-4 py-3">
                          <span className="num shrink-0 font-semibold text-cobalt">{fmt.format(ex.count)}×</span>
                          <span className="leading-snug">&ldquo;{ex.text}&rdquo;</span>
                        </li>
                      ))}
                    </ul>
                    <div className="text-sm leading-relaxed text-ink-soft">
                      <p>
                        {fmt.format(t.negative)} negative, {fmt.format(t.mixed)} mixed and {fmt.format(t.positive)} positive.
                        {t.avg_severity > 0 && ` Average severity ${t.avg_severity.toFixed(1)} of 5.`}
                      </p>
                      <Link href={`/feedback${qs({ ...filters, topic: t.topic })}`} className="label-caps mt-3 inline-block border-b border-ink pb-0.5">
                        Read all {fmt.format(t.count)}
                      </Link>
                    </div>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
