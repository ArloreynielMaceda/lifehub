import { NotebookPen, Pin, Plus, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { FilterTabs } from "@/components/shared/filter-tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination, parsePage } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { NotesSearch } from "@/features/notes/components/notes-search";
import { listNotes, type NoteSummary } from "@/features/notes/queries";
import { NOTES_PAGE_SIZE, parseNotesFilters } from "@/features/notes/schemas";
import { getUserContext } from "@/lib/auth";
import { flattenSearchParams } from "@/lib/validation";

export const metadata: Metadata = { title: "Notes" };

function NoteCard({ note }: { note: NoteSummary }) {
  return (
    <li>
      <Link
        href={`/notes/${note.id}`}
        className="group flex h-full min-h-40 flex-col rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:p-5"
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className={note.title ? "line-clamp-2 font-semibold" : "font-semibold text-muted-foreground"}>
            {note.title || "Untitled"}
          </h3>
          {note.pinned ? (
            <Pin className="mt-0.5 size-4 shrink-0 text-primary" aria-label="Pinned" />
          ) : null}
        </div>
        <p className="mt-2 line-clamp-4 flex-1 text-sm whitespace-pre-line text-muted-foreground">
          {note.excerpt || "No content"}
        </p>
        <p className="mt-3 text-xs text-muted-foreground">Edited {note.updatedLabel.toLowerCase() === "just now" ? "just now" : note.updatedLabel}</p>
      </Link>
    </li>
  );
}

export default async function NotesPage({ searchParams }: PageProps<"/notes">) {
  const raw = await searchParams;
  const filters = parseNotesFilters(raw);
  const page = parsePage(raw.page);
  const { timezone } = await getUserContext();
  const { notes, total } = await listNotes(filters, page, timezone);
  const pinned = notes.filter((note) => note.pinned);
  const others = notes.filter((note) => !note.pinned);
  const grouped = filters.filter === "all" && pinned.length > 0 && others.length > 0;

  return (
    <>
      <PageHeader
        title="Notes"
        description="Lists, ideas and anything worth writing down. Pinned notes stay on top."
        actions={
          <Button asChild>
            <Link href="/notes/new">
              <Plus aria-hidden="true" /> New note
            </Link>
          </Button>
        }
      />
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <FilterTabs
            param="filter"
            label="Note filters"
            value={filters.filter}
            defaultValue="all"
            options={[
              { value: "all", label: "All notes" },
              { value: "pinned", label: "Pinned" },
            ]}
          />
          <NotesSearch value={filters.q} />
        </div>

        {notes.length === 0 ? (
          filters.q || filters.filter === "pinned" ? (
            <EmptyState
              icon={<SearchX />}
              title={filters.q ? "No notes match your search" : "No pinned notes"}
              description={filters.q ? "Try different words." : "Pin a note from the editor to keep it on top."}
            />
          ) : (
            <EmptyState
              icon={<NotebookPen />}
              title="No notes yet"
              description="Capture a grocery list, meeting notes or an idea. Notes save automatically as you type."
              action={
                <Button asChild>
                  <Link href="/notes/new">
                    <Plus aria-hidden="true" /> Write your first note
                  </Link>
                </Button>
              }
            />
          )
        ) : grouped ? (
          <div className="space-y-6">
            <section aria-labelledby="pinned-heading">
              <h2 id="pinned-heading" className="eyebrow mb-2">Pinned</h2>
              <ul role="list" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {pinned.map((note) => <NoteCard key={note.id} note={note} />)}
              </ul>
            </section>
            <section aria-labelledby="others-heading">
              <h2 id="others-heading" className="eyebrow mb-2">Others</h2>
              <ul role="list" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {others.map((note) => <NoteCard key={note.id} note={note} />)}
              </ul>
            </section>
          </div>
        ) : (
          <ul role="list" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {notes.map((note) => <NoteCard key={note.id} note={note} />)}
          </ul>
        )}
        <Pagination
          page={page}
          pageSize={NOTES_PAGE_SIZE}
          total={total}
          basePath="/notes"
          searchParams={flattenSearchParams(raw)}
          itemLabel="notes"
        />
      </div>
    </>
  );
}
