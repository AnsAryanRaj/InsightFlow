"use client";

import Link from "next/link";
import { use } from "react";
import { Printer } from "lucide-react";
import ReportView from "@/components/ReportView";
import { Button, ErrorNote, Skeleton } from "@/components/ui";
import type { ReportPayload } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { longDate } from "@/lib/format";

type Shared = { slug: string; title: string; created_at: string; payload: ReportPayload };

export default function SharedReport({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { data, error } = useApi<Shared>(`/api/reports/${slug}`);

  return (
    <div className="paper-grain min-h-screen pb-20">
      <div className="no-print mx-auto flex max-w-[920px] flex-wrap items-center justify-between gap-4 px-5 py-6">
        <Link href="/" className="display text-2xl">
          insightflow.
        </Link>
        <div className="flex items-center gap-4 text-sm text-ink-soft">
          {data && <span>Read-only snapshot from {longDate(data.created_at)}</span>}
          <Button onClick={() => window.print()} variant="cobalt">
            <Printer className="size-3.5" aria-hidden /> Save as PDF
          </Button>
        </div>
      </div>
      <div className="px-5">
        {error && (
          <div className="mx-auto max-w-[920px]">
            <ErrorNote message={error} />
          </div>
        )}
        {!data && !error && <Skeleton className="mx-auto h-[900px] max-w-[920px]" />}
        {data && (
          <div className="mx-auto max-w-[920px] overflow-hidden rounded-[26px] ring-1 ring-rule print:ring-0">
            <ReportView title={data.title} payload={data.payload} />
          </div>
        )}
      </div>
    </div>
  );
}
