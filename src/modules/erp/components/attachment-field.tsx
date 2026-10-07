"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import {
  CLOUDINARY_CONFIGURED,
  uploadImageToCloudinary,
} from "@/modules/products/lib/cloudinary-upload";

export function AttachmentField({
  value,
  onChange,
  label = "Attachment",
  accept = "image/*,.pdf",
}: {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  accept?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | null) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const url = await uploadImageToCloudinary(file);
      onChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  if (!CLOUDINARY_CONFIGURED) {
    return (
      <p className="text-sm text-muted-foreground">
        File upload is not configured. Set Cloudinary environment variables.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <Input
        type="file"
        accept={accept}
        disabled={uploading}
        onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
      />
      {uploading ? <p className="text-xs text-muted-foreground">Uploading…</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {value ? (
        <a href={value} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
          View attachment
        </a>
      ) : null}
    </div>
  );
}
