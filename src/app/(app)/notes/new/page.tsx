import type { Metadata } from "next";

import { NoteEditor } from "@/features/notes/components/note-editor";

export const metadata: Metadata = { title: "New note" };

export default function NewNotePage() {
  return <NoteEditor note={null} />;
}
