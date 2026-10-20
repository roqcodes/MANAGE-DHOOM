"use client";

import { useQuery } from "@tanstack/react-query";

import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { Card, CardContent } from "@/components/ui/card";
import { AdminTableBodySkeleton } from "@/modules/admin/components/admin-page-skeleton";
import type { ErpSalesmanRow } from "@/modules/users/services/erp-salesmen.service";

export function UsersSalesmenPanel() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "erp-salesmen"],
    queryFn: () => adminGet<{ salesmen: ErpSalesmanRow[] }>("erp/salesmen"),
  });

  const salesmen = data?.salesmen ?? [];

  return (
    <Card className="overflow-hidden border border-border py-0 ring-0">
      <CardContent className="flex flex-col gap-0 p-0">
        <div className="border-b px-3 py-3">
          <h2 className="text-sm font-medium">Salesmen</h2>
          <p className="text-xs text-muted-foreground">
            PIN-identified sellers for sales invoices and orders. Managed by super admins only.
          </p>
        </div>
        {isLoading ? (
          <AdminTableBodySkeleton rows={4} />
        ) : error ? (
          <p className="px-3 py-6 text-sm text-destructive">Could not load salesmen.</p>
        ) : salesmen.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            No salesmen yet. Use Create salesman to add one.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Phone</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {salesmen.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium">{row.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.email ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.phone ?? "—"}</td>
                    <td className="px-3 py-2">
                      {row.is_active ? (
                        <span className="text-emerald-700 dark:text-emerald-400">Active</span>
                      ) : (
                        <span className="text-muted-foreground">Inactive</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
