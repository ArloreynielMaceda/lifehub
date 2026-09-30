"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, SESSION_EXPIRED, fail, ok } from "@/lib/action-result";
import {
  DOCUMENTS_BUCKET,
  DOCUMENT_MIME_TYPES,
  MAX_DOCUMENTS_PER_USER,
  MAX_DOCUMENT_BYTES,
  SIGNATURE_BYTES,
  SIGNED_URL_TTL_SECONDS,
  buildStoragePath,
  detectDocumentType,
  sanitizeFileName,
} from "@/lib/documents";
import { type ActionContext, getActionContext, toUserError } from "@/lib/server-action";
import { idSchema } from "@/lib/validation";

const uploadRequestSchema = z.object({
  name: z.string().min(1).max(255),
  size: z
    .number()
    .int()
    .positive("The file is empty")
    .max(MAX_DOCUMENT_BYTES, `Files must be ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB or smaller`),
  type: z.enum(DOCUMENT_MIME_TYPES, "Only PDF, JPEG and PNG files are supported"),
});

const PENDING_TTL_MS = 60 * 60 * 1000;

/** Removes the caller's abandoned uploads (older than an hour). */
async function cleanupStalePending(ctx: ActionContext) {
  const cutoff = new Date(Date.now() - PENDING_TTL_MS).toISOString();
  const { data } = await ctx.supabase
    .from("documents")
    .select("id, storage_path")
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .limit(50);
  if (!data?.length) return;
  await ctx.supabase.storage.from(DOCUMENTS_BUCKET).remove(data.map((row) => row.storage_path));
  await ctx.supabase
    .from("documents")
    .delete()
    .in(
      "id",
      data.map((row) => row.id),
    );
}

async function discard(ctx: ActionContext, id: string, path: string) {
  await ctx.supabase.storage.from(DOCUMENTS_BUCKET).remove([path]);
  await ctx.supabase.from("documents").delete().eq("id", id);
}

export interface PreparedUpload {
  documentId: string;
  signedUrl: string;
}

/**
 * Step 1: validate the declared file, reserve a randomized path inside the user's folder
 * and return a signed upload URL. The browser uploads straight to Storage (no size limits
 * from serverless functions) and reports progress.
 */
export async function prepareDocumentUpload(input: unknown): Promise<ActionResult<PreparedUpload>> {
  const ctx = await getActionContext();
  if (!ctx) return fail(SESSION_EXPIRED);
  const parsed = uploadRequestSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "This file can't be uploaded.");

  await cleanupStalePending(ctx);

  const { count } = await ctx.supabase.from("documents").select("id", { count: "exact", head: true });
  if ((count ?? 0) >= MAX_DOCUMENTS_PER_USER) {
    return fail(`Your vault is full (${MAX_DOCUMENTS_PER_USER} documents). Delete something to make room.`);
  }

  const path = buildStoragePath(ctx.userId, randomUUID(), parsed.data.type);
  const { data: row, error } = await ctx.supabase
    .from("documents")
    .insert({
      name: sanitizeFileName(parsed.data.name),
      storage_path: path,
      mime_type: parsed.data.type,
      size_bytes: parsed.data.size,
    })
    .select("id")
    .single();
  if (error || !row) return fail(toUserError("documents:prepare", error));

  const { data: signed, error: signError } = await ctx.supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUploadUrl(path);
  if (signError || !signed) {
    await ctx.supabase.from("documents").delete().eq("id", row.id);
    console.error("[documents] signed upload url failed", { message: signError?.message });
    return fail("Uploads are unavailable right now. Please try again.");
  }

  return ok({ documentId: row.id, signedUrl: signed.signedUrl });
}

/** Reads the first bytes of a stored object without downloading all of it. */
async function readSignature(ctx: ActionContext, path: string): Promise<Uint8Array | null> {
  const { data } = await ctx.supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(path, 30);
  if (!data?.signedUrl) return null;
  const response = await fetch(data.signedUrl, {
    headers: { Range: `bytes=0-${SIGNATURE_BYTES - 1}` },
    cache: "no-store",
  });
  if (!response.ok || !response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (received < SIGNATURE_BYTES) {
    const { value, done } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    received += value.length;
  }
  await reader.cancel().catch(() => undefined);
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes.slice(0, SIGNATURE_BYTES);
}

/**
 * Step 2: verify what actually landed in Storage — size, declared content type and the
 * file's magic bytes — before the document becomes visible. Anything suspicious is deleted.
 */
export async function finalizeDocumentUpload(id: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await getActionContext();
  if (!ctx) return fail(SESSION_EXPIRED);
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return fail("Upload not found.");

  const { data: doc } = await ctx.supabase
    .from("documents")
    .select("id, storage_path, mime_type, status")
    .eq("id", parsedId.data)
    .maybeSingle();
  if (!doc) return fail("Upload not found.");
  if (doc.status === "ready") return ok({ id: doc.id });

  const { data: info, error: infoError } = await ctx.supabase.storage
    .from(DOCUMENTS_BUCKET)
    .info(doc.storage_path);
  if (infoError || !info) {
    await discard(ctx, doc.id, doc.storage_path);
    return fail("The upload didn't finish. Please try again.");
  }

  const size = Number(info.size ?? 0);
  const contentType = String(info.contentType ?? "").split(";")[0]?.trim();
  if (size <= 0 || size > MAX_DOCUMENT_BYTES || contentType !== doc.mime_type) {
    await discard(ctx, doc.id, doc.storage_path);
    return fail("This file doesn't match the allowed types or size.");
  }

  const signature = await readSignature(ctx, doc.storage_path);
  if (!signature || detectDocumentType(signature) !== doc.mime_type) {
    await discard(ctx, doc.id, doc.storage_path);
    return fail("This file's contents don't look like a real PDF, JPEG or PNG.");
  }

  const { error } = await ctx.supabase
    .from("documents")
    .update({ status: "ready", size_bytes: size })
    .eq("id", doc.id);
  if (error) return fail(toUserError("documents:finalize", error));

  revalidatePath("/documents");
  return ok({ id: doc.id });
}

/** Cleans up after an upload the browser could not complete. */
export async function cancelDocumentUpload(id: unknown): Promise<ActionResult> {
  const ctx = await getActionContext();
  if (!ctx) return fail(SESSION_EXPIRED);
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return fail("Upload not found.");
  const { data: doc } = await ctx.supabase
    .from("documents")
    .select("id, storage_path")
    .eq("id", parsedId.data)
    .eq("status", "pending")
    .maybeSingle();
  if (doc) await discard(ctx, doc.id, doc.storage_path);
  return ok(null);
}

/**
 * Returns a short-lived (60 s) signed URL for the owner. RLS on `documents` and the storage
 * policies both ensure users can only sign URLs for their own files.
 */
export async function getDocumentUrl(id: unknown, mode: unknown): Promise<ActionResult<{ url: string }>> {
  const ctx = await getActionContext();
  if (!ctx) return fail(SESSION_EXPIRED);
  const parsedId = idSchema.safeParse(id);
  const parsedMode = z.enum(["view", "download"]).safeParse(mode);
  if (!parsedId.success || !parsedMode.success) return fail("Invalid request.");

  const { data: doc } = await ctx.supabase
    .from("documents")
    .select("name, storage_path")
    .eq("id", parsedId.data)
    .eq("status", "ready")
    .maybeSingle();
  if (!doc) return fail("That document could not be found.");

  const { data, error } = await ctx.supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(doc.storage_path, SIGNED_URL_TTL_SECONDS, parsedMode.data === "download" ? { download: doc.name } : undefined);
  if (error || !data?.signedUrl) {
    console.error("[documents] signed url failed", { message: error?.message });
    return fail("Couldn't open the document. Please try again.");
  }
  return ok({ url: data.signedUrl });
}

export async function deleteDocument(id: unknown): Promise<ActionResult> {
  const ctx = await getActionContext();
  if (!ctx) return fail(SESSION_EXPIRED);
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return fail("That document could not be found.");

  const { data: doc } = await ctx.supabase
    .from("documents")
    .select("id, storage_path")
    .eq("id", parsedId.data)
    .maybeSingle();
  if (!doc) return fail("That document could not be found.");

  const { error: storageError } = await ctx.supabase.storage.from(DOCUMENTS_BUCKET).remove([doc.storage_path]);
  if (storageError) {
    console.error("[documents] storage delete failed", { message: storageError.message });
    return fail("Couldn't delete the file. Please try again.");
  }
  const { error } = await ctx.supabase.from("documents").delete().eq("id", doc.id);
  if (error) return fail(toUserError("documents:delete", error));

  revalidatePath("/documents");
  return ok(null, "Document deleted");
}
