"use client";

import { useState, useTransition } from "react";

import { writeClientNote } from "@/app/(agent)/agent/clients/[clientId]/actions";
import { CLIENT_COPY } from "@/lib/agent/content";
import type { ClientNote } from "@/lib/agent/clientDetail";

/**
 * Screen 3.3.7's Notes tab — the one client island on this screen.
 *
 * SAME SHAPE AS `TripNotesEditor`: the server action is imported directly rather than
 * passed as a prop, because a plain function in a `"use client"` prop object typechecks,
 * passes tests, and throws at runtime across the RSC boundary.
 *
 * THE LIST IS SERVER-RENDERED AND `revalidatePath` REFRESHES IT. Nothing here keeps a local
 * copy of the notes: a composer that appended optimistically would need its own id, its own
 * author name and its own timestamp, all three of which the server already knows and one of
 * which (whether the body was actually stored, after trimming) it alone can answer.
 *
 * DELETE ASKS FIRST. It is the only destructive control on the detail surface, and a note
 * is the one thing here that cannot be reconstructed from anywhere else.
 */
export function ClientNotesTab({ clientId, notes }: { clientId: string; notes: ClientNote[] }) {
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(
    action: () => Promise<{ ok: boolean; message?: string }>,
    onDone?: () => void,
  ) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.message ?? CLIENT_COPY.noteFailed);
        return;
      }
      setSaved(true);
      onDone?.();
    });
  }

  return (
    <div className="flex flex-col gap-3.5">
      <section className="card p-4">
        <div className="t-label text-[var(--md-on-surface-variant)]">
          {CLIENT_COPY.noteComposerEyebrow}
        </div>
        <textarea
          className="input mt-1.5 h-20 resize-none p-3"
          placeholder={CLIENT_COPY.noteComposerPlaceholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={pending}
          aria-label={CLIENT_COPY.noteComposerEyebrow}
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            className="btn btn-tonal btn-sm"
            disabled={pending || draft.trim() === ""}
            onClick={() =>
              run(
                () => writeClientNote({ clientId, op: "create", body: draft }),
                () => setDraft(""),
              )
            }
          >
            {pending ? CLIENT_COPY.noteSaving : CLIENT_COPY.noteSave}
          </button>
          {saved && !error && (
            <span className="t-body-s text-[var(--md-on-surface-variant)]" role="status">
              {CLIENT_COPY.noteSaved}
            </span>
          )}
          {error && (
            <span className="t-body-s text-[var(--md-error)]" role="alert">
              {error}
            </span>
          )}
        </div>
      </section>

      {notes.length === 0 ? (
        <p className="t-body-s px-1 text-[var(--md-on-surface-variant)]">
          {CLIENT_COPY.notesEmpty}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map((n) => (
            <li key={n.noteId} className="card bg-[var(--md-surface-2)] p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="t-label-s text-brand-orange">{n.whenLabel}</span>
                <span className="t-body-s text-[var(--md-on-surface-variant)]">
                  · {n.authorName}
                  {n.edited ? ` · ${CLIENT_COPY.noteEditedMarker}` : ""}
                </span>
                {/* Only the author may edit — the accessor answers `author_is_me` and the
                    write function enforces it, so this is an affordance over a real rule. */}
                {n.mine && editingId !== n.noteId && confirmingId !== n.noteId && (
                  <span className="ml-auto flex gap-1">
                    <button
                      type="button"
                      className="btn btn-text btn-sm"
                      disabled={pending}
                      onClick={() => {
                        setEditingId(n.noteId);
                        setEditDraft(n.body);
                      }}
                    >
                      {CLIENT_COPY.noteEdit}
                    </button>
                    <button
                      type="button"
                      className="btn btn-text btn-sm"
                      disabled={pending}
                      onClick={() => setConfirmingId(n.noteId)}
                    >
                      {CLIENT_COPY.noteDelete}
                    </button>
                  </span>
                )}
              </div>

              {editingId === n.noteId ? (
                <>
                  <textarea
                    className="input mt-2 h-20 resize-none p-3"
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    disabled={pending}
                    aria-label={`Edit note from ${n.whenLabel}`}
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className="btn btn-tonal btn-sm"
                      disabled={pending || editDraft.trim() === ""}
                      onClick={() =>
                        run(
                          () =>
                            writeClientNote({
                              clientId,
                              op: "update",
                              noteId: n.noteId,
                              body: editDraft,
                            }),
                          () => setEditingId(null),
                        )
                      }
                    >
                      {pending ? CLIENT_COPY.noteSaving : CLIENT_COPY.noteSave}
                    </button>
                    <button
                      type="button"
                      className="btn btn-text btn-sm"
                      disabled={pending}
                      onClick={() => setEditingId(null)}
                    >
                      {CLIENT_COPY.noteCancel}
                    </button>
                  </div>
                </>
              ) : (
                <p className="t-body mt-1 whitespace-pre-wrap">{n.body}</p>
              )}

              {confirmingId === n.noteId && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="t-body-s text-[var(--md-on-surface-variant)]">
                    Delete this note?
                  </span>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => writeClientNote({ clientId, op: "archive", noteId: n.noteId }),
                        () => setConfirmingId(null),
                      )
                    }
                  >
                    {CLIENT_COPY.noteDelete}
                  </button>
                  <button
                    type="button"
                    className="btn btn-text btn-sm"
                    disabled={pending}
                    onClick={() => setConfirmingId(null)}
                  >
                    {CLIENT_COPY.noteCancel}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
