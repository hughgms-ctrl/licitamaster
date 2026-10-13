import * as React from "react";
import { cn } from "@/lib/utils";
import { campoBase } from "./input";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => (
    <textarea className={cn(campoBase, "min-h-[72px] py-2 leading-relaxed", className)} ref={ref} {...props} />
  )
);
Textarea.displayName = "Textarea";

export { Textarea };
