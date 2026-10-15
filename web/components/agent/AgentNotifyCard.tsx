"use client";

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { VISUALLY_HIDDEN } from "@/lib/mui/sx";
import { AGENT_MESSAGES_COPY } from "@/lib/agent/content";
import { pushSupported, refreshPushIfOn, turnOnPush } from "@/lib/agent/pushClient";

/** Per browser, like the permission itself. "Not now" is not "never": a new browser asks again. */
export const NOT_NOW_KEY = "sta.notify.notNow";

type View = "hidden" | "offer" | "working" | "blocked" | "failed" | "on";

function readNotNow(): boolean {
  try {
    return window.localStorage.getItem(NOT_NOW_KEY) === "1";
  } catch {
    return false;
  }
}

function writeNotNow(): void {
  try {
    window.localStorage.setItem(NOT_NOW_KEY, "1");
  } catch {
    // Private windows can refuse storage; the card simply comes back next time.
  }
}

/**
 * Screen 3.10.7's opt-in (A3107, ruling 7): "Get notified when clients write", in the inbox,
 * until it is answered. Permission is asked only when "Turn on" is tapped.
 *
 * Renders nothing on the server and on first paint: whether to offer depends on this browser
 * (support, permission, an existing subscription, "Not now"), which only the browser knows. So
 * it appears after hydration rather than flashing in and out.
 *
 * Already on: says so to the server again, quietly (`refreshPushIfOn`), so a browser shared by
 * two advisors follows whoever is signed in.
 */
const noSubscription = () => () => {};

/** Can this browser be asked? Read on the client only; the server snapshot says no. */
function canOffer(): boolean {
  return pushSupported() && Notification.permission === "default" && !readNotNow();
}

export function AgentNotifyCard() {
  // Null until the advisor acts; until then the browser's own state decides.
  const [answered, setAnswered] = useState<View | null>(null);
  const [allowedButUnsubscribed, setAllowedButUnsubscribed] = useState(false);
  const askable = useSyncExternalStore(noSubscription, canOffer, () => false);

  useEffect(() => {
    if (!pushSupported() || Notification.permission !== "granted") return;
    // Allowed before: refresh this browser's row, or offer again if its subscription is gone.
    // Denied before: the browser will not ask again and the card cannot help, so it stays away.
    void refreshPushIfOn().then((on) => {
      if (!on && !readNotNow()) setAllowedButUnsubscribed(true);
    });
  }, []);

  const view: View = answered ?? (askable || allowedButUnsubscribed ? "offer" : "hidden");
  const setView = setAnswered;
  const titleId = useId();

  // One live region, mounted for as long as the card could speak, so a screen reader hears the
  // outcome change rather than a region that arrived already holding its words.
  const status = (
    <Typography role="status" variant="caption" sx={view === "on" ? { display: "block", pt: 0.5, color: "text.secondary" } : VISUALLY_HIDDEN}>
      {view === "on" ? AGENT_MESSAGES_COPY.notifyOn : view === "working" ? AGENT_MESSAGES_COPY.notifyTurningOn : ""}
    </Typography>
  );
  if (view === "hidden") return null;

  const turnOn = async () => {
    if (view === "working") return;
    setView("working");
    const result = await turnOnPush();
    // Closing the browser's prompt is not an error: back to the offer, quietly.
    setView(result === "dismissed" ? "offer" : result);
  };
  const notNow = () => {
    writeNotNow();
    setView("hidden");
  };

  if (view === "on") return status;

  return (
    <Card
      component="section"
      aria-labelledby={titleId}
      sx={{ mt: 1.5, bgcolor: "secondary.container", color: "secondary.onContainer", boxShadow: "none" }}
    >
      <CardContent sx={{ p: 1.75, "&:last-child": { pb: 1.75 } }}>
        <Stack direction="row" spacing={1.25}>
          <Box aria-hidden sx={{ pt: 0.25 }}>
            <Icon name="bell" size={18} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography id={titleId} component="h2" variant="subtitle2" sx={{ m: 0, fontWeight: 600 }}>
              {AGENT_MESSAGES_COPY.notifyTitle}
            </Typography>
            <Typography variant="caption" sx={{ display: "block", mt: 0.25 }}>
              {AGENT_MESSAGES_COPY.notifyBody}
            </Typography>
            {(view === "blocked" || view === "failed") && (
              <Typography role="alert" variant="caption" sx={{ display: "block", mt: 0.75, fontWeight: 600 }}>
                {view === "blocked" ? AGENT_MESSAGES_COPY.notifyBlocked : AGENT_MESSAGES_COPY.notifyFailed}
              </Typography>
            )}
            <Stack direction="row" spacing={1} sx={{ mt: 1.25 }}>
              {view !== "blocked" && (
                // aria-disabled, not disabled: a disabled button drops the focus it holds.
                <Button variant="filled" size="sm" onClick={turnOn} aria-disabled={view === "working"}>
                  {view === "working" ? AGENT_MESSAGES_COPY.notifyTurningOn : AGENT_MESSAGES_COPY.notifyTurnOn}
                </Button>
              )}
              <Button variant="text" size="sm" onClick={notNow}>
                {AGENT_MESSAGES_COPY.notifyNotNow}
              </Button>
            </Stack>
          </Box>
        </Stack>
        {status}
      </CardContent>
    </Card>
  );
}
