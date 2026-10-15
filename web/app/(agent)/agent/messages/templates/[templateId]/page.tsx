import { notFound } from "next/navigation";

import { MessageTemplateEditor } from "@/components/agent/MessageTemplateEditor";
import { RetryState } from "@/components/client/RetryState";
import { isUuid } from "@/lib/agent/messageQuery";
import { knownTags, loadMessageTemplate, loadMessageTemplates } from "@/lib/agent/messageTemplates";

/**
 * Screen 3.10.5 — Template Editor (A3105_TemplateEditor), for one template. An archived one is
 * not edited: it is restored from the library's Archived view first, so this answers 404 for
 * it, as the write would.
 */
export const metadata = { title: "Message template" };

export default async function MessageTemplatePage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  if (!isUuid(templateId)) notFound();

  const [result, templates] = await Promise.all([loadMessageTemplate(templateId), loadMessageTemplates(false)]);
  // "Not yours" and "not there" are one answer, so ids cannot be probed.
  if (!result.ok && result.reason === "not-found") notFound();
  if (!result.ok || !templates) return <RetryState />;
  if (result.template.archived) notFound();

  const t = result.template;
  return (
    <MessageTemplateEditor
      // A fresh form when the template changes under the same route.
      key={t.id}
      initial={{ id: t.id, category: t.category, name: t.name, body: t.body, tags: t.tags }}
      tagSuggestions={knownTags(templates)}
    />
  );
}
