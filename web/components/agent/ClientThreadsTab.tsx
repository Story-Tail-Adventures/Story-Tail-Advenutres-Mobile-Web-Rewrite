import { Icon } from "@/components/ui/Icon";
import { CLIENT_COPY } from "@/lib/agent/content";
import type { ClientThread } from "@/lib/agent/clientDetail";

/**
 * Screen 3.3.5 — every conversation with this client.
 *
 * THREAD LIST ONLY. The thread BODY is §3.10.2 and is not built, so rows are not links:
 * §3.2.1's rule, that a row wired to nothing is worse than a row that is plainly a list
 * item. The unread badge is real — `conversation.agent_unread_count` is outside the client
 * grant, which is part of why this tab needs an accessor at all.
 */
export function ClientThreadsTab({ threads }: { threads: ClientThread[] }) {
  if (threads.length === 0) {
    return (
      <p className="t-body-s px-1 py-4 text-[var(--md-on-surface-variant)]">
        {CLIENT_COPY.threadsEmpty}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {threads.map((t) => (
        <li key={t.conversationId} className="card flex items-center gap-3 px-3.5 py-3">
          <Icon name="message" size={16} className="shrink-0 text-[var(--md-primary)]" />
          <span className="min-w-0 flex-1">
            <span className="t-title-s block truncate">{t.subject}</span>
            <span className="t-body-s block truncate text-[var(--md-on-surface-variant)]">
              {t.preview ?? `${t.messageCount} messages`}
            </span>
          </span>
          <span className="t-body-s shrink-0 text-[var(--md-on-surface-variant)]">
            {t.whenLabel}
          </span>
          {t.unread > 0 && (
            <span className="shrink-0 rounded-full bg-brand-orange px-2 py-0.5 text-[11px] font-bold text-white">
              {t.unread}
              <span className="sr-only"> {CLIENT_COPY.threadUnreadLabel}</span>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
