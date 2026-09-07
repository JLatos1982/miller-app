import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
  buildAlbertaFatalityResponseSnapshot,
  compareAlbertaFatalityResponseSnapshots,
} from "../server/millerNorthAlbertaFatalityResponseListener.js"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const args = process.argv.slice(2)
const valueAfter = flag => args[args.indexOf(flag) + 1]
const workbookPath = valueAfter("--workbook")
const caseName = valueAfter("--case") || "T.M.,C.L.,S.R., E.S."
if (!workbookPath) throw new Error("Usage: npm run listen:miller-north-alberta-fatality -- --workbook /path/to/public.xlsx [--case case-name]")

const outputPath = resolve(root, "artifacts/miller-north/miller-north-alberta-fatality-response-snapshot-v1.json")
let previous
try { previous = JSON.parse(readFileSync(outputPath, "utf8")) } catch { previous = null }
const current = buildAlbertaFatalityResponseSnapshot(readFileSync(resolve(workbookPath)), { caseName })
const comparison = compareAlbertaFatalityResponseSnapshots(previous, current)
const output = { ...current, checked_at: new Date().toISOString(), changes_since_previous: comparison }

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify({ responder_rows: output.responder_rows, distinct_recommendations: output.distinct_recommendations, status_counts: output.status_counts, added_rows: comparison.added.length, changed_rows: comparison.changed.length, removed_rows: comparison.removed.length, production_writes: 0 }, null, 2))
