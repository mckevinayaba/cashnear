import { formatClock, remainingFraction } from "@/lib/cash";
import { cn } from "@/lib/utils";

/**
 * A countdown drawn as a closing ring. The remaining time is also written in
 * numerals inside it, so the ring is never the only way to read the time.
 */
export function HoldRing({
  secondsLeft,
  totalSeconds,
  size = 132,
  className,
  label,
}: {
  secondsLeft: number;
  totalSeconds: number;
  size?: number;
  className?: string;
  label: string;
}) {
  const r = 44;
  const circumference = 2 * Math.PI * r;
  const fraction = remainingFraction(secondsLeft, totalSeconds);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 112 112"
      role="img"
      aria-label={`${label}: ${formatClock(secondsLeft)} left`}
      className={cn("shrink-0", className)}
    >
      <circle
        cx="56"
        cy="56"
        r={r}
        fill="none"
        strokeWidth="3"
        stroke="currentColor"
        className="text-border-strong"
      />
      <circle
        cx="56"
        cy="56"
        r={r}
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        stroke="currentColor"
        className="text-gold transition-[stroke-dashoffset] duration-1000 ease-linear"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - fraction)}
        transform="rotate(-90 56 56)"
      />
      <text
        x="56"
        y="63"
        textAnchor="middle"
        className="fill-foreground font-display"
        style={{ fontSize: 24 }}
        suppressHydrationWarning
      >
        {formatClock(secondsLeft)}
      </text>
    </svg>
  );
}
