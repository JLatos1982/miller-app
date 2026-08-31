import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { CORRECTION_READINESS_VERSION, rankCorrectionReadiness } from "../server/correctionReadiness.js"

const fixturePath = resolve(process.argv[2] || "test/fixtures/correction-readiness-v1.json")
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"))
if (fixture.version !== CORRECTION_READINESS_VERSION || !Array.isArray(fixture.candidates)) throw new Error("correction_readiness_fixture_invalid")
const ranked = rankCorrectionReadiness(fixture.candidates, { now: Date.parse(fixture.now) })
console.log(JSON.stringify({ version: CORRECTION_READINESS_VERSION, mode: "fixture_only_no_live_access", ranked: ranked.map(({ candidate: _candidate, ...result }) => result) }, null, 2))
