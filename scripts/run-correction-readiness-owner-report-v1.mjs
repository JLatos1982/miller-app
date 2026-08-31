import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { CORRECTION_READINESS_VERSION } from "../server/correctionReadiness.js"
import { buildCorrectionReadinessOwnerReport, formatCorrectionReadinessOwnerReport } from "../server/correctionReadinessReport.js"

const fixturePath = resolve(process.argv[2] || "test/fixtures/correction-readiness-v1.json")
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"))
if (fixture.version !== CORRECTION_READINESS_VERSION || !Array.isArray(fixture.candidates)) throw new Error("correction_readiness_fixture_invalid")
const report = buildCorrectionReadinessOwnerReport(fixture.candidates, { now: Date.parse(fixture.now) })
process.stdout.write(formatCorrectionReadinessOwnerReport(report))
