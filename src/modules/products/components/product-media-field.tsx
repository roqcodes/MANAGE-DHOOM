"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  Film,
  ImageOff,
  Loader2,
  Plus,
  Star,
  Trash2,
  UploadCloud,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ACCEPTED_IMAGE_MIME,
  ACCEPTED_VIDEO_MIME,
  CLOUDINARY_CONFIGURED,
  uploadImageToCloudinary,
  uploadVideoToCloudinary,
  validateImageFile,
  validateVideoFile,
} from "@/modules/products/lib/cloudinary-upload";

const ACCEPTED_MEDIA_MIME = `${ACCEPTED_IMAGE_MIME},${ACCEPTED_VIDEO_MIME}`;

function isLikelyVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v|avi)(\?|#|$)/i.test(url);
}

function ImageThumb({
  url,
  isPreview,
  busy,
  onSetPreview,
  onRemove,
}: {
  url: string;
  isPreview: boolean;
  busy: boolean;
  onSetPreview: () => void;
  onRemove: () => void;
}) {
  const [broken, setBroken] = useState(false);

  return (
    <div
      className={cn(
        "flex w-[68px] flex-col overflow-hidden rounded-lg border bg-background",
        isPreview ? "border-primary/40 ring-1 ring-primary/20" : "border-border",
      )}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {broken ? (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-4" aria-hidden />
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
            className="absolute left-1 top-1 h-4 px-1 text-[9px]"
          >
            Thumb
          </Badge>
        ) : null}
      </div>
      <div className="flex items-center gap-0.5 border-t border-border p-0.5">
        <Button
          type="button"
          variant={isPreview ? "secondary" : "ghost"}
          size="icon-sm"
          className="min-w-0 flex-1"
          disabled={busy || isPreview}
          onClick={onSetPreview}
          title="Set as thumbnail"
        >
          <Star className="size-3" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-destructive hover:text-destructive"
          disabled={busy}
          onClick={onRemove}
          title="Remove"
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
    </div>
  );
}

function VideoTile({
  url,
  busy,
  onRemove,
}: {
  url: string;
  busy: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="flex w-[68px] flex-col overflow-hidden rounded-lg border border-border bg-background">
      <div className="relative flex aspect-square w-full items-center justify-center bg-slate-900/90">
        <Film className="size-5 text-white/90" aria-hidden />
        <Badge
          variant="secondary"
          className="absolute left-1 top-1 h-4 px-1 text-[9px]"
        >
          Video
        </Badge>
      </div>
      <div className="flex items-center justify-center border-t border-border p-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-destructive hover:text-destructive"
          disabled={busy}
          onClick={onRemove}
          title="Remove video"
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
      <p className="truncate px-1 pb-1 text-[8px] text-muted-foreground" title={url}>
        {url.split("/").pop() ?? "video"}
      </p>
    </div>
  );
}

function MediaDropZone({
  busy,
  uploadProgress,
  dragActive,
  onDragActive,
  onFiles,
  inputRef,
  hasMedia,
}: {
  busy: boolean;
  uploadProgress: { total: number; done: number } | null;
  dragActive: boolean;
  onDragActive: (active: boolean) => void;
  onFiles: (files: FileList | null) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  hasMedia: boolean;
}) {
  if (!CLOUDINARY_CONFIGURED) return null;

  return (
    <button
      type="button"
      onClick={() => !busy && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy) onDragActive(true);
      }}
      onDragLeave={() => onDragActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        onDragActive(false);
        if (!busy) onFiles(e.dataTransfer.files);
      }}
      disabled={busy}
      className={cn(
        "flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center transition",
        hasMedia ? "min-h-[100px]" : "min-h-[200px] flex-1",
        dragActive
          ? "border-primary bg-primary/5"
          : "border-border bg-muted/40 hover:border-muted-foreground/30 hover:bg-muted/60",
        busy && "cursor-not-allowed opacity-70",
      )}
    >
      {uploadProgress ? (
        <>
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-xs font-bold text-slate-600">
            Uploading {uploadProgress.done}/{uploadProgress.total}
          </p>
        </>
      ) : (
        <>
          <span className="flex size-10 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm ring-1 ring-border">
            <UploadCloud className="size-5" />
          </span>
          <p className="text-sm font-bold text-foreground">
            Drop photos or videos here
          </p>
          <p className="text-[11px] font-medium text-muted-foreground">
            or click to browse · JPG, PNG, WebP, MP4, WebM
          </p>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_MEDIA_MIME}
        multiple
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />
    </button>
  );
}

function UrlRow({
  placeholder,
  value,
  onChange,
  onAdd,
  disabled,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onAdd: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <input
        className="h-8 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] text-slate-900 outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10 disabled:opacity-50"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onAdd();
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        inputMode="url"
        disabled={disabled}
      />
      <button
        type="button"
        onClick={onAdd}
        disabled={disabled || !value.trim()}
        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
      >
        <Plus className="size-3" />
        Add
      </button>
    </div>
  );
}

export function ProductMediaField({
  images,
  previewIndex,
  onImagesChange,
  videos,
  onVideosChange,
  onUploadingChange,
}: {
  images: string[];
  previewIndex: number;
  onImagesChange: (images: string[], previewIndex: number) => void;
  videos: string[];
  onVideosChange: (videos: string[]) => void;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const [uploadProgress, setUploadProgress] = useState<{ total: number; done: number } | null>(
    null,
  );
  const [dragActive, setDragActive] = useState(false);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  const busy = uploadProgress !== null;

  useEffect(() => {
    onUploadingChange?.(busy);
  }, [busy, onUploadingChange]);

  function addImageUrls(urls: string[]) {
    const clean = urls.map((u) => u.trim()).filter(Boolean);
    if (clean.length === 0) return;
    onImagesChange(
      [...images, ...clean],
      images.length === 0 ? 0 : previewIndex,
    );
  }

  function removeImageAt(index: number) {
    const next = images.filter((_, i) => i !== index);
    let nextPreview = previewIndex;
    if (index === previewIndex) nextPreview = 0;
    else if (index < previewIndex) nextPreview = previewIndex - 1;
    onImagesChange(next, Math.min(nextPreview, Math.max(0, next.length - 1)));
  }

  async function handleMediaFiles(fileList: FileList | null) {
    const files = fileList ? Array.from(fileList) : [];
    if (files.length === 0) return;

    setMediaError(null);

    for (const file of files) {
      if (file.type.startsWith("image/")) {
        const err = validateImageFile(file);
        if (err) {
          setMediaError(err);
          if (mediaInputRef.current) mediaInputRef.current.value = "";
          return;
        }
      } else if (file.type.startsWith("video/")) {
        const err = validateVideoFile(file);
        if (err) {
          setMediaError(err);
          if (mediaInputRef.current) mediaInputRef.current.value = "";
          return;
        }
      } else {
        setMediaError("Only images and videos are supported.");
        if (mediaInputRef.current) mediaInputRef.current.value = "";
        return;
      }
    }

    setUploadProgress({ total: files.length, done: 0 });
    const uploadedImages: string[] = [];
    const uploadedVideos: string[] = [];

    try {
      for (const file of files) {
        if (file.type.startsWith("image/")) {
          uploadedImages.push(await uploadImageToCloudinary(file));
        } else {
          uploadedVideos.push(await uploadVideoToCloudinary(file));
        }
        setUploadProgress((s) => (s ? { ...s, done: s.done + 1 } : s));
      }
    } catch (e) {
      setUploadProgress(null);
      if (mediaInputRef.current) mediaInputRef.current.value = "";
      setMediaError(e instanceof Error ? e.message : "Upload failed.");
      return;
    }

    setUploadProgress(null);
    if (mediaInputRef.current) mediaInputRef.current.value = "";

    if (uploadedImages.length > 0) addImageUrls(uploadedImages);
    if (uploadedVideos.length > 0) {
      const clean = uploadedVideos.map((u) => u.trim()).filter(Boolean);
      if (clean.length > 0) onVideosChange([...videos, ...clean]);
    }
  }

  function addUrl() {
    const url = urlDraft.trim();
    if (!url) return;
    setUrlDraft("");
    if (isLikelyVideoUrl(url)) {
      onVideosChange([...videos, url]);
    } else {
      addImageUrls([url]);
    }
  }

  const hasMedia = images.length > 0 || videos.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {hasMedia ? (
        <div
          className="max-h-[180px] shrink-0 overflow-y-auto overscroll-contain rounded-lg border border-slate-100 bg-slate-50/60 p-2"
        >
          <div className="flex flex-wrap content-start gap-1.5">
            {images.map((url, i) => (
              <ImageThumb
                key={`img-${url}-${i}`}
                url={url}
                isPreview={i === previewIndex}
                busy={busy}
                onSetPreview={() => onImagesChange(images, i)}
                onRemove={() => removeImageAt(i)}
              />
            ))}
            {videos.map((url, i) => (
              <VideoTile
                key={`vid-${url}-${i}`}
                url={url}
                busy={busy}
                onRemove={() => onVideosChange(videos.filter((_, j) => j !== i))}
              />
            ))}
          </div>
        </div>
      ) : null}

      <MediaDropZone
        busy={busy}
        uploadProgress={uploadProgress}
        dragActive={dragActive}
        onDragActive={setDragActive}
        onFiles={(f) => void handleMediaFiles(f)}
        inputRef={mediaInputRef}
        hasMedia={hasMedia}
      />

      <UrlRow
        placeholder="Paste image or video URL"
        value={urlDraft}
        onChange={setUrlDraft}
        onAdd={addUrl}
        disabled={busy}
      />

      {mediaError ? (
        <p className="text-[11px] font-semibold text-rose-600">{mediaError}</p>
      ) : null}
    </div>
  );
}
