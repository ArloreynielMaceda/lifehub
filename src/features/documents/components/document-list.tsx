"use client";

import { Download, Eye, FileImage, FileText, MoreHorizontal, Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { DOCUMENT_TYPES, formatFileSize, isDocumentMimeType } from "@/lib/documents";

import { deleteDocument, getDocumentUrl } from "../actions";

export interface DocumentRow {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  uploadedLabel: string;
}

function typeLabel(mime: string) {
  return isDocumentMimeType(mime) ? DOCUMENT_TYPES[mime].label : "File";
}

function DocumentActions({ doc, onPreview }: { doc: DocumentRow; onPreview: (doc: DocumentRow) => void }) {
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isImage = doc.mime_type.startsWith("image/");

  const open = (mode: "view" | "download") => {
    if (mode === "view" && isImage) {
      onPreview(doc);
      return;
    }
    // Open the tab synchronously (inside the click) so pop-up blockers allow it.
    const tab = mode === "view" ? window.open("about:blank", "_blank") : null;
    if (tab) tab.opener = null;
    startTransition(async () => {
      const result = await getDocumentUrl(doc.id, mode);
      if (!result.ok) {
        tab?.close();
        toast.error(result.error);
        return;
      }
      if (tab) tab.location.href = result.data.url;
      else window.location.assign(result.data.url); // attachment: the page stays put
    });
  };

  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="sm" onClick={() => open("view")} disabled={pending} className="hidden sm:inline-flex">
        {pending ? <Spinner aria-hidden="true" /> : <Eye aria-hidden="true" />}
        {isImage ? "Preview" : "Open"}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${doc.name}`} className="text-muted-foreground">
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => open("view")}>
            <Eye aria-hidden="true" /> {isImage ? "Preview" : "Open"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => open("download")}>
            <Download aria-hidden="true" /> Download
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmOpen(true)}>
            <Trash2 aria-hidden="true" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete this document?"
        description={`"${doc.name}" will be permanently removed from your vault.`}
        onConfirm={async () => {
          const result = await deleteDocument(doc.id);
          if (!result.ok) {
            toast.error(result.error);
            return false;
          }
          toast.success(result.message ?? "Document deleted");
        }}
      />
    </div>
  );
}

function ImagePreview({ doc, onClose }: { doc: DocumentRow | null; onClose: () => void }) {
  const [loaded, setLoaded] = useState<{ id: string; url: string | null; error: string | null } | null>(null);

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    void getDocumentUrl(doc.id, "view").then((result) => {
      if (cancelled) return;
      setLoaded({ id: doc.id, url: result.ok ? result.data.url : null, error: result.ok ? null : result.error });
    });
    return () => {
      cancelled = true;
    };
  }, [doc]);

  const state = doc && loaded?.id === doc.id ? loaded : null;

  return (
    <Dialog open={!!doc} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{doc?.name}</DialogTitle>
          <DialogDescription>Private preview · link expires in 60 seconds</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-64 items-center justify-center overflow-hidden rounded-lg bg-muted">
          {state?.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : state?.url ? (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not optimizable
            <img src={state.url} alt={doc?.name ?? "Document preview"} className="max-h-[70dvh] w-auto object-contain" referrerPolicy="no-referrer" />
          ) : (
            <Spinner className="text-muted-foreground" aria-label="Loading preview" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DocumentList({ documents }: { documents: DocumentRow[] }) {
  const [preview, setPreview] = useState<DocumentRow | null>(null);
  return (
    <>
      <ul role="list" className="divide-y overflow-hidden rounded-xl border bg-card">
        {documents.map((doc) => {
          const Icon = doc.mime_type === "application/pdf" ? FileText : FileImage;
          return (
            <li key={doc.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={doc.name}>
                  {doc.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {typeLabel(doc.mime_type)} · {formatFileSize(doc.size_bytes)} · {doc.uploadedLabel}
                </p>
              </div>
              <DocumentActions doc={doc} onPreview={setPreview} />
            </li>
          );
        })}
      </ul>
      <ImagePreview doc={preview} onClose={() => setPreview(null)} />
    </>
  );
}
