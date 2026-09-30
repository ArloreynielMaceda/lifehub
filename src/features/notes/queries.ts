import "server-only";

import { relativeTimeLabel } from "@/lib/dates";
import { toSearchPattern } from "@/lib/server-action";
import { createClient } from "@/lib/supabase/server";
import { reportQueryError, throwQueryError } from "@/lib/schema-status";
import type { Note } from "@/types/database";

import { NOTES_PAGE_SIZE, type NotesFilters } from "./schemas";

export type NoteSummary = Pick<Note, "id" | "title" | "pinned" | "updated_at"> & {
  excerpt: string;
  updatedLabel: string;
};

export async function listNotes(filters: NotesFilters, page: number, timeZone: string) {
  const supabase = await createClient();
  // Lists read the generated 280-character excerpt, never full note bodies.
  let query = supabase
    .from("notes")
    .select("id, title, pinned, updated_at, excerpt", { count: "exact" });
  if (filters.filter === "pinned") query = query.eq("pinned", true);
  if (filters.q) query = query.ilike("search_text", toSearchPattern(filters.q));

  const from = (page - 1) * NOTES_PAGE_SIZE;
  const { data, count, error } = await query
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, from + NOTES_PAGE_SIZE - 1);
  if (error) throwQueryError("notes:list", error, "Could not load notes");
  const now = new Date();
  const notes: NoteSummary[] = (data ?? []).map((note) => ({
    id: note.id,
    title: note.title,
    pinned: note.pinned,
    updated_at: note.updated_at,
    excerpt: note.excerpt,
    updatedLabel: relativeTimeLabel(note.updated_at, timeZone, now),
  }));
  return { notes, total: count ?? 0 };
}

export async function getNote(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notes")
    .select("id, title, content, pinned, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  reportQueryError("notes:load", error);
  return data;
}
