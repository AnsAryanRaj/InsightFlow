"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Download } from "lucide-react";
import FilterBar from "@/components/FilterBar";
import { Meter } from "@/components/charts";
import { Button, Empty, ErrorNote, PageHeader, Skeleton } from "@/components/ui";
import TierBadge from "@/components/TierBadge";
import { api, API_URL, Priority, qs } from "@/lib/api";
import { useApi, useFilters } from "@/lib/hooks";
import { CATEGORY_SHORT, fmt, pct } from "@/lib/format";

export default function PrioritiesPage() {
  const { filters } = useFilters();
  const query = qs({ category: filters.category, date_from: filters.date_from, date_to: filters.date_to });
  const { data, error, loading, reload, setData } = useApi<Priority[]>(`/api/priorities${query}`);

  return (
    <div className="space-y-10">
      <PageHeader
        title="Priorities"
        intro="Complaints ranked by what fixing them is worth. Every score is built from four parts you can see, so you can explain the ranking to anyone."
      >
        <a
          href={`${API_URL}/api/export/priorities.csv${query}`}
          className="label-caps inline-flex items-center gap-2 rounded-full border border-ink/25 px-5 py-3 hover:border-ink"
        >
          <Download className="size-3.5" aria-hidden /> Export CSV
        </a>
      </PageHeader>

      <div className="grid gap-6 rounded-2xl bg-paper-deep/60 p-6 md:grid-cols-4">
        {[
          ["Volume", "35%", "How many reports, compared with the biggest complaint."],
          ["Negativity", "25%", "Share of fully negative reports. Partly fixed ones count half."],
          ["Severity", "25%", "How much the customer was hurt, from 1 (annoyed) to 5 (lost money)."],
          ["Growth", "15%", "Last 14 days against the 14 before. Neutral when history is thin."],
        ].map(([t, w, d]) => (
          <div key={t}>
            <p className="font-semibold">
              {t} <span className="num font-normal text-ink-soft">{w}</span>
            </p>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">{d}</p>
          </div>
        ))}
      </div>

      <FilterBar sentiment={false} />

      {error && <ErrorNote message={error} onRetry={reload} />}
      {loading && !data && <Skeleton className="h-[600px]" />}
      {data && !data.length && <Empty title="No complaints in this view">Widen the period or remove a category.</Empty>}

      <ol className="space-y-6">
        {data?.map((p) => (
          <PriorityCard
            key={p.topic}
            p={p}
            onTracked={(id) => setData((rows) => rows?.map((r) => (r.topic === p.topic ? { ...r, tracked_issue_id: id } : r)) ?? null)}
          />
        ))}
      </ol>
    </div>
  );
}

function PriorityCard({ p, onTracked }: { p: Priority; onTracked: (id: number) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function track() {
    setBusy(true);
    setError(null);
    try {
      const issue = await api<{ id: number }>("/api/issues", { method: "POST", body: JSON.stringify({ topic: p.topic }) });
      onTracked(issue.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const growthText =
    p.previous_14d >= 5
      ? `${p.recent_14d} vs ${p.previous_14d} reports (${p.growth >= 0 ? "+" : ""}${Math.round(p.growth * 100)}%)`
      : "Not enough history yet";

  return (
    <li className="grid gap-8 rounded-[24px] border border-rule bg-paper p-6 md:grid-cols-[150px_1.3fr_1fr] md:p-8">
      <div className="flex items-center gap-5 md:flex-col md:items-start">
        <span className="display num text-7xl leading-none text-cobalt md:text-8xl">{p.rank}</span>
        <div className="space-y-2">
          <p className="text-sm text-ink-soft">
            Score <span className="display num text-3xl text-ink">{p.score}</span>
          </p>
          <TierBadge tier={p.tier} />
        </div>
      </div>

      <div className="min-w-0">
        <p className="text-sm text-ink-soft">
          {CATEGORY_SHORT[p.category] ?? p.category} · Owner: {p.owner}
        </p>
        <h2 className="display mt-1 text-3xl leading-tight md:text-[2.2rem]">{p.label}</h2>
        <h3 className="mt-6 font-semibold">Why it deserves attention</h3>
        <ul className="mt-2 space-y-2 leading-relaxed text-ink-soft">
          {p.reasons.map((r) => (
            <li key={r} className="flex gap-2.5">
              <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-cobalt" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Meter label="Volume" value={p.components.volume} weight={p.weights.volume} detail={`${fmt.format(p.count)} reports, ${pct(p.share_of_complaints)} of complaints`} />
          <Meter label="Negativity" value={p.components.negativity} weight={p.weights.negativity} detail={p.mixed ? `${fmt.format(p.negative)} negative, ${fmt.format(p.mixed)} partly fixed` : `All ${fmt.format(p.negative)} fully negative`} />
          <Meter label="Severity" value={p.components.severity} weight={p.weights.severity} detail={`${p.avg_severity.toFixed(1)} of 5 on average`} />
          <Meter label="Growth" value={p.components.growth} weight={p.weights.growth} detail={growthText} />
        </div>
        {p.confidence < 1 && (
          <p className="mt-4 text-sm text-ink-soft">
            Score damped because only {p.count} {p.count === 1 ? "review mentions" : "reviews mention"} this. One loud review cannot outrank a real pattern.
          </p>
        )}
      </div>

      <div className="flex min-w-0 flex-col">
        <h3 className="font-semibold">What to do</h3>
        <ol className="mt-3 space-y-3">
          {p.actions.map((a, i) => (
            <li key={a} className="grid grid-cols-[1.5rem_1fr] gap-2 leading-relaxed">
              <span className="num font-semibold text-cobalt">{i + 1}.</span>
              <span>{a}</span>
            </li>
          ))}
        </ol>
        {p.examples[0] && (
          <figure className="mt-6 rounded-xl bg-paper-deep/60 p-4">
            <blockquote className="leading-snug">&ldquo;{p.examples[0].text}&rdquo;</blockquote>
            <figcaption className="num mt-2 text-sm text-ink-soft">Sent {fmt.format(p.examples[0].count)} times</figcaption>
          </figure>
        )}
        <div className="mt-auto pt-6">
          {p.tracked_issue_id ? (
            <Link href="/tracker" className="label-caps inline-flex items-center gap-2 rounded-full bg-pos/15 px-5 py-3 text-ink">
              <Check className="size-3.5" aria-hidden /> Tracked. Open tracker
            </Link>
          ) : (
            <Button onClick={track} busy={busy}>
              Track this issue
            </Button>
          )}
          {error && <p role="alert" className="mt-2 text-sm text-neg">{error}</p>}
        </div>
      </div>
    </li>
  );
}
