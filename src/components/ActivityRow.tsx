import { describeActivity, formatRand, formatWhen, type CashHistoryItem } from "@/lib/cash";
import { cn } from "@/lib/utils";

/**
 * One past request, readable at a glance: how much and how it ended on the top
 * line, where and when underneath, with room for the whole shop name.
 */
export function ActivityRow({ item }: { item: CashHistoryItem }) {
  const { outcome, tone } = describeActivity(item);
  return (
    <li className="px-5 py-4">
      <div className="flex items-baseline justify-between gap-4">
        <p className="font-display text-[24px] leading-none">{formatRand(item.amount_cents)}</p>
        <p
          className={cn(
            "text-right text-[13px] font-medium",
            tone === "success" && "text-success",
            tone === "warn" && "text-gold",
            tone === "muted" && "text-muted-foreground",
          )}
        >
          {outcome}
        </p>
      </div>
      <p className="mt-2 text-[14px] text-muted-foreground">
        {item.shop_name ?? "A shop"} · {formatWhen(item.created_at)}
      </p>
    </li>
  );
}
