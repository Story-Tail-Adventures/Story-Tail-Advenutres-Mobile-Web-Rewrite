import { NextResponse, type NextRequest } from "next/server";
import { topicQuoteHref } from "./href";

/**
 * The Caribbean and Honeymoons inquiry bars submit here (a GET form), and this only
 * redirects: it builds the quote request link from what the visitor typed and sends them
 * through the sign-up gate to Screen 2.3.8 with it filled in.
 *
 * It is a route rather than a link because the bar's values are not known until submit, and
 * the quote form's address nests them inside the gate's `next=` — something a GET form
 * cannot write by itself. Working without JavaScript comes for free.
 *
 * The Location is RELATIVE on purpose. The target is always our own path, and an absolute URL
 * built from the request would carry whatever host the request arrived with — behind a
 * rewrite or proxy, an internal one. The browser resolves a relative Location against the
 * address it actually used.
 *
 * Nothing is stored and nothing is called. A submission naming no topic goes to /explore
 * rather than to an error.
 */
export function GET(request: NextRequest) {
  const href = topicQuoteHref(request.nextUrl.searchParams) ?? "/explore";
  return new NextResponse(null, { status: 303, headers: { Location: href } });
}
