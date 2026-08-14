import { execFileSync } from "node:child_process"
import fs from "node:fs/promises"

const SOURCE_URL = "https://www.bchousing.org/housing-assistance/women-fleeing-violence/transition-houses-safe-homes"
const OUTPUT = new URL("../data/shelter-candidates-bc-transition-houses.json", import.meta.url)
const checkedAt = new Date().toISOString()
const decode = (value = "") => String(value).replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&#x2B;/g, "+")
const text = (html = "") => decode(html.replace(/<br\s*\/?\s*>/gi, " · ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()

const html = execFileSync("curl", ["-sS", "--fail", SOURCE_URL], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 })
const table = html.match(/<table[^>]*>[\s\S]*?Location[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i)?.[1]
if (!table) throw new Error("BC Housing transition-house table was not found")
const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) => [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cell[1])).filter((cells) => cells.length >= 5)

const candidates = rows.map(([locationHtml, operatorHtml, programHtml, contactHtml, typeHtml]) => {
  const community = text(locationHtml), operator = text(operatorHtml), name = text(programHtml), programType = text(typeHtml)
  const phone = decode(contactHtml.match(/href="tel:([^"]+)"/i)?.[1] || "").trim()
  const operatorUrl = operatorHtml.match(/href="(https:\/\/[^"#]+)"/i)?.[1] || ""
  return {
    name, operator, shelter_type: /safe home/i.test(programType) ? "domestic_violence_safe_home" : /second stage/i.test(programType) ? "domestic_violence_second_stage" : "domestic_violence_transition_house",
    population_served: "People seeking safety from violence; consult the public program contact for eligibility", community,
    public_address: "", location_disclosure_status: "confidential", crisis_line: phone, website: operatorUrl,
    source_url: SOURCE_URL, source_name: "BC Housing Transition Houses & Safe Homes List", retrieved_title: "Transition Houses & Safe Homes List",
    source_excerpt: `${programType}; ${community}; public contact ${text(contactHtml).replace(/Email/g, "email available through source")}.`,
    evidence_notes: "BC Housing intentionally publishes the service area and contact method without a street address. Never infer, reconstruct, geocode, or map this location.",
    managed_alcohol_program: "not_stated", confidence: "high", checked_at: checkedAt,
  }
})

await fs.writeFile(OUTPUT, `${JSON.stringify({ version: "miller-bc-transition-houses-v1.0.0", generated_at: checkedAt, source_url: SOURCE_URL, coordinates_retained: 0, candidates }, null, 2)}\n`)
console.log(JSON.stringify({ output: OUTPUT.pathname, candidates: candidates.length, communities: new Set(candidates.map((x) => x.community)).size, confidential: candidates.length, addresses: 0, coordinates_retained: 0 }, null, 2))
