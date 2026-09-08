# Farm recovery assessment

## Verified state

- The private `samwise-private` Supabase project is active and its organization reports a Pro subscription.
- Supabase documents daily backups with seven days of retention for Pro projects. Point-in-time recovery is a separate add-on and was not verified as enabled for this project.
- No destructive restore was attempted.
- The local recovery manifest covers the listener registry, legal source registry, shared resource registry, versioned legal query taxonomy, append-only Farm run history and scheduler state.
- Six included files passed SHA-256 verification. The Igor credential and replay/security material were intentionally excluded.

## Gaps

- No owner-approved encrypted off-host destination or encryption-key custody procedure is configured for local listener memory and run history.
- Supabase dashboard settings for point-in-time recovery and the exact oldest restorable private-project backup were not available through the bounded management interface and require owner-console confirmation.
- A full restore of Miller/Samwise application state has not been rehearsed.

## Recommended supervised drill

1. Choose an encrypted off-host destination and assign key custody.
2. Export only the files enumerated by the recovery manifest; keep credentials separate.
3. Restore into an isolated temporary workspace and verify all manifest hashes.
4. Restore a private Supabase backup into a disposable recovery project or supported branch, never over production.
5. Run listener-memory parsing, scheduler-state validation and privacy tests.
6. Record recovery point, duration and unresolved gaps, then destroy the temporary recovery environment through the approved owner workflow.

No backup policy, credential, production data, or Supabase recovery setting was changed in this pass.
