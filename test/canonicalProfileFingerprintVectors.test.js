import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { canonicalProfileFingerprint } from "../server/canonicalProfile.js"

const vectors = JSON.parse(readFileSync(new URL("./fixtures/canonical-profile-fingerprint-v1.json", import.meta.url), "utf8"))

test("canonical profile fingerprint vectors define the shared JavaScript/Samwise contract", () => {
  for (const vector of vectors) assert.equal(canonicalProfileFingerprint(vector.input), vector.sha256, vector.id)
})
