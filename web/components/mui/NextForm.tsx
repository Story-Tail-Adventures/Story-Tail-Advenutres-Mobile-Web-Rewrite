"use client";

/**
 * next/form as a client reference, so a Server Component can hand it to an MUI component:
 * `<Paper component={NextForm} action="/explore/results">`. Same reason NextLink.tsx exists:
 * a Server Component cannot pass a function across the boundary, but it can pass a client
 * reference, and the search pill has to BE the form (the cells are its flex children).
 */
export { default } from "next/form";
