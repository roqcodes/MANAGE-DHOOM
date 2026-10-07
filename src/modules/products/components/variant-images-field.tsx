"use client";

import { useEffect, useRef, useState } from "react";
import { Star, Trash2, UploadCloud, Loader2, Plus, ImageOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ACCEPTED_IMAGE_MIME,
  CLOUDINARY_CONFIGURED,
  uploadImageToCloudinary,
  validateImageFile,
} from "@/modules/products/lib/cloudinary-upload";

function LocalThumb({
  url,
  isPreview,
  busy,
  onSetPreview,
  onRemove,
  compact = false,
}: {
  url: string;
  isPreview: boolean;
  busy: boolean;
  onSetPreview: () => void;
  onRemove: () => void;
  compact?: boolean;
}) {
  const [broken, setBroken] = useState(false);

  return (
    <div
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-lg border bg-background",
        compact && "w-[68px]",
        isPreview ? "border-primary/30" : "border-border",
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
            src={url}
            alt=""
            className="size-full object-cover"
            onError={() => setBroken(true)}
          />
        )}

        {isPreview ? (
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
          variant={isPreview ? "secondary" : "ghost"}
          size="icon-sm"
          className="min-w-0 flex-1"
          disabled={busy || isPreview}
          onClick={onSetPreview}
          title={isPreview ? "Current preview" : "Set as preview"}
          aria-pressed={isPreview}
        >
          <Star />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-destructive hover:text-destructive"
          disabled={busy}
          onClick={onRemove}
          title="Remove image"
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}

export function VariantImagesField({
  images,
  previewIndex,
  onChange,
  onUploadingChange,
  compact = false,
}: {
  images: string[];
  previewIndex: number;
  onChange: (images: string[], previewIndex: number) => void;
  onUploadingChange?: (uploading: boolean) => void;
  compact?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const [upload, setUpload] = useState<{ total: number; done: number } | null>(
    null,
  );
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onUploadingChange?.(upload !== null);
  }, [upload, onUploadingChange]);

  function addUrls(urls: string[]) {
    const clean = urls.map((u) => u.trim()).filter(Boolean);
    if (clean.length === 0) return;
    onChange([...images, ...clean], images.length === 0 ? 0 : previewIndex);
  }

  function removeAt(index: number) {
    const next = images.filter((_, i) => i !== index);
    let nextPreview = previewIndex;
    if (index === previewIndex) nextPreview = 0;
    else if (index < previewIndex) nextPreview = previewIndex - 1;
    onChange(next, Math.min(nextPreview, Math.max(0, next.length - 1)));
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
    const uploaded: string[] = [];
    try {
      for (const file of files) {
        const url = await uploadImageToCloudinary(file);
        uploaded.push(url);
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
    addUrls(uploaded);
  }

  function handleAddUrl() {
    const url = urlDraft.trim();
    if (!url) return;
    setUrlDraft("");
    addUrls([url]);
  }

  const busy = upload !== null;
  const hasImages = images.length > 0;

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
          : "w-full flex-col gap-1.5 rounded-xl px-4 py-4"
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
              compact ? "size-7" : "size-8"
            }`}
          >
            <UploadCloud className={compact ? "size-3.5" : "size-4"} aria-hidden />
          </span>
          <p className={`font-bold text-foreground ${compact ? "text-[10px] leading-tight" : "text-[12px]"}`}>
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
        className={`w-full rounded-lg border border-slate-200 bg-white px-2.5 text-slate-900 outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10 disabled:opacity-50 ${
          compact ? "h-8 text-[12px]" : "h-10 rounded-xl px-3 text-[13px]"
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
          compact ? "h-8 px-2 text-[11px]" : "h-10 rounded-xl px-3 text-[12.5px]"
        }`}
      >
        <Plus className={compact ? "size-3" : "size-3.5"} aria-hidden />
        Add
      </button>
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      {!compact ? (
        <span className="text-[13px] font-bold text-slate-700">
          Images{" "}
          <span className="font-medium text-slate-400">· optional</span>
        </span>
      ) : null}

      {compact ? (
        <div className="flex min-h-[92px] items-stretch gap-2">
          <div className="flex min-w-0 flex-[1.2] flex-wrap content-start gap-1.5 overflow-y-auto rounded-lg border border-slate-100 bg-white p-1.5">
            {hasImages ? (
              images.map((url, i) => (
                <LocalThumb
                  key={`${url}-${i}`}
                  url={url}
                  isPreview={i === previewIndex}
                  busy={busy}
                  onSetPreview={() => onChange(images, i)}
                  onRemove={() => removeAt(i)}
                  compact
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
            <div className="grid shrink-0 grid-cols-3 gap-1.5 sm:grid-cols-4">
              {images.map((url, i) => (
                <LocalThumb
                  key={`${url}-${i}`}
                  url={url}
                  isPreview={i === previewIndex}
                  busy={busy}
                  onSetPreview={() => onChange(images, i)}
                  onRemove={() => removeAt(i)}
                />
              ))}
            </div>
          ) : null}
          {dropZone}
          {urlRow}
        </>
      )}

      {error ? (
        <p className="text-[11.5px] font-semibold text-rose-600">{error}</p>
      ) : null}
    </div>
  );
}
