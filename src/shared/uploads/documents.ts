export interface MediaUploadPolicy {
  max_bytes: number;
  image_max_width: number;
  image_max_height: number;
  image_jpeg_quality: number;
  allowed_mime_types: string[];
  image_output_mime_type: "image/jpeg";
}

export const DEFAULT_MEDIA_UPLOAD_POLICY: MediaUploadPolicy = {
  max_bytes: 10 * 1024 * 1024,
  image_max_width: 1600,
  image_max_height: 1600,
  image_jpeg_quality: 0.82,
  allowed_mime_types: [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "text/plain",
    "text/csv",
    "application/msword",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
  image_output_mime_type: "image/jpeg",
};

export const MAX_DOCUMENT_UPLOAD_BYTES = DEFAULT_MEDIA_UPLOAD_POLICY.max_bytes;

export interface PreparedDocumentUploadFile {
  file: File;
  compressed: boolean;
  originalSize: number;
}

export async function prepareDocumentUploadFile(
  file: File,
  policy: MediaUploadPolicy = DEFAULT_MEDIA_UPLOAD_POLICY,
): Promise<PreparedDocumentUploadFile> {
  if (file.size <= 0) {
    throw new Error("Selected file is empty.");
  }

  const normalizedMimeType = file.type.trim().toLowerCase();
  const allowedMimeTypes = policy.allowed_mime_types.map((mimeType) =>
    mimeType.trim().toLowerCase(),
  );
  if (normalizedMimeType && !allowedMimeTypes.includes(normalizedMimeType)) {
    throw new Error("This file type is not allowed for upload.");
  }

  const prepared = normalizedMimeType.startsWith("image/")
    ? await prepareImageUploadFile(file, policy)
    : file;
  if (prepared.size > policy.max_bytes) {
    throw new Error(
      `File is ${formatBytes(prepared.size)}. Maximum allowed upload size is ${formatBytes(
        policy.max_bytes,
      )}.`,
    );
  }

  return {
    file: prepared,
    compressed: prepared !== file,
    originalSize: file.size,
  };
}

export function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function uploadPolicyAccept(
  policy: MediaUploadPolicy = DEFAULT_MEDIA_UPLOAD_POLICY,
): string {
  return policy.allowed_mime_types.join(",");
}

async function prepareImageUploadFile(file: File, policy: MediaUploadPolicy): Promise<File> {
  const compressed = await compressImageFile(file, policy);
  if (!compressed || compressed.size >= file.size) {
    return file;
  }
  return compressed;
}

async function compressImageFile(file: File, policy: MediaUploadPolicy): Promise<File | null> {
  const imageUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(imageUrl);
    const scale = Math.min(
      1,
      policy.image_max_width / image.width,
      policy.image_max_height / image.height,
    );
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, policy.image_output_mime_type, policy.image_jpeg_quality),
    );
    if (!blob) return null;
    return new File([blob], renameAsJpeg(file.name), {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image could not be read."));
    image.src = src;
  });
}

function renameAsJpeg(name: string): string {
  return /\.[^.]+$/u.test(name) ? name.replace(/\.[^.]+$/u, ".jpg") : `${name}.jpg`;
}
