"use client";

import { ArrowLeft, Check, CloudOff, Loader2, Pin, PinOff, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

import { createNote, deleteNote, saveNote, setNotePinned } from "../actions";
import { NOTE_CONTENT_MAX, NOTE_TITLE_MAX } from "../schemas";

type SaveState = "empty" | "saved" | "dirty" | "saving" | "error";

export interface EditableNote {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  updatedLabel: string;
}

const AUTOSAVE_DELAY_MS = 900;

/**
 * Note editor with autosave. Saves are serialized (never two in flight), debounced while
 * typing, flushed on blur / tab hide / leaving the page, and a browser prompt guards against
 * closing the tab with unsaved changes. A new note is created on its first save and the URL
 * switches to /notes/<id> without remounting the editor.
 */
export function NoteEditor({ note }: { note: EditableNote | null }) {
  const router = useRouter();
  const [title, setTitle] = useState(note?.title ?? "");
  const [content, setContent] = useState(note?.content ?? "");
  const [pinned, setPinned] = useState(note?.pinned ?? false);
  const [state, setState] = useState<SaveState>(note ? "saved" : "empty");
  const [savedLabel, setSavedLabel] = useState(note?.updatedLabel ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const idRef = useRef<string | null>(note?.id ?? null);
  const latest = useRef({ title: note?.title ?? "", content: note?.content ?? "" });
  const lastSaved = useRef({ title: note?.title ?? "", content: note?.content ?? "" });
  const inFlight = useRef<Promise<void> | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isDirty = useCallback(
    () => latest.current.title !== lastSaved.current.title || latest.current.content !== lastSaved.current.content,
    [],
  );

  const save = useCallback(async (): Promise<void> => {
    window.clearTimeout(timer.current);
    // One save at a time; callers during a save share it, and the loop below picks up
    // any edits made while it was running.
    if (inFlight.current) return inFlight.current;

    const run = (async () => {
      while (isDirty()) {
        const snapshot = { ...latest.current };
        if (!idRef.current && !snapshot.title.trim() && !snapshot.content.trim()) {
          setState("empty"); // never create empty notes
          return;
        }
        setState("saving");
        let result: Awaited<ReturnType<typeof saveNote>>;
        if (idRef.current) {
          result = await saveNote(idRef.current, snapshot);
        } else {
          const created = await createNote(snapshot);
          if (created.ok) {
            idRef.current = created.data.id;
            window.history.replaceState(null, "", `/notes/${created.data.id}`);
          }
          result = created;
        }
        if (!result.ok) {
          setState("error");
          toast.error(result.error);
          return;
        }
        lastSaved.current = snapshot;
        setSavedLabel("Just now");
        setState("saved");
      }
    })();

    inFlight.current = run;
    try {
      await run;
    } finally {
      inFlight.current = null;
    }
  }, [isDirty]);

  const scheduleSave = () => {
    setState("dirty");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
  };

  // Guard the tab against closing with unsaved work; flush when the tab is hidden.
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (isDirty() || inFlight.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") void save();
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("visibilitychange", visibility);
      // Leaving the page inside the app: flush pending edits (the request still completes).
      void save();
    };
  }, [isDirty, save]);

  // Auto-grow the textarea.
  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.max(element.scrollHeight, 320)}px`;
  }, [content]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void save();
    }
  };

  const togglePin = async () => {
    await save();
    if (!idRef.current) {
      toast.info("Write something first, then pin the note.");
      return;
    }
    const next = !pinned;
    setPinned(next);
    const result = await setNotePinned(idRef.current, next);
    if (!result.ok) {
      setPinned(!next);
      toast.error(result.error);
    } else {
      toast.success(result.message ?? (next ? "Pinned" : "Unpinned"));
    }
  };

  const words = content.trim() ? content.trim().split(/\s+/).length : 0;

  return (
    <div className="mx-auto max-w-3xl" onKeyDown={onKeyDown}>
      <div className="mb-6 flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href="/notes">
            <ArrowLeft aria-hidden="true" /> All notes
          </Link>
        </Button>
        <div className="flex items-center gap-1.5">
          <SaveIndicator state={state} savedLabel={savedLabel} onRetry={() => void save()} />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={togglePin}
            aria-pressed={pinned}
            aria-label={pinned ? "Unpin note" : "Pin note"}
            className={cn(pinned ? "text-primary" : "text-muted-foreground")}
          >
            {pinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete note"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => (idRef.current ? setConfirmDelete(true) : router.push("/notes"))}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </div>

      <label htmlFor="note-title" className="sr-only">
        Title
      </label>
      <input
        id="note-title"
        value={title}
        maxLength={NOTE_TITLE_MAX}
        placeholder="Untitled"
        autoFocus={!note}
        onChange={(event) => {
          setTitle(event.target.value);
          latest.current.title = event.target.value;
          scheduleSave();
        }}
        onBlur={() => void save()}
        className="w-full bg-transparent font-display text-4xl leading-tight outline-none placeholder:text-muted-foreground/50 sm:text-5xl"
      />
      <label htmlFor="note-content" className="sr-only">
        Note
      </label>
      <textarea
        id="note-content"
        ref={textareaRef}
        value={content}
        maxLength={NOTE_CONTENT_MAX}
        placeholder="Start writing…"
        onChange={(event) => {
          setContent(event.target.value);
          latest.current.content = event.target.value;
          scheduleSave();
        }}
        onBlur={() => void save()}
        className="mt-4 w-full resize-none bg-transparent text-base leading-7 outline-none placeholder:text-muted-foreground/60"
      />
      <p className="mt-6 flex items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
        <span className="tabular">{words.toLocaleString("en-US")} words</span>
        <span aria-hidden="true">·</span>
        <span className="hidden sm:inline">
          Saves automatically. Press <Kbd>Ctrl</Kbd> <Kbd>S</Kbd> to save now.
        </span>
        <span className="sm:hidden">Saves automatically</span>
      </p>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this note?"
        description="The note will be permanently deleted. This can't be undone."
        onConfirm={async () => {
          if (!idRef.current) return;
          window.clearTimeout(timer.current);
          const result = await deleteNote(idRef.current);
          if (!result.ok) {
            toast.error(result.error);
            return false;
          }
          // Prevent the unmount flush from recreating the note.
          lastSaved.current = { ...latest.current };
          idRef.current = null;
          toast.success(result.message ?? "Note deleted");
          router.push("/notes");
        }}
      />
    </div>
  );
}

function SaveIndicator({ state, savedLabel, onRetry }: { state: SaveState; savedLabel: string; onRetry: () => void }) {
  return (
    <span role="status" aria-live="polite" className="mr-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      {state === "saving" ? (
        <>
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Saving…
        </>
      ) : state === "dirty" ? (
        <>Unsaved changes</>
      ) : state === "error" ? (
        <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 text-destructive hover:underline">
          <CloudOff className="size-3.5" aria-hidden="true" /> Not saved — retry
        </button>
      ) : state === "saved" ? (
        <>
          <Check className="size-3.5 text-primary" aria-hidden="true" /> Saved{savedLabel ? ` · ${savedLabel}` : ""}
        </>
      ) : (
        <>New note</>
      )}
    </span>
  );
}
