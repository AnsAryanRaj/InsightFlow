"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { Layers, Plus, Upload } from "lucide-react";
import FilterBar from "@/components/FilterBar";
import { Button, Empty, ErrorNote, PageHeader, SentimentTag, SeverityDots, Skeleton } from "@/components/ui";
import ImportHealthPanel from "@/components/ImportHealth";
import { api, FeedbackItem, ImportHealth, qs } from "@/lib/api";
import { useApi, useFilters } from "@/lib/hooks";
import { CATEGORY_SHORT, fmt, relative } from "@/lib/format";

type Page = { total: number; page: number; page_size: number; items: FeedbackItem[] };

const CATEGORIES = ["Operational Issues", "Fraud and Scam", "Product Feedback", "Customer Service"];

export default function FeedbackPage() {
  const { filters } = useFilters();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const page = Number(params.get("page") ?? 1);
  const group = params.get("group") === "1";
  const sort = params.get("sort") ?? (group ? "repeats" : "newest");

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== "page") next.delete("page");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const list = useApi<Page>(`/api/feedback${qs({ ...filters, page, page_size: 25, group, sort })}`);
  const imports = useApi<ImportHealth[]>("/api/imports");

  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    list.reload();
    imports.reload();
  };

  async function uploadFile(file: File) {
    setBusy("import");
    setNotice(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await api<ImportHealth>("/api/feedback/import", { method: "POST", body });
      setNotice({ kind: "ok", text: `Imported ${fmt.format(res.rows_imported)} rows from ${res.filename}.` });
      refresh();
    } catch (e) {
      setNotice({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function loadSample() {
    if (!confirm("Replace all feedback with the Build Battle sample dataset? Tracked issues are kept.")) return;
    setBusy("sample");
    setNotice(null);
    try {
      const res = await api<ImportHealth>("/api/feedback/sample?replace=true", { method: "POST" });
      setNotice({ kind: "ok", text: `Loaded the sample: ${fmt.format(res.rows_imported)} reviews.` });
      refresh();
    } catch (e) {
      setNotice({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const latest = imports.data?.[0];
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.page_size)) : 1;

  return (
    <div className="space-y-8">
      <PageHeader title="Feedback" intro="Every review, searchable. Add one by hand, import a CSV, or load the sample data.">
        <Button variant="line" onClick={() => setShowForm((v) => !v)} aria-expanded={showForm}>
          <Plus className="size-3.5" aria-hidden /> Add feedback
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          id="csv-input"
          onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
        />
        <Button variant="line" busy={busy === "import"} onClick={() => fileRef.current?.click()}>
          <Upload className="size-3.5" aria-hidden /> Import CSV
        </Button>
        <Button variant="cobalt" busy={busy === "sample"} onClick={loadSample}>
          Load sample data
        </Button>
      </PageHeader>

      {notice && (
        <p
          role="status"
          className={`rounded-xl px-5 py-3 text-sm ${notice.kind === "ok" ? "bg-pos/10 text-ink" : "bg-neg/10 text-ink"}`}
        >
          {notice.text}
        </p>
      )}

      {showForm && <AddFeedback onAdded={refresh} />}

      {latest && <ImportHealthPanel health={latest} />}

      <FilterBar search />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-soft" aria-live="polite">
          {list.data ? (
            <>
              <span className="num font-semibold text-ink">{fmt.format(list.data.total)}</span>{" "}
              {group ? "unique messages" : "reviews"}
            </>
          ) : (
            "Loading"
          )}
        </p>
        <div className="flex items-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => setParam("group", group ? null : "1")}
            aria-pressed={group}
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 ${
              group ? "border-cobalt bg-cobalt text-cream" : "border-ink/20 hover:border-ink/50"
            }`}
          >
            <Layers className="size-3.5" aria-hidden /> Group repeats
          </button>
          <label className="flex items-center gap-2">
            <span className="text-ink-soft">Sort</span>
            <select
              value={sort}
              onChange={(e) => setParam("sort", e.target.value)}
              className="rounded-full border border-ink/20 bg-white/60 px-3 py-1.5"
            >
              {group ? (
                <>
                  <option value="repeats">Most repeated</option>
                  <option value="newest">Most recent</option>
                </>
              ) : (
                <>
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="severity">Most severe</option>
                </>
              )}
            </select>
          </label>
        </div>
      </div>

      {list.error && <ErrorNote message={list.error} onRetry={list.reload} />}
      {list.loading && !list.data && <Skeleton className="h-96" />}
      {list.data && list.data.items.length === 0 && (
        <Empty title="No reviews match">
          <p>Clear the filters or change the search words.</p>
        </Empty>
      )}

      {list.data && list.data.items.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-rule bg-paper">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Customer feedback</caption>
            <thead className="hidden bg-paper-deep/60 text-sm text-ink-soft md:table-header-group">
              <tr>
                <th scope="col" className="px-5 py-3 font-medium">Review</th>
                <th scope="col" className="px-4 py-3 font-medium">Topic</th>
                <th scope="col" className="px-4 py-3 font-medium">Sentiment</th>
                <th scope="col" className="px-4 py-3 font-medium">Severity</th>
                <th scope="col" className="px-5 py-3 text-right font-medium">{group ? "Repeats" : "Received"}</th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((item, i) => (
                <tr key={item.id ?? `${item.text}-${i}`} className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-rule px-5 py-4 first:border-t-0 md:table-row md:p-0">
                  <td className="col-span-2 md:px-5 md:py-4">
                    <p className="max-w-[60ch] leading-snug">{item.text}</p>
                    <p className="mt-1 text-xs text-ink-soft">
                      {CATEGORY_SHORT[item.category] ?? item.category}
                      {item.engine !== "rules" && <span className="ml-2 rounded-full bg-cobalt/10 px-2 py-0.5 text-cobalt">read by {item.engine}</span>}
                    </p>
                  </td>
                  <td className="text-sm md:px-4 md:py-4">{item.topic_label}</td>
                  <td className="md:px-4 md:py-4">
                    <SentimentTag value={item.sentiment} />
                  </td>
                  <td className="md:px-4 md:py-4">{item.severity > 0 ? <SeverityDots value={item.severity} /> : <span className="text-sm text-ink-faint">None</span>}</td>
                  <td className="num text-sm text-ink-soft md:px-5 md:py-4 md:text-right">
                    {group ? (
                      <span className="font-semibold text-ink">{fmt.format(item.count ?? 1)}×</span>
                    ) : item.created_at ? (
                      <span title={item.simulated_time ? "Simulated timestamp" : undefined}>
                        {relative(item.created_at)}
                        {item.simulated_time && <span aria-hidden>*</span>}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {list.data && pages > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label="Pages">
          <button disabled={page <= 1} onClick={() => setParam("page", String(page - 1))} className="label-caps disabled:opacity-30">
            Previous
          </button>
          <span className="num text-ink-soft">
            Page {page} of {fmt.format(pages)}
          </span>
          <button disabled={page >= pages} onClick={() => setParam("page", String(page + 1))} className="label-caps disabled:opacity-30">
            Next
          </button>
        </nav>
      )}
      {!group && list.data?.items.some((i) => i.simulated_time) && (
        <p className="text-xs text-ink-soft">* Simulated timestamp. The sample dataset has no dates.</p>
      )}
    </div>
  );
}

function AddFeedback({ onAdded }: { onAdded: () => void }) {
  const [text, setText] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<(FeedbackItem & { engine: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<FeedbackItem>("/api/feedback", {
        method: "POST",
        body: JSON.stringify({ text, category: category || null }),
      });
      setResult(res);
      setText("");
      onAdded();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-6 rounded-2xl border border-rule bg-paper p-6 md:grid-cols-[1.4fr_1fr]">
      <div className="space-y-3">
        <label htmlFor="fb-text" className="display block text-2xl">
          Add a piece of feedback
        </label>
        <textarea
          id="fb-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          minLength={8}
          required
          placeholder="Paste what the customer wrote"
          className="w-full rounded-xl border border-ink/20 bg-white/70 p-4 leading-relaxed placeholder:text-ink-faint focus:border-cobalt focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-ink-soft">Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-full border border-ink/20 bg-white/60 px-3 py-1.5">
              <option value="">Detect it for me</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_SHORT[c]}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" busy={busy} disabled={text.trim().length < 8}>
            Analyze and save
          </Button>
        </div>
        {error && <p role="alert" className="text-sm text-neg">{error}</p>}
      </div>
      <div className="halftone-ink rounded-xl bg-paper-deep/60 p-5" aria-live="polite">
        {result ? (
          <>
            <p className="text-sm text-ink-soft">Saved and read as</p>
            <p className="display mt-2 text-2xl leading-tight">{result.topic_label}</p>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <SentimentTag value={result.sentiment} />
              {result.severity > 0 && <SeverityDots value={result.severity} />}
              <span className="text-sm text-ink-soft">{CATEGORY_SHORT[result.category] ?? result.category}</span>
            </div>
            <p className="mt-4 text-xs text-ink-soft">Analyzed by {result.engine === "llm" ? "Claude" : result.engine === "adaption" ? "Adaption" : "the topic rules"}.</p>
          </>
        ) : (
          <p className="text-sm leading-relaxed text-ink-soft">
            The review is read the moment you save it: sentiment, topic and how much it hurt the customer. It then shows up
            in every chart and in the priority ranking.
          </p>
        )}
      </div>
    </form>
  );
}
