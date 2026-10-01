"use client";

import { CheckCircle2, CircleAlert, UploadCloud, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  DOCUMENT_ACCEPT,
  MAX_DOCUMENT_BYTES,
  SIGNATURE_BYTES,
  detectDocumentType,
  formatFileSize,
  isDocumentMimeType,
} from "@/lib/documents";
import { cn } from "@/lib/utils";

import { cancelDocumentUpload, finalizeDocumentUpload, prepareDocumentUpload } from "../actions";

type UploadStatus = "checking" | "uploading" | "verifying" | "done" | "error";

interface UploadItem {
  key: string;
  name: string;
  size: number;
  progress: number;
  status: UploadStatus;
  error?: string;
}

const MAX_FILES_PER_BATCH = 10;

async function preflight(file: File): Promise<string | null> {
  if (file.size === 0) return "This file is empty.";
  if (file.size > MAX_DOCUMENT_BYTES) return `Files must be ${formatFileSize(MAX_DOCUMENT_BYTES)} or smaller.`;
  if (!isDocumentMimeType(file.type)) return "Only PDF, JPEG and PNG files are supported.";
  const head = new Uint8Array(await file.slice(0, SIGNATURE_BYTES).arrayBuffer());
  if (detectDocumentType(head) !== file.type) return "This file's contents don't match its type.";
  return null;
}

function putWithProgress(url: string, file: File, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`status ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("network"));
    xhr.onabort = () => reject(new Error("aborted"));
    const body = new FormData();
    // max-age=0: private documents shouldn't be reused from browser or CDN caches after their
    // 60-second signed link expires (Supabase's default would keep them for an hour).
    body.append("cacheControl", "0");
    body.append("", file);
    xhr.send(body);
  });
}

export function DocumentUploader() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputId = useId();
  const zoneRef = useRef<HTMLLabelElement>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);

  // Quick-add "Upload document" highlights the drop zone (browsers only open file pickers
  // from a direct click).
  useEffect(() => {
    if (searchParams.get("upload") === "1") {
      zoneRef.current?.scrollIntoView({ block: "center" });
      zoneRef.current?.focus();
    }
  }, [searchParams]);

  const patch = (key: string, update: Partial<UploadItem>) =>
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...update } : item)));

  const uploadOne = async (file: File, key: string): Promise<boolean> => {
    const problem = await preflight(file);
    if (problem) {
      patch(key, { status: "error", error: problem });
      return false;
    }

    const prepared = await prepareDocumentUpload({ name: file.name, size: file.size, type: file.type });
    if (!prepared.ok) {
      patch(key, { status: "error", error: prepared.error });
      return false;
    }

    patch(key, { status: "uploading" });
    try {
      await putWithProgress(prepared.data.signedUrl, file, (progress) => patch(key, { progress }));
    } catch {
      await cancelDocumentUpload(prepared.data.documentId);
      patch(key, { status: "error", error: "Upload failed. Check your connection and try again." });
      return false;
    }

    patch(key, { status: "verifying", progress: 100 });
    const finalized = await finalizeDocumentUpload(prepared.data.documentId);
    if (!finalized.ok) {
      patch(key, { status: "error", error: finalized.error });
      return false;
    }
    patch(key, { status: "done" });
    return true;
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const files = Array.from(fileList).slice(0, MAX_FILES_PER_BATCH);
    if (fileList.length > MAX_FILES_PER_BATCH) {
      toast.info(`Uploading the first ${MAX_FILES_PER_BATCH} files. Add the rest in another batch.`);
    }
    const batch = files.map((file) => ({
      file,
      item: {
        key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: file.name,
        size: file.size,
        progress: 0,
        status: "checking" as UploadStatus,
      },
    }));
    setItems((prev) => [...batch.map((entry) => entry.item), ...prev].slice(0, 30));

    let succeeded = 0;
    for (const { file, item } of batch) {
      if (await uploadOne(file, item.key)) succeeded += 1;
    }
    if (succeeded > 0) {
      toast.success(succeeded === 1 ? "Document uploaded" : `${succeeded} documents uploaded`);
      router.refresh();
    }
  };

  const busy = items.some((item) => item.status === "checking" || item.status === "uploading" || item.status === "verifying");

  return (
    <div className="space-y-3">
      <label
        ref={zoneRef}
        htmlFor={inputId}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            document.getElementById(inputId)?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void handleFiles(event.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-card px-6 py-8 text-center transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          dragging ? "border-primary bg-accent" : "hover:border-foreground/30 hover:bg-muted/40",
        )}
      >
        <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <UploadCloud className="size-5" aria-hidden="true" />
        </span>
        <span className="text-sm font-medium">
          Drop files here or <span className="text-primary underline underline-offset-4">browse</span>
        </span>
        <span className="text-xs text-muted-foreground">
          PDF, JPEG or PNG · up to {formatFileSize(MAX_DOCUMENT_BYTES)} each · stored privately
        </span>
        <input
          id={inputId}
          type="file"
          multiple
          accept={DOCUMENT_ACCEPT}
          className="sr-only"
          disabled={busy}
          onChange={(event) => {
            void handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </label>

      {items.length > 0 ? (
        <ul className="space-y-2" aria-label="Uploads" aria-live="polite">
          {items.map((item) => (
            <li key={item.key} className="rounded-lg border bg-card px-3 py-2.5">
              <div className="flex items-center gap-3">
                {item.status === "done" ? (
                  <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
                ) : item.status === "error" ? (
                  <CircleAlert className="size-4 shrink-0 text-destructive" aria-hidden="true" />
                ) : (
                  <UploadCloud className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className={cn("text-xs", item.status === "error" ? "text-destructive" : "text-muted-foreground")}>
                    {item.status === "checking" && "Checking file…"}
                    {item.status === "uploading" && `Uploading · ${item.progress}% of ${formatFileSize(item.size)}`}
                    {item.status === "verifying" && "Verifying…"}
                    {item.status === "done" && `Uploaded · ${formatFileSize(item.size)}`}
                    {item.status === "error" && item.error}
                  </p>
                </div>
                {item.status === "done" || item.status === "error" ? (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Dismiss ${item.name}`}
                    onClick={() => setItems((prev) => prev.filter((entry) => entry.key !== item.key))}
                  >
                    <X aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
              {item.status === "uploading" || item.status === "verifying" ? (
                <Progress value={item.progress} className="mt-2 h-1" aria-label={`Upload progress for ${item.name}`} />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
