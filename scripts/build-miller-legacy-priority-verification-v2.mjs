import { writeFile } from "node:fs/promises"

import rawResources from "../src/vancouver_resources_merged_updated.json" with { type: "json" }
import { stableCuratedResourceId } from "../src/map/mapChat.js"
import { normalizedResourceRows } from "../src/resourceData.js"

const overrides = Object.freeze({
  "curated:1ykkt91": {
    website: "https://lastdoor.org/contact/",
    description: "Youth and adult addiction treatment and recovery programs for males, with direct intake contact through Last Door Recovery Society.",
    phone: "604-525-9771",
    address: "323 8th Street, New Westminster, BC V3M 3R3",
    access: "Call the program or use its official contact form to ask about current admissions, program fit and cost.",
  },
  "curated:193xiju": {
    website: "https://www.csfs.org/programs/substance-use-recovery-program/",
    name: "Carrier Sekani Substance Use Recovery Program",
    description: "Culturally grounded seasonal residential, community and after-care programming for Indigenous adults in British Columbia and Yukon.",
    phone: "250-567-2900",
    address: "240 West Stewart Street, Vanderhoof, BC V0J 3A0",
    population: "Indigenous adults residing in British Columbia or Yukon; current program criteria apply.",
    access: "Review the official application steps, complete the treatment-centre application and medical sections, and contact a wellness worker or the program for current intake dates.",
  },
  "curated:thfx53": {
    website: "https://archway.ca/program/abbotsford-addictions-centre/",
    description: "Free outpatient alcohol and drug counselling, recovery groups and referrals for youth, adults, couples and families affected by substance use.",
    phone: "604-850-5106",
    address: "202-31943 South Fraser Way, Abbotsford, BC V2T 1V5",
    population: "Youth and adults with substance-use concerns, and people affected by another person's substance use.",
    access: "Self-referral and professional referral are accepted; call the centre to start.",
  },
  "curated:1e3mcco": {
    website: "https://hopetransition.org/",
    name: "Hope and Area Transition Society Substance Use Services",
    description: "Adult and youth substance-use support, community-based mental-health/substance-use services and connection to housing, family and recovery supports in Hope and surrounding communities.",
    phone: "604-869-5111",
    address: "400 Park Street, Hope, BC V0X 1L0",
    access: "Call the main office or use the official service inquiry form to confirm the appropriate substance-use program and current access route.",
  },
  "curated:13pq95v": {
    website: "https://www.lcss.ca/programs-and-services/substance-use-services/",
    name: "Langley Community Services Substance Use Services",
    description: "Free outpatient information, counselling, groups, after-care and referrals for people affected by their own or another person's substance use.",
    phone: "604-534-7230 ext. 1108",
    address: "5339 207 Street, Langley, BC V3A 2E6",
    population: "Children, youth, adults and seniors residing in Langley City, Langley Township or Aldergrove.",
    access: "Call the intake worker to start the self-referral process.",
  },
  "curated:1kgx1i3": {
    website: "https://www.charlfordhouse.ca/admissions",
    description: "Structured residential recovery program in Burnaby for women age 19 and older seeking support with substance use.",
    phone: "604-420-4626",
    population: "Women age 19 and older; current admission and funding requirements apply.",
    access: "Contact intake, complete the referral package and required medical sections, then confirm current eligibility, funding and bed availability with the program.",
  },
  "curated:1ko4u58": {
    website: "https://dixonsociety.ca/contact-us/",
    description: "24-hour transition-house intake for women and children seeking safety from violence, with housing and support navigation.",
    phone: "604-298-3454",
    access: "Call the 24-hour Dixon House intake line. The website contact form is not monitored continuously.",
  },
  "curated:ldowha": {
    website: "https://dixonsociety.ca/programs/wendas-place/",
    description: "Second-stage supportive housing for women, children and pets, with counselling, life-skills and resource navigation.",
    phone: "604-298-6046",
    access: "Call the program for current access information. The official page states that Wenda's Place does not maintain a waitlist and the office line is monitored on weekdays.",
  },
  "curated:l9m2tc": {
    website: "https://talithakoumsociety.org/program/",
    description: "Residential recovery programming for women through Starr House and Gianna House in Coquitlam.",
    phone: "604-492-3393",
    access: "Contact the society to confirm current referral, admission and program requirements.",
  },
})

const legacy = normalizedResourceRows(rawResources).map(resource => ({ ...resource, id: stableCuratedResourceId(resource), province: resource.province || "British Columbia" }))
const byId = new Map(legacy.map(resource => [resource.id, resource]))
const records = Object.entries(overrides).map(([id, update]) => {
  const resource = byId.get(id)
  if (!resource) throw new Error(`missing legacy resource ${id}`)
  const website = update.website || resource.website
  if (!website.startsWith("https://")) throw new Error(`non-HTTPS source for ${id}`)
  const name = update.name || resource.name
  return {
    canonical_resource_id: id,
    project_visibility: ["miller"],
    name,
    organization: resource.organization || name,
    categories: [resource.category || resource.serviceType || "practical_support"],
    description: update.description || resource.description,
    population_served: update.population || resource.population || "People seeking the listed practical service",
    province: resource.province,
    community: resource.city || undefined,
    address: update.address || resource.address || undefined,
    physical_location: resource.city ? { community: resource.city, address: update.address || resource.address || undefined, province: resource.province } : undefined,
    local_service_area: resource.city ? [resource.city] : undefined,
    service_area: resource.region || resource.city || resource.province,
    delivery_modes: resource.virtual_service ? ["virtual"] : ["contact service"],
    referral_requirements: update.access || resource.accessType,
    access_pathway: update.access || resource.accessType,
    eligibility: update.population || resource.eligibility || undefined,
    phone: update.phone || resource.phone || undefined,
    website,
    source: { title: name, authority: resource.organization || name, url: website },
    last_verified_date: "2026-09-08",
  }
})

const output = {
  schema_version: "miller-legacy-priority-verification-v2",
  generated_at: "2026-09-08",
  selection_method: ["high-use practical service", "stale verification blocked mobile readiness", "current first-party source available"],
  verification_scope: "Bounded nine-record enrichment. Contact, scope and access details were refreshed from current first-party pages; missing facts were not inferred.",
  deferred: [{ canonical_resource_id: "curated:dhc0z6", reason: "Unresolved duplicate with curated:1km2iyf; active first-party source confirmed but mobile-ready remains blocked pending canonical duplicate reconciliation." }],
  records,
}

await writeFile(new URL("../src/data/miller-legacy-priority-verification-v2-2026-09-08.json", import.meta.url), `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify({ generated: records.length, deferred: output.deferred.length }))
