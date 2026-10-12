"use client";

import Link from "next/link";
import { ArrowDown, ArrowUpRight, Database } from "lucide-react";
import Nav from "@/components/Nav";
import Terrain from "@/components/Terrain";
import { PillLink, Skeleton } from "@/components/ui";
import type { Overview, Priority, TopicRow } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { fmt, pct } from "@/lib/format";

const STEPS = [
  {
    title: "Bring in feedback",
    body: "Import a CSV, type in a single review, or load the Build Battle sample. Repeats are detected and counted, not analyzed again.",
  },
  {
    title: "Adaption enriches it",
    body: "Each unique review goes through Adaption, which writes a structured read of it and grades the data quality before and after.",
  },
  {
    title: "Patterns surface",
    body: "Sentiment, recurring topics and trends over time, filterable by category, sentiment and date.",
  },
  {
    title: "Decide what to fix",
    body: "Issues are ranked by volume, negativity, severity and growth, each with the reasons and the next steps spelled out.",
  },
];

export default function Home() {
  const topics = useApi<TopicRow[]>("/api/topics");
  const overview = useApi<Overview>("/api/overview");
  const priorities = useApi<Priority[]>("/api/priorities");
  const ov = overview.data;

  return (
    <main>
      <section className="halftone relative flex min-h-[100svh] flex-col overflow-hidden bg-cobalt text-cream">
        <Nav tone="transparent" />

        <div className="relative z-20 mx-auto mt-[3vh] flex max-w-5xl flex-col items-center px-5 text-center">
          <p className="label-caps text-cream/85">Customer feedback, made clear</p>
          <h1 className="display mt-5 text-[clamp(3.2rem,8vw,6.6rem)]">
            Hear it all.
            <br />
            Fix what matters.
          </h1>
          <p className="mt-6 max-w-md text-[1.02rem] leading-relaxed text-cream/90">
            InsightFlow reads every review, finds the problems that keep coming back, and tells you which one to fix
            first, and why.
          </p>
          <div className="on-cobalt mt-8 flex flex-wrap items-center justify-center gap-6">
            <PillLink href="/dashboard">Open the dashboard</PillLink>
            <Link href="/priorities" className="label-caps inline-flex items-center gap-1.5 border-b border-cream/70 pb-1">
              See what to fix first <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        </div>

        <div className="relative -mt-8 min-h-[360px] flex-1 md:-mt-12">
          <div className="absolute inset-0">{topics.data ? <Terrain topics={topics.data} /> : null}</div>

        <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-cobalt-night/70 to-transparent">
          <div className="mx-auto flex max-w-[1360px] flex-wrap items-end justify-between gap-4 px-5 pb-5 pt-14 text-[0.72rem] uppercase tracking-[0.14em] md:px-8">
            <div className="flex items-center gap-5">
              <div className="flex items-start gap-2.5">
                <Database className="mt-0.5 size-4" aria-hidden />
                <div>
                  <p className="font-semibold">Build Battle dataset</p>
                  <p className="num text-cream/80">{ov ? `${fmt.format(ov.total)} reviews` : "Loading"}</p>
                </div>
              </div>
              <span className="h-8 w-px bg-cream/40" aria-hidden />
              <div>
                <p className="font-semibold">Only {ov ? fmt.format(ov.unique_texts) : "..."} unique</p>
                <p className="text-cream/80">{ov ? `${pct(ov.duplicate_share)} are repeats` : ""}</p>
              </div>
            </div>
            <a href="#how" className="hidden flex-col items-center font-semibold md:flex">
              <span className="text-[0.8rem] normal-case tracking-normal text-cream/85">Each peak is a complaint topic, sized by reports</span>
              <span className="mt-1 inline-flex items-center gap-1.5">
                Scroll to explore <ArrowDown className="size-3.5" aria-hidden />
              </span>
            </a>
            <div className="hidden text-right sm:block">
              <p className="num font-semibold">{ov ? `${pct(ov.negative_share)} negative` : ""}</p>
              <p className="num text-cream/80">{ov ? `${fmt.format(ov.complaints)} complaints` : ""}</p>
            </div>
          </div>
        </div>
        </div>
      </section>

      <section id="how" className="paper-grain">
        <div className="mx-auto max-w-[1360px] px-5 py-20 md:px-8 md:py-28">
          <h2 className="display max-w-2xl text-4xl md:text-5xl">From a pile of reviews to a decision, in four steps.</h2>
          <ol className="mt-12 grid gap-10 md:grid-cols-4 md:gap-8">
            {STEPS.map((s, i) => (
              <li key={s.title} className="border-t-2 border-ink pt-5">
                <span className="display num text-5xl text-cobalt">{i + 1}</span>
                <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 leading-relaxed text-ink-soft">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-paper-deep">
        <div className="mx-auto max-w-[1360px] px-5 py-20 md:px-8 md:py-24">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h2 className="display max-w-xl text-4xl md:text-5xl">Fix these three first.</h2>
            <PillLink href="/priorities" variant="cobalt">
              All priorities
            </PillLink>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {priorities.data
              ? priorities.data.slice(0, 3).map((p) => (
                  <article key={p.topic} className="flex flex-col rounded-[22px] bg-paper p-7 ring-1 ring-rule">
                    <div className="flex items-baseline justify-between">
                      <span className="display num text-6xl text-cobalt">{p.rank}</span>
                      <span className="text-sm text-ink-soft">
                        Score <span className="num font-semibold text-ink">{p.score}</span>
                      </span>
                    </div>
                    <h3 className="display mt-6 text-2xl leading-tight">{p.label}</h3>
                    <p className="mt-3 text-ink-soft">{p.reasons[0]}</p>
                    <p className="mt-auto pt-6 text-sm">
                      <span className="font-semibold">First step:</span> {p.actions[0]}
                    </p>
                  </article>
                ))
              : [0, 1, 2].map((i) => <Skeleton key={i} className="h-72" />)}
          </div>
        </div>
      </section>

      <footer className="bg-cobalt-deep halftone text-cream">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm md:px-8">
          <span className="display text-2xl">insightflow.</span>
          <span className="text-cream/80">Built for Frontend Arena Build Battle 2026. Enrichment by Adaption.</span>
        </div>
      </footer>
    </main>
  );
}
