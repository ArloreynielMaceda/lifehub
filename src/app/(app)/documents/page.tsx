import { FolderLock, SearchX, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination, parsePage } from "@/components/shared/pagination";
import { DocumentList } from "@/features/documents/components/document-list";
import { DocumentSearch } from "@/features/documents/components/document-search";
import { DocumentUploader } from "@/features/documents/components/document-uploader";
import { DOCUMENTS_PAGE_SIZE, getDocumentUsage, listDocuments } from "@/features/documents/queries";
import { getUserContext } from "@/lib/auth";
import { formatTimestamp } from "@/lib/dates";
import { MAX_DOCUMENTS_PER_USER, formatFileSize } from "@/lib/documents";
import { flattenSearchParams, one } from "@/lib/validation";

export const metadata: Metadata = { title: "Documents" };

export default async function DocumentsPage({ searchParams }: PageProps<"/documents">) {
  const raw = await searchParams;
  const q = (one(raw.q) ?? "").trim().slice(0, 100);
  const page = parsePage(raw.page);
  const { timezone } = await getUserContext();
  const [{ documents, total }, usage] = await Promise.all([listDocuments(q, page), getDocumentUsage()]);

  return (
    <>
      <PageHeader
        title="Documents"
        description="A private vault for IDs, receipts, certificates and other important files."
      />
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <DocumentUploader />
          <aside className="rounded-xl border bg-card p-4 text-sm sm:p-5">
            <p className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="size-4 text-primary" aria-hidden="true" /> Private by design
            </p>
            <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
              <li>Files are stored in a private bucket, in a folder only your account can access.</li>
              <li>Links to open or download expire after 60 seconds.</li>
              <li>Every upload is checked to be a genuine PDF, JPEG or PNG.</li>
            </ul>
            <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{usage.count}</span> of {MAX_DOCUMENTS_PER_USER} documents ·{" "}
              {formatFileSize(usage.bytes)} used
            </p>
          </aside>
        </div>

        <section aria-labelledby="vault-heading" className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 id="vault-heading" className="text-[0.95rem] font-semibold">
              Your files
            </h2>
            <DocumentSearch value={q} />
          </div>
          {documents.length === 0 ? (
            q ? (
              <EmptyState icon={<SearchX />} title="No documents match your search" description="Try a different file name." />
            ) : (
              <EmptyState
                icon={<FolderLock />}
                title="Your vault is empty"
                description="Upload scans of your ID, insurance card, receipts or warranties so they're there when you need them."
              />
            )
          ) : (
            <DocumentList
              documents={documents.map((doc) => ({
                id: doc.id,
                name: doc.name,
                mime_type: doc.mime_type,
                size_bytes: doc.size_bytes,
                uploadedLabel: `Added ${formatTimestamp(doc.created_at, timezone, "date")}`,
              }))}
            />
          )}
          <Pagination
            page={page}
            pageSize={DOCUMENTS_PAGE_SIZE}
            total={total}
            basePath="/documents"
            searchParams={flattenSearchParams(raw)}
            itemLabel="documents"
          />
        </section>
      </div>
    </>
  );
}
