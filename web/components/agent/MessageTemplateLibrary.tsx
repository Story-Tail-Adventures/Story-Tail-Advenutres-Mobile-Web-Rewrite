"use client";

import { useState, useTransition } from "react";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";

import {
  duplicateMessageTemplateAction,
  setMessageTemplateArchivedAction,
  type TemplateWriteResult,
} from "@/app/(agent)/agent/messages/templates/actions";
import NextLink from "@/components/mui/NextLink";
import { MESSAGE_TEMPLATE_COPY } from "@/lib/agent/content";
import type { MessageTemplate, TemplateGroup } from "@/lib/agent/templateLibrary";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";
import { uuidV7 } from "@/lib/uuid";

/**
 * Screen 3.10.4's groups of cards (A3104): the category as an overline, three cards a row on
 * the web, each with Edit and Duplicate, plus Archive (the artboard's grid has no room to draw
 * it, and archive is one of the screen's three Key actions). The archived view shows Restore
 * alone: an archived template is not edited or copied until it is back.
 *
 * Each write revalidates the tree in its action, which re-renders this page; nothing here
 * refreshes on top. The outcome is read out through one status line.
 */
const BTN_SM = { minHeight: 32, px: "12px", gap: 0.75, whiteSpace: "nowrap" } as const;

export function MessageTemplateLibrary({
  groups,
  archived,
  empty,
  headingId,
}: {
  groups: TemplateGroup[];
  archived: boolean;
  /** Shown when there is nothing; rendered here so the status line outlives the last card. */
  empty: React.ReactNode;
  /** The page's h1. Archive, Restore and Duplicate move the card that had focus, so focus goes here. */
  headingId: string;
}) {
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const toHeading = () => document.getElementById(headingId)?.focus();

  return (
    <Box sx={{ mt: 2.5 }}>
      <Box component="p" role="status" sx={VISUALLY_HIDDEN}>
        {status}
      </Box>
      {error && (
        <Typography component="p" variant="body2" role="alert" sx={{ m: 0, mb: 1.5, color: "error.main" }}>
          {error}
        </Typography>
      )}
      {groups.length === 0 && empty}
      {groups.map((group) => (
        <Box component="section" key={group.category} aria-labelledby={`tpl-group-${group.category}`} sx={{ mb: 2.5 }}>
          <Typography
            id={`tpl-group-${group.category}`}
            component="h2"
            variant="overline"
            sx={{ m: 0, display: "block", lineHeight: 1.3, color: "text.secondary" }}
          >
            {group.label}
          </Typography>
          <Box
            sx={{
              mt: 1,
              display: "grid",
              gap: 1.25,
              gridTemplateColumns: {
                xs: "minmax(0, 1fr)",
                sm: "repeat(2, minmax(0, 1fr))",
                web: "repeat(3, minmax(0, 1fr))",
              },
            }}
          >
            {group.templates.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                archived={archived}
                onDone={(message) => {
                  setError(null);
                  setStatus(message);
                  toHeading();
                }}
                onError={(message) => {
                  setStatus("");
                  setError(message);
                }}
              />
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function TemplateCard({
  template,
  archived,
  onDone,
  onError,
}: {
  template: MessageTemplate;
  archived: boolean;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [pending, startTransition] = useTransition();

  function run(write: () => Promise<TemplateWriteResult>, done: string) {
    startTransition(async () => {
      let result: TemplateWriteResult;
      try {
        result = await write();
      } catch {
        result = { ok: false, message: MESSAGE_TEMPLATE_COPY.actionFailed };
      }
      if (result.ok) onDone(done);
      else onError(result.message);
    });
  }

  const named = (
    <Box component="span" sx={VISUALLY_HIDDEN}>
      {" "}
      {template.name}
    </Box>
  );

  return (
    <Card component="article" aria-busy={pending || undefined}>
      <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Typography component="h3" variant="subtitle1" sx={{ m: 0, fontWeight: 600, overflowWrap: "anywhere" }}>
          {template.name}
        </Typography>
        <Typography component="p" variant="caption" sx={{ display: "block", mt: 0.25, color: "text.secondary" }}>
          {template.lastEditedLabel}
          {template.tags.length > 0 && ` · ${template.tags.join(", ")}`}
        </Typography>
        <Box sx={{ mt: 1, display: "flex", gap: 0.75, flexWrap: "wrap" }}>
          {archived ? (
            <MuiButton
              type="button"
              variant="outlined"
              color="secondary"
              size="small"
              disabled={pending}
              sx={{ ...BTN_SM, flex: 1 }}
              onClick={() =>
                run(
                  () => setMessageTemplateArchivedAction({ templateId: template.id, archived: false }),
                  MESSAGE_TEMPLATE_COPY.restoredDone,
                )
              }
            >
              {MESSAGE_TEMPLATE_COPY.restore}
              {named}
            </MuiButton>
          ) : (
            <>
              <MuiButton
                component={NextLink}
                href={`/agent/messages/templates/${template.id}`}
                variant="outlined"
                color="secondary"
                size="small"
                sx={{ ...BTN_SM, flex: 1 }}
              >
                {MESSAGE_TEMPLATE_COPY.edit}
                {named}
              </MuiButton>
              <MuiButton
                type="button"
                variant="text"
                size="small"
                disabled={pending}
                sx={BTN_SM}
                onClick={() =>
                  run(
                    () => duplicateMessageTemplateAction({ templateId: template.id, newTemplateId: uuidV7() }),
                    MESSAGE_TEMPLATE_COPY.duplicated,
                  )
                }
              >
                {MESSAGE_TEMPLATE_COPY.duplicate}
                {named}
              </MuiButton>
              <MuiButton
                type="button"
                variant="text"
                size="small"
                disabled={pending}
                sx={BTN_SM}
                onClick={() =>
                  run(
                    () => setMessageTemplateArchivedAction({ templateId: template.id, archived: true }),
                    MESSAGE_TEMPLATE_COPY.archivedDone,
                  )
                }
              >
                {MESSAGE_TEMPLATE_COPY.archive}
                {named}
              </MuiButton>
            </>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
