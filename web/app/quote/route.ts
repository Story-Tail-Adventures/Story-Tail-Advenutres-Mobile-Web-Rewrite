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
 * Nothing is stored and nothing is called. A submission naming no topic we quote from goes
 * to /explore rather than to an error.
 */
export function GET(request: NextRequest) {
  const href = topicQuoteHref(request.nextUrl.searchParams) ?? "/explore";
  return NextResponse.redirect(new URL(href, request.nextUrl), 303);
}
