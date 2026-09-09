import { ResultsSkeleton } from "./ResultsSkeleton";

/** Streams while /explore/results parses the URL and filters the catalog (Screen Inventory §5). */
export default function Loading() {
  return <ResultsSkeleton />;
}
