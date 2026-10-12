"use client";

import { useEffect, useState } from "react";
import { api, AdaptionStatus } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { fmt, relative } from "@/lib/format";
import { Button } from "./ui";

const STEPS = [
  ["Upload", "Only the unique reviews go up, one row each, with their category as context."],
  ["Adapt", "Adaption writes a completion for every review. Our blueprint makes that completion a structured read: sentiment, topic, severity, summary and a next step."],
  ["Dedupe and screen", "The deduplication recipe removes near-duplicate phrasings, and safety analysis flags abusive feedback."],
  ["Evaluate", "Adaption grades the dataset quality before and after, shown below."],
  ["Merge", "Each completion is parsed and stored as that review's analysis. Topic rules fill any gap."],
];

export default function AdaptionPanel({ onDone }: { onDone?: () => void }) {
  const { data, reload } = useApi<AdaptionStatus>("/api/adaption");
  const [estimating, setEstimating] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = estimating || enriching;
  const running = data?.state.status === "running" || data?.is_active === true;

  useEffect(() => {
    if (!running) return;
    const t = setInterval(reload, 3000);
    return () => clearInterval(t);
  }, [running, reload]);

  useEffect(() => {
    if (data?.state.status === "succeeded") onDone?.();
  }, [data?.state.status, onDone]);

  async function run(estimateOnly: boolean) {
    if (estimateOnly) setEstimating(true);
    else setEnriching(true);
    setError(null);
    try {
      await api("/api/adaption/run", { method: "POST", body: JSON.stringify({ estimate_only: estimateOnly }) });
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (estimateOnly) setEstimating(false);
      else setEnriching(false);
    }
  }

  const ev = data?.cached.evaluation;
  const est = data?.state.estimate ?? data?.cached.estimate;

  return (
    <section className="overflow-hidden rounded-[24px] bg-cobalt-deep text-cream" aria-labelledby="adaption-title">
      <div className="halftone grid gap-8 p-7 md:grid-cols-[1.1fr_1fr] md:p-9">
        <div>
          <p className="label-caps text-cream/75">Data enrichment</p>
          <h2 id="adaption-title" className="display mt-2 text-4xl">
            How Adaption reads each review
          </h2>
          <ol className="mt-6 space-y-4">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="grid grid-cols-[2rem_1fr] gap-3">
                <span className="display num text-2xl text-sunset">{i + 1}</span>
                <p className="leading-relaxed text-cream/90">
                  <span className="font-semibold text-cream">{title}.</span> {body}
                </p>
              </li>
            ))}
          </ol>
        </div>

        <div className="flex flex-col gap-5">
          <div className="rounded-2xl bg-cobalt-night/60 p-6 ring-1 ring-cream/15" aria-live="polite">
            {!data ? (
              <p className="text-cream/80">Checking Adaption status</p>
            ) : data.cached.available ? (
              <>
                <p className="text-sm text-cream/75">
                  Last run {data.cached.created_at ? relative(data.cached.created_at) : ""}
                  {data.cached.applied_at && data.cached.applied_at !== data.cached.created_at && (
                    <span> · Applied {relative(data.cached.applied_at)}</span>
                  )}
                </p>
                <p className="display mt-1 text-3xl">
                  {fmt.format(data.cached.enriched)} reviews enriched
                </p>
                {data.cached.fallback_count ? (
                  <p className="mt-1 text-xs text-cream/70">
                    {fmt.format(data.cached.fallback_count)} items preserved on local rules fallback
                  </p>
                ) : null}
                {ev && (ev.grade_before || ev.grade_after) ? (
                  <dl className="mt-5 grid grid-cols-3 gap-4">
                    <div>
                      <dt className="text-xs text-cream/70">Quality before</dt>
                      <dd className="display text-4xl">{ev.grade_before ?? "?"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-cream/70">Quality after</dt>
                      <dd className="display text-4xl">{ev.grade_after ?? "?"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-cream/70">Improvement</dt>
                      <dd className="display num text-4xl">
                        {ev.improvement_percent != null ? `${Math.round(ev.improvement_percent)}%` : "?"}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="mt-3 text-sm text-cream/75">Quality evaluation: {ev?.status ?? "not available"}.</p>
                )}
                <p className="mt-4 break-all text-xs text-cream/60">Dataset {data.cached.dataset_id}</p>
              </>
            ) : data.configured ? (
              <>
                <p className="display text-3xl">Ready to run</p>
                <p className="mt-2 text-cream/80">
                  Your Adaption key is set. Get a cost estimate first, then run it on every unique review.
                </p>
              </>
            ) : (
              <>
                <p className="display text-3xl">Running on local rules</p>
                <p className="mt-2 leading-relaxed text-cream/80">
                  No Adaption key is set, so reviews are read by the topic rules for now. Add{" "}
                  <code className="rounded bg-cream/10 px-1.5">ADAPTION_API_KEY</code> to the backend and run the
                  enrichment here or with <code className="rounded bg-cream/10 px-1.5">python -m scripts.run_adaption</code>.
                </p>
              </>
            )}

            {running && (
              <p className="mt-4 rounded-lg bg-cream/10 px-3 py-2 text-sm">
                Running: {data?.state.step ?? "working"}
              </p>
            )}
            {data?.state.status === "failed" && data.state.error && (
              <div role="alert" className="mt-4 rounded-lg bg-neg/30 p-3 text-sm">
                <p className="font-semibold text-cream">Run stopped or failed:</p>
                <p className="mt-1 text-cream/90">{data.state.error}</p>
                <button
                  type="button"
                  className="mt-2 rounded bg-cream/10 px-2.5 py-1 text-xs font-medium text-cream hover:bg-cream/20"
                  onClick={async () => {
                    try {
                      await api("/api/adaption/reset", { method: "POST" });
                      reload();
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Dismiss error
                </button>
              </div>
            )}
            {est && !running && (
              <p className="mt-4 text-sm text-cream/80">
                Estimate: about {fmt.format(Math.round(est.credits))} credits and {Math.ceil(est.minutes)} minutes.
              </p>
            )}
            {data && (
              <div className="on-cobalt mt-5 flex flex-wrap gap-3">
                <Button variant="cream" onClick={() => run(true)} busy={estimating} disabled={running || busy}>
                  Run estimate
                </Button>
                <Button variant="ghost" className="text-cream ring-1 ring-cream/50 hover:bg-cream/10" onClick={() => run(false)} busy={enriching} disabled={running || busy}>
                  {data.cached.available ? "Run again" : "Run enrichment"}
                </Button>
              </div>
            )}
            {error && <p role="alert" className="mt-3 text-sm text-sunset">{error}</p>}
          </div>

          <details className="group rounded-2xl bg-cobalt-night/40 p-5 ring-1 ring-cream/10">
            <summary className="cursor-pointer list-none text-sm font-semibold">
              <span className="underline underline-offset-4">See the blueprint sent to Adaption</span>
            </summary>
            <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-cream/85">{data?.blueprint}</pre>
          </details>
        </div>
      </div>
    </section>
  );
}
