import { describe, expect, it } from "vitest";

import {
  buildStoragePath,
  detectDocumentType,
  formatFileSize,
  isDocumentMimeType,
  sanitizeFileName,
} from "@/lib/documents";
import { safeNextPath } from "@/lib/safe-redirect";

describe("safeNextPath", () => {
  it("allows same-origin relative paths", () => {
    expect(safeNextPath("/tasks")).toBe("/tasks");
    expect(safeNextPath("/tasks?view=calendar#today")).toBe("/tasks?view=calendar#today");
  });

  it("blocks open redirects", () => {
    for (const next of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "evil.example",
      "/%0d%0aLocation:evil",
      "/tasks\nfoo",
      "",
      null,
      undefined,
    ]) {
      const result = safeNextPath(next as string | null | undefined);
      expect(result.startsWith("/"), String(next)).toBe(true);
      expect(result.startsWith("//")).toBe(false);
      if (next && !next.startsWith("/%0d")) expect(result).toBe("/dashboard");
    }
  });

  it("uses a custom fallback", () => {
    expect(safeNextPath("https://x.y", "/settings")).toBe("/settings");
  });
});

const bytes = (...values: number[]) => new Uint8Array(values);

describe("detectDocumentType", () => {
  it("recognises allowed signatures", () => {
    expect(detectDocumentType(bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37))).toBe("application/pdf");
    expect(detectDocumentType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(detectDocumentType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0))).toBe("image/jpeg");
  });

  it("rejects other or disguised content", () => {
    const html = new TextEncoder().encode("<html><script>");
    const svg = new TextEncoder().encode("<svg xmlns=");
    const zip = bytes(0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0); // docx/zip
    const exe = bytes(0x4d, 0x5a, 0x90, 0, 0, 0, 0, 0); // Windows PE
    for (const sample of [html, svg, zip, exe, bytes(), bytes(0x25, 0x50)]) {
      expect(detectDocumentType(sample)).toBeNull();
    }
  });
});

describe("file names and paths", () => {
  it("sanitizes display names", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("C:\\Users\\me\\Tax Return 2025.pdf")).toBe("Tax Return 2025.pdf");
    expect(sanitizeFileName('bad<>:"|?*name.png')).toBe("badname.png");
    expect(sanitizeFileName("   ")).toBe("document");
    expect(sanitizeFileName(".hidden.pdf")).toBe("hidden.pdf");
    const long = `${"a".repeat(300)}.pdf`;
    const cleaned = sanitizeFileName(long);
    expect(cleaned.length).toBeLessThanOrEqual(120);
    expect(cleaned.endsWith(".pdf")).toBe(true);
  });

  it("builds randomized per-user storage paths", () => {
    expect(
      buildStoragePath(
        "11111111-1111-4111-8111-111111111111",
        "0f0e0d0c-0b0a-4908-8706-050403020100",
        "image/jpeg",
      ),
    ).toBe("11111111-1111-4111-8111-111111111111/0f0e0d0c-0b0a-4908-8706-050403020100.jpg");
  });

  it("checks MIME types and formats sizes", () => {
    expect(isDocumentMimeType("application/pdf")).toBe(true);
    expect(isDocumentMimeType("image/svg+xml")).toBe(false);
    expect(isDocumentMimeType("toString")).toBe(false);
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2.0 KB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
