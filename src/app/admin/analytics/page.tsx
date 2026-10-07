"use client";

import { Suspense } from "react";

import { AnalyticsPage } from "@/components/analytics/analytics-page";
import { Skeleton } from "@/components/ui/skeleton";

function AnalyticsFallback() {
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-3 py-3 sm:px-4 sm:py-4">
      <Skeleton className="h-7 w-48" />
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}

export default function AdminAnalyticsRoutePage() {
  return (
    <Suspense fallback={<AnalyticsFallback />}>
      <AnalyticsPage />
    </Suspense>
  );
}
