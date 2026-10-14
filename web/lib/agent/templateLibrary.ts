import type { AgentMessageTemplateRow } from "@/lib/agent/api";
import { MESSAGE_TEMPLATE_CATEGORY_LABELS, templateLastEdited } from "@/lib/agent/content";
import { TEMPLATE_CATEGORIES, type MergeValues, type TemplateCategory } from "@/lib/agent/templateMerge";

/**
 * §3.10 Stage 2's template view model and the pure helpers over it: grouping, search, tag
 * suggestions. PURE, so the picker and the library (client components) can import it; the
 * loaders that read Supabase are in `messageTemplates.ts`, which a client file may import only
 * types from. A value import from there pulls `next/headers` into the browser bundle.
 */

export type MessageTemplate = {
  id: string;
  category: TemplateCategory;
  name: string;
  body: string;
  tags: string[];
  archived: boolean;
  lastEditedLabel: string;
};

export type TemplateGroup = { category: TemplateCategory; label: string; templates: MessageTemplate[] };

function asCategory(value: string): TemplateCategory {
  return (TEMPLATE_CATEGORIES as readonly string[]).includes(value) ? (value as TemplateCategory) : "other";
}

function dayIn(iso: string, timeZone: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone });
  } catch {
    // A bad zone string on the agent row should not take the library down.
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  }
}

export function toTemplate(row: AgentMessageTemplateRow, timeZone: string): MessageTemplate {
  return {
    id: row.template_id,
    category: asCategory(row.category),
    name: row.name,
    body: row.body,
    tags: row.tags ?? [],
    archived: row.archived,
    lastEditedLabel: templateLastEdited(dayIn(row.updated_at, timeZone)),
  };
}

/**
 * Grouped by category in the library's order (Lead response first, Other last), A to Z inside
 * each, empty groups left out (Gyasi, 2026-10-14).
 */
export function groupTemplates(templates: readonly MessageTemplate[]): TemplateGroup[] {
  return TEMPLATE_CATEGORIES.flatMap((category) => {
    const inGroup = templates
      .filter((t) => t.category === category)
      .sort((a, b) => a.name.localeCompare(b.name, "en-US", { sensitivity: "base" }));
    return inGroup.length > 0
      ? [{ category, label: MESSAGE_TEMPLATE_CATEGORY_LABELS[category], templates: inGroup }]
      : [];
  });
}

/** The picker's search: every word must appear in the name, a tag or the body. */
export function matchesSearch(template: MessageTemplate, search: string): boolean {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = `${template.name}\n${template.tags.join("\n")}\n${template.body}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** Every tag already used, for the editor's suggestions, A to Z, first spelling kept. */
export function knownTags(templates: readonly MessageTemplate[]): string[] {
  const seen = new Map<string, string>();
  for (const t of templates) for (const tag of t.tags) if (!seen.has(tag.toLowerCase())) seen.set(tag.toLowerCase(), tag);
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "en-US", { sensitivity: "base" }));
}

/**
 * Everything the reply box's picker needs, loaded beside the thread. `null` (from the loader)
 * means the read failed; the reply box then offers no picker rather than an empty one.
 */
export type PickerData = {
  templates: MessageTemplate[];
  values: MergeValues;
  /** Opened from Trip Detail's "Remind the client": start open, on Payment reminder. */
  startOn: TemplateCategory | null;
};
