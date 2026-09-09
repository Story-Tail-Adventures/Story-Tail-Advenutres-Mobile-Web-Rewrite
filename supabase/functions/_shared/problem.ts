/**
 * RFC 7807 problem+json responses.
 *
 * Every Edge Function error goes through here, for one reason: error bodies must not
 * leak SQL text, stack traces, or row counts to a caller. Building the body by hand at
 * each throw site is how that leaks.
 */
import { buildCorsHeaders } from "./cors.ts";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    readonly detail?: string,
  ) {
    super(title);
    this.name = "HttpError";
  }
}

export const unauthorized = (detail?: string) =>
  new HttpError(401, "Unauthorized", detail);
export const forbidden = (detail?: string) =>
  new HttpError(403, "Forbidden", detail);
export const badRequest = (detail?: string) =>
  new HttpError(400, "Bad Request", detail);
export const notFound = (detail?: string) =>
  new HttpError(404, "Not Found", detail);

/**
 * Turn any thrown value into a problem+json Response.
 *
 * Anything that is not an HttpError becomes a generic 500: the real message goes to the
 * function log, where an operator can see it, and never to the caller.
 */
export function problem(err: unknown): Response {
  const headers = {
    ...buildCorsHeaders(),
    "Content-Type": "application/problem+json",
  };

  if (err instanceof HttpError) {
    return new Response(
      JSON.stringify({
        type: "about:blank",
        title: err.title,
        status: err.status,
        ...(err.detail ? { detail: err.detail } : {}),
      }),
      { status: err.status, headers },
    );
  }

  console.error("Unhandled error in Edge Function:", err);
  return new Response(
    JSON.stringify({
      type: "about:blank",
      title: "Internal Server Error",
      status: 500,
    }),
    { status: 500, headers },
  );
}
