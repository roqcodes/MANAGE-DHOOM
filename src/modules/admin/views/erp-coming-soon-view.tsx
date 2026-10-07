import Link from "next/link";

import { Button } from "@/components/ui/button";

export function ErpComingSoonView({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-6 py-20 text-center">
      <p className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
        Coming soon
      </p>
      <h1 className="mt-4 text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {description ?? "This HR module is planned for a future release."}
      </p>
      <Button nativeButton={false} className="mt-8" render={<Link href="/admin" />}>
        Back to dashboard
      </Button>
    </div>
  );
}
