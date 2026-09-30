import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { NoteEditor } from "@/features/notes/components/note-editor";
import { getNote } from "@/features/notes/queries";
import { getUserContext } from "@/lib/auth";
import { relativeTimeLabel } from "@/lib/dates";
import { idSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Note" };

export default async function NotePage({ params }: PageProps<"/notes/[id]">) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();

  const [{ timezone }, note] = await Promise.all([getUserContext(), getNote(id)]);
  // RLS returns nothing for notes owned by someone else, so this is also the ownership check.
  if (!note) notFound();

  return (
    <NoteEditor
      key={note.id}
      note={{
        id: note.id,
        title: note.title,
        content: note.content,
        pinned: note.pinned,
        updatedLabel: relativeTimeLabel(note.updated_at, timezone),
      }}
    />
  );
}
