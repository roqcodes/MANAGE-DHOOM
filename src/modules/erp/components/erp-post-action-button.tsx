import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** Issue / finalize / post — green CTA (avoids brand primary when it reads as red). */
export const ERP_POST_ACTION_BUTTON_CLASS =
  "border-emerald-600 bg-emerald-600 text-white shadow-sm shadow-emerald-600/20 transition-all duration-200 ease-out hover:-translate-y-px hover:bg-emerald-700 hover:text-white hover:shadow-md hover:shadow-emerald-600/25 active:translate-y-0 active:scale-[0.98] motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 dark:border-emerald-500 dark:bg-emerald-600 dark:hover:bg-emerald-500";

export function ErpPostActionButton({
  className,
  ...props
}: ComponentProps<typeof Button>) {
  return <Button className={cn(ERP_POST_ACTION_BUTTON_CLASS, className)} {...props} />;
}
