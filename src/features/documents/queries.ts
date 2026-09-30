import "server-only";

import { toSearchPattern } from "@/lib/server-action";
import { createClient } from "@/lib/supabase/server";
import { throwQueryError } from "@/lib/schema-status";
import type { DocumentRecord } from "@/types/database";

export type DocumentItem = Pick<DocumentRecord, "id" | "name" | "mime_type" | "size_bytes" | "created_at">;

export const DOCUMENTS_PAGE_SIZE = 30;

export async function listDocuments(q: string, page: number) {
  const supabase = await createClient();
  let query = supabase
    .from("documents")
    .select("id, name, mime_type, size_bytes, created_at", { count: "exact" })
    .eq("status", "ready");
  if (q) query = query.ilike("name", toSearchPattern(q));
  const from = (page - 1) * DOCUMENTS_PAGE_SIZE;
  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, from + DOCUMENTS_PAGE_SIZE - 1);
  if (error) throwQueryError("documents:list", error, "Could not load documents");
  return { documents: (data ?? []) as DocumentItem[], total: count ?? 0 };
}

/** Count and total size. Bounded by the per-user document quota. */
export async function getDocumentUsage() {
  const supabase = await createClient();
  const { data } = await supabase.from("documents").select("size_bytes").eq("status", "ready").limit(1000);
  const rows = data ?? [];
  return { count: rows.length, bytes: rows.reduce((sum, row) => sum + Number(row.size_bytes), 0) };
}
