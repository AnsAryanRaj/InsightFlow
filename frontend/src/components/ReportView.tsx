import type { ReportPayload } from "@/lib/api";
import { CATEGORY_SHORT, fmt, longDate, pct } from "@/lib/format";
import { CategoryBars, Legend, SentimentSplit, TrendChart } from "./charts";
import TierBadge from "./TierBadge";

const STATUS_LABEL = { open: "Open", in_progress: "In progress", resolved: "Resolved" } as const;

export default function ReportView({ title, payload }: { title: string; payload: ReportPayload }) {
  const ov = payload.overview;
  const f = payload.filters;
  const scope = [
    f.category ? `Categories: ${f.category.split(",").map((c) => CATEGORY_SHORT[c] ?? c).join(", ")}` : "All categories",
    f.date_from ? `from ${longDate(f.date_from)}` : "all dates",
  ].join(", ");

  return (
    <article className="mx-auto max-w-[920px] bg-paper text-ink">
      <header className="overflow-hidden rounded-t-[24px] bg-cobalt text-cream print:rounded-none">
        <div className="halftone px-8 py-10 md:px-12 md:py-14">
          <p className="display text-2xl">insightflow.</p>
          <h1 className="display mt-8 text-5xl md:text-6xl">{title}</h1>
          <p className="mt-4 text-cream/85">
            Prepared {longDate(payload.generated_at)}. {scope}.
          </p>
        </div>
      </header>

      <div className="space-y-12 px-8 py-10 md:px-12">
        <section>
          <h2 className="display text-3xl">Summary</h2>
          <ul className="mt-4 space-y-3 text-[1.05rem] leading-relaxed">
            {payload.summary.map((l) => (
              <li key={l} className="flex gap-3">
                <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-cobalt" />
                {l}
              </li>
            ))}
          </ul>
        </section>

        {ov?.total ? (
          <section className="grid gap-10 md:grid-cols-2">
            <div>
              <h2 className="display text-3xl">Sentiment</h2>
              <div className="mt-5">
                <SentimentSplit counts={ov.sentiment} />
              </div>
            </div>
            <div>
              <h2 className="display text-3xl">By category</h2>
              <div className="mt-5">
                <CategoryBars rows={ov.categories} />
              </div>
            </div>
          </section>
        ) : null}

        {ov?.trend?.length ? (
          <section>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="display text-3xl">Volume over time</h2>
              <Legend />
            </div>
            <div className="mt-4">
              <TrendChart data={ov.trend} />
            </div>
            {ov.simulated_time && <p className="mt-2 text-xs text-ink-soft">Dataset timestamps are simulated; the source file has no dates.</p>}
          </section>
        ) : null}

        <section className="print-break">
          <h2 className="display text-3xl">What to fix first</h2>
          <p className="mt-2 text-ink-soft">Ranked by volume, negativity, severity and growth.</p>
          {payload.priorities.length > 0 ? (
            <ol className="mt-6 divide-y divide-rule border-y border-rule">
              {payload.priorities.map((p) => (
                <li key={p.topic} className="grid gap-4 py-6 md:grid-cols-[70px_1fr]">
                  <span className="display num text-5xl text-cobalt">{p.rank}</span>
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="display text-2xl">{p.label}</h3>
                      <TierBadge tier={p.tier} />
                      <span className="num text-sm text-ink-soft">Score {p.score}</span>
                    </div>
                    <p className="mt-2 text-sm text-ink-soft">
                      {fmt.format(p.count)} reports, {pct(p.share_of_complaints)} of complaints, severity {p.avg_severity.toFixed(1)} of 5.
                      Owner: {p.owner}.
                    </p>
                    {p.reasons?.[2] && <p className="mt-3 leading-relaxed">{p.reasons[2]}</p>}
                    <p className="mt-3 font-semibold">Recommended actions</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 leading-relaxed">
                      {p.actions.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="mt-6 rounded-2xl bg-paper-deep/60 p-6 text-ink-soft">
              <p className="font-semibold text-ink">No high-priority complaints in this report scope.</p>
              <p className="mt-1 text-sm">
                Feedback under the selected categories or date range contains no critical complaint patterns.
              </p>
            </div>
          )}
        </section>

        {payload.praise.length > 0 && (
          <section>
            <h2 className="display text-3xl">What customers like</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {payload.praise.map((t) => (
                <li key={t.topic} className="flex items-baseline justify-between rounded-xl bg-pos/[0.08] px-4 py-3">
                  <span>{t.label}</span>
                  <span className="num text-sm text-ink-soft">{fmt.format(t.count)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="display text-3xl">Tracked issues</h2>
          {payload.issues.length ? (
            <table className="mt-4 w-full text-left text-sm">
              <thead className="text-ink-soft">
                <tr className="border-b border-rule">
                  <th className="py-2 font-medium">Issue</th>
                  <th className="py-2 font-medium">Owner</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 text-right font-medium">Score</th>
                </tr>
              </thead>
              <tbody>
                {payload.issues.map((i) => (
                  <tr key={i.id} className="border-b border-rule align-top">
                    <td className="py-3 pr-4">
                      <p className="font-semibold">{i.title}</p>
                      {i.notes && <p className="mt-1 text-ink-soft">{i.notes}</p>}
                    </td>
                    <td className="py-3 pr-4">{i.owner || "Unassigned"}</td>
                    <td className="py-3 pr-4">{STATUS_LABEL[i.status]}</td>
                    <td className="num py-3 text-right">{i.priority_score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-3 text-ink-soft">No issues are being tracked yet.</p>
          )}
        </section>

        <footer className="border-t border-rule pt-6 text-xs text-ink-soft">
          Generated by InsightFlow from {fmt.format(ov?.total ?? 0)} pieces of feedback. Analysis engines:{" "}
          {Object.entries(ov?.engines ?? {})
            .map(([k, v]) => `${k === "rules" ? "topic rules" : k} (${fmt.format(v)} unique texts)`)
            .join(", ")}
          .
        </footer>
      </div>
    </article>
  );
}
