/**
 * §3.12.1: `agent.avatar_url` holds a PATH in the public bucket
 * ("/storage/v1/object/public/agent-avatars/…"), never an absolute URL (Data-Model §7.1). This
 * puts it on the Supabase origin the browser uses. Pure: the origin is passed in.
 */
export function avatarSrc(path: string | null | undefined, supabaseOrigin: string): string | null {
  if (!path || !path.startsWith("/storage/v1/object/public/agent-avatars/")) return null;
  try {
    return new URL(path, supabaseOrigin).toString();
  } catch {
    return null;
  }
}
