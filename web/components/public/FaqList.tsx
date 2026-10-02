"use client";

import * as React from "react";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { Icon } from "@/components/ui/Icon";
import type { FaqItem } from "@/content/public/types";

interface FaqListProps {
  items: readonly FaqItem[];
  /** Prefix for the summary / panel ids. (Was the shared <details name> that made the group exclusive.) */
  name?: string;
  /** Open the first item, as the artboards do. */
  defaultOpenFirst?: boolean;
  /** Answer type: 13px (About) or 14px (About Gyasi). */
  answerSize?: "s" | "m";
  className?: string;
}

/**
 * FAQ on MUI's Accordion (design: the FAQ stacks on 2.0.2 and 2.0.11 — gutterless
 * accordions, subtitle2 question, body copy answer, chevron expand icon).
 *
 * It is a client island because the group is EXCLUSIVE — one answer open at a time, the
 * way the native <details name="faq"> group behaved — and that takes state. The page that
 * renders it stays a Server Component and stays static.
 *
 * Each question stays a real heading: MUI puts the summary inside an <h3> (its `heading`
 * slot, set explicitly here), so the outline is unchanged. The question text itself is a
 * span inside that heading rather than a second heading element.
 */
export function FaqList({
  items,
  name = "faq",
  defaultOpenFirst = true,
  answerSize = "s",
  className,
}: FaqListProps) {
  const [open, setOpen] = React.useState<number | null>(defaultOpenFirst ? 0 : null);

  return (
    <Stack className={className} spacing={{ xs: 1, md: 1.25 }}>
      {items.map((item, index) => {
        const id = `${name}-${index}`;
        return (
          <Accordion
            key={item.q}
            disableGutters
            expanded={open === index}
            onChange={(_event, expanded) => setOpen(expanded ? index : null)}
            slots={{ heading: "h3" }}
          >
            <AccordionSummary
              id={`${id}-summary`}
              aria-controls={`${id}-panel`}
              expandIcon={<Icon name="chevron_down" size={16} />}
            >
              <Typography component="span" variant="subtitle2" sx={{ color: "text.primary" }}>
                {item.q}
              </Typography>
            </AccordionSummary>
            {/* No id here: MUI puts `${id}-panel` (from the summary's aria-controls) on the region
                that wraps this, and a second copy would duplicate it. */}
            <AccordionDetails sx={{ pt: 0 }}>
              <Typography component="p" variant={answerSize === "m" ? "body2" : "caption"} sx={{ display: "block", color: "text.secondary" }}>
                {item.a}
              </Typography>
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Stack>
  );
}
