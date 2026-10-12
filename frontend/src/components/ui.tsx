"use client";

import clsx from "clsx";
import Link from "next/link";
import { ArrowUpRight, LoaderCircle } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { SENTIMENT_COLOR, SENTIMENT_LABEL } from "@/lib/format";
import type { Sentiment } from "@/lib/api";

type Variant = "cream" | "cobalt" | "ghost" | "line";

const variantClass: Record<Variant, string> = {
  cream: "bg-cream text-ink hover:bg-white",
  cobalt: "bg-cobalt text-cream hover:bg-cobalt-deep",
  ghost: "text-ink hover:bg-ink/5",
  line: "border border-ink/25 text-ink hover:border-ink hover:bg-ink/[0.03]",
};

export function Button({
  variant = "cobalt",
  className,
  busy,
  arrow,
  children,
  ...rest
}: ComponentProps<"button"> & { variant?: Variant; busy?: boolean; arrow?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={clsx(
        "label-caps inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variantClass[variant],
        className,
      )}
    >
      {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
      {arrow && <ArrowUpRight className="size-3.5" aria-hidden />}
    </button>
  );
}

export function PillLink({
  href,
  variant = "cream",
  className,
  children,
  arrow = true,
}: {
  href: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
  arrow?: boolean;
}) {
  return (
    <Link
      href={href}
      className={clsx(
        "label-caps inline-flex items-center gap-2 rounded-full px-5 py-3 transition-colors",
        variantClass[variant],
        className,
      )}
    >
      {children}
      {arrow && <ArrowUpRight className="size-3.5" aria-hidden />}
    </Link>
  );
}

export function SentimentTag({ value, compact }: { value: Sentiment; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-ink">
      <span
        aria-hidden
        className={clsx("inline-block size-2.5", value === "mixed" ? "rotate-45" : "rounded-full")}
        style={{ background: SENTIMENT_COLOR[value] }}
      />
      {!compact && SENTIMENT_LABEL[value]}
    </span>
  );
}

export function SeverityDots({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Severity ${value} of 5`} title={`Severity ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={clsx("inline-block h-2.5 w-1.5 rounded-[1px]", i <= value ? "bg-neg" : "bg-ink/12")}
        />
      ))}
    </span>
  );
}

export function PageHeader({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-6 border-b border-rule pb-8 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        <h1 className="display text-5xl md:text-6xl">{title}</h1>
        {intro && <p className="mt-4 max-w-xl text-[1.05rem] leading-relaxed text-ink-soft">{intro}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
    </header>
  );
}

export function Section({
  title,
  note,
  action,
  children,
  className,
}: {
  title: string;
  note?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("min-w-0", className)}>
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <div>
          <h2 className="display text-2xl md:text-[1.7rem]">{title}</h2>
          {note && <p className="mt-1 text-sm text-ink-soft">{note}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="halftone-ink rounded-2xl border border-dashed border-ink/25 px-6 py-12 text-center">
      <p className="display text-2xl">{title}</p>
      {children && <div className="mx-auto mt-3 max-w-md text-ink-soft">{children}</div>}
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-neg/40 bg-neg/[0.06] px-5 py-4 text-sm">
      <p className="font-semibold text-ink">Could not load this view.</p>
      <p className="mt-1 text-ink-soft">
        {message}. Check that the API is running at the address in <code>NEXT_PUBLIC_API_URL</code>.
      </p>
      {onRetry && (
        <button onClick={onRetry} className="label-caps mt-3 underline underline-offset-4">
          Try again
        </button>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-xl bg-ink/[0.06]", className)} />;
}

export function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
        active ? "border-cobalt bg-cobalt text-cream" : "border-ink/20 text-ink hover:border-ink/50",
      )}
    >
      {children}
    </button>
  );
}
