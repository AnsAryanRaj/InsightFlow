"use client";

import { useState } from "react";
import { Check, Copy, Download, Link2, Printer } from "lucide-react";
import FilterBar from "@/components/FilterBar";
import ReportView from "@/components/ReportView";
import { Button, ErrorNote, PageHeader, Skeleton } from "@/components/ui";
import { api, API_URL, qs, ReportPayload } from "@/lib/api";
import { useApi, useFilters } from "@/lib/hooks";
import { relative } from "@/lib/format";

export default function ReportPage() {
  const { filters } = useFilters();
  const scope = { category: filters.category, date_from: filters.date_from, date_to: filters.date_to };
  const preview = useApi<ReportPayload>(`/api/report/preview${qs(scope)}`);
  const past = useApi<{ slug: string; title: string; created_at: string }[]>("/api/reports");
  const [title, setTitle] = useState("Customer feedback insight report");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function share() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ slug: string }>("/api/reports", { method: "POST", body: JSON.stringify({ title, ...scope }) });
      const url = `${window.location.origin}/r/${r.slug}`;
      setLink(url);
      past.reload();
      await navigator.clipboard?.writeText(url).then(() => setCopied(true)).catch(() => {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="no-print space-y-8">
        <PageHeader
          title="Insight report"
          intro="A one-page summary for people who will not open the dashboard. Save it as a PDF, or share a read-only link that keeps today's numbers."
        />
        <div className="grid gap-6 rounded-2xl border border-rule bg-paper p-6 md:grid-cols-[1.3fr_1fr]">
          <div className="space-y-4">
            <label className="block">
              <span className="text-sm text-ink-soft">Report title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="display mt-1 w-full rounded-xl border border-ink/20 bg-white/60 px-4 py-3 text-2xl focus:border-cobalt focus:outline-none"
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => window.print()} variant="cobalt">
                <Printer className="size-3.5" aria-hidden /> Save as PDF
              </Button>
              <Button onClick={share} variant="line" busy={busy}>
                <Link2 className="size-3.5" aria-hidden /> Create share link
              </Button>
              <a
                href={`${API_URL}/api/export/priorities.csv${qs(scope)}`}
                className="label-caps inline-flex items-center gap-2 rounded-full border border-ink/25 px-5 py-3 hover:border-ink"
              >
                <Download className="size-3.5" aria-hidden /> Priorities CSV
              </a>
            </div>
            {link && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl bg-pos/10 px-4 py-3 text-sm" role="status">
                <span className="font-semibold">{copied ? "Link copied." : "Link ready."}</span>
                <a href={link} target="_blank" rel="noreferrer" className="break-all underline">
                  {link}
                </a>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(link).then(() => setCopied(true))}
                  className="inline-flex items-center gap-1"
                  aria-label="Copy link"
                >
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                </button>
              </div>
            )}
            {error && <p role="alert" className="text-sm text-neg">{error}</p>}
          </div>
          <div>
            <p className="text-sm font-semibold">Shared before</p>
            {past.data?.length ? (
              <ul className="mt-2 divide-y divide-rule text-sm">
                {past.data.slice(0, 5).map((r) => (
                  <li key={r.slug} className="flex justify-between gap-3 py-2">
                    <a href={`/r/${r.slug}`} target="_blank" rel="noreferrer" className="truncate underline-offset-4 hover:underline">
                      {r.title}
                    </a>
                    <span className="shrink-0 text-ink-soft">{relative(r.created_at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-ink-soft">No shared reports yet.</p>
            )}
          </div>
        </div>
        <FilterBar sentiment={false} />
      </div>

      {preview.error && <ErrorNote message={preview.error} onRetry={preview.reload} />}
      {preview.loading && !preview.data && <Skeleton className="h-[900px]" />}
      {preview.data && (
        <div className="mx-auto max-w-[920px] overflow-hidden rounded-[26px] ring-1 ring-rule print:ring-0">
          <ReportView title={title} payload={preview.data} />
        </div>
      )}
    </div>
  );
}
