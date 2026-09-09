import projection from "../data/miller-north-access-equity-public-v1.json"

// This file is deliberately public-safe. It is the projection created after
// the dual publication gate; private and owner-review candidates stay in
// Palantír artifacts and are never imported by the public client.
export const ACCESS_EQUITY_PUBLIC_PROJECTION = Object.freeze({
  schema_version: projection.schema_version,
  findings: Object.freeze(projection.findings),
  suggested_follow_ups: Object.freeze(projection.suggested_follow_ups),
})
