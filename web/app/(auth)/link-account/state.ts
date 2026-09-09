import type { MappedAuthError } from "@/lib/auth-errors";
import { PROVIDER_LABEL, type OAuthProvider } from "@/lib/auth/providers";

/** Screen 2.1.8 Social Login / Account Linking — form state and copy. */
export interface LinkAccountState {
  fieldErrors?: { email?: string[]; password?: string[] };
  formError?: MappedAuthError;
  /** Echoed back so a failed submit does not clear the field. Never the password. */
  email?: string;
}

export const initialLinkAccountState: LinkAccountState = {};

export const LINK_TEXT = {
  metaTitle: "Link your account",
  metaDescription: "Connect a social sign-in to the Story-Tail account you already have.",
  overline: "ACCOUNT FOUND",
  title: "Looks like you already have an account with this email",
  sub: "Sign in to it once and we'll connect the two, so either way in works from now on.",
  email: "Email",
  password: "Password for the existing account",
  forgot: "Forgot?",
  useDifferent: "Use a different email",
  pending: "Signing you in…",
} as const;

export function linkSubmitLabel(provider: OAuthProvider): string {
  return `Sign in & link ${PROVIDER_LABEL[provider]}`;
}
