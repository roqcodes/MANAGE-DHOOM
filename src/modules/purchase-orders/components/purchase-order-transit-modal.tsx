"use client";

import { useEffect, useState } from "react";
import { Landmark, Plane, Ship, Truck, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type PurchaseOrderTransitMode = "by_sea" | "by_air" | "in_customs";

export function PurchaseOrderTransitModal({
  open,
  variant = "pickup",
  initialMode,
  initialDate,
  onClose,
  onSave,
}: {
  open: boolean;
  variant?: "pickup" | "edit";
  initialMode?: PurchaseOrderTransitMode | null;
  initialDate?: string | null;
  onClose: () => void;
  onSave: (mode: PurchaseOrderTransitMode, date: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<PurchaseOrderTransitMode | null>(null);
  const [date, setDate] = useState(
    initialDate || new Date().toISOString().slice(0, 10),
  );

  useEffect(() => {
    if (open) {
      setMode(variant === "edit" && initialMode ? initialMode : null);
      setDate(initialDate || new Date().toISOString().slice(0, 10));
      setErr(null);
    }
  }, [open, initialDate, initialMode, variant]);

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSave() {
    if (!mode) {
      setErr("Please select a transit mode.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await onSave(mode, date);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const modes: {
    id: PurchaseOrderTransitMode;
    label: string;
    icon: LucideIcon;
    desc: string;
    iconWrap: string;
  }[] = [
    {
      id: "by_sea",
      label: "By Sea",
      icon: Ship,
      desc: "Ocean freight",
      iconWrap: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    },
    {
      id: "by_air",
      label: "By Air",
      icon: Plane,
      desc: "Air freight",
      iconWrap: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    },
    {
      id: "in_customs",
      label: "In Customs",
      icon: Landmark,
      desc: "Customs clearance",
      iconWrap: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
    },
  ];

  const isEdit = variant === "edit";

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md" instant>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? null : <Truck className="size-4 shrink-0" aria-hidden />}
            {isEdit ? "Edit delivery" : "Ready For Pickup"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {isEdit
              ? "Update transit mode or expected delivery date while the shipment is in transit."
              : "Select how the shipment is travelling and when it is expected."}
          </p>

          <div className="grid grid-cols-3 gap-2">
            {modes.map((m) => {
              const ModeIcon = m.icon;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 text-center transition-colors",
                    mode === m.id
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:border-border/70 hover:bg-muted/50",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-9 items-center justify-center rounded-md",
                      m.iconWrap,
                      mode === m.id && "ring-2 ring-primary/30",
                    )}
                  >
                    <ModeIcon className="size-4" aria-hidden />
                  </span>
                  <span className="text-xs font-semibold">{m.label}</span>
                  <span className="text-[10px] text-muted-foreground">{m.desc}</span>
                </button>
              );
            })}
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Expected delivery date</span>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="max-w-xs"
            />
          </label>

          {err ? <p className="text-sm text-destructive">{err}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !mode}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}