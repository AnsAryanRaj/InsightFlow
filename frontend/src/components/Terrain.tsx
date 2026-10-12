"use client";

import { useMemo } from "react";
import type { TopicRow } from "@/lib/api";
import { fmt } from "@/lib/format";

/**
 * The hero landscape is drawn from the data:
 * every mountain peak is a complaint topic, its height is the number of reports,
 * and the green hills in front are the praise. Mixed reviews are the yellow flowers.
 */

const W = 1440;
const H = 470;
const BASE = 350; // where the range meets the meadow

const rand = (i: number) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

type Peak = { x: number; h: number; w: number; topic: TopicRow };

function layoutPeaks(complaints: TopicRow[]): Peak[] {
  const sorted = [...complaints].sort((a, b) => b.count - a.count).slice(0, 9);
  if (!sorted.length) return [];
  const max = sorted[0].count;
  // Biggest peak in the middle, the rest alternate outwards, as in a real range
  const slots: number[] = [];
  sorted.forEach((_, i) => slots.push(i === 0 ? 0 : (i % 2 ? -1 : 1) * Math.ceil(i / 2)));
  const step = W / (sorted.length + 1.6);
  return sorted.map((topic, i) => {
    const ratio = topic.count / max;
    return {
      topic,
      x: W / 2 + slots[i] * step + (rand(i) - 0.5) * step * 0.35,
      h: 50 + Math.pow(ratio, 1.6) * 200,
      w: 115 + ratio * 150,
    };
  });
}

function ridge(peaks: Peak[], jag: number, seed: number) {
  const pts: [number, number][] = [];
  for (let x = -20; x <= W + 20; x += 6) {
    let lift = 22 + Math.sin(x / 140 + seed) * 10 + Math.sin(x / 53 + seed * 2) * 5;
    for (const p of peaks) {
      const t = Math.abs(x - p.x) / p.w;
      if (t < 1) lift = Math.max(lift, p.h * Math.pow(1 - t, 1.12) + Math.sin(x / 23 + p.x) * 4 * (1 - t));
    }
    const noise = (rand(Math.round(x / 18) + seed) - 0.5) * jag * (0.5 + lift / 260);
    pts.push([x, BASE - lift + noise]);
  }
  return pts;
}

const toPath = (pts: [number, number][], bottom: number) =>
  `M${pts[0][0]},${bottom} ` + pts.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(" ") + ` L${pts[pts.length - 1][0]},${bottom} Z`;

export default function Terrain({ topics, label = true }: { topics: TopicRow[]; label?: boolean }) {
  const shapes = useMemo(() => {
    const complaints = topics.filter((t) => t.polarity === "complaint");
    const praise = topics.filter((t) => t.polarity === "praise").reduce((s, t) => s + t.count, 0);
    const mixed = topics.reduce((s, t) => s + t.mixed, 0);
    const total = topics.reduce((s, t) => s + t.count, 0) || 1;
    const peaks = layoutPeaks(complaints);
    const main = ridge(peaks, 10, 1);
    const far = ridge(
      peaks.map((p, i) => ({ ...p, x: p.x + (i % 2 ? 90 : -110), h: p.h * 0.62 + 40, w: p.w * 1.2 })),
      8,
      7,
    );
    const maxH = peaks[0]?.h ?? 200;
    const snowLine = (x: number) => BASE - maxH * 0.74 + Math.sin(x / 31) * 7 + (rand(Math.round(x / 14)) - 0.5) * 10;
    const snow: [number, number][] = [];
    for (let x = -20; x <= W + 20; x += 14) snow.push([x, snowLine(x)]);
    const shadows = peaks.map((p) => {
      const apexY = BASE - p.h;
      return `M${p.x},${apexY} L${p.x + p.w * 0.9},${BASE + 4} L${p.x + p.w * 0.18},${BASE + 4} Q${p.x + 18},${apexY + p.h * 0.45} ${p.x},${apexY} Z`;
    });
    const praiseShare = praise / total;
    const flowers = Array.from({ length: Math.min(90, Math.round(mixed / 3) + 30) }, (_, i) => ({
      x: rand(i * 3.1) * W,
      y: BASE + 55 + rand(i * 7.7) * 60,
      r: 2 + rand(i * 1.9) * 3.2,
    }));
    return { peaks, main, far, snow, shadows, praiseShare, praise, flowers };
  }, [topics]);

  const hill = 40 + shapes.praiseShare * 120; // praise lifts the meadow
  const labelled = shapes.peaks.slice(0, 3);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMax slice"
      className="h-full w-full"
      role="img"
      aria-label={`Feedback terrain: ${labelled.map((p) => `${p.topic.label}, ${p.topic.count} reports`).join("; ")}. Green hills show ${shapes.praise} positive reviews.`}
    >
      <defs>
        <pattern id="dots" width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="1.1" fill="#fff" fillOpacity="0.28" />
        </pattern>
        <pattern id="dots-dark" width="5" height="5" patternUnits="userSpaceOnUse">
          <circle cx="1.3" cy="1.3" r="1" fill="#0d1360" fillOpacity="0.22" />
        </pattern>
        <linearGradient id="rock" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2845a" />
          <stop offset="0.55" stopColor="#d9482b" />
          <stop offset="1" stopColor="#7a2a3a" />
        </linearGradient>
        <linearGradient id="meadow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5fae5a" />
          <stop offset="1" stopColor="#1f6e4f" />
        </linearGradient>
        <clipPath id="range-clip">
          <path d={toPath(shapes.main, H)} />
        </clipPath>
      </defs>

      {/* sunset clouds */}
      <g opacity="0.95">
        {[
          [110, 200, 0.9],
          [1310, 215, 1.0],
        ].map(([cx, cy, s], i) => (
          <g key={i} transform={`translate(${cx} ${cy}) scale(${s})`}>
            {[[-90, 10, 60], [-30, -14, 74], [40, 0, 64], [100, 16, 46], [-140, 24, 38]].map(([dx, dy, r], j) => (
              <circle key={j} cx={dx} cy={dy} r={r} fill={j % 2 ? "#f6b48d" : "#f7ebd3"} />
            ))}
            {[[-90, 10, 60], [-30, -14, 74], [40, 0, 64], [100, 16, 46]].map(([dx, dy, r], j) => (
              <circle key={`d${j}`} cx={dx} cy={dy} r={r} fill="url(#dots-dark)" />
            ))}
          </g>
        ))}
      </g>

      {/* far range */}
      <path d={toPath(shapes.far, H)} fill="#5b6be0" opacity="0.55" className="ridge" style={{ animationDelay: "0.05s" }} />

      {/* main range: one peak per complaint topic */}
      <g className="ridge" style={{ animationDelay: "0.2s" }}>
        <path d={toPath(shapes.main, H)} fill="url(#rock)" />
        <g clipPath="url(#range-clip)">
          {shapes.shadows.map((d, i) => (
            <path key={i} d={d} fill="#5a1f3b" opacity="0.32" />
          ))}
          <path
            d={`M-20,-10 ` + shapes.snow.map(([x, y]) => `L${x},${y}`).join(" ") + ` L${W + 20},-10 Z`}
            fill="#f7ebd3"
          />
          <rect width={W} height={H} fill="url(#dots)" />
        </g>
      </g>

      {/* lake */}
      <path d={`M${W * 0.52},${BASE + 26} Q${W * 0.8},${BASE - 6} ${W + 20},${BASE + 8} L${W + 20},${BASE + 70} L${W * 0.55},${BASE + 70} Z`} fill="#3f57e8" />
      <path d={`M${W * 0.52},${BASE + 26} Q${W * 0.8},${BASE - 6} ${W + 20},${BASE + 8} L${W + 20},${BASE + 70} L${W * 0.55},${BASE + 70} Z`} fill="url(#dots)" />

      {/* meadow: praise */}
      <g className="ridge" style={{ animationDelay: "0.4s" }}>
        <path
          d={`M-20,${H} L-20,${BASE + 40 - hill * 0.4} C${W * 0.12},${BASE - hill} ${W * 0.3},${BASE - hill * 0.2} ${W * 0.48},${BASE + 60} C${W * 0.62},${BASE + 110} ${W * 0.8},${BASE + 70} ${W + 20},${BASE + 120} L${W + 20},${H} Z`}
          fill="url(#meadow)"
        />
        <path
          d={`M-20,${H} L-20,${BASE + 40 - hill * 0.4} C${W * 0.12},${BASE - hill} ${W * 0.3},${BASE - hill * 0.2} ${W * 0.48},${BASE + 60} C${W * 0.62},${BASE + 110} ${W * 0.8},${BASE + 70} ${W + 20},${BASE + 120} L${W + 20},${H} Z`}
          fill="url(#dots)"
        />
        {shapes.flowers.map((f, i) => (
          <circle key={i} cx={f.x} cy={f.y} r={f.r} fill={i % 4 ? "#e8a317" : "#f7ebd3"} opacity="0.9" />
        ))}
      </g>

      {label &&
        labelled.map((p, i) => {
          const apexY = BASE - p.h;
          const side = i === 0 ? 1 : p.x < W / 2 ? -1 : 1;
          const lx = p.x + side * (i === 0 ? 150 : 130);
          const ly = apexY + (i === 0 ? 18 : i === 2 ? 46 : 10);
          return (
            <g key={p.topic.topic} className="ridge terrain-label" style={{ animationDelay: "0.9s" }}>
              <path d={`M${p.x},${apexY} L${p.x + side * 26},${ly} L${lx},${ly}`} stroke="#f7ebd3" strokeWidth="1.3" fill="none" />
              <circle cx={p.x} cy={apexY} r="3.5" fill="#f7ebd3" />
              <text
                x={lx + side * 8}
                y={ly - 4}
                textAnchor={side > 0 ? "start" : "end"}
                fill="#f7ebd3"
                style={{ font: "600 15px var(--font-sans)" }}
              >
                {p.topic.label}
              </text>
              <text
                x={lx + side * 8}
                y={ly + 16}
                textAnchor={side > 0 ? "start" : "end"}
                fill="#f7ebd3"
                fillOpacity="0.8"
                style={{ font: "400 14px var(--font-sans)" }}
              >
                {fmt.format(p.topic.count)} reports
              </text>
            </g>
          );
        })}
    </svg>
  );
}
