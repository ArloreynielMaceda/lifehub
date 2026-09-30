/**
 * Document vault rules shared by the browser (pre-flight checks) and the server
 * (authoritative checks). Only inert, commonly used formats are allowed; SVG, HTML and Office
 * files are deliberately excluded because they can carry active content.
 */

export const DOCUMENTS_BUCKET = "documents";
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10 MB, mirrored by the bucket limit
export const MAX_DOCUMENTS_PER_USER = 200; // mirrored by a database trigger
export const SIGNED_URL_TTL_SECONDS = 60;

export const DOCUMENT_TYPES = {
  "application/pdf": { extension: "pdf", label: "PDF" },
  "image/jpeg": { extension: "jpg", label: "JPEG image" },
  "image/png": { extension: "png", label: "PNG image" },
} as const;

export type DocumentMimeType = keyof typeof DOCUMENT_TYPES;
export const DOCUMENT_MIME_TYPES = Object.keys(DOCUMENT_TYPES) as DocumentMimeType[];
export const DOCUMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

export function isDocumentMimeType(value: unknown): value is DocumentMimeType {
  return typeof value === "string" && Object.hasOwn(DOCUMENT_TYPES, value);
}

/** Number of leading bytes needed to recognise every allowed type. */
export const SIGNATURE_BYTES = 8;

/** Detects the real file type from its magic bytes. */
export function detectDocumentType(bytes: Uint8Array): DocumentMimeType | null {
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d // -
  ) {
    return "application/pdf";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  return null;
}

/**
 * Produces a safe display name: strips directories, control and reserved characters,
 * collapses whitespace and limits length while keeping the extension.
 */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001F\u007F<>:"|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  if (!cleaned) return "document";
  if (cleaned.length <= 120) return cleaned;
  const dot = cleaned.lastIndexOf(".");
  const extension = dot > 0 && cleaned.length - dot <= 6 ? cleaned.slice(dot) : "";
  return cleaned.slice(0, 120 - extension.length).trimEnd() + extension;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Storage object path: `<user id>/<random uuid>.<ext>` — never derived from the file name. */
export function buildStoragePath(userId: string, objectId: string, mime: DocumentMimeType): string {
  return `${userId}/${objectId}.${DOCUMENT_TYPES[mime].extension}`;
}
