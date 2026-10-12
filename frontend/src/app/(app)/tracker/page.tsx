"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { Empty, ErrorNote, PageHeader, PillLink, Skeleton } from "@/components/ui";
import { api, Issue } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { fmt, relative } from "@/lib/format";

const COLUMNS: { key: Issue["status"]; title: string; hint: string }[] = [
  { key: "open", title: "Open", hint: "Tracked, nobody working on it yet" },
  { key: "in_progress", title: "In progress", hint: "Someone owns it and is on it" },
  { key: "resolved", title: "Resolved", hint: "Fixed. Watch the topic to confirm" },
];

export default function TrackerPage() {
  const { data, error, loading, reload, setData } = useApi<Issue[]>("/api/issues");

  async function patch(id: number, body: Partial<Issue>) {
    setData((rows) => rows?.map((r) => (r.id === id ? { ...r, ...body } : r)) ?? null);
    try {
      await api(`/api/issues/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    } catch {
      reload();
    }
  }

  async function remove(id: number) {
    if (!confirm("Stop tracking this issue?")) return;
    setData((rows) => rows?.filter((r) => r.id !== id) ?? null);
    await api(`/api/issues/${id}`, { method: "DELETE" }).catch(reload);
  }

  return (
    <div className="space-y-10">
      <PageHeader title="Tracker" intro="The issues you decided to act on. Move them along as work happens; the report picks up their status.">
        <PillLink href="/priorities" variant="cobalt">
          Add from priorities
        </PillLink>
      </PageHeader>

      {error && <ErrorNote message={error} onRetry={reload} />}
      {loading && !data && <Skeleton className="h-96" />}
      {data && !data.length && (
        <Empty title="Nothing tracked yet">
          <p>
            Open <a href="/priorities" className="underline">Priorities</a> and choose &ldquo;Track this issue&rdquo; on the problems you plan to fix.
          </p>
        </Empty>
      )}

      {data && data.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-3">
          {COLUMNS.map((col, ci) => {
            const items = data.filter((i) => i.status === col.key);
            return (
              <section key={col.key} aria-labelledby={`col-${col.key}`} className="min-w-0 rounded-[22px] bg-paper-deep/50 p-4">
                <div className="flex items-baseline justify-between px-2 pb-3">
                  <h2 id={`col-${col.key}`} className="display text-2xl">
                    {col.title}
                  </h2>
                  <span className="num text-sm text-ink-soft">{items.length}</span>
                </div>
                <p className="px-2 pb-4 text-sm text-ink-soft">{col.hint}</p>
                <ul className="space-y-4">
                  {items.map((issue) => (
                    <IssueCard
                      key={issue.id}
                      issue={issue}
                      canLeft={ci > 0}
                      canRight={ci < COLUMNS.length - 1}
                      onMove={(dir) => patch(issue.id, { status: COLUMNS[ci + dir].key })}
                      onPatch={(b) => patch(issue.id, b)}
                      onRemove={() => remove(issue.id)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function IssueCard({
  issue,
  canLeft,
  canRight,
  onMove,
  onPatch,
  onRemove,
}: {
  issue: Issue;
  canLeft: boolean;
  canRight: boolean;
  onMove: (dir: -1 | 1) => void;
  onPatch: (b: Partial<Issue>) => void;
  onRemove: () => void;
}) {
  const [notes, setNotes] = useState(issue.notes);
  const [owner, setOwner] = useState(issue.owner);

  return (
    <li className="rounded-2xl bg-paper p-5 ring-1 ring-rule">
      <div className="flex items-start justify-between gap-3">
        <h3 className="display text-xl leading-tight">{issue.title}</h3>
        <span className="num shrink-0 rounded-full bg-cobalt px-2.5 py-0.5 text-sm text-cream" title="Priority score when tracked">
          {issue.priority_score}
        </span>
      </div>
      <p className="mt-2 text-sm text-ink-soft">
        {issue.evidence.count ? `${fmt.format(issue.evidence.count)} reports` : ""}
        {issue.evidence.tier ? `, ${issue.evidence.tier.toLowerCase()} priority` : ""}. Updated {relative(issue.updated_at)}.
      </p>
      {issue.evidence.actions?.[0] && (
        <p className="mt-3 text-sm">
          <span className="font-semibold">Next step:</span> {issue.evidence.actions[0]}
        </p>
      )}
      <label className="mt-4 block text-sm">
        <span className="text-ink-soft">Owner</span>
        <input
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          onBlur={() => owner !== issue.owner && onPatch({ owner })}
          className="mt-1 w-full rounded-lg border border-ink/15 bg-white/60 px-3 py-2 focus:border-cobalt focus:outline-none"
        />
      </label>
      <label className="mt-3 block text-sm">
        <span className="text-ink-soft">Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== issue.notes && onPatch({ notes })}
          rows={2}
          placeholder="What is being done, links, dates"
          className="mt-1 w-full rounded-lg border border-ink/15 bg-white/60 px-3 py-2 placeholder:text-ink-faint focus:border-cobalt focus:outline-none"
        />
      </label>
      <div className="mt-4 flex items-center justify-between">
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!canLeft}
            onClick={() => onMove(-1)}
            aria-label="Move back"
            className="grid size-9 place-items-center rounded-full border border-ink/20 disabled:opacity-25"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            disabled={!canRight}
            onClick={() => onMove(1)}
            className="label-caps inline-flex items-center gap-1 rounded-full bg-cobalt px-4 text-cream disabled:opacity-25"
          >
            {issue.status === "open" ? "Start" : "Resolve"} <ChevronRight className="size-4" />
          </button>
        </div>
        <button type="button" onClick={onRemove} aria-label="Stop tracking" className="grid size-9 place-items-center rounded-full text-ink-soft hover:bg-neg/10 hover:text-neg">
          <Trash2 className="size-4" />
        </button>
      </div>
    </li>
  );
}
