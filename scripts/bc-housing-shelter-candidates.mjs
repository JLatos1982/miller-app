import { execFileSync } from "node:child_process"
import fs from "node:fs/promises"

const SOURCE_URL = "https://smap.bchousing.org/"
const OUTPUT = new URL("../data/shelter-candidates-bc-housing.json", import.meta.url)
const checkedAt = new Date().toISOString()

const decode = (value = "") => value.replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&amp;", "&").replaceAll("&#x2B;", "+").replaceAll("&#x2013;", "–").replaceAll("&#x2019;", "’")
const clean = (value = "") => decode(String(value)).replace(/\s+/g, " ").trim()
const invalidAddress = /^(?:\*+|phone|call|address (?:redacted|withheld)|confidential|undisclosed)/i

const healthAuthority = (city) => {
  const groups = {
    "Fraser Health": ["Abbotsford", "Burnaby", "Chilliwack", "Coquitlam", "Hope", "Langley", "Maple Ridge", "Mission", "New Westminster", "Surrey"],
    "Vancouver Coastal Health": ["North Vancouver", "Powell River", "Richmond", "Sechelt", "Squamish", "Vancouver", "Vancovuer"],
    "Island Health": ["Campbell River", "Courtenay", "Duncan", "Ladysmith", "Nanaimo", "North Cowichan", "Port Alberni", "Port Hardy", "Saanich", "Salt Spring Island", "Victoria"],
    "Northern Health": ["Chetwynd", "Dawson Creek", "Fort Nelson", "Fort St. John", "Kitimat", "Prince George", "Prince Rupert", "Quesnel", "Smithers", "Terrace"],
  }
  return Object.entries(groups).find(([, cities]) => cities.includes(city))?.[0] || "Interior Health"
}

const html = execFileSync("curl", ["-sS", "--fail", SOURCE_URL], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 })
const embedded = html.match(/value="(\[\{&quot;Operator&quot;[\s\S]*?\}\])"/)?.[1]
if (!embedded) throw new Error("BC Housing embedded shelter inventory was not found")
const rows = JSON.parse(decode(embedded)).filter((row) => clean(row.ShelterType) !== "Drop-in Centres")

const candidates = rows.map((row) => {
  const operator = clean(row.Operator), rawCity = clean(row.City), city = rawCity === "Vancovuer" ? "Vancouver" : rawCity
  const rawAddress = clean(row.Address), address = invalidAddress.test(rawAddress) ? "" : rawAddress
  const type = clean(row.ShelterType) === "Temporary Shelter" ? "temporary_shelter" : "year_round_emergency_shelter"
  const eligibility = clean(row.Type).replace(/^.*? - /, "")
  const addressLabel = address.split(",")[0]
  return {
    name: `${operator} — ${city} ${type === "temporary_shelter" ? "Temporary" : "Year-Round"} Shelter${!/all clients/i.test(eligibility) && eligibility ? ` — ${eligibility}` : ""}${addressLabel ? ` (${addressLabel})` : ""}`,
    operator, shelter_type: type, population_served: eligibility || "Not stated", community: city,
    region: healthAuthority(city).replace(/ Health$/, ""), health_authority: healthAuthority(city),
    public_address: address, location_disclosure_status: address ? "public" : "undisclosed", address_intentionally_public: Boolean(address),
    phone: clean(row.Phone), website: /^https?:\/\//i.test(clean(row.Website)) ? clean(row.Website) : "",
    capacity: Number.isFinite(row.BedsCount) ? `${row.BedsCount} beds listed by BC Housing` : "",
    source_url: SOURCE_URL, source_name: "BC Housing Emergency Shelter Map", retrieved_title: "BC Housing Shelter Map",
    source_excerpt: `${clean(row.ShelterType)}; ${eligibility || "eligibility not stated"}; ${Number.isFinite(row.BedsCount) ? `${row.BedsCount} beds` : "capacity not stated"}.`,
    evidence_notes: "Current BC Housing map listing. The source does not expose a shelter-name field, so the displayed candidate name combines operator, community, shelter type, and public street label and requires editorial review. Coordinate fields supplied by the source were deliberately discarded.",
    managed_alcohol_program: "not_stated", confidence: "medium", checked_at: checkedAt,
  }
})

const output = { version: "miller-bc-housing-shelters-v1.0.0", generated_at: checkedAt, source_url: SOURCE_URL, source_rows: rows.length, coordinates_retained: 0, candidates }
await fs.writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify({ output: OUTPUT.pathname, candidates: candidates.length, communities: new Set(candidates.map((x) => x.community)).size, public_addresses: candidates.filter((x) => x.public_address).length, undisclosed: candidates.filter((x) => !x.public_address).length, coordinates_retained: 0 }, null, 2))
