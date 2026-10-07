import Image from "next/image";

import { cn } from "@/lib/utils";
import { BRAND_ACCENT, BRAND_SHORT_NAME, COMPANY_NAME } from "@/modules/brand/lib/brand";

export const BUYHUB_LOGO_PATH = "/DHOOM-LOGO.png";
export const BUYHUB_ICON_PATH = "/icon.png";
export const BUYHUB_FAVICON_PATH = "/favicon.png";

type BuyHubLogoProps = {
  size?: number;
  showWordmark?: boolean;
  wordmarkSuffix?: string;
  className?: string;
  imageClassName?: string;
  priority?: boolean;
};

export function BuyHubLogo({
  size = 36,
  showWordmark = false,
  wordmarkSuffix,
  className,
  imageClassName,
  priority,
}: BuyHubLogoProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <Image
        src={BUYHUB_LOGO_PATH}
        alt={COMPANY_NAME}
        width={size}
        height={size}
        className={cn("shrink-0 rounded-xl object-contain", imageClassName)}
        priority={priority}
      />
      {showWordmark ? (
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] font-black tracking-tight text-slate-900">
            {BRAND_SHORT_NAME}
            <span style={{ color: BRAND_ACCENT }}> TRADING</span>
          </span>
          {wordmarkSuffix ? (
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
              {wordmarkSuffix}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function BuyHubInvoiceLogo({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={BUYHUB_LOGO_PATH}
      alt={COMPANY_NAME}
      className={cn("h-10 w-auto object-contain print:h-9", className)}
    />
  );
}
