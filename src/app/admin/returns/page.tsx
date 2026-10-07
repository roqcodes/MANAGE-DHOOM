"use client";

import Link from "next/link";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function AdminReturnsPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-5 py-16 text-center sm:px-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <RotateCcw className="h-7 w-7 text-muted-foreground" />
      </div>
      <h1 className="mt-6 text-2xl font-bold">Returns temporarily disabled</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Online order returns are not available in admin yet. For sales returns from customers,
        create a credit note manually under Sales → Credit Note.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button nativeButton={false} render={<Link href="/admin/erp/credit-notes" />}>
          Go to credit notes
        </Button>
        <Button variant="outline" nativeButton={false} render={<Link href="/admin" />}>
          Back to dashboard
        </Button>
      </div>
    </div>
  );
}
