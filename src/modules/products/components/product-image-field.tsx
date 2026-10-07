"use client";

import { useEffect, useRef, useState } from "react";
import { UploadCloud, Link2, Loader2, ImageOff, X, Package } from "lucide-react";

import {
  ACCEPTED_IMAGE_MIME,
  CLOUDINARY_CONFIGURED,
  uploadImageToCloudinary,
  validateImageFile,
} from "@/modules/products/lib/cloudinary-upload";

const BRAND = "#2563EB";

type Mode = "upload" | "url";

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof UploadCloud;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-bold transition ${
        active
          ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
          : "text-slate-500 hover:text-slate-700"
      }`}
    >
      <Icon className="size-3.5" aria-hidden />
      {children}
    </button>
  );
}

export function ProductImageField({
  value,
  onChange,
  onUploadingChange,
}: {
  value: string;
  onChange: (url: string) => void;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const trimmed = value.trim();
  const [mode, setMode] = useState<Mode>(() =>
    !trimmed && CLOUDINARY_CONFIGURED ? "upload" : "url",
  );
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewBroken, setPreviewBroken] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPreviewBroken(false);
  }, [trimmed]);

  useEffect(() => {
    onUploadingChange?.(uploading);
  }, [uploading, onUploadingChange]);

  async function handleFile(file: File | undefined | null) {
    if (!file) return;
    const validationError = validateImageFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setProgress(0);
    setUploading(true);
    try {
      const url = await uploadImageToCloudinary(file, {
        onProgress: setProgress,
      });
      onChange(url);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    if (uploading) return;
    void handleFile(e.dataTransfer.files?.[0]);
  }

  const showPreview = trimmed.length > 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold text-slate-700">
          Product Image
        </span>
        {showPreview ? (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setError(null);
            }}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 transition hover:text-rose-500"
          >
            <X className="size-3" aria-hidden />
            Remove
          </button>
        ) : null}
      </div>

      {/* Mode toggle */}
      <div className="inline-flex w-full gap-1 rounded-xl bg-slate-100/80 p-1">
        <TabButton
          active={mode === "upload"}
          onClick={() => setMode("upload")}
          icon={UploadCloud}
        >
          Upload
        </TabButton>
        <TabButton
          active={mode === "url"}
          onClick={() => setMode("url")}
          icon={Link2}
        >
          Paste URL
        </TabButton>
      </div>

      {mode === "upload" ? (
        CLOUDINARY_CONFIGURED ? (
          <button
            type="button"
            onClick={() => !uploading && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              if (!uploading) setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            disabled={uploading}
            className={`group relative flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-6 text-center transition ${
              dragActive
                ? "border-[color:var(--brand)] bg-[color:var(--brand)]/[0.04]"
                : "border-slate-300 bg-slate-50/60 hover:border-slate-400 hover:bg-slate-50"
            } disabled:cursor-not-allowed`}
            style={{ ["--brand" as string]: BRAND }}
          >
            {uploading ? (
              <>
                <Loader2
                  className="size-6 animate-spin text-[color:var(--brand)]"
                  aria-hidden
                />
                <p className="text-[12px] font-bold text-slate-600">
                  Uploading… {progress}%
                </p>
                <div className="h-1.5 w-40 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-[color:var(--brand)] transition-[width] duration-150"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </>
            ) : (
              <>
                <span className="flex size-10 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200 transition group-hover:text-[color:var(--brand)]">
                  <UploadCloud className="size-5" aria-hidden />
                </span>
                <p className="text-[12.5px] font-bold text-slate-700">
                  Drag &amp; drop or{" "}
                  <span className="text-[color:var(--brand)]">browse</span>
                </p>
                <p className="text-[11px] font-medium text-slate-400">
                  PNG, JPG, WEBP or GIF · up to 5&nbsp;MB
                </p>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_IMAGE_MIME}
              className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
          </button>
        ) : (
          <p className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5 text-[11.5px] font-medium leading-snug text-amber-700">
            Direct upload isn’t configured. Add{" "}
            <code className="font-mono">NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME</code>{" "}
            and{" "}
            <code className="font-mono">
              NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET
            </code>{" "}
            to your env, or paste an image URL instead.
          </p>
        )
      ) : (
        <input
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/10"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setError(null);
          }}
          placeholder="https://…"
          autoComplete="off"
          inputMode="url"
        />
      )}

      {error ? (
        <p className="text-[11.5px] font-semibold text-rose-600">{error}</p>
      ) : null}

      {/* Preview */}
      {showPreview ? (
        <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
          <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-slate-200/80">
            {previewBroken ? (
              <ImageOff className="size-6 text-slate-300" aria-hidden />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={trimmed}
                src={trimmed}
                alt=""
                className="max-h-full max-w-full object-contain"
                onError={() => setPreviewBroken(true)}
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-0.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Preview
            </p>
            {previewBroken ? (
              <p className="text-[11.5px] font-semibold leading-snug text-amber-700">
                Couldn’t load this image. Check the URL.
              </p>
            ) : (
              <p className="truncate text-[11.5px] font-medium text-slate-500">
                {trimmed}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 text-slate-400">
          <Package className="size-5 shrink-0" strokeWidth={1.5} aria-hidden />
          <p className="text-[11.5px] font-medium">No image yet — optional.</p>
        </div>
      )}
    </div>
  );
}
