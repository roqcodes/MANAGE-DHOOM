"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Package } from "lucide-react";

import { cn } from "@/lib/utils";
import { fetchProductPreviewImageUrl } from "@/modules/erp/lib/product-image-preview.client";

const PREVIEW_MAX = 280;
const PREVIEW_GAP = 6;
const HOVER_CLOSE_MS = 100;

export function LineProductImageThumb({
  productId,
  productName,
  imageUrl: imageUrlHint,
}: {
  productId: string | null;
  productName?: string;
  imageUrl?: string | null;
}) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const label = productName?.trim() || "Product";

  const { data: fetchedUrl, isFetching, isPending } = useQuery({
    queryKey: ["admin", "product-preview-image", productId],
    queryFn: () => fetchProductPreviewImageUrl(productId!),
    enabled: Boolean(productId) && !imageUrlHint?.trim(),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  });

  const url = imageUrlHint?.trim() || fetchedUrl || null;
  const canPreview = Boolean(url) && imgLoaded;

  useEffect(() => {
    setImgLoaded(false);
  }, [url, productId]);

  const loadingUrl =
    Boolean(productId) && !imageUrlHint?.trim() && (isPending || isFetching);
  const loadingImage = Boolean(url) && !imgLoaded;

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => setPreviewOpen(false), HOVER_CLOSE_MS);
  }, [clearCloseTimer]);

  const openPreview = useCallback(() => {
    if (!canPreview) return;
    clearCloseTimer();
    setPreviewOpen(true);
  }, [canPreview, clearCloseTimer]);

  useEffect(() => {
    if (!canPreview) return;
    const anchor = anchorRef.current;
    if (anchor?.matches(":hover")) openPreview();
  }, [canPreview, openPreview]);

  const updatePopoverPosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = PREVIEW_MAX;
    const height = PREVIEW_MAX + 36;

    let left = rect.right + PREVIEW_GAP;
    if (left + width > window.innerWidth - 8) {
      left = rect.left - width - PREVIEW_GAP;
    }
    if (left < 8) left = 8;

    let top = rect.top + rect.height / 2 - height / 2;
    top = Math.min(Math.max(8, top), window.innerHeight - height - 8);

    setPopoverStyle({ top, left });
  }, []);

  useEffect(() => {
    if (!previewOpen) {
      setPopoverStyle(null);
      return;
    }
    updatePopoverPosition();
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);
    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [previewOpen, updatePopoverPosition]);

  useEffect(() => {
    return () => clearCloseTimer();
  }, [clearCloseTimer]);

  const previewPanel =
    previewOpen && popoverStyle && url ? (
      <div
        ref={previewRef}
        role="tooltip"
        className="fixed z-[200] w-[min(280px,70vw)] rounded-lg border border-border bg-popover p-2 shadow-lg ring-1 ring-foreground/5"
        style={{ top: popoverStyle.top, left: popoverStyle.left }}
        onMouseEnter={clearCloseTimer}
        onMouseLeave={scheduleClose}
      >
        <p className="mb-1.5 truncate px-0.5 text-xs font-medium text-foreground">{label}</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={label}
          className="max-h-[min(280px,50vh)] w-full rounded-md object-contain"
        />
      </div>
    ) : null;

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        disabled={!url && !loadingUrl}
        onMouseEnter={openPreview}
        onMouseLeave={scheduleClose}
        onFocus={openPreview}
        onBlur={(e) => {
          const next = e.relatedTarget as Node | null;
          if (previewRef.current?.contains(next)) return;
          setPreviewOpen(false);
        }}
        className={cn(
          "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40 transition",
          canPreview && "cursor-zoom-in hover:ring-2 hover:ring-ring/40",
          !productId && "opacity-50",
        )}
        aria-label={
          loadingUrl || loadingImage
            ? `Loading image for ${label}`
            : canPreview
              ? `Preview image for ${label}`
              : "No product image"
        }
        title={
          loadingUrl || loadingImage
            ? "Loading image…"
            : canPreview
              ? "Hover to preview"
              : productId
                ? "No image"
                : "Link a product"
        }
      >
        {loadingUrl || loadingImage ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
        ) : null}
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={url}
            src={url}
            alt=""
            className={cn(
              "size-full object-cover",
              (loadingUrl || loadingImage) && "sr-only",
            )}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgLoaded(true)}
          />
        ) : !loadingUrl ? (
          <Package className="size-4 text-muted-foreground" aria-hidden />
        ) : null}
      </button>

      {typeof document !== "undefined" && previewPanel
        ? createPortal(previewPanel, document.body)
        : null}
    </>
  );
}
