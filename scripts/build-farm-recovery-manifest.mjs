import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { buildFarmRecoveryManifest, verifyFarmRecoveryManifest } from "../server/farmRecovery.js"

const root = resolve(fileURLToPath(new URL("..", import.meta.url)))
const paths = [
  "src/data/farm-listener-registry-v1.json",
  "src/data/miller-legal-source-registry-v1.json",
  "src/data/miller-shared-resource-registry-v1.json",
  "src/data/farm-legal-query-taxonomy-v2.json",
  ".farm-operations/farm-job-run-history-v1.ndjson",
  ".farm-operations/farm-job-state-v1.json",
  ".farm-operations/igor-worker-credential-v1.json"
]
const manifest = buildFarmRecoveryManifest({ root, paths })
const verification = verifyFarmRecoveryManifest({ root, manifest })
const output = { ...manifest, verification, recovery_boundaries: { off_host_copy: "not_configured", reason: "No owner-approved encrypted destination and key-custody mechanism is configured.", supabase_private_project: "Pro plan confirmed; platform database backup retention/PITR settings still require owner console verification.", restore_drill: "manifest verification only; no destructive restore performed" } }
const path = resolve(root, "artifacts/farm-operations/farm-recovery-manifest-v1.json")
mkdirSync(resolve(root, "artifacts/farm-operations"), { recursive: true })
writeFileSync(path, `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify({ path, files: output.files.length, excluded: output.excluded.length, verification }, null, 2))
