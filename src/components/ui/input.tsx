import * as React from "react";
import { cn } from "@/lib/utils";

export const campoBase =
  "flex w-full rounded-md border border-input bg-card px-3 text-sm transition-colors placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-background";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      campoBase,
      "h-9 py-1 file:border-0 file:bg-transparent file:text-sm file:font-medium [&::-webkit-search-cancel-button]:hidden",
      className
    )}
    ref={ref}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };
