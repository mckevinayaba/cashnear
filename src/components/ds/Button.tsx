import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Button — CashNear design system primitive.
 * `primary`   Ivory on navy — default CTA
 * `gold`      Rich Gold — reserved for the single dominant action per screen
 * `ghost`     Text-only on dark surfaces
 * `secondary` Elevated navy surface
 * `success`   Premium Emerald — confirmations only
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium tracking-tight transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 active:scale-[0.98]",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[var(--shadow-elevated)]",
        gold:
          "bg-gold text-gold-foreground hover:brightness-105 shadow-[var(--shadow-gold)]",
        secondary:
          "bg-surface-elevated text-foreground border border-border-strong hover:bg-surface-elevated/80",
        ghost:
          "bg-transparent text-foreground hover:bg-surface-elevated",
        success:
          "bg-success text-success-foreground hover:brightness-105",
        outline:
          "bg-transparent border border-border-strong text-foreground hover:bg-surface-elevated",
      },
      size: {
        sm: "h-10 px-4 text-sm",
        md: "h-12 px-6 text-[15px]",
        lg: "h-14 px-8 text-base",
        icon: "h-11 w-11",
      },
      fullWidth: {
        true: "w-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
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
