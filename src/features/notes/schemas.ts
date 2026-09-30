import { z } from "zod";

import { one, type RawSearchParams } from "@/lib/validation";

export const NOTE_TITLE_MAX = 200;
export const NOTE_CONTENT_MAX = 50_000;
export const NOTES_PAGE_SIZE = 24;

export const noteContentSchema = z.object({
  title: z.string().max(NOTE_TITLE_MAX, `Keep the title under ${NOTE_TITLE_MAX} characters`),
  content: z.string().max(NOTE_CONTENT_MAX, "This note is too long (50,000 characters max)"),
});

export type NoteContent = z.infer<typeof noteContentSchema>;

const notesFiltersSchema = z.object({
  q: z.string().trim().max(100).catch(""),
  filter: z.enum(["all", "pinned"]).catch("all"),
});

export type NotesFilters = z.output<typeof notesFiltersSchema>;

export function parseNotesFilters(params: RawSearchParams): NotesFilters {
  return notesFiltersSchema.parse({ q: one(params.q) ?? "", filter: one(params.filter) });
}
