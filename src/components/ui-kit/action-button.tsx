import { ButtonHTMLAttributes, forwardRef, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Slot } from "@radix-ui/react-slot";

type Variant = "primary" | "secondary" | "ghost" | "destructive" | "soft";
type Size = "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconPosition?: "left" | "right";
  asChild?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary: "text-primary-foreground shadow-md hover:opacity-90",
  secondary: "border bg-card text-foreground hover:bg-accent",
  ghost: "text-foreground hover:bg-accent",
  destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
  soft: "bg-primary-soft text-primary hover:bg-primary-soft/70",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  lg: "h-11 px-5 text-sm",
};

export const ActionButton = forwardRef<HTMLButtonElement, Props>(
  (
    { variant = "primary", size = "md", icon, iconPosition = "left", asChild, className, children, style, ...rest },
    ref,
  ) => {
    const Comp: any = asChild ? Slot : "button";
    const mergedStyle =
      variant === "primary" ? { background: "var(--gradient-primary)", ...style } : style;
    return (
      <Comp
        ref={ref}
        style={mergedStyle}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-50",
          VARIANTS[variant],
          SIZES[size],
          className,
        )}
        {...rest}
      >
        {icon && iconPosition === "left" && <span className="shrink-0">{icon}</span>}
        {children}
        {icon && iconPosition === "right" && <span className="shrink-0">{icon}</span>}
      </Comp>
    );
  },
);
ActionButton.displayName = "ActionButton";
