"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Bot,
  Bug,
  CloudUpload,
  Headphones,
  Keyboard,
  LogOut,
  Settings,
  Sparkles,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { useAiAssistantPreference } from "@/modules/ai-assistant";
import { useAdminLoadDebugPreference } from "@/modules/navigation/context/AdminLoadDebugPreferenceContext";
import { useOutboxActivityPreference } from "@/modules/pwa/context/OutboxActivityPreferenceContext";
import { cn } from "@/lib/utils";
import { useAdminSession } from "@/modules/admin/providers/admin-session-provider";
import { signOutAction } from "@/modules/auth/actions/auth.actions";
import { useIsMdUp } from "@/modules/admin/hooks/use-is-md-up";

const CLOSE_DELAY_MS = 180;

type MenuItem =
  | {
      type: "link";
      label: string;
      icon: LucideIcon;
      href: string;
    }
  | {
      type: "action";
      label: string;
      icon: LucideIcon;
    }
  | {
      type: "sign-out";
      label: string;
      icon: LucideIcon;
    };

const MENU_ITEMS: MenuItem[] = [
  { type: "action", label: "Help & guides", icon: BookOpen },
  { type: "action", label: "Contact support", icon: Headphones },
  { type: "action", label: "What's new", icon: Sparkles },
  { type: "action", label: "Keyboard shortcuts", icon: Keyboard },
  { type: "link", label: "Account settings", icon: Settings, href: "/admin/config" },
  { type: "sign-out", label: "Sign out", icon: LogOut },
];

function ProfileAvatar({
  name,
  avatarUrl,
  size = "md",
  className,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const initial = name[0]?.toUpperCase() ?? "A";
  const sizeClass =
    size === "lg" ? "size-14 text-lg" : size === "sm" ? "size-9 text-xs" : "size-10 text-sm";

  return (
    <Avatar
      className={cn(
        "rounded-xl after:rounded-xl",
        sizeClass,
        !avatarUrl && "bg-slate-100",
        className,
      )}
      size={size === "lg" ? "lg" : size === "sm" ? "sm" : "default"}
    >
      {avatarUrl ? (
        <AvatarImage src={avatarUrl} alt={name} className="rounded-xl object-cover" />
      ) : null}
      <AvatarFallback
        className={cn(
          "rounded-xl bg-gradient-to-br from-slate-100 to-slate-200/90 font-bold text-slate-600",
          size === "lg" && "text-lg",
        )}
      >
        {initial}
      </AvatarFallback>
    </Avatar>
  );
}

function ProfileMenuButton({
  item,
  onNavigate,
}: {
  item: MenuItem;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const isDestructive = item.type === "sign-out";

  const className = cn(
    "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-all duration-150",
    "hover:bg-slate-100/90 hover:translate-x-0.5 active:scale-[0.98] active:bg-slate-200/70",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25",
    isDestructive
      ? "text-rose-600 hover:bg-rose-50 hover:text-rose-700"
      : "text-slate-700 hover:text-slate-900",
  );

  const iconWrap = (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-150",
        isDestructive
          ? "bg-rose-50 text-rose-600 group-hover:bg-rose-100"
          : "bg-slate-100 text-slate-500 group-hover:bg-white group-hover:text-slate-700 group-hover:shadow-sm",
      )}
    >
      <Icon className="size-4" aria-hidden />
    </span>
  );

  if (item.type === "sign-out") {
    return (
      <form action={signOutAction}>
        <button type="submit" className={className} onClick={onNavigate}>
          {iconWrap}
          <span>{item.label}</span>
        </button>
      </form>
    );
  }

  if (item.type === "link") {
    return (
      <Link href={item.href} className={className} onClick={onNavigate}>
        {iconWrap}
        <span>{item.label}</span>
      </Link>
    );
  }

  return (
    <button type="button" className={className} onClick={(e) => e.preventDefault()}>
      {iconWrap}
      <span>{item.label}</span>
    </button>
  );
}

export function AdminProfileMenu() {
  const profile = useAdminSession();
  const { enabled: aiAssistantEnabled, setEnabled: setAiAssistantEnabled } =
    useAiAssistantPreference();
  const { enabled: outboxActivityEnabled, setEnabled: setOutboxActivityEnabled } =
    useOutboxActivityPreference();
  const { enabled: loadDebugEnabled, setEnabled: setLoadDebugEnabled } =
    useAdminLoadDebugPreference();
  const isMd = useIsMdUp();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, [cancelClose]);

  const handleOpen = useCallback(() => {
    cancelClose();
    setOpen(true);
  }, [cancelClose]);

  const handleToggle = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  const closeMenu = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open || isMd) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, isMd]);

  if (!profile) return null;

  const displayName = profile.name ?? "Admin";

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={isMd ? handleOpen : undefined}
      onMouseLeave={isMd ? scheduleClose : undefined}
    >
      <button
        type="button"
        onClick={isMd ? undefined : handleToggle}
        className={cn(
          "rounded-xl p-0.5 transition-all duration-200",
          "hover:scale-105 active:scale-95",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
          open && "scale-105 ring-2 ring-slate-200/80",
        )}
        aria-label="Account menu"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <ProfileAvatar
          name={displayName}
          avatarUrl={profile.avatar_url}
          size="sm"
          className="shadow-sm ring-1 ring-slate-200/80"
        />
      </button>

      <div
        className={cn(
          "absolute right-0 top-full z-50 origin-top-right pt-2.5",
          "transition-all duration-200 ease-out",
          open
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none -translate-y-1 scale-[0.97] opacity-0",
        )}
        role="menu"
        aria-label="Account"
        onMouseEnter={isMd ? handleOpen : undefined}
        onMouseLeave={isMd ? scheduleClose : undefined}
      >
        <div className="w-[min(18.5rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl shadow-slate-900/10">
          <div className="border-b border-slate-100 bg-gradient-to-br from-slate-50 via-white to-slate-50/80 px-4 py-4">
            <div className="flex items-center gap-3">
              <ProfileAvatar
                name={displayName}
                avatarUrl={profile.avatar_url}
                size="lg"
                className="shadow-md ring-2 ring-white"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-900">{displayName}</p>
                <p className="truncate text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {profile.role ?? "System"}
                </p>
                {profile.email ? (
                  <p className="mt-1 truncate text-xs text-slate-500">{profile.email}</p>
                ) : null}
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <div
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-white/90 px-3 py-2.5 shadow-sm"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                    aria-hidden
                  >
                    <Bot className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900">AI Assistant</p>
                    <p className="text-[10px] leading-snug text-slate-500">
                      Orb, chat & on-screen guide
                    </p>
                  </div>
                </div>
                <Switch
                  size="sm"
                  checked={aiAssistantEnabled}
                  onCheckedChange={setAiAssistantEnabled}
                  aria-label="Enable AI Assistant"
                />
              </div>

              <div
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-white/90 px-3 py-2.5 shadow-sm"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600"
                    aria-hidden
                  >
                    <CloudUpload className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900">Sync activity bar</p>
                    <p className="text-[10px] leading-snug text-slate-500">
                      Live queued DB operations
                    </p>
                  </div>
                </div>
                <Switch
                  size="sm"
                  checked={outboxActivityEnabled}
                  onCheckedChange={setOutboxActivityEnabled}
                  aria-label="Enable sync activity bar"
                />
              </div>

              <div
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-white/90 px-3 py-2.5 shadow-sm"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-700"
                    aria-hidden
                  >
                    <Bug className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900">Load debug</p>
                    <p className="text-[10px] leading-snug text-slate-500">
                      Header refresh timings & JSON export
                    </p>
                  </div>
                </div>
                <Switch
                  size="sm"
                  checked={loadDebugEnabled}
                  onCheckedChange={setLoadDebugEnabled}
                  aria-label="Enable load debug trace"
                />
              </div>
            </div>
          </div>

          <div className="space-y-0.5 p-2">
            {MENU_ITEMS.map((item) => (
              <ProfileMenuButton key={item.label} item={item} onNavigate={closeMenu} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
