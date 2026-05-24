export const MAX_DOCUMENT_UPLOAD_BYTES = 10 * 1024 * 1024;

export interface PreparedDocumentUploadFile {
  file: File;
  compressed: boolean;
  originalSize: number;
}

export async function prepareDocumentUploadFile(file: File): Promise<PreparedDocumentUploadFile> {
  if (file.size <= 0) {
    throw new Error("Selected file is empty.");
  }

  const prepared = file.type.startsWith("image/") ? await prepareImageUploadFile(file) : file;
  if (prepared.size > MAX_DOCUMENT_UPLOAD_BYTES) {
    throw new Error(
      `File is ${formatBytes(prepared.size)}. Maximum allowed upload size is ${formatBytes(
        MAX_DOCUMENT_UPLOAD_BYTES,
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

async function prepareImageUploadFile(file: File): Promise<File> {
  const compressed = await compressImageFile(file);
  if (!compressed || compressed.size >= file.size) {
    return file;
  }
  return compressed;
}

async function compressImageFile(file: File): Promise<File | null> {
  const imageUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(imageUrl);
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
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
      canvas.toBlob(resolve, "image/jpeg", 0.82),
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
