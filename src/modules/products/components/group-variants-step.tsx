"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { currencyLabel } from "@/lib/format-currency";
import { PrimaryBtn } from "@/modules/admin/components/modal";

export type GroupSkuRow = {
  localId: string;
  variantId?: string;
  name: string;
  price: number;
  mrp: number;
  stock: number;
};

export type GroupDraft = {
  localId: string;
  name: string;
  rows: GroupSkuRow[];
};

export type GroupSkuDefaults = {
  price: number;
  mrp: number;
};

function newLocalId(): string {
  return crypto.randomUUID();
}

export function emptyGroupSkuRow(defaults?: GroupSkuDefaults): GroupSkuRow {
  return {
    localId: newLocalId(),
    name: "",
    price: defaults?.price ?? 0,
    mrp: defaults?.mrp ?? 0,
    stock: 0,
  };
}

export function emptyGroupDraft(defaults?: GroupSkuDefaults): GroupDraft {
  return {
    localId: newLocalId(),
    name: "",
    rows: [emptyGroupSkuRow(defaults)],
  };
}


const compactInputCls =
  "h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-[12px] text-slate-900 outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10";

export function isGroupDraftsValid(
  groups: GroupDraft[],
  showMrp = true,
): boolean {
  return (
    groups.length >= 1 &&
    groups.every(
      (g) =>
        g.name.trim().length > 0 &&
        g.rows.length >= 1 &&
        g.rows.every(
          (r) =>
            r.name.trim().length > 0,
        ),
    )
  );
}

export function GroupVariantsStep({
  groups,
  onChange,
  onDirty,
  showMrp = true,
  defaultPrice = 0,
  defaultMrp = 0,
  initialVariantId,
}: {
  groups: GroupDraft[];
  onChange: (next: GroupDraft[]) => void;
  onDirty: () => void;
  showMrp?: boolean;
  defaultPrice?: number;
  defaultMrp?: number;
  initialVariantId?: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(() => groups[0]?.localId ?? null);
  const [focusRowId, setFocusRowId] = useState<string | null>(null);
  const nameRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const initialVariantHandled = useRef(false);

  const skuDefaults: GroupSkuDefaults = { price: defaultPrice, mrp: defaultMrp };

  useEffect(() => {
    if (!initialVariantId || initialVariantHandled.current) return;
    for (const g of groups) {
      const row = g.rows.find(
        (r) => r.variantId === initialVariantId || r.localId === initialVariantId,
      );
      if (row) {
        initialVariantHandled.current = true;
        setSelectedId(g.localId);
        setFocusRowId(row.localId);
        return;
      }
    }
  }, [initialVariantId, groups]);

  useEffect(() => {
    if (selectedId && !groups.some((g) => g.localId === selectedId)) {
      setSelectedId(groups[0]?.localId ?? null);
    }
  }, [groups, selectedId]);

  useEffect(() => {
    if (!focusRowId) return;
    const el = nameRefs.current.get(focusRowId);
    if (el) {
      el.focus();
      setFocusRowId(null);
    }
  }, [groups, focusRowId]);

  const selected = groups.find((g) => g.localId === selectedId);

  function patch(next: GroupDraft[]) {
    onDirty();
    onChange(next);
  }

  function addGroup() {
    const g = emptyGroupDraft(skuDefaults);
    patch([...groups, g]);
    setSelectedId(g.localId);
  }

  function removeGroup(localId: string) {
    if (groups.length <= 1) return;
    const next = groups.filter((g) => g.localId !== localId);
    patch(next);
    if (selectedId === localId) setSelectedId(next[0]?.localId ?? null);
  }

  function updateGroup(localId: string, partial: Partial<GroupDraft>) {
    patch(groups.map((g) => (g.localId === localId ? { ...g, ...partial } : g)));
  }

  function addRow(groupId: string, focusNew = false) {
    const g = groups.find((x) => x.localId === groupId);
    if (!g) return;
    const row = emptyGroupSkuRow(skuDefaults);
    updateGroup(groupId, { rows: [...g.rows, row] });
    if (focusNew) setFocusRowId(row.localId);
  }

  function updateRow(groupId: string, rowId: string, partial: Partial<GroupSkuRow>) {
    const g = groups.find((x) => x.localId === groupId);
    if (!g) return;
    updateGroup(groupId, {
      rows: g.rows.map((r) => (r.localId === rowId ? { ...r, ...partial } : r)),
    });
  }

  function removeRow(groupId: string, rowId: string) {
    const g = groups.find((x) => x.localId === groupId);
    if (!g || g.rows.length <= 1) return;
    updateGroup(groupId, { rows: g.rows.filter((r) => r.localId !== rowId) });
  }

  function handleModelRowKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    groupId: string,
  ) {
    if (!selected || e.nativeEvent.isComposing) return;

    const isTabForward = e.key === "Tab" && !e.shiftKey;
    const isEnter =
      e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey;

    if (!isTabForward && !isEnter) return;

    const isLastRow = rowIndex === selected.rows.length - 1;

    if (isLastRow) {
      e.preventDefault();
      addRow(groupId, true);
      return;
    }

    if (isEnter) {
      e.preventDefault();
      const nextRow = selected.rows[rowIndex + 1];
      nameRefs.current.get(nextRow.localId)?.focus();
    }
  }

  return (
    <div
      className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-2 p-2 sm:gap-3 sm:p-3 min-[1100px]:grid-cols-[minmax(160px,200px)_1fr] min-[1100px]:grid-rows-1 min-[1100px]:gap-4 min-[1100px]:p-4"
    >
      <aside
        className="flex min-h-0 max-h-[min(28vh,160px)] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white min-[1100px]:max-h-none"
      >
        <div className="border-b border-slate-100 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">Groups</p>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain divide-y divide-slate-50">
          {groups.map((g) => (
            <li key={g.localId}>
              <button
                type="button"
                onClick={() => setSelectedId(g.localId)}
                className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold transition ${
                  selectedId === g.localId
                    ? "bg-[#2563EB]/8 text-[#2563EB]"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="truncate">{g.name.trim() || "Unnamed group"}</span>
                <span className="ml-auto text-[10px] text-slate-400">{g.rows.length}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-slate-100 p-2">
          <button
            type="button"
            onClick={addGroup}
            className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-200 py-2 text-[11px] font-bold text-slate-500 transition hover:border-[#2563EB]/40 hover:text-[#2563EB]"
          >
            <Plus className="size-3" />
            Add group
          </button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
        {selected ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2.5 sm:p-3 min-[1100px]:p-4">
            <div className="mb-2 flex flex-wrap items-end gap-2 min-[1100px]:mb-3">
              <label className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                  Group name
                </span>
                <input
                  className={compactInputCls}
                  value={selected.name}
                  onChange={(e) => updateGroup(selected.localId, { name: e.target.value })}
                  placeholder="e.g. Samsung, Vivo"
                />
              </label>
              <button
                type="button"
                onClick={() => removeGroup(selected.localId)}
                disabled={groups.length <= 1}
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-rose-100 bg-rose-50/80 px-2.5 text-[11px] font-bold text-rose-500 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className="size-3" />
                Remove
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-100">
              <table className="w-full text-left text-[12px]">
                <thead className="sticky top-0 bg-slate-50 text-[10px] font-bold uppercase tracking-[0.06em] text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Model</th>
                    <th className="px-3 py-2 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {selected.rows.map((row, rowIndex) => (
                    <tr key={row.localId}>
                      <td className="px-3 py-1.5">
                        <input
                          ref={(el) => {
                            if (el) nameRefs.current.set(row.localId, el);
                            else nameRefs.current.delete(row.localId);
                          }}
                          data-group-model-input
                          className={compactInputCls}
                          value={row.name}
                          onChange={(e) =>
                            updateRow(selected.localId, row.localId, { name: e.target.value })
                          }
                          onKeyDown={(e) =>
                            handleModelRowKeyDown(e, rowIndex, selected.localId)
                          }
                          placeholder="e.g. S24 Ultra"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <button
                          type="button"
                          onClick={() => removeRow(selected.localId, row.localId)}
                          disabled={selected.rows.length <= 1}
                          tabIndex={-1}
                          className="inline-flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 disabled:opacity-30"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-2 flex justify-end min-[1100px]:mt-3">
              <PrimaryBtn onClick={() => addRow(selected.localId, true)}>Add model row</PrimaryBtn>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-400">
            Add a group to start
          </div>
        )}
      </div>
    </div>
  );
}
