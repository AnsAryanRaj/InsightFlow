"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Overview, Sentiment, TrendPoint } from "@/lib/api";
import { CATEGORY_SHORT, fmt, pct, SENTIMENT_COLOR, SENTIMENT_LABEL, shortDate } from "@/lib/format";

const ORDER: Sentiment[] = ["positive", "mixed", "negative"];

export function Legend({ items = ORDER }: { items?: Sentiment[] }) {
  return (
    <ul className="flex flex-wrap gap-4 text-sm text-ink-soft">
      {items.map((s) => (
        <li key={s} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className={`inline-block size-2.5 ${s === "mixed" ? "rotate-45" : "rounded-full"}`}
            style={{ background: SENTIMENT_COLOR[s] }}
          />
          {SENTIMENT_LABEL[s]}
        </li>
      ))}
    </ul>
  );
}

/** One 100% bar: how the feedback splits by sentiment. Direct labels on each part. */
export function SentimentSplit({ counts }: { counts: Record<Sentiment, number> }) {
  const total = ORDER.reduce((s, k) => s + counts[k], 0) || 1;
  return (
    <div>
      <div className="flex h-11 w-full gap-[2px] overflow-hidden rounded-md" role="img" aria-label={ORDER.map((s) => `${SENTIMENT_LABEL[s]} ${pct(counts[s] / total)}`).join(", ")}>
        {ORDER.map((s) =>
          counts[s] ? (
            <div
              key={s}
              title={`${SENTIMENT_LABEL[s]}: ${fmt.format(counts[s])} (${pct(counts[s] / total, 1)})`}
              style={{ width: `${(counts[s] / total) * 100}%`, background: SENTIMENT_COLOR[s] }}
            />
          ) : null,
        )}
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-4">
        {ORDER.map((s) => (
          <div key={s}>
            <dt className="inline-flex items-center gap-1.5 text-sm text-ink-soft">
              <span aria-hidden className={`size-2.5 ${s === "mixed" ? "rotate-45" : "rounded-full"}`} style={{ background: SENTIMENT_COLOR[s] }} />
              {SENTIMENT_LABEL[s]}
            </dt>
            <dd className="display num mt-1 text-3xl">{pct(counts[s] / total)}</dd>
            <dd className="num text-sm text-ink-soft">{fmt.format(counts[s])} reviews</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function TrendTooltip({ active, payload }: { active?: boolean; payload?: { payload: TrendPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-xl bg-cobalt-deep px-4 py-3 text-sm text-cream shadow-lg">
      <p className="font-semibold">
        Week of {shortDate(p.week)}
        {p.partial && <span className="font-normal text-cream/70"> (partial week)</span>}
      </p>
      <ul className="mt-2 space-y-1">
        {[...ORDER].reverse().map((s) => (
          <li key={s} className="flex items-center justify-between gap-6">
            <span className="inline-flex items-center gap-1.5">
              <span className={`size-2 ${s === "mixed" ? "rotate-45" : "rounded-full"}`} style={{ background: SENTIMENT_COLOR[s] }} />
              {SENTIMENT_LABEL[s]}
            </span>
            <span className="num">{fmt.format(p[s])}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 border-t border-cream/20 pt-2 num">{pct(p.negative_share)} negative</p>
    </div>
  );
}

/** Weekly volume stacked by sentiment. Partial weeks at either end are drawn lighter. */
export function TrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="#17208c" strokeOpacity={0.08} />
          <XAxis
            dataKey="week"
            tickFormatter={shortDate}
            tick={{ fill: "#4a5199", fontSize: 12 }}
            axisLine={{ stroke: "#17208c", strokeOpacity: 0.25 }}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis tick={{ fill: "#4a5199", fontSize: 12 }} axisLine={false} tickLine={false} width={44} />
          <Tooltip content={<TrendTooltip />} cursor={{ fill: "#17208c", fillOpacity: 0.05 }} />
          {ORDER.map((s, i) => (
            <Bar
              key={s}
              dataKey={s}
              stackId="s"
              fill={SENTIMENT_COLOR[s]}
              stroke="#fbf5ea"
              strokeWidth={1}
              radius={i === ORDER.length - 1 ? [4, 4, 0, 0] : 0}
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell key={d.week} fillOpacity={d.partial ? 0.4 : 1} />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Each category as a stacked bar, scaled to the largest category. */
export function CategoryBars({ rows, onPick }: { rows: Overview["categories"]; onPick?: (c: string) => void }) {
  const max = Math.max(...rows.map((r) => r.total), 1);
  return (
    <ul className="space-y-4">
      {rows.map((r) => (
        <li key={r.category}>
          <button
            type="button"
            onClick={() => onPick?.(r.category)}
            className="group block w-full text-left"
            aria-label={`Filter by ${r.category}`}
          >
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span className="font-semibold group-hover:underline">{CATEGORY_SHORT[r.category] ?? r.category}</span>
              <span className="num text-ink-soft">
                {fmt.format(r.total)} <span className="text-ink-faint">· {pct(r.negative / r.total)} negative</span>
              </span>
            </div>
            <div className="flex h-3.5 gap-[2px]" style={{ width: `${(r.total / max) * 100}%` }}>
              {ORDER.map((s) =>
                r[s] ? (
                  <span
                    key={s}
                    title={`${SENTIMENT_LABEL[s]}: ${fmt.format(r[s])}`}
                    className="first:rounded-l-[4px] last:rounded-r-[4px]"
                    style={{ width: `${(r[s] / r.total) * 100}%`, background: SENTIMENT_COLOR[s] }}
                  />
                ) : null,
              )}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Ranked horizontal bars for one measure. */
export function RankedBars({
  rows,
  onPick,
}: {
  rows: { key: string; label: string; value: number; note?: string }[];
  onPick?: (key: string) => void;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ol className="space-y-3">
      {rows.map((r) => (
        <li key={r.key}>
          <button type="button" onClick={() => onPick?.(r.key)} className="group grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 text-left">
            <span className="truncate text-[0.95rem] group-hover:underline">{r.label}</span>
            <span className="num text-sm text-ink-soft">
              {fmt.format(r.value)}
              {r.note && <span className="text-ink-faint"> · {r.note}</span>}
            </span>
            <span className="col-span-2 h-2 rounded-full bg-ink/[0.07]">
              <span className="block h-2 rounded-full bg-cobalt" style={{ width: `${(r.value / max) * 100}%` }} />
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

export function Sparkline({ values, color = "#2338d4", width = 120, height = 32 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return <span className="text-xs text-ink-faint">Not enough data</span>;
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (width - 4) + 2, height - 3 - ((v - min) / span) * (height - 6)]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="3" fill={color} stroke="#fbf5ea" strokeWidth="1.5" />
    </svg>
  );
}

/** A labelled meter for one part of the priority score. */
export function Meter({ label, value, weight, detail }: { label: string; value: number; weight: number; detail: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold">{label}</span>
        <span className="num text-ink-soft">
          {Math.round(value * 100)} <span className="text-ink-faint">× {Math.round(weight * 100)}%</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-ink/[0.08]">
        <div className="h-2 rounded-full bg-cobalt" style={{ width: `${Math.max(2, value * 100)}%` }} />
      </div>
      <p className="mt-1 text-xs text-ink-soft">{detail}</p>
    </div>
  );
}
