import {
  AlertCircle,
  AlertTriangle,
  WifiOff,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import type { AppErrorAudience } from "@/modules/feedback/lib/present-app-error";

export const AUDIENCE_CALLOUT: Record<
  AppErrorAudience,
  {
    Icon: LucideIcon;
    border: string;
    bg: string;
    icon: string;
    title: string;
    body: string;
  }
> = {
  user: {
    Icon: AlertCircle,
    border: "border-rose-200/70",
    bg: "bg-rose-50/50",
    icon: "text-rose-600",
    title: "text-rose-950",
    body: "text-rose-800/90",
  },
  developer: {
    Icon: Wrench,
    border: "border-amber-200/80",
    bg: "bg-amber-50/60",
    icon: "text-amber-700",
    title: "text-amber-950",
    body: "text-amber-900/90",
  },
  network: {
    Icon: WifiOff,
    border: "border-sky-200/80",
    bg: "bg-sky-50/50",
    icon: "text-sky-700",
    title: "text-sky-950",
    body: "text-sky-900/90",
  },
  auth: {
    Icon: AlertTriangle,
    border: "border-orange-200/80",
    bg: "bg-orange-50/50",
    icon: "text-orange-700",
    title: "text-orange-950",
    body: "text-orange-900/90",
  },
};
