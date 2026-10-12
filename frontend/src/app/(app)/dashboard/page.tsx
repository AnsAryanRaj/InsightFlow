"use client";

import { useRouter } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, Download } from "lucide-react";
import FilterBar, { SimulatedNote } from "@/components/FilterBar";
import { CategoryBars, Legend, RankedBars, SentimentSplit, TrendChart } from "@/components/charts";
import { Empty, ErrorNote, PageHeader, PillLink, Section, Skeleton } from "@/components/ui";
import { API_URL, Overview, qs } from "@/lib/api";
import { useApi, useFilters } from "@/lib/hooks";
import { fmt, pct } from "@/lib/format";

function Figure({ label, value, detail }: { label: string; value: React.ReactNode; detail?: React.ReactNode }) {
  return (
    <div className="min-w-0 border-ink/15 py-1 md:border-l md:pl-6 md:first:border-l-0 md:first:pl-0">
      <p className="text-sm text-ink-soft">{label}</p>
      <p className="display num mt-1 text-[2.6rem] leading-none">{value}</p>
      {detail && <p className="mt-2 text-sm text-ink-soft">{detail}</p>}
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const { filters, setFilters } = useFilters();
  const query = qs(filters);
  const { data: ov, error, loading, reload } = useApi<Overview>(`/api/overview${query}`);
  const summary = useApi<{ lines: string[] }>(`/api/summary${query}`);

  const change = ov ? ov.negative_share_last_30d - ov.negative_share_prev_30d : 0;

  return (
    <div className="space-y-10">
      <PageHeader
        title="Dashboard"
        intro={ov?.total ? `What ${fmt.format(ov.total)} customers told you, and how it is changing.` : "What customers told you, and how it is changing."}
      >
        <a
          href={`${API_URL}/api/export/feedback.csv${query}`}
          className="label-caps inline-flex items-center gap-2 rounded-full border border-ink/25 px-5 py-3 hover:border-ink"
        >
          <Download className="size-3.5" aria-hidden /> Export CSV
        </a>
        <PillLink href={`/report${query}`} variant="cobalt">
          Build report
        </PillLink>
      </PageHeader>

      <FilterBar />

      {error && <ErrorNote message={error} onRetry={reload} />}
      {loading && !ov && <Skeleton className="h-[520px]" />}

      {ov && !ov.total && (
        <Empty title={ov.empty ? "No feedback yet" : "Nothing matches these filters"}>
          {ov.empty ? (
            <p>
              Import a CSV or load the sample dataset on the <a className="underline" href="/feedback">Feedback</a> page.
            </p>
          ) : (
            <p>Try a wider period or remove a filter.</p>
          )}
        </Empty>
      )}

      {ov?.total ? (
        <>
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4 md:gap-0">
            <Figure label="Feedback analyzed" value={fmt.format(ov.total)} detail={`${fmt.format(ov.unique_texts)} unique messages`} />
            <Figure
              label="Negative"
              value={pct(ov.negative_share)}
              detail={
                <span className="inline-flex items-center gap-1">
                  {change > 0.005 ? (
                    <ArrowUpRight className="size-4 text-neg" aria-hidden />
                  ) : change < -0.005 ? (
                    <ArrowDownRight className="size-4 text-pos" aria-hidden />
                  ) : null}
                  {Math.abs(change) < 0.005
                    ? "Flat vs the 30 days before"
                    : `${change > 0 ? "Up" : "Down"} ${Math.abs(change * 100).toFixed(1)} points vs the 30 days before`}
                </span>
              }
            />
            <Figure label="Complaints" value={fmt.format(ov.complaints)} detail={`Average severity ${ov.avg_complaint_severity.toFixed(1)} of 5`} />
            <Figure label="Repeated messages" value={pct(ov.duplicate_share)} detail="Same words, sent again and again" />
          </div>

          <div className="grid gap-10 lg:grid-cols-[1.75fr_1fr]">
            <Section title="Feedback over time" note="Reviews per week by sentiment. Lighter bars are partial weeks." action={<Legend />}>
              <TrendChart data={ov.trend} />
              {ov.simulated_time && (
                <div className="mt-3">
                  <SimulatedNote />
                </div>
              )}
            </Section>
            <Section title="Sentiment split">
              <SentimentSplit counts={ov.sentiment} />
              {summary.data?.lines?.length ? (
                <div className="mt-8 rounded-2xl bg-cobalt-deep halftone p-6 text-cream">
                  <p className="label-caps text-cream/80">In plain words</p>
                  <ul className="mt-3 space-y-3 text-[0.95rem] leading-relaxed">
                    {summary.data.lines.slice(0, 3).map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Section>
          </div>

          <div className="grid gap-10 lg:grid-cols-2">
            <Section title="By category" note="Select a category to filter the whole page.">
              <CategoryBars rows={ov.categories} onPick={(c) => setFilters({ category: c })} />
            </Section>
            <Section
              title="Most reported problems"
              note="Complaints only. Select one to read the reviews."
              action={<PillLink href="/priorities" variant="line">Why they matter</PillLink>}
            >
              <RankedBars
                rows={ov.top_issues.map((t) => ({ key: t.topic, label: t.label, value: t.count, note: pct(t.share_of_complaints) }))}
                onPick={(topic) => router.push(`/feedback${qs({ ...filters, topic })}`)}
              />
            </Section>
          </div>
        </>
      ) : null}
    </div>
  );
}
