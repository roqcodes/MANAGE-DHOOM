"use client";

/**
 * Unsigned, browser-side Cloudinary uploads. The cloud name + unsigned upload
 * preset are public by design (the preset constrains what can be uploaded), so
 * no server secret is involved and the file never round-trips through our API.
 */

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

export const CLOUDINARY_CONFIGURED = Boolean(CLOUD_NAME && UPLOAD_PRESET);

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ACCEPTED_IMAGE_MIME = "image/png,image/jpeg,image/webp,image/gif,image/avif";

export function validateImageFile(file: File): string | null {
  if (!file.type.startsWith("image/")) {
    return "Please choose an image file.";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return "Image is too large — keep it under 5 MB.";
  }
  return null;
}

interface UploadOptions {
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

/** Uploads a single image and resolves to its `secure_url`. */
export function uploadImageToCloudinary(
  file: File,
  { onProgress, signal }: UploadOptions = {},
): Promise<string> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    return Promise.reject(
      new Error(
        "Image upload isn’t configured. Set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME and NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET.",
      ),
    );
  }

  const validationError = validateImageFile(file);
  if (validationError) {
    return Promise.reject(new Error(validationError));
  }

  return new Promise<string>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Upload aborted", "AbortError"));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    );

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText) as {
            secure_url?: string;
            url?: string;
          };
          const url = data.secure_url ?? data.url;
          if (url) {
            resolve(url);
          } else {
            reject(new Error("Upload succeeded but no image URL was returned."));
          }
        } catch {
          reject(new Error("Could not read the upload response."));
        }
        return;
      }

      let message = `Upload failed (${xhr.status}).`;
      try {
        const data = JSON.parse(xhr.responseText) as {
          error?: { message?: string };
        };
        if (data.error?.message) message = data.error.message;
      } catch {
        /* keep default message */
      }
      reject(new Error(message));
    };

    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.onabort = () => reject(new DOMException("Upload aborted", "AbortError"));

    if (signal) {
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }

    const form = new FormData();
    form.append("file", file);
    form.append("upload_preset", UPLOAD_PRESET);
    xhr.send(form);
  });
}

export const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB
export const ACCEPTED_VIDEO_MIME =
  "video/mp4,video/webm,video/quicktime,video/x-msvideo";

export function validateVideoFile(file: File): string | null {
  if (!file.type.startsWith("video/")) {
    return "Please choose a video file.";
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return "Video is too large — keep it under 50 MB.";
  }
  return null;
}

/** Uploads a single video and resolves to its `secure_url`. */
export function uploadVideoToCloudinary(
  file: File,
  { onProgress, signal }: UploadOptions = {},
): Promise<string> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    return Promise.reject(
      new Error(
        "Upload isn’t configured. Set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME and NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET.",
      ),
    );
  }

  const validationError = validateVideoFile(file);
  if (validationError) {
    return Promise.reject(new Error(validationError));
  }

  return new Promise<string>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Upload aborted", "AbortError"));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`,
    );

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText) as {
            secure_url?: string;
            url?: string;
          };
          const url = data.secure_url ?? data.url;
          if (url) {
            resolve(url);
          } else {
            reject(new Error("Upload succeeded but no video URL was returned."));
          }
        } catch {
          reject(new Error("Could not read the upload response."));
        }
        return;
      }

      let message = `Upload failed (${xhr.status}).`;
      try {
        const data = JSON.parse(xhr.responseText) as {
          error?: { message?: string };
        };
        if (data.error?.message) message = data.error.message;
      } catch {
        /* keep default message */
      }
      reject(new Error(message));
    };

    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.onabort = () => reject(new DOMException("Upload aborted", "AbortError"));

    if (signal) {
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }

    const form = new FormData();
    form.append("file", file);
    form.append("upload_preset", UPLOAD_PRESET);
    xhr.send(form);
  });
}
