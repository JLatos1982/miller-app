import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { CORRECTION_READINESS_VERSION } from "../server/correctionReadiness.js"
import { buildCorrectionReadinessChangeDigest, formatCorrectionReadinessChangeDigest } from "../server/correctionReadinessDigest.js"

const fixturePath = resolve(process.argv[2] || "test/fixtures/correction-readiness-digest-v1.json")
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"))
if (fixture.version !== CORRECTION_READINESS_VERSION || !Array.isArray(fixture.previous) || !Array.isArray(fixture.current)) throw new Error("correction_readiness_digest_fixture_invalid")
const digest = buildCorrectionReadinessChangeDigest(fixture.previous, fixture.current, { now: Date.parse(fixture.now) })
process.stdout.write(formatCorrectionReadinessChangeDigest(digest))
