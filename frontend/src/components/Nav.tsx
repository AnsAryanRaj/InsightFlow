"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { PillLink } from "./ui";

export const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/feedback", label: "Feedback" },
  { href: "/insights", label: "Insights" },
  { href: "/priorities", label: "Priorities" },
  { href: "/tracker", label: "Tracker" },
];

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={clsx("display text-[1.9rem] leading-none tracking-tight", className)}>
      insightflow.
    </Link>
  );
}

export default function Nav({ tone = "cobalt" }: { tone?: "cobalt" | "transparent" }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <nav
      className={clsx(
        "on-cobalt relative z-30 text-cream",
        tone === "cobalt" && "bg-cobalt-deep halftone",
      )}
    >
      <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-6 px-5 py-4 md:px-8">
        <Logo />
        <ul className="hidden items-center gap-7 lg:flex">
          {NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={pathname.startsWith(item.href) ? "page" : undefined}
                className={clsx(
                  "label-caps border-b pb-0.5 transition-colors",
                  pathname.startsWith(item.href) ? "border-cream" : "border-transparent hover:border-cream/50",
                )}
              >
                {item.label}.
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3">
          <span className="hidden sm:block">
            <PillLink href="/report">Insight report</PillLink>
          </span>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className="grid size-11 place-items-center rounded-full border border-cream/70 lg:hidden"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-cream/20 bg-cobalt-deep px-5 pb-6 lg:hidden">
          <ul className="flex flex-col">
            {[...NAV, { href: "/report", label: "Insight report" }].map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="display block border-b border-cream/15 py-3 text-3xl"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  );
}
