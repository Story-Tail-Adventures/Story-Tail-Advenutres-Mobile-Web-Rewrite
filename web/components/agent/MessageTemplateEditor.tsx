"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import MuiLink from "@mui/material/Link";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import {
  saveMessageTemplateAction,
  setMessageTemplateArchivedAction,
} from "@/app/(agent)/agent/messages/templates/actions";
import NextLink from "@/components/mui/NextLink";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { SelectField } from "@/components/ui/Select";
import { TextareaField } from "@/components/ui/Textarea";
import {
  MESSAGE_TEMPLATE_CATEGORY_LABELS,
  MESSAGE_TEMPLATE_COPY,
  templateUnknownFields,
} from "@/lib/agent/content";
import {
  MAX_TAG,
  MAX_TAGS,
  MAX_TEMPLATE_BODY,
  MAX_TEMPLATE_NAME,
  MERGE_FIELDS,
  SAMPLE_CONTEXT,
  TEMPLATE_CATEGORIES,
  insertAtCursor,
  mergeValues,
  renderTemplate,
  unknownTokens,
  type TemplateCategory,
} from "@/lib/agent/templateMerge";
import { uuidV7 } from "@/lib/uuid";

export type EditorInitial = {
  id: string | null;
  category: TemplateCategory;
  name: string;
  body: string;
  tags: string[];
};

type Draft = { category: TemplateCategory; name: string; body: string; tags: string[] };

const LIBRARY = "/agent/messages/templates";
const SAMPLE_VALUES = mergeValues(SAMPLE_CONTEXT);
const CATEGORY_OPTIONS = TEMPLATE_CATEGORIES.map((c) => ({ value: c, label: MESSAGE_TEMPLATE_CATEGORY_LABELS[c] }));

function same(a: Draft, b: Draft): boolean {
  return a.category === b.category && a.name === b.name && a.body === b.body && a.tags.join("\n") === b.tags.join("\n");
}

/**
 * Screen 3.10.5 (A3105_TemplateEditor): the form on the left, a live preview on the right.
 *
 * PLAIN TEXT, NO SUBJECT, EXPLICIT SAVE (Gyasi, 2026-10-14). The body is a plain textarea, as
 * the artboard draws it; rich text and the subject line arrive with email (Stage 4). The
 * artboard's "Auto-save" is not here: saving half a template would change what the picker
 * inserts while it is being written. Leaving with unsaved changes asks first: on a reload or
 * close (the browser's own prompt), and on any in-app link clicked while there are changes (the
 * nav rail, the header, Back to library). The browser's own Back button is not caught.
 *
 * THE MERGE FIELDS ARE CHIPS that go in at the cursor. An unknown token is named and blocks
 * Save here, before the Edge Function and the SQL refuse it too.
 *
 * THE PREVIEW USES A FIXED SAMPLE (Jordan, Nassau), never a real client: the picker is where a
 * real thread's data merges. A field the sample cannot fill does not exist; the sample fills
 * every one.
 *
 * ONE ID PER NEW FORM, minted when the form mounts, so a double click on Save creates once
 * (the second answers `exists`). After a create the URL becomes the template's own.
 */
export function MessageTemplateEditor({ initial, tagSuggestions }: { initial: EditorInitial; tagSuggestions: string[] }) {
  const router = useRouter();
  const [newId] = useState(() => uuidV7());
  const templateId = initial.id ?? newId;
  // Once a create has succeeded the form is that template's, even before the route catches up:
  // a second Save is an update, never a second create answering "exists".
  const [created, setCreated] = useState(false);
  const isNew = initial.id === null && !created;

  const [saved, setSaved] = useState<Draft>({ category: initial.category, name: initial.name, body: initial.body, tags: initial.tags });
  const [category, setCategory] = useState<TemplateCategory>(initial.category);
  const [name, setName] = useState(initial.name);
  const [body, setBody] = useState(initial.body);
  const [tags, setTags] = useState<string[]>(initial.tags);
  const [errors, setErrors] = useState<{ name?: string; body?: string; form?: string }>({});
  const [status, setStatus] = useState("");
  const [pending, startTransition] = useTransition();
  const caret = useRef<number | null>(null);

  const nameId = useId();
  const categoryId = useId();
  const bodyId = useId();
  const tagsId = useId();
  const fieldsLabelId = useId();

  const draft: Draft = { category, name, body, tags };
  const dirty = !same(draft, saved) || isNew;
  const changed = !same(draft, saved);
  const unknown = useMemo(() => unknownTokens(body), [body]);
  const preview = useMemo(() => renderTemplate(body, SAMPLE_VALUES).text, [body]);

  // The browser's own prompt on reload or close, and a confirm on any in-app link while there
  // are changes. Capture phase, so it runs before Next's Link starts the navigation.
  useEffect(() => {
    if (!changed) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    const guardLinks = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      if (!window.confirm(MESSAGE_TEMPLATE_COPY.leaveUnsaved)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", guardLinks, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", guardLinks, true);
    };
  }, [changed]);

  // Put the caret back after a chip insert re-renders the textarea.
  useEffect(() => {
    if (caret.current === null) return;
    const el = document.getElementById(bodyId) as HTMLTextAreaElement | null;
    if (el) {
      el.focus();
      el.setSelectionRange(caret.current, caret.current);
    }
    caret.current = null;
  }, [body, bodyId]);

  function insertField(field: string) {
    const el = document.getElementById(bodyId) as HTMLTextAreaElement | null;
    const token = `{{${field}}}`;
    // In the body, the token always goes in where the cursor was, even into an empty box.
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? start;
    const next = body.trim() === "" ? { value: token, caret: token.length } : insertAtCursor(body, token, start, end);
    caret.current = next.caret;
    setBody(next.value);
  }

  function validate(): boolean {
    const next: typeof errors = {};
    if (name.trim() === "") next.name = MESSAGE_TEMPLATE_COPY.nameRequired;
    if (body.trim() === "") next.body = MESSAGE_TEMPLATE_COPY.bodyRequired;
    else if (unknown.length > 0) next.body = templateUnknownFields(unknown);
    setErrors(next);
    if (next.name) document.getElementById(nameId)?.focus();
    else if (next.body) document.getElementById(bodyId)?.focus();
    return !next.name && !next.body;
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setStatus("");
    if (!validate()) return;
    if (!dirty) {
      setStatus(MESSAGE_TEMPLATE_COPY.nothingChanged);
      return;
    }
    const sent: Draft = { category, name: name.trim(), body, tags };
    startTransition(async () => {
      let result;
      try {
        result = await saveMessageTemplateAction({ mode: isNew ? "create" : "update", templateId, ...sent });
      } catch {
        result = { ok: false as const, message: MESSAGE_TEMPLATE_COPY.saveFailed };
      }
      if (!result.ok) {
        setErrors({ form: result.message });
        return;
      }
      setName(sent.name);
      setSaved(sent);
      setStatus(MESSAGE_TEMPLATE_COPY.saved);
      // REPLACE: Back from the saved template should not land on a blank "new" form.
      if (isNew) {
        setCreated(true);
        router.replace(`${LIBRARY}/${templateId}`);
      }
    });
  }

  function archive() {
    if (pending || isNew) return;
    if (changed && !window.confirm(MESSAGE_TEMPLATE_COPY.leaveUnsaved)) return;
    startTransition(async () => {
      let result;
      try {
        result = await setMessageTemplateArchivedAction({ templateId, archived: true });
      } catch {
        result = { ok: false as const, message: MESSAGE_TEMPLATE_COPY.actionFailed };
      }
      if (!result.ok) {
        setErrors({ form: result.message });
        return;
      }
      setSaved(draft);
      router.push(LIBRARY);
    });
  }

  return (
    <Box
      component="form"
      onSubmit={save}
      // Enter in the tags box adds a tag (the Autocomplete handles it first); it must not also
      // submit the form, which on an empty tags box would save.
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).id === tagsId) e.preventDefault();
      }}
      noValidate
      aria-label={isNew ? MESSAGE_TEMPLATE_COPY.newTitle : name || MESSAGE_TEMPLATE_COPY.title}
      sx={{ display: "flex", flexDirection: "column", minHeight: "100%" }}
    >
      <Box
        component="header"
        sx={{
          px: { xs: 2, md: 3.5 },
          py: 1.75,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          flexWrap: "wrap",
        }}
      >
        <Box sx={{ flex: "1 1 260px", minWidth: 0 }}>
          <Typography component="p" variant="caption" sx={{ m: 0, color: "text.secondary" }}>
            <MuiLink component={NextLink} href={LIBRARY} underline="hover" color="inherit">
              {MESSAGE_TEMPLATE_COPY.backToLibrary}
            </MuiLink>{" "}
            · {MESSAGE_TEMPLATE_CATEGORY_LABELS[category]}
          </Typography>
          <Typography component="h1" variant="h5" sx={{ m: 0, fontWeight: 700, overflowWrap: "anywhere" }}>
            {isNew && saved.name === "" ? MESSAGE_TEMPLATE_COPY.newTitle : saved.name}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Typography component="p" variant="caption" role="status" sx={{ m: 0, color: "text.secondary" }}>
            {changed ? MESSAGE_TEMPLATE_COPY.unsaved : status}
          </Typography>
          {!isNew && (
            <Button variant="text" size="sm" onClick={archive} disabled={pending}>
              {MESSAGE_TEMPLATE_COPY.archive}
            </Button>
          )}
          <Button type="submit" variant="filled" size="sm" disabled={pending}>
            {pending ? MESSAGE_TEMPLATE_COPY.saving : MESSAGE_TEMPLATE_COPY.save}
          </Button>
        </Box>
      </Box>

      {errors.form && (
        <Typography component="p" variant="body2" role="alert" sx={{ m: 0, px: { xs: 2, md: 3.5 }, pt: 1.5, color: "error.main" }}>
          {errors.form}
        </Typography>
      )}

      <Box
        sx={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) minmax(0, 1fr)" },
          minHeight: 0,
        }}
      >
        <Box sx={{ p: 2.25, borderRight: { lg: 1 }, borderColor: { lg: "divider" }, display: "grid", gap: 1.5, alignContent: "start" }}>
          <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "minmax(0, 2fr) minmax(0, 1fr)" } }}>
            <Field
              id={nameId}
              label={MESSAGE_TEMPLATE_COPY.nameLabel}
              value={name}
              maxLength={MAX_TEMPLATE_NAME}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((x) => ({ ...x, name: undefined }));
              }}
              error={errors.name}
              readOnly={pending}
            />
            <SelectField
              id={categoryId}
              label={MESSAGE_TEMPLATE_COPY.categoryLabel}
              options={CATEGORY_OPTIONS}
              value={category}
              onChange={(e) => setCategory(e.target.value as TemplateCategory)}
              disabled={pending}
            />
          </Box>
          {/* The artboard sets the body in mono, so a token reads as a token. */}
          <Box sx={{ "& textarea": { fontFamily: "mono", fontSize: 12 } }}>
          <TextareaField
            id={bodyId}
            label={MESSAGE_TEMPLATE_COPY.bodyLabel}
            rows={12}
            value={body}
            maxLength={MAX_TEMPLATE_BODY}
            onChange={(e) => {
              setBody(e.target.value);
              if (errors.body) setErrors((x) => ({ ...x, body: undefined }));
            }}
            error={errors.body}
            hint={MESSAGE_TEMPLATE_COPY.bodyHint}
            readOnly={pending}
          />
          </Box>
          <Box role="group" aria-labelledby={fieldsLabelId}>
            <Typography id={fieldsLabelId} component="p" variant="caption" sx={{ m: 0, mb: 0.75, color: "text.secondary" }}>
              {MESSAGE_TEMPLATE_COPY.fieldsLabel}
            </Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
              {MERGE_FIELDS.map((f) => (
                <Chip
                  key={f}
                  size="small"
                  variant="outlined"
                  label={`{{${f}}}`}
                  onClick={() => insertField(f)}
                  disabled={pending}
                  sx={{ fontFamily: "mono", fontSize: 10.5, height: 26 }}
                />
              ))}
            </Box>
          </Box>
          <Autocomplete
            multiple
            freeSolo
            id={tagsId}
            options={tagSuggestions.filter((t) => !tags.some((x) => x.toLowerCase() === t.toLowerCase()))}
            value={tags}
            disabled={pending}
            onChange={(_e, next) => {
              const kept = new Map<string, string>();
              for (const raw of next) {
                for (const part of String(raw).split(",")) {
                  const tag = part.trim().slice(0, MAX_TAG);
                  if (tag && !kept.has(tag.toLowerCase())) kept.set(tag.toLowerCase(), tag);
                }
              }
              setTags([...kept.values()].slice(0, MAX_TAGS));
            }}
            renderValue={(value, getItemProps) =>
              value.map((option, index) => {
                const { key, ...itemProps } = getItemProps({ index });
                return <Chip key={key} variant="outlined" size="small" label={option} {...itemProps} />;
              })
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label={MESSAGE_TEMPLATE_COPY.tagsLabel}
                helperText={MESSAGE_TEMPLATE_COPY.tagsHint}
                size="small"
              />
            )}
          />
        </Box>

        <Box component="section" aria-labelledby={`${bodyId}-preview`} sx={{ p: 2.25, bgcolor: "surface.main" }}>
          <Typography
            id={`${bodyId}-preview`}
            component="h2"
            variant="overline"
            sx={{ m: 0, display: "block", lineHeight: 1.3, color: "text.secondary" }}
          >
            {MESSAGE_TEMPLATE_COPY.previewHeading}
          </Typography>
          <Card sx={{ mt: 0.75 }}>
            <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
              <Typography component="p" variant="body2" sx={{ m: 0, lineHeight: 1.55, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {preview}
              </Typography>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Box>
  );
}
