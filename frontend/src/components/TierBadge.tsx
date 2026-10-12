import { Flag } from "lucide-react";
import type { Priority } from "@/lib/api";

const TIER_STYLE: Record<Priority["tier"], string> = {
  Critical: "bg-neg text-white",
  High: "bg-mix text-ink",
  Medium: "bg-ink/10 text-ink",
  Low: "bg-ink/5 text-ink-soft",
};

export default function TierBadge({ tier }: { tier: Priority["tier"] }) {
  return (
    <span className={`label-caps inline-flex items-center gap-1.5 rounded-full px-3 py-1 ${TIER_STYLE[tier]}`}>
      <Flag className="size-3" aria-hidden /> {tier}
    </span>
  );
}

