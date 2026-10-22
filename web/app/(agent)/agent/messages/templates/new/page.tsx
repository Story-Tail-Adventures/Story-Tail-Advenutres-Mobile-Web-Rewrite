import { MessageTemplateEditor } from "@/components/agent/MessageTemplateEditor";
import { RetryState } from "@/components/client/RetryState";
import { knownTags, loadMessageTemplates } from "@/lib/agent/messageTemplates";

/**
 * Screen 3.10.5 — Template Editor, for a new template. The library's "New template". It starts
 * in Other with nothing in it; the advisor picks the category.
 */
export const metadata = { title: "New message template" };

export default async function NewMessageTemplatePage() {
  // For the tag suggestions only; the form itself needs nothing loaded.
  const templates = await loadMessageTemplates(false);
  if (!templates) return <RetryState />;

  return (
    <MessageTemplateEditor
      initial={{ id: null, category: "other", name: "", body: "", tags: [] }}
      tagSuggestions={knownTags(templates)}
    />
  );
}
