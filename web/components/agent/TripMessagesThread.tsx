import { AGENT_COPY } from "@/lib/agent/content";
import type { TripMessageRow } from "@/lib/agent/tripDetail";

/**
 * Read-only in this pass — composing and sending a new message is §3.10. `is_internal_note`
 * rows ARE included (the agent's own read, unlike the client's) and are visually distinguished
 * rather than hidden.
 */
export function TripMessagesThread({ messages }: { messages: TripMessageRow[] }) {
  if (messages.length === 0) {
    return (
      <p className="t-body-s px-1 py-4 text-[var(--md-on-surface-variant)]">
        {AGENT_COPY.tripMessagesEmpty}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {messages.map((m) => (
        <div
          key={m.messageId}
          className={`card p-3 ${m.isInternalNote ? "bg-[var(--md-surface-2)]" : ""}`}
        >
          <div className="flex items-center gap-2">
            <span className="t-label-s text-[var(--md-on-surface-variant)]">
              {m.senderRole === "agent" ? "You" : m.senderRole === "client" ? "Client" : m.senderRole}
            </span>
            {m.isInternalNote && <span className="chip">Internal note</span>}
            <span className="t-body-s ml-auto text-[var(--md-on-surface-variant)]">
              {m.createdLabel}
            </span>
          </div>
          <p className="t-body-s mt-1">{m.body}</p>
        </div>
      ))}
    </div>
  );
}
