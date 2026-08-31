import assert from "node:assert/strict"
import test from "node:test"
import { verifyCanonicalCorrectionParityBundle } from "../server/canonicalCorrectionParityBundle.js"

const bundlePath = new URL("../artifacts/samwise/miller-canonical-field-correction-v1-local-e2e", import.meta.url).pathname
const manifestSha256 = "027bdbe150b01bdffb2a91e0c11d126335b2b181c97bb07e4cedf1f6c09bf92e"

test("canonical correction parity bundle hashes and exported request fingerprints are self-consistent", () => {
  const result = verifyCanonicalCorrectionParityBundle({ bundlePath, expectedManifestSha256: manifestSha256 })
  assert.equal(result.outcome, "miller_canonical_correction_parity_bundle_self_consistent_verified")
  assert.equal(result.vector_count, 10)
  assert.equal(result.request_vector_count, 3)
})
