import MuiDivider from "@mui/material/Divider";

/** A 1px rule in the theme's divider colour (`--md-outline-variant`). Renders an <hr>. */
export function Divider({ className }: { className?: string }) {
  return <MuiDivider className={className} />;
}

/**
 * A labelled rule — "———— OR ————". Used between the social and email sign-in
 * blocks on 2.1.1 / 2.1.2. MUI draws the two lines as pseudo-elements around the label, so
 * this is one element rather than the legacy flex row of two rules and a span.
 */
export function DividerWithLabel({ label }: { label: string }) {
  return (
    // role="none": MUI gives a labelled Divider role="separator", whose children are
    // presentational, so some screen readers skip the label. The legacy row was plain text.
    <MuiDivider role="none" sx={{ typography: "caption", color: "text.secondary" }}>
      {label}
    </MuiDivider>
  );
}
