"use client";

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ACCEPTED_IMAGE_MIME,
  CLOUDINARY_CONFIGURED,
  uploadImageToCloudinary,
  validateImageFile,
} from "@/modules/products/lib/cloudinary-upload";
import { CustomerAvatar } from "@/modules/customers/components/customers-ui";

export function CustomerPhotoField({
  value,
  name,
  onChange,
  onUploadingChange,
}: {
  value: string;
  name?: string | null;
  onChange: (url: string) => void;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = value.trim();

  async function handleFile(file: File | undefined | null) {
    if (!file) return;
    const validationError = validateImageFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setUploading(true);
    onUploadingChange?.(true);
    try {
      const url = await uploadImageToCloudinary(file);
      onChange(url);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex w-24 shrink-0 flex-col items-center gap-2">
      <button
        type="button"
        disabled={uploading}
        aria-label={trimmed ? "Change profile photo" : "Upload profile photo"}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "group relative size-24 overflow-hidden rounded-full border border-border bg-muted/40",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed",
        )}
      >
        <CustomerAvatar name={name} avatarUrl={trimmed || null} className="size-24 text-base" />
        <span
          className={cn(
            "absolute inset-0 flex flex-col items-center justify-center gap-1 bg-foreground/55 text-background",
            "opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
            uploading && "opacity-100",
          )}
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Camera className="size-4" aria-hidden />
          )}
          <span className="text-[10px] font-medium tracking-wide uppercase">
            {uploading ? "Uploading" : trimmed ? "Change" : "Add"}
          </span>
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_MIME}
        className="sr-only"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      {trimmed ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground"
          disabled={uploading}
          onClick={() => {
            onChange("");
            setError(null);
          }}
        >
          Remove
        </Button>
      ) : (
        <p className="text-center text-[11px] leading-snug text-muted-foreground">Photo</p>
      )}
      {!CLOUDINARY_CONFIGURED && !trimmed ? (
        <p className="text-center text-[10px] leading-snug text-amber-700 dark:text-amber-400">
          Upload isn’t configured
        </p>
      ) : null}
      {error ? (
        <p className="text-center text-[11px] font-medium text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
