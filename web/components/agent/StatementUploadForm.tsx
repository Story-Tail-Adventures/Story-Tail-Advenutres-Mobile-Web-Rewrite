"use client";

import { startTransition, useActionState, useState } from "react";
import Box from "@mui/material/Box";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";

import { uploadStatementAction } from "@/app/(agent)/agent/commission/import/actions";
import NextLink from "@/components/mui/NextLink";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { STATEMENT_COPY } from "@/lib/agent/content";
import { MAX_STATEMENT_BYTES, type UploadState } from "@/lib/agent/statementForm";

/**
 * 3.7.5's Step 1 card body: the prototype's dashed drop area, which is a real `<label>` around
 * a real file input — so clicking anywhere in it opens the picker, a file dropped on it lands
 * in the input, and a keyboard reaches the input itself.
 *
 * The size and type are checked HERE first, so a wrong file is named before 500 KB crosses
 * the network; the server action and the Edge Function check them again.
 */
export function StatementUploadForm() {
  const [state, formAction, pending] = useActionState<UploadState, FormData>(uploadStatementAction, {});
  const [chosen, setChosen] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  // A server refusal belongs to the file it was about; picking another file hides it.
  const [stateSeen, setStateSeen] = useState<UploadState | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The file is read off the input itself and set on the FormData explicitly: the form's
    // own FormData is not guaranteed to carry an input's `files` (jsdom's does not, when a
    // test sets them), and the check below must look at the same file the action receives.
    // `namedItem("file")` is the one <input name="file"> this component renders.
    const input = event.currentTarget.elements.namedItem("file") as HTMLInputElement | null;
    const file = input?.files?.[0];
    const data = new FormData(event.currentTarget);
    if (file) data.set("file", file);
    if (!file || file.size === 0) {
      setLocalError(STATEMENT_COPY.noFile);
      return;
    }
    if (file.size > MAX_STATEMENT_BYTES) {
      setLocalError(STATEMENT_COPY.tooBig);
      return;
    }
    setLocalError(null);
    setStateSeen(null);
    startTransition(() => formAction(data));
  }

  const serverError = state === stateSeen ? undefined : state.formError;
  const error = localError ?? serverError;

  /** A file dropped anywhere on the zone, not only on the input inside it. */
  function onDrop(event: React.DragEvent<HTMLLabelElement>) {
    const files = event.dataTransfer.files;
    const input = document.getElementById("statement-file") as HTMLInputElement | null;
    if (!input || files.length === 0) return;
    event.preventDefault();
    input.files = files;
    setChosen(files[0].name);
    setLocalError(null);
    setStateSeen(state);
  }

  return (
    <Box component="form" action={formAction} onSubmit={onSubmit}>
      <Box
        component="label"
        htmlFor="statement-file"
        onDragOver={(e: React.DragEvent<HTMLLabelElement>) => e.preventDefault()}
        onDrop={onDrop}
        sx={{
          display: "block",
          mt: 1.25,
          p: 3,
          textAlign: "center",
          bgcolor: "surface.2",
          border: "1.5px dashed",
          borderColor: "outline.main",
          borderRadius: 1,
          cursor: "pointer",
          "&:focus-within": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
        }}
      >
        <Box sx={{ color: "text.secondary", display: "inline-flex" }} aria-hidden>
          <Icon name="upload" size={32} />
        </Box>
        <Typography component="span" variant="subtitle1" sx={{ display: "block", fontWeight: 600, mt: 1 }}>
          {STATEMENT_COPY.dropTitle}
        </Typography>
        <Typography component="span" variant="caption" sx={{ display: "block", color: "text.secondary" }}>
          {STATEMENT_COPY.dropHint}
        </Typography>
        <Box
          component="input"
          id="statement-file"
          name="file"
          type="file"
          accept=".csv,text/csv"
          aria-describedby={error ? "statement-file-error" : undefined}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setChosen(e.target.files?.[0]?.name ?? null);
            setLocalError(null);
            setStateSeen(state);
          }}
          sx={{ display: "block", mx: "auto", mt: 1.5, maxWidth: "100%", fontSize: 13 }}
        />
      </Box>

      {chosen && (
        <Typography component="p" variant="caption" sx={{ mt: 1, color: "text.secondary" }}>
          {chosen}
        </Typography>
      )}

      {error && (
        <Box id="statement-file-error" sx={{ mt: 1.25 }}>
          <Alert tone="error">
            {error}
            {!localError && serverError && state.duplicateHref && (
              <>
                {" "}
                <MuiLink component={NextLink} href={state.duplicateHref} underline="always" color="inherit">
                  {STATEMENT_COPY.duplicateOpen}
                </MuiLink>
              </>
            )}
          </Alert>
        </Box>
      )}

      <Box sx={{ mt: 1.5 }}>
        <Button type="submit" variant="filled" fullWidth disabled={pending}>
          {pending ? STATEMENT_COPY.uploading : STATEMENT_COPY.uploadButton}
        </Button>
      </Box>
    </Box>
  );
}
