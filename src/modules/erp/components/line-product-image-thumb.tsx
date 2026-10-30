"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { fetchProductPreviewImageUrl } from "@/modules/erp/lib/product-image-preview.client";

export function LineProductImageThumb({
  productId,
  productName,
  imageUrl: imageUrlHint,
}: {
  productId: string | null;
  productName?: string;
  imageUrl?: string | null;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const label = productName?.trim() || "Product";

  const { data: fetchedUrl, isFetching } = useQuery({
    queryKey: ["admin", "product-preview-image", productId],
    queryFn: () => fetchProductPreviewImageUrl(productId!),
    enabled: Boolean(productId) && !imageUrlHint?.trim(),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  });

  const url = imageUrlHint?.trim() || fetchedUrl || null;
  const canPreview = Boolean(url);

  return (
    <>
      <button
        type="button"
        disabled={!canPreview}
        onClick={() => canPreview && setPreviewOpen(true)}
        className={cn(
          "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40 transition",
          canPreview && "cursor-zoom-in hover:ring-2 hover:ring-ring/40",
          !productId && "opacity-50",
        )}
        aria-label={canPreview ? `View image for ${label}` : "No product image"}
        title={canPreview ? "View image" : productId ? "No image" : "Link a product"}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="size-full object-cover" />
        ) : isFetching && productId ? (
          <span className="size-4 animate-pulse rounded bg-muted-foreground/20" aria-hidden />
        ) : (
          <Package className="size-4 text-muted-foreground" aria-hidden />
        )}
      </button>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-[min(96vw,720px)] gap-2 border-border p-3 sm:p-4">
          <DialogTitle className="text-sm font-medium">{label}</DialogTitle>
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={label}
              className="max-h-[min(80vh,720px)] w-full rounded-md object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
