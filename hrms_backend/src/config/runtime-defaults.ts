export const defaultMediaMimeTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
] as const;

export const runtimeDefaults = {
  MEDIA_UPLOAD_MAX_BYTES: 10 * 1024 * 1024,
  MEDIA_IMAGE_MAX_WIDTH: 1600,
  MEDIA_IMAGE_MAX_HEIGHT: 1600,
  MEDIA_IMAGE_JPEG_QUALITY: 0.82,
  MEDIA_ALLOWED_MIME_TYPES: defaultMediaMimeTypes.join(","),
  MEDIA_CLOUDINARY_UPLOAD_TRANSFORMATION: "q_auto:eco,f_auto",

  COMPANY_LOGO_MAX_BYTES: 2 * 1024 * 1024,
  COMPANY_LOGO_MAX_WIDTH: 512,
  COMPANY_LOGO_MAX_HEIGHT: 512,
  COMPANY_LOGO_JPEG_QUALITY: 0.82,
  COMPANY_LOGO_ALLOWED_MIME_TYPES: "image/jpeg,image/png,image/webp",
  COMPANY_LOGO_CLOUDINARY_TRANSFORMATION: "c_fit,w_512,h_512,q_auto:eco,f_auto",

  PROFILE_PHOTO_MAX_BYTES: 2 * 1024 * 1024,
  PROFILE_PHOTO_MAX_WIDTH: 512,
  PROFILE_PHOTO_MAX_HEIGHT: 512,
  PROFILE_PHOTO_JPEG_QUALITY: 0.82,
  PROFILE_PHOTO_ALLOWED_MIME_TYPES: "image/jpeg,image/png,image/webp",
  PROFILE_PHOTO_CLOUDINARY_TRANSFORMATION: "c_fill,g_face,w_512,h_512,q_auto:eco,f_auto",

  PDF_COMPRESSION_MIN_BYTES: 128 * 1024,

  EMAIL_VERIFICATION_TOKEN_TTL_SECONDS: 24 * 60 * 60,
  EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS: 60,
  EMAIL_VERIFICATION_RESEND_HOURLY_LIMIT: 5,
  EMAIL_VERIFICATION_RESEND_DAILY_LIMIT: 10
} as const;
