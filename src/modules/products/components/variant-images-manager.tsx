"use client";

import { useRef, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Star,
  Trash2,
  UploadCloud,
  Loader2,
  Plus,
  ImageOff,
} from "lucide-react";

import type { ProductVariant, VariantImage } from "@/common/admin/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  addVariantImagesAction,
  deleteVariantImageAction,
  setPreviewImageAction,
} from "@/modules/products/actions/variant-images.actions";
import {
  ACCEPTED_IMAGE_MIME,
  CLOUDINARY_CONFIGURED,
  uploadImageToCloudinary,
  validateImageFile,
} from "@/modules/products/lib/cloudinary-upload";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import { FormError, SecondaryBtn } from "@/modules/admin/components/modal";

function Thumb({
  image,
  busy,
  onSetPreview,
  onDelete,
  compact = false,
}: {
  image: VariantImage;
  busy: boolean;
  onSetPreview: () => void;
  onDelete: () => void;
  compact?: boolean;
}) {
  const [broken, setBroken] = useState(false);

  return (
    <div
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-lg border bg-background",
        compact && "w-[68px]",
        image.is_preview ? "border-primary/30" : "border-border",
      )}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {broken ? (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <ImageOff aria-hidden />
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.url}
            alt=""
            className="size-full object-cover"
            onError={() => setBroken(true)}
          />
        )}

        {image.is_preview ? (
          <Badge
            variant="secondary"
            className="absolute left-1 top-1 h-5 px-1.5 text-[10px]"
          >
            Preview
          </Badge>
        ) : null}
      </div>

      <div className="flex items-center gap-1 border-t border-border p-1">
        <Button
          type="button"
          variant={image.is_preview ? "secondary" : "ghost"}
          size="icon-sm"
          className="min-w-0 flex-1"
          disabled={busy || image.is_preview}
          onClick={onSetPreview}
          title={image.is_preview ? "Current preview" : "Set as preview"}
          aria-pressed={image.is_preview}
        >
          <Star />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-destructive hover:text-destructive"
          disabled={busy}
          onClick={onDelete}
          title="Delete image"
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}

export function VariantImagesManager({
  productId,
  variant,
  onClose,
  embedded = false,
  compact = false,
}: {
  productId: string;
  variant: ProductVariant;
  onClose: () => void;
  /** When true, hides the footer Done button (for inline use inside manage modal). */
  embedded?: boolean;
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const [upload, setUpload] = useState<{ total: number; done: number } | null>(
    null,
  );
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const images = variant.images ?? [];
  const busy = isPending || upload !== null;
  const hasImages = images.length > 0;

  function refresh() {
    return Promise.all([
      queryClient.invalidateQueries({
        queryKey: adminQueryKeys.productDetail(productId),
      }),
      queryClient.invalidateQueries({ queryKey: ["admin", "products"] }),
    ]);
  }

  function runAction(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  async function handleFiles(fileList: FileList | null) {
    const files = fileList ? Array.from(fileList) : [];
    if (files.length === 0) return;
    setError(null);

    for (const file of files) {
      const validationError = validateImageFile(file);
      if (validationError) {
        setError(validationError);
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
    }

    setUpload({ total: files.length, done: 0 });
    const urls: string[] = [];
    try {
      for (const file of files) {
        const url = await uploadImageToCloudinary(file);
        urls.push(url);
        setUpload((s) => (s ? { ...s, done: s.done + 1 } : s));
      }
    } catch (e) {
      setUpload(null);
      if (inputRef.current) inputRef.current.value = "";
      setError(e instanceof Error ? e.message : "Upload failed.");
      return;
    }

    setUpload(null);
    if (inputRef.current) inputRef.current.value = "";
    runAction(() => addVariantImagesAction(productId, variant.id, urls));
  }

  function handleAddUrl() {
    const url = urlDraft.trim();
    if (!url) return;
    setUrlDraft("");
    runAction(() => addVariantImagesAction(productId, variant.id, [url]));
  }

  const dropZone = CLOUDINARY_CONFIGURED ? (
    <button
      type="button"
      onClick={() => !busy && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy) setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragActive(false);
        if (!busy) void handleFiles(e.dataTransfer.files);
      }}
      disabled={busy}
      className={`group flex items-center justify-center rounded-lg border border-dashed text-center transition ${
        compact
          ? "min-h-[72px] w-full flex-1 flex-col gap-1 px-2"
          : "w-full flex-col gap-1.5 rounded-xl px-4 py-5"
      } ${
        dragActive
          ? "border-primary bg-primary/5"
          : "border-border bg-muted/40 hover:border-muted-foreground/30 hover:bg-muted/60"
      } disabled:cursor-not-allowed`}
    >
      {upload ? (
        <>
          <Loader2
            className={`animate-spin text-primary ${compact ? "size-4" : "size-5"}`}
            aria-hidden
          />
          <p className={`font-bold text-slate-600 ${compact ? "text-[10px]" : "text-[12px]"}`}>
            Uploading {upload.done}/{upload.total}…
          </p>
        </>
      ) : (
        <>
          <span
            className={`flex items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm ring-1 ring-border transition group-hover:text-primary ${
              compact ? "size-7" : "size-9"
            }`}
          >
            <UploadCloud className={compact ? "size-3.5" : "size-5"} aria-hidden />
          </span>
          <p className={`font-bold text-foreground ${compact ? "text-[10px] leading-tight" : "text-[12.5px]"}`}>
            {compact ? (
              <>
                Drop or <span className="text-primary">browse</span>
              </>
            ) : (
              <>
                Drag &amp; drop or{" "}
                <span className="text-primary">browse</span> — multiple allowed
              </>
            )}
          </p>
          {!compact ? (
            <p className="text-[11px] font-medium text-slate-400">
              PNG, JPG, WEBP or GIF · up to 5&nbsp;MB each
            </p>
          ) : null}
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_MIME}
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
    </button>
  ) : null;

  const urlRow = (
    <div className={`flex shrink-0 items-center ${compact ? "gap-1.5" : "gap-2"}`}>
      <input
        className={`w-full rounded-lg border border-slate-200 bg-white text-slate-900 outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10 disabled:opacity-50 ${
          compact ? "h-8 px-2.5 text-[12px]" : "h-11 rounded-xl px-3 text-sm"
        }`}
        value={urlDraft}
        onChange={(e) => setUrlDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleAddUrl();
          }
        }}
        placeholder="Paste URL"
        autoComplete="off"
        inputMode="url"
        disabled={busy}
      />
      <button
        type="button"
        onClick={handleAddUrl}
        disabled={busy || !urlDraft.trim()}
        className={`inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 ${
          compact ? "h-8 px-2 text-[11px]" : "h-11 rounded-xl px-4 text-[13px] gap-1.5"
        }`}
      >
        <Plus className={compact ? "size-3" : "size-4"} aria-hidden />
        Add
      </button>
    </div>
  );

  return (
    <div className={compact ? "flex flex-col gap-2" : "flex flex-col gap-2"}>
      {!compact && !embedded ? (
        <p className="text-[12.5px] font-medium leading-snug text-muted-foreground">
          Manage images for{" "}
          <span className="font-semibold text-foreground">
            {variant.name ?? "this variant"}
          </span>
          . The image marked{" "}
          <span className="font-semibold text-foreground">Preview</span> is
          shown first.
        </p>
      ) : null}

      {compact ? (
        <div className="flex min-h-[92px] items-stretch gap-2">
          <div className="flex min-w-0 flex-[1.2] flex-wrap content-start gap-1.5 overflow-y-auto rounded-lg border border-slate-100 bg-white p-1.5">
            {hasImages ? (
              images.map((img) => (
                <Thumb
                  key={img.id}
                  image={img}
                  busy={busy}
                  compact
                  onSetPreview={() =>
                    runAction(() =>
                      setPreviewImageAction(productId, variant.id, img.id),
                    )
                  }
                  onDelete={() =>
                    runAction(() => deleteVariantImageAction(productId, img.id))
                  }
                />
              ))
            ) : (
              <p className="flex min-h-[76px] w-full items-center justify-center text-[10px] font-medium text-slate-400">
                No images yet
              </p>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {dropZone}
            {urlRow}
          </div>
        </div>
      ) : (
        <>
          {hasImages ? (
            <div
              className={
                embedded
                  ? "grid shrink-0 grid-cols-3 gap-1.5 sm:grid-cols-4"
                  : "grid grid-cols-2 gap-2 sm:grid-cols-3"
              }
            >
              {images.map((img) => (
                <Thumb
                  key={img.id}
                  image={img}
                  busy={busy}
                  onSetPreview={() =>
                    runAction(() =>
                      setPreviewImageAction(productId, variant.id, img.id),
                    )
                  }
                  onDelete={() =>
                    runAction(() => deleteVariantImageAction(productId, img.id))
                  }
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center">
              <ImageOff className="size-8 text-slate-300" aria-hidden />
              <p className="text-[12.5px] font-semibold text-slate-500">
                No images yet — add some below.
              </p>
            </div>
          )}
          {dropZone}
          {urlRow}
        </>
      )}

      <FormError message={error} />

      {!embedded ? (
        <div className="flex justify-end pt-1">
          <SecondaryBtn onClick={onClose}>Done</SecondaryBtn>
        </div>
      ) : null}
    </div>
  );
}
