package api

// portTable lists every function that runs in Go, with the gate its Deno original had
// (config.toml's verify_jwt, the cron jobs, the web-only search). A known name that is not
// here passes through to Supabase. Add a row in the PR that ports the function, never
// before its differential test passes (docs/GO-MIGRATION.md §5.9).
func portTable() map[string]port {
	return map[string]port{}
}
