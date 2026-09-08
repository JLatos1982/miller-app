import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { buildFarmRecoveryManifest, verifyFarmRecoveryManifest } from "../server/farmRecovery.js"

test("recovery manifests exclude credentials and verify hashes without restoring", () => {
  const root = mkdtempSync(join(tmpdir(), "farm-recovery-"))
  writeFileSync(join(root, "state.json"), "safe")
  writeFileSync(join(root, "worker-credential.json"), "secret")
  const manifest = buildFarmRecoveryManifest({ root, paths: ["state.json", "worker-credential.json"] })
  assert.equal(manifest.files.length, 1)
  assert.equal(manifest.excluded.length, 1)
  assert.equal(manifest.contains_credentials, false)
  assert.equal(verifyFarmRecoveryManifest({ root, manifest }).verified, 1)
  writeFileSync(join(root, "state.json"), "changed")
  const result = verifyFarmRecoveryManifest({ root, manifest })
  assert.equal(result.failures[0].status, "changed")
  assert.equal(result.destructive_restore_performed, false)
})
