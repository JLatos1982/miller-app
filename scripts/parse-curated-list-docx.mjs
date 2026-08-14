import { execFileSync } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import { parseCounsellingDocumentXml } from "../server/curatedLists.js"

const input = path.resolve(process.argv[2] || "Low cost counselling list.docx")
const output = path.resolve(process.argv[3] || "data/low-cost-counselling-draft.json")
const xml = execFileSync("unzip", ["-p", input, "word/document.xml"], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 })
const parsed = parseCounsellingDocumentXml(xml, { filename: path.basename(input) })
await fs.writeFile(output, `${JSON.stringify(parsed, null, 2)}\n`)
console.log(JSON.stringify({ output, ...parsed.summary, source_sha256: parsed.source_sha256 }, null, 2))
