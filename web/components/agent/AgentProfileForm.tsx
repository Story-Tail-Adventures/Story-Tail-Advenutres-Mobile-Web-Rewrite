"use client";

import { useId, useRef, useState, useTransition } from "react";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import MuiLink from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import {
  removeAvatarAction,
  saveProfileAction,
  setAvatarAction,
} from "@/app/(agent)/agent/settings/actions";
import { useUnsavedGuard } from "@/components/agent/useUnsavedGuard";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { TextareaField } from "@/components/ui/Textarea";
import { prepareAvatar } from "@/lib/agent/avatarImage";
import { SETTINGS_COPY } from "@/lib/agent/settingsCopy";
import {
  MAX_BIO,
  MAX_NAME,
  MAX_PRONOUNS,
  NETWORK_LABEL,
  normalizeSocialLink,
  phoneProblem,
  SettingsRuleError,
  SOCIAL_NETWORKS,
  type SocialLinks,
  type SocialNetwork,
} from "@/lib/agent/settingsRules";
import { initialsOf, type ProfileView } from "@/lib/agent/settingsView";

const C = SETTINGS_COPY.profile;

type Draft = {
  displayName: string;
  pronouns: string;
  phone: string;
  bio: string;
  links: Record<SocialNetwork, string>;
};

function draftOf(p: ProfileView): Draft {
  return {
    displayName: p.displayName,
    pronouns: p.pronouns,
    phone: p.phone,
    bio: p.bio,
    links: {
      instagram: p.socialLinks.instagram ?? "",
      facebook: p.socialLinks.facebook ?? "",
      linkedin: p.socialLinks.linkedin ?? "",
      website: p.socialLinks.website ?? "",
    },
  };
}

function same(a: Draft, b: Draft): boolean {
  return (
    a.displayName === b.displayName &&
    a.pronouns === b.pronouns &&
    a.phone === b.phone &&
    a.bio === b.bio &&
    SOCIAL_NETWORKS.every((n) => a.links[n] === b.links[n])
  );
}

type Errors = Partial<Record<"displayName" | "phone" | SocialNetwork | "form" | "photo", string>>;

/**
 * Screen 3.12.1 (A3121): the advisor's own profile, and beside it how clients see them.
 *
 * The photo saves on its own the moment one is picked or removed (it is a file, not a field
 * to revise); the fields save together with Save. Email is read-only (Q7). Links are turned
 * into full https links on save, and the boxes show what was stored.
 */
export function AgentProfileForm({ profile, responseTimeHours }: { profile: ProfileView; responseTimeHours: number }) {
  const [saved, setSaved] = useState<Draft>(() => draftOf(profile));
  const [draft, setDraft] = useState<Draft>(() => draftOf(profile));
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatarUrl);
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState("");
  const [pending, startTransition] = useTransition();
  const [photoPending, startPhoto] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const ids = {
    name: useId(),
    pronouns: useId(),
    email: useId(),
    phone: useId(),
    bio: useId(),
    file: useId(),
    instagram: useId(),
    facebook: useId(),
    linkedin: useId(),
    website: useId(),
  };

  const changed = !same(draft, saved);
  useUnsavedGuard(changed, SETTINGS_COPY.leaveUnsaved);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setStatus("");
  };
  const setLink = (n: SocialNetwork, value: string) => {
    setDraft((d) => ({ ...d, links: { ...d.links, [n]: value } }));
    setStatus("");
  };

  function validate(): { links: SocialLinks } | null {
    const next: Errors = {};
    if (draft.displayName.trim() === "") next.displayName = C.nameRequired;
    const phone = phoneProblem(draft.phone);
    if (phone) next.phone = phone;
    const links: SocialLinks = {};
    for (const n of SOCIAL_NETWORKS) {
      try {
        const v = normalizeSocialLink(n, draft.links[n]);
        if (v) links[n] = v;
      } catch (e) {
        if (e instanceof SettingsRuleError) next[n] = e.message;
        else throw e;
      }
    }
    setErrors(next);
    const firstBad = (["displayName", "phone", ...SOCIAL_NETWORKS] as const).find((k) => next[k]);
    if (firstBad) {
      const id = firstBad === "displayName" ? ids.name : firstBad === "phone" ? ids.phone : ids[firstBad];
      document.getElementById(id)?.focus();
      return null;
    }
    return { links };
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setStatus("");
    const ok = validate();
    if (!ok) return;
    if (!changed) {
      setStatus(SETTINGS_COPY.nothingChanged);
      return;
    }
    const sent = {
      displayName: draft.displayName.trim(),
      pronouns: draft.pronouns.trim(),
      phone: draft.phone.trim(),
      bio: draft.bio.trim(),
      socialLinks: ok.links,
    };
    startTransition(async () => {
      let result;
      try {
        result = await saveProfileAction(sent);
      } catch {
        result = { ok: false as const, message: SETTINGS_COPY.saveFailed };
      }
      if (!result.ok) {
        setErrors({ form: result.message });
        return;
      }
      const stored: Draft = {
        displayName: sent.displayName,
        pronouns: sent.pronouns,
        phone: sent.phone,
        bio: sent.bio,
        links: {
          instagram: ok.links.instagram ?? "",
          facebook: ok.links.facebook ?? "",
          linkedin: ok.links.linkedin ?? "",
          website: ok.links.website ?? "",
        },
      };
      setSaved(stored);
      setDraft(stored);
      setStatus(SETTINGS_COPY.saved);
    });
  }

  function cancel() {
    setDraft(saved);
    setErrors({});
    setStatus("");
  }

  function pickPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || photoPending) return;
    setErrors((e) => ({ ...e, photo: undefined }));
    startPhoto(async () => {
      const prepared = await prepareAvatar(file);
      if (!prepared.ok) {
        setErrors((e) => ({
          ...e,
          photo: prepared.error === "too-big" ? C.photoTooBig : prepared.error === "wrong-type" ? C.photoWrongType : C.photoUnreadable,
        }));
        return;
      }
      let result;
      try {
        result = await setAvatarAction({ image: prepared.base64 });
      } catch {
        result = { ok: false as const, message: SETTINGS_COPY.saveFailed };
      }
      if (!result.ok) {
        setErrors((e) => ({ ...e, photo: result.message }));
        return;
      }
      setAvatarUrl(result.avatarUrl ?? null);
      setStatus(C.photoSaved);
    });
  }

  function removePhoto() {
    if (photoPending) return;
    startPhoto(async () => {
      let result;
      try {
        result = await removeAvatarAction();
      } catch {
        result = { ok: false as const, message: SETTINGS_COPY.saveFailed };
      }
      if (!result.ok) {
        setErrors((e) => ({ ...e, photo: result.message }));
        return;
      }
      setAvatarUrl(null);
      setStatus(C.photoRemoved);
    });
  }

  const initials = initialsOf(draft.displayName || saved.displayName);
  const firstName = (draft.displayName.trim() || saved.displayName).split(/\s+/)[0] ?? "";
  const shownLinks = SOCIAL_NETWORKS.filter((n) => saved.links[n] !== "");

  return (
    <Box component="form" onSubmit={save} noValidate aria-labelledby={`${ids.name}-title`}>
      <Box
        component="header"
        sx={{ mt: 2.5, mb: 1.75, display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 1.5 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography id={`${ids.name}-title`} component="h2" variant="h5" sx={{ fontWeight: 700 }}>
            {C.title}
          </Typography>
          <Typography component="p" variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
            {C.sub}
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <Typography component="p" variant="caption" role="status" sx={{ m: 0, color: "text.secondary" }}>
            {status || (changed ? SETTINGS_COPY.unsaved : "")}
          </Typography>
          <Button variant="text" size="sm" onClick={cancel} disabled={!changed || pending}>
            {C.cancel}
          </Button>
          <Button variant="filled" size="sm" type="submit" disabled={pending}>
            {C.save}
          </Button>
        </Stack>
      </Box>

      {errors.form ? (
        <Box sx={{ mb: 1.75 }}>
          <Alert tone="error">{errors.form}</Alert>
        </Box>
      ) : null}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "minmax(0, 1fr) 320px" },
          gap: 2.25,
          maxWidth: 1080,
        }}
      >
        <Card>
          <CardContent sx={{ p: 2.5 }}>
            <Stack direction="row" spacing={1.75} sx={{ alignItems: "center", mb: 2 }}>
              <Avatar src={avatarUrl ?? undefined} alt="" sx={{ width: 84, height: 84, bgcolor: "primary.main", color: "primary.contrastText", fontSize: 28, fontWeight: 600 }}>
                {initials}
              </Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography component="p" variant="subtitle1">
                  {C.photo}
                </Typography>
                <Typography component="p" variant="caption" sx={{ display: "block", color: "text.secondary" }}>
                  {C.photoHint}
                </Typography>
                <Stack direction="row" spacing={0.75} sx={{ mt: 0.75 }}>
                  <Button variant="tonal" size="sm" onClick={() => fileRef.current?.click()} disabled={photoPending}>
                    {photoPending ? C.uploading : C.upload}
                  </Button>
                  {avatarUrl ? (
                    <Button variant="text" size="sm" onClick={removePhoto} disabled={photoPending}>
                      {C.remove}
                    </Button>
                  ) : null}
                </Stack>
                <input
                  ref={fileRef}
                  id={ids.file}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                  aria-label={C.upload}
                  onChange={pickPhoto}
                />
              </Box>
            </Stack>
            {errors.photo ? (
              <Box sx={{ mb: 1.75 }}>
                <Alert tone="error">{errors.photo}</Alert>
              </Box>
            ) : null}

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" }, gap: 1.5 }}>
              <Field
                id={ids.name}
                label={C.name}
                value={draft.displayName}
                maxLength={MAX_NAME}
                autoComplete="name"
                error={errors.displayName}
                onChange={(e) => set("displayName", e.target.value)}
              />
              <Field
                id={ids.pronouns}
                label={C.pronouns}
                hint={C.pronounsHint}
                value={draft.pronouns}
                maxLength={MAX_PRONOUNS}
                onChange={(e) => set("pronouns", e.target.value)}
              />
              <Field id={ids.email} label={C.email} hint={C.emailHint} value={profile.email} readOnly />
              <Field
                id={ids.phone}
                label={C.phone}
                type="tel"
                autoComplete="tel"
                value={draft.phone}
                error={errors.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
              <Box sx={{ gridColumn: "1 / -1" }}>
                <TextareaField
                  id={ids.bio}
                  label={C.bio}
                  hint={C.bioHint}
                  rows={3}
                  maxLength={MAX_BIO}
                  value={draft.bio}
                  onChange={(e) => set("bio", e.target.value)}
                />
              </Box>
              <Typography component="p" variant="subtitle2" sx={{ gridColumn: "1 / -1", mt: 0.5 }}>
                {C.links}
                <Typography component="span" variant="caption" sx={{ display: "block", color: "text.secondary", fontWeight: 400 }}>
                  {C.linksHint}
                </Typography>
              </Typography>
              {SOCIAL_NETWORKS.map((n) => (
                <Field
                  key={n}
                  id={ids[n]}
                  label={NETWORK_LABEL[n]}
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  value={draft.links[n]}
                  error={errors[n]}
                  onChange={(e) => setLink(n, e.target.value)}
                />
              ))}
            </Box>
          </CardContent>
        </Card>

        <Card component="aside" aria-label={C.preview} sx={{ alignSelf: "start" }}>
          <CardContent sx={{ p: 1.75 }}>
            <Typography component="p" variant="overline" sx={{ display: "block", lineHeight: 1.3, color: "text.secondary" }}>
              {C.preview}
            </Typography>
            <Paper variant="outlined" sx={{ p: 1.5, mt: 1, bgcolor: "surface.2" }}>
              <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
                <Avatar src={avatarUrl ?? undefined} alt="" sx={{ width: 44, height: 44, bgcolor: "primary.main", color: "primary.contrastText", fontSize: 15, fontWeight: 600 }}>
                  {initials}
                </Avatar>
                <Box sx={{ minWidth: 0 }}>
                  <Typography component="p" variant="subtitle1" sx={{ overflowWrap: "anywhere" }}>
                    {firstName} · {C.previewRole}
                    {draft.pronouns.trim() ? (
                      <Typography component="span" variant="caption" sx={{ ml: 0.75, color: "text.secondary" }}>
                        ({draft.pronouns.trim()})
                      </Typography>
                    ) : null}
                  </Typography>
                  <Typography component="p" variant="caption" sx={{ display: "block", color: "text.secondary" }}>
                    {C.replyWithin(responseTimeHours)}
                  </Typography>
                </Box>
              </Stack>
              {draft.bio.trim() ? (
                <Typography component="p" variant="body2" sx={{ mt: 1.25, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>
                  {draft.bio.trim()}
                </Typography>
              ) : null}
              {shownLinks.length > 0 ? (
                <Stack direction="row" spacing={1.25} sx={{ mt: 1, flexWrap: "wrap" }}>
                  {shownLinks.map((n) => (
                    <MuiLink key={n} href={saved.links[n]} target="_blank" rel="noopener noreferrer" variant="caption">
                      {NETWORK_LABEL[n]}
                    </MuiLink>
                  ))}
                </Stack>
              ) : null}
            </Paper>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
