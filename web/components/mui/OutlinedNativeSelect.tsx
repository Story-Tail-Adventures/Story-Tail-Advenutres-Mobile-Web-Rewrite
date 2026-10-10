"use client";

import NativeSelect, { type NativeSelectProps } from "@mui/material/NativeSelect";
import OutlinedInput from "@mui/material/OutlinedInput";

/**
 * A real <select> in MUI's outlined box, safe to render from a Server Component.
 *
 * NativeSelect's `input` prop is an ELEMENT that NativeSelect clones and reads `.props` off.
 * Written in a Server Component, `input={<OutlinedInput />}` arrives as a server reference
 * with no readable props, and the page 500s during server rendering ("Cannot read properties
 * of undefined (reading 'inputProps')") — the browser then quietly re-renders it client-side,
 * so the page looks fine. Building the element here, on the client side of the boundary,
 * avoids that. Server Components pass plain props (id, name, defaultValue, <option>s).
 */
export function OutlinedNativeSelect({
  size = "small",
  ...props
}: Omit<NativeSelectProps, "input"> & { size?: "small" | "medium" }) {
  return <NativeSelect {...props} input={<OutlinedInput size={size} />} />;
}
