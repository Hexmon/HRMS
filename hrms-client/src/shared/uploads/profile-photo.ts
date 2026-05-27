import { formatBytes } from "./documents";

export interface ProfilePhotoPolicy {
  max_bytes: number;
  max_width: number;
  max_height: number;
  jpeg_quality: number;
  allowed_mime_types: string[];
  output_mime_type: "image/jpeg";
  cloudinary_transformation?: string;
}

export interface PreparedProfilePhotoFile {
  file: File;
  compressed: boolean;
  originalSize: number;
}

export const DEFAULT_PROFILE_PHOTO_POLICY: ProfilePhotoPolicy = {
  max_bytes: 2 * 1024 * 1024,
  max_width: 512,
  max_height: 512,
  jpeg_quality: 0.82,
  allowed_mime_types: ["image/jpeg", "image/png", "image/webp"],
  output_mime_type: "image/jpeg",
};

export async function prepareProfilePhotoUploadFile(
  file: File,
  policy: ProfilePhotoPolicy = DEFAULT_PROFILE_PHOTO_POLICY,
): Promise<PreparedProfilePhotoFile> {
  if (file.size <= 0) {
    throw new Error("Selected profile photo is empty.");
  }

  const normalizedType = file.type.toLowerCase();
  if (!policy.allowed_mime_types.includes(normalizedType)) {
    throw new Error(
      `Profile photo must be ${policy.allowed_mime_types
        .map((type) => type.replace("image/", "").toUpperCase())
        .join(", ")}.`,
    );
  }

  const prepared = await compressProfilePhoto(file, policy);
  if (prepared.size > policy.max_bytes) {
    throw new Error(
      `Profile photo is ${formatBytes(prepared.size)} after compression. Maximum allowed size is ${formatBytes(
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

async function compressProfilePhoto(file: File, policy: ProfilePhotoPolicy): Promise<File> {
  const imageUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(imageUrl);
    const scale = Math.min(1, policy.max_width / image.width, policy.max_height / image.height);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, policy.output_mime_type, policy.jpeg_quality),
    );
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], renameAsJpeg(file.name), {
      type: policy.output_mime_type,
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
    image.onerror = () => reject(new Error("Profile photo could not be read."));
    image.src = src;
  });
}

function renameAsJpeg(name: string): string {
  return /\.[^.]+$/u.test(name) ? name.replace(/\.[^.]+$/u, ".jpg") : `${name}.jpg`;
}
