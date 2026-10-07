"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, UploadCloud, Loader2, Plus, Film } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ACCEPTED_VIDEO_MIME,
  CLOUDINARY_CONFIGURED,
  uploadVideoToCloudinary,
  validateVideoFile,
} from "@/modules/products/lib/cloudinary-upload";

export function ProductVideosField({
  videos,
  onChange,
  onUploadingChange,
  compact = false,
}: {
  videos: string[];
  onChange: (videos: string[]) => void;
  onUploadingChange?: (uploading: boolean) => void;
  compact?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const [upload, setUpload] = useState<{ total: number; done: number } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onUploadingChange?.(upload !== null);
  }, [upload, onUploadingChange]);

  function addUrls(urls: string[]) {
    const clean = urls.map((u) => u.trim()).filter(Boolean);
    if (clean.length === 0) return;
    onChange([...videos, ...clean]);
  }

  function removeAt(index: number) {
    onChange(videos.filter((_, i) => i !== index));
  }

  async function handleFiles(fileList: FileList | null) {
    const files = fileList ? Array.from(fileList) : [];
    if (files.length === 0) return;
    setError(null);

    for (const file of files) {
      const validationError = validateVideoFile(file);
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
        const url = await uploadVideoToCloudinary(file);
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
  const hasVideos = videos.length > 0;

  return (
    <div className="flex flex-col gap-2">
      {hasVideos ? (
        <ul
          className={cn(
            "flex flex-wrap gap-2",
            compact ? "max-h-[120px] overflow-y-auto" : "",
          )}
        >
          {videos.map((url, index) => (
            <li
              key={`${url}-${index}`}
              className={cn(
                "flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-2 py-1.5",
                compact ? "text-xs" : "text-sm",
              )}
            >
              <Film className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="max-w-[180px] truncate text-muted-foreground">{url}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0 text-destructive hover:text-destructive"
                disabled={busy}
                onClick={() => removeAt(index)}
                title="Remove video"
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {CLOUDINARY_CONFIGURED ? (
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
          className={cn(
            "flex items-center justify-center rounded-lg border border-dashed text-center transition",
            compact ? "min-h-[72px] w-full flex-col gap-1 px-2" : "w-full flex-col gap-1.5 px-4 py-4",
            dragActive
              ? "border-primary bg-primary/5"
              : "border-border bg-muted/40 hover:border-muted-foreground/30 hover:bg-muted/60",
          )}
        >
          {busy ? (
            <>
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                Uploading {upload?.done ?? 0}/{upload?.total ?? 0}…
              </span>
            </>
          ) : (
            <>
              <UploadCloud className="size-5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">
                Drop videos or click to upload
              </span>
            </>
          )}
        </button>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_VIDEO_MIME}
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />

      <div className="flex gap-2">
        <input
          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 text-xs outline-none focus:border-primary"
          value={urlDraft}
          onChange={(e) => setUrlDraft(e.target.value)}
          placeholder="Paste video URL"
          disabled={busy}
        />
        <Button type="button" variant="outline" size="sm" disabled={busy || !urlDraft.trim()} onClick={handleAddUrl}>
          <Plus />
          Add
        </Button>
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
