import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { campoBase } from "./input";

/**
 * Select nativo com a cara do shadcn. Nos formulários com server action o
 * nativo é o mais seguro: `name` e `defaultValue` funcionam sem estado.
 */
const NativeSelect = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(
  ({ className, children, ...props }, ref) => (
    <div className={cn("relative", className)}>
      <select ref={ref} className={cn(campoBase, "h-9 appearance-none truncate pr-8")} {...props}>
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
);
NativeSelect.displayName = "NativeSelect";

export { NativeSelect };
