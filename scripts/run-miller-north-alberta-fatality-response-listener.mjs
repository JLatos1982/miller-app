import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
  buildAlbertaFatalityResponseSnapshot,
  compareAlbertaFatalityResponseSnapshots,
} from "../server/millerNorthAlbertaFatalityResponseListener.js"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const args = process.argv.slice(2)
const valueAfter = flag => {
  const index = args.indexOf(flag)
  return index === -1 ? null : args[index + 1]
}
const workbookPath = valueAfter("--workbook")
const caseName = valueAfter("--case") || "T.M.,C.L.,S.R., E.S."
const metadataUrl = "https://open.alberta.ca/api/3/action/package_show?id=responses-to-public-fatality-inquiry-recommendations"

async function currentWorkbook() {
  if (workbookPath) return readFileSync(resolve(workbookPath))
  const metadataResponse = await fetch(metadataUrl, { redirect: "follow", signal: AbortSignal.timeout(30_000) })
  if (!metadataResponse.ok) throw new Error(`alberta_fatality_metadata_fetch_${metadataResponse.status}`)
  const metadata = await metadataResponse.json()
  const resource = metadata?.result?.resources?.find(item => /\.xlsx(?:$|\?)/i.test(item.url || "") || /excel/i.test(item.format || ""))
  if (!resource?.url || !/^https:\/\/open\.alberta\.ca\//.test(resource.url)) throw new Error("alberta_fatality_workbook_not_located")
  const response = await fetch(resource.url, { redirect: "follow", signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error(`alberta_fatality_workbook_fetch_${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

const outputPath = resolve(root, "artifacts/miller-north/miller-north-alberta-fatality-response-snapshot-v1.json")
let previous
try { previous = JSON.parse(readFileSync(outputPath, "utf8")) } catch { previous = null }
const current = buildAlbertaFatalityResponseSnapshot(await currentWorkbook(), { caseName })
const comparison = compareAlbertaFatalityResponseSnapshots(previous, current)
const output = { ...current, checked_at: new Date().toISOString(), changes_since_previous: comparison }

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify({ responder_rows: output.responder_rows, distinct_recommendations: output.distinct_recommendations, status_counts: output.status_counts, added_rows: comparison.added.length, changed_rows: comparison.changed.length, removed_rows: comparison.removed.length, production_writes: 0 }, null, 2))
