"use client";

import { useId, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import ListSubheader from "@mui/material/ListSubheader";
import MuiLink from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import NextLink from "@/components/mui/NextLink";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { MESSAGE_TEMPLATE_COPY, templateMissing, templatePreviewFor } from "@/lib/agent/content";
import { groupTemplates, matchesSearch, type MessageTemplate } from "@/lib/agent/templateLibrary";
import { renderTemplate, type MergeValues, type TemplateCategory } from "@/lib/agent/templateMerge";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";

/**
 * Screen 3.10.3 (A3103_TemplatePicker): the list on the left, the preview on the right, merged
 * with the REAL client and trip of the thread it was opened from.
 *
 * A FIELD WITH NO VALUE TURNS "INSERT AS-IS" OFF (Gyasi, 2026-10-14). The preview names what
 * is missing in plain words; "Insert & edit" still works and leaves the raw `{{token}}` in the
 * reply box, where Send refuses it until it is replaced.
 *
 * Grouped by category, A to Z, one search over names, tags and body text. `startOn` opens it
 * on a category (Trip Detail's "Remind the client" starts on Payment reminder).
 */
export function TemplatePicker({
  open,
  onClose,
  templates,
  values,
  clientFirstName,
  startOn,
  onInsert,
}: {
  open: boolean;
  onClose: () => void;
  templates: MessageTemplate[];
  values: MergeValues;
  clientFirstName: string;
  startOn: TemplateCategory | null;
  onInsert: (text: string, edit: boolean) => void;
}) {
  const titleId = useId();
  const searchId = useId();
  const listId = useId();
  const missingId = useId();
  const [search, setSearch] = useState("");
  // The first in the order the list shows them, or the first in `startOn`'s group.
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const ordered = groupTemplates(templates).flatMap((g) => g.templates);
    return ((startOn && ordered.find((t) => t.category === startOn)) || ordered[0])?.id ?? null;
  });

  const groups = useMemo(
    () => groupTemplates(templates.filter((t) => matchesSearch(t, search))),
    [templates, search],
  );
  const shown = groups.flatMap((g) => g.templates);
  // Keep the preview on something visible: a search that hides the selection moves it.
  const selected = shown.find((t) => t.id === selectedId) ?? shown[0] ?? null;
  const rendered = selected ? renderTemplate(selected.body, values) : null;
  const blocked = (rendered?.missing.length ?? 0) > 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      aria-labelledby={titleId}
      slotProps={{ paper: { sx: { m: 2, width: "min(720px, calc(100vw - 2rem))", maxWidth: "none", p: 2.5 } } }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 1.5 }}>
        <Box component="span" sx={{ color: "brand.main", display: "inline-flex" }}>
          <Icon name="sparkle" size={18} />
        </Box>
        <Typography id={titleId} component="h2" variant="h5" sx={{ m: 0 }}>
          {MESSAGE_TEMPLATE_COPY.pickerTitle}
        </Typography>
        <IconButton size="small" onClick={onClose} sx={{ ml: "auto" }}>
          <Icon name="close" size={16} />
          <Box component="span" sx={VISUALLY_HIDDEN}>
            {MESSAGE_TEMPLATE_COPY.close}
          </Box>
        </IconButton>
      </Box>

      {templates.length === 0 ? (
        <Typography component="p" variant="body2" sx={{ m: 0 }}>
          {MESSAGE_TEMPLATE_COPY.pickerEmpty}{" "}
          <MuiLink component={NextLink} href="/agent/messages/templates/new" underline="hover">
            {MESSAGE_TEMPLATE_COPY.newTemplate}
          </MuiLink>
        </Typography>
      ) : (
        <>
          <Field
            id={searchId}
            label={MESSAGE_TEMPLATE_COPY.searchLabel}
            placeholder={MESSAGE_TEMPLATE_COPY.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            type="search"
            aria-controls={shown.length > 0 ? listId : undefined}
          />
          <Box
            sx={{
              mt: 1.5,
              display: "grid",
              gap: 1.5,
              gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "240px minmax(0, 1fr)" },
            }}
          >
            <Paper variant="outlined" sx={{ p: 1, bgcolor: "surface.2", maxHeight: { xs: 220, sm: 360 }, overflowY: "auto" }}>
              {shown.length === 0 ? (
                <Typography component="p" variant="body2" sx={{ m: 0, p: 1, color: "text.secondary" }}>
                  {MESSAGE_TEMPLATE_COPY.noMatch}
                </Typography>
              ) : (
                <List id={listId} dense disablePadding aria-label={MESSAGE_TEMPLATE_COPY.pickerTitle}>
                  {groups.map((g) => (
                    <li key={g.category}>
                      <Box component="ul" sx={{ p: 0, m: 0 }}>
                        <ListSubheader sx={{ bgcolor: "surface.2", lineHeight: 2.2, px: 1.25, fontSize: 11 }}>
                          {g.label}
                        </ListSubheader>
                        {g.templates.map((t) => (
                          <ListItem key={t.id} disablePadding>
                          <ListItemButton
                            selected={t.id === selected?.id}
                            aria-current={t.id === selected?.id ? "true" : undefined}
                            onClick={() => setSelectedId(t.id)}
                            // The opening selection gets focus, which also scrolls it into view
                            // (Payment reminder sits below the fold when the reminder door opens it).
                            autoFocus={t.id === selectedId && search === ""}
                            sx={{ borderRadius: 1, py: 0.75, px: 1.25, mb: 0.25 }}
                          >
                            <ListItemText
                              primary={t.name}
                              slotProps={{ primary: { variant: "body2", sx: { fontWeight: 500 } } }}
                              sx={{ my: 0 }}
                            />
                          </ListItemButton>
                          </ListItem>
                        ))}
                      </Box>
                    </li>
                  ))}
                </List>
              )}
            </Paper>
            <Paper variant="outlined" component="section" aria-live="polite" sx={{ p: 1.75, minWidth: 0 }}>
              {rendered ? (
                <>
                  <Typography component="p" variant="overline" sx={{ m: 0, display: "block", lineHeight: 1.3, color: "text.secondary" }}>
                    {templatePreviewFor(clientFirstName)}
                  </Typography>
                  <Typography
                    component="p"
                    variant="body2"
                    sx={{ m: 0, mt: 1, lineHeight: 1.55, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                  >
                    {rendered.text}
                  </Typography>
                  {blocked && (
                    <Typography
                      id={missingId}
                      component="p"
                      variant="caption"
                      sx={{ m: 0, mt: 1.25, display: "flex", gap: 0.5, alignItems: "flex-start", color: "text.secondary" }}
                    >
                      <Icon name="info" size={12} /> {templateMissing(rendered.missing)}
                    </Typography>
                  )}
                </>
              ) : (
                <Typography component="p" variant="body2" sx={{ m: 0, color: "text.secondary" }}>
                  {MESSAGE_TEMPLATE_COPY.pickOne}
                </Typography>
              )}
            </Paper>
          </Box>
        </>
      )}

      <Box sx={{ mt: 1.75, display: "flex", alignItems: "center", gap: 1.25, flexWrap: "wrap" }}>
        <MuiLink component={NextLink} href="/agent/messages/templates" underline="hover" variant="body2">
          {MESSAGE_TEMPLATE_COPY.manage}
        </MuiLink>
        <Box sx={{ ml: "auto", display: "flex", gap: 1.25, flexWrap: "wrap" }}>
          <Button variant="text" size="sm" onClick={onClose}>
            {MESSAGE_TEMPLATE_COPY.cancel}
          </Button>
          <Button variant="tonal" size="sm" disabled={!rendered} onClick={() => rendered && onInsert(rendered.text, true)}>
            {MESSAGE_TEMPLATE_COPY.insertAndEdit}
          </Button>
          <Button
            variant="filled"
            size="sm"
            disabled={!rendered || blocked}
            aria-describedby={blocked ? missingId : undefined}
            onClick={() => rendered && !blocked && onInsert(rendered.text, false)}
          >
            {MESSAGE_TEMPLATE_COPY.insertAsIs}
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
}
