"use client";

/**
 * next/link as a client reference, so a Server Component can hand it to an MUI component:
 * `<Button component={NextLink} href="/trips">`. A Server Component cannot pass a function
 * across the boundary, but it can pass a client reference — the same pattern MUI's own
 * Next.js example uses.
 */
export { default } from "next/link";
