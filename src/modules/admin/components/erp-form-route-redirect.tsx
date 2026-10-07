"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function ErpFormRouteRedirect({
  listPath,
  form,
  id,
  extra,
}: {
  listPath: string;
  form: "new" | "edit";
  id?: string;
  extra?: Record<string, string>;
}) {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("form", form);
    if (form === "edit" && id) params.set("id", id);
    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        if (value) params.set(key, value);
      }
    }
    router.replace(`${listPath}?${params.toString()}`);
  }, [router, listPath, form, id, extra]);

  return null;
}
