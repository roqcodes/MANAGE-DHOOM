"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState, useTransition } from "react";
import { Pencil, Users, Check, X } from "lucide-react";

import type { DBUser } from "@/common/admin/types";
import { UserRole } from "@/common/auth/types";
import { updateUserRoleAction } from "@/modules/admin/actions/admin-users.actions";
import { TableShell, EmptyState } from "@/modules/admin/components/empty-state";
import { Pagination } from "@/modules/admin/components/pagination";

const ROLE_OPTIONS: readonly string[] = [
  UserRole.Admin,
  UserRole.Vendor,
  UserRole.Delivery,
];

function UserAvatar({ name }: { name: string | null }) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2563EB]/10 text-[15px] font-extrabold text-[#2563EB]">
      {name?.[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

function RoleTag({ role }: { role: string | null }) {
  return (
    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
      {role ?? "—"}
    </span>
  );
}

function RoleModal({
  user,
  onClose,
  onUpdate,
}: {
  user: DBUser;
  onClose: () => void;
  onUpdate: (newRole: string) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-[28px] bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-extrabold text-slate-900">Change Role</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={20} />
          </button>
        </div>
        <div className="mb-5 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <span className="font-bold text-slate-900">{user.name}</span>
          <br />
          Current role:{" "}
          <span className="font-bold uppercase text-slate-900">{user.role}</span>
        </div>
        <div className="flex flex-col gap-2">
          {ROLE_OPTIONS.map((role) => (
            <button
              key={role}
              onClick={() => onUpdate(role)}
              className={[
                "flex items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-bold transition",
                user.role === role
                  ? "bg-[#2563EB]/5 text-[#2563EB]"
                  : "hover:bg-slate-50 text-slate-700",
              ].join(" ")}
            >
              <span className="uppercase">{role}</span>
              {user.role === role && (
                <Check size={16} className="text-[#2563EB]" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PortalStaffPanel({
  users,
  total,
  page,
  segment,
}: {
  users: DBUser[];
  total: number;
  page: number;
  segment: "vendor" | "delivery" | "admin";
}) {
  const queryClient = useQueryClient();
  const [selectedUser, setSelectedUser] = useState<DBUser | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRoleUpdate(newRole: string) {
    if (!selectedUser) return;
    const userId = selectedUser.id;
    setSelectedUser(null);
    startTransition(async () => {
      await updateUserRoleAction(userId, newRole);
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    });
  }

  const subtitle =
    segment === "delivery"
      ? "Verified delivery operators."
      : segment === "vendor"
        ? "Verified vendor portal accounts."
        : "Verified admin accounts.";

  return (
    <>
      {selectedUser && (
        <RoleModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onUpdate={handleRoleUpdate}
        />
      )}

      <p className="mb-4 text-sm text-slate-500">{subtitle}</p>

      <TableShell>
        {users.length === 0 ? (
          <EmptyState
            icon={<Users size={48} />}
            message={`No ${segment === "delivery" ? "delivery" : segment === "vendor" ? "vendor" : "admin"} users yet.`}
          />
        ) : (
          <>
            <ul className="divide-y divide-slate-50">
              {users.map((user) => (
                <li key={user.id}>
                  <div className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-slate-50/70">
                    <div className="flex min-w-0 items-center gap-3.5">
                      <UserAvatar name={user.name} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-900">
                          {user.name ?? "Unknown"}
                        </p>
                        <p className="truncate text-xs text-slate-500">{user.email}</p>
                        <div className="mt-1.5">
                          <RoleTag role={user.role} />
                        </div>
                      </div>
                    </div>
                    <button
                      disabled={isPending}
                      onClick={() => setSelectedUser(user)}
                      className="ml-4 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                      title="Change role"
                    >
                      <Pencil size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <Pagination
              total={total}
              page={page}
              basePath="/admin/users"
              extraParams={{ tab: "users", segment }}
            />
          </>
        )}
      </TableShell>
    </>
  );
}
