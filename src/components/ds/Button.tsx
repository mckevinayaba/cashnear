import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Button — quiet, confident, premium.
 * primary — ivory on navy (default CTA)
 * gold — muted gold, reserved for the single dominant action per flow
 * ghost — text only
 * outline — thin border on dark surface
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium tracking-[-0.01em] transition-[background,color,transform,border-color] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-40 active:scale-[0.985]",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground hover:bg-primary/95",
        gold:
          "bg-gold text-gold-foreground hover:bg-gold/95",
        secondary:
          "bg-surface-2 text-foreground hover:bg-surface-2/80 border border-border-strong",
        ghost:
          "bg-transparent text-foreground hover:bg-surface-2/60",
        outline:
          "bg-transparent border border-border-strong text-foreground hover:border-foreground/30",
        success:
          "bg-success text-success-foreground hover:brightness-105",
      },
      size: {
        sm: "h-9 px-4 text-[13px]",
        md: "h-11 px-5 text-[14px]",
        lg: "h-12 px-6 text-[15px]",
        icon: "h-10 w-10",
      },
      fullWidth: { true: "w-full" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, fullWidth, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, fullWidth }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { buttonVariants };
