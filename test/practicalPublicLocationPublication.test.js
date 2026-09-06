import test from "node:test"
import assert from "node:assert/strict"
import { evaluatePracticalLocationCandidates, publishPracticalPublicLocation, publishPracticalPublicLocations, semanticResourceIdentityOverlap } from "../server/practicalPublicLocationPublication.js"

const resourceId = "00000000-0000-4000-8000-000000009901"
const actorId = "00000000-0000-4000-8000-000000009902"
const feature = {
  geometry: { coordinates: [-123.101, 49.281] },
  properties: {
    fullAddress: "100 Main Street, Vancouver, BC", civicNumber: "100", streetName: "Main", streetType: "Street",
    localityName: "Vancouver", provinceCode: "BC", score: 100, precisionPoints: 100,
    matchPrecision: "CIVIC_NUMBER", locationDescriptor: "parcelPoint", siteID: "practical-fixture", faults: [],
  },
}

function dbFor({ preflight = { status: "eligible_publicly_listed_location" }, publication = { status: "published" } } = {}) {
  const calls = []
  return {
    calls,
    from(table) {
      assert.equal(table, "resource_registry")
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  return { data: { id: resourceId, display_name: "Practical Centre", lifecycle_state: "active", editorial_status: "approved" }, error: null }
                },
              }
            },
          }
        },
      }
    },
    async rpc(name, args) {
      calls.push({ name, args })
      if (name === "preflight_public_location_v1") return { data: preflight, error: null }
      if (name === "publish_practical_public_location_v1") return { data: publication, error: null }
      throw new Error(`unexpected RPC ${name}`)
    },
  }
}

const trustedSource = async () => ({
  url: "https://provider.example.test/location",
  source_quality: "credible_primary",
  fingerprint: "trusted-source-fixture",
  segments: [{ evidence_id: "source_01", text: "Practical Centre offers appointments at 100 Main Street in Vancouver." }],
})
const geocode = async () => ({ ok: true, status: "matched", features: [feature] })

test("trusted helper reads source, extracts a civic address, geocodes, preflights, and publishes", async () => {
  const db = dbFor()
  const output = await publishPracticalPublicLocation({
    db, resourceId, actorId, source: { url: "https://provider.example.test/location", locality: "Vancouver", title: "Provider location" }, readSource: trustedSource, geocode,
  })
  assert.equal(output.outcome, "published")
  assert.equal(output.publication_attempted, true)
  assert.deepEqual(db.calls.map((call) => call.name), ["preflight_public_location_v1", "publish_practical_public_location_v1"])
  const pkg = db.calls[0].args.p_package
  assert.equal(pkg.canonical_address, "100 Main Street")
  assert.equal(pkg.source_reader, "samwise_farm_source_reader_v1")
  assert.equal(pkg.geocoder.coordinates.latitude, 49.281)
  assert.equal(pkg.coordinates, undefined, "the helper does not provide a separate raw coordinate")
})

test("trusted helper stops at a rejected preflight without attempting publication", async () => {
  const db = dbFor({ preflight: { status: "hold_existing_location_conflict" } })
  const output = await publishPracticalPublicLocation({
    db, resourceId, source: { url: "https://provider.example.test/location", locality: "Vancouver" }, readSource: trustedSource, geocode,
  })
  assert.equal(output.outcome, "preflight_rejected")
  assert.equal(output.publication_attempted, false)
  assert.deepEqual(db.calls.map((call) => call.name), ["preflight_public_location_v1"])
})

test("trusted helper rejects ambiguous civic extraction before any database write RPC", async () => {
  const db = dbFor()
  const output = await publishPracticalPublicLocation({
    db, resourceId, source: { url: "https://provider.example.test/location", locality: "Vancouver" },
    readSource: async () => ({ ...await trustedSource(), segments: [{ evidence_id: "source_01", text: "Practical Centre operates at 100 Main Street and 200 Side Road." }] }),
    geocode,
  })
  assert.equal(output.outcome, "ambiguous_civic_address")
  assert.equal(db.calls.length, 0)
})

test("trusted helper stops weak geocoding before preflight or publication", async () => {
  const db = dbFor()
  const weak = { ...feature, properties: { ...feature.properties, score: 90, matchPrecision: "STREET", locationDescriptor: "streetPoint" } }
  const output = await publishPracticalPublicLocation({
    db, resourceId, source: { url: "https://provider.example.test/location", locality: "Vancouver" }, readSource: trustedSource,
    geocode: async () => ({ ok: true, status: "matched", features: [weak] }),
  })
  assert.match(output.outcome, /^geocoder_/)
  assert.equal(db.calls.length, 0)
})

test("trusted helper sends a conservative practical 99/accesspoint package only after same-civic resolution", async () => {
  const db = dbFor()
  const practical = { ...feature, properties: { ...feature.properties, score: 99, precisionPoints: 99, matchPrecision: "BLOCK", locationDescriptor: "accessPoint" } }
  const fallback = { ...feature, properties: { ...feature.properties, fullAddress: "Main Street, Vancouver, BC", civicNumber: "", score: 77, precisionPoints: 78, matchPrecision: "STREET", locationDescriptor: "streetPoint" } }
  const output = await publishPracticalPublicLocation({
    db, resourceId, source: { url: "https://provider.example.test/location", locality: "Vancouver" }, readSource: trustedSource,
    geocode: async () => ({ ok: true, status: "matched", features: [practical, fallback] }),
  })
  assert.equal(output.outcome, "published")
  const geocoder = db.calls[0].args.p_package.geocoder
  assert.equal(geocoder.score, 99)
  assert.equal(geocoder.location_descriptor, "accesspoint")
  assert.equal(geocoder.candidate_identity_clear, true)
  assert.equal(geocoder.materially_competing_candidate, false)
})

test("trusted helper records an unavailable official page and uses the next supplied trusted source", async () => {
  const db = dbFor()
  const output = await publishPracticalPublicLocation({
    db, resourceId,
    sources: [
      { url: "https://official.example.test/program", locality: "Vancouver" },
      { url: "https://bc.211.ca/program", locality: "Vancouver", title: "BC 211 listing" },
    ],
    readSource: async ({ url }) => {
      if (url.includes("official.")) throw new Error("farm_source_unavailable")
      return trustedSource()
    },
    geocode,
  })
  assert.equal(output.outcome, "published")
  assert.equal(output.fallback_used, true)
  assert.deepEqual(output.attempts.map((attempt) => attempt.outcome), ["official_source_unavailable", "published"])
  assert.deepEqual(db.calls.map((call) => call.name), ["preflight_public_location_v1", "publish_practical_public_location_v1"])
})

test("multi-location evaluator retains two program-labelled sites and excludes an unrelated office", () => {
  const resource = { display_name: "Recovery Program" }
  const text = `Recovery Program location: 100 Main Street.${" ".repeat(1000)}Recovery Program location: 200 Side Road.${" ".repeat(1000)}Corporate office: 300 Admin Avenue.`
  const candidates = evaluatePracticalLocationCandidates({ resource, sourceText: text, candidates: ["100 Main Street", "200 Side Road", "300 Admin Avenue"] })
  assert.deepEqual(candidates.map((item) => item.program_site_disposition), ["program_site_supported", "program_site_supported", "site_context_unknown"])
})

test("program linkage requires the target program phrase, not a parent agency or hospital word", () => {
  const resource = { display_name: "Road to Recovery - St. Paul's Hospital", organization: "Providence Health Care" }
  const text = "Providence Health Care operates St. Paul's Hospital. Address 1190 Hornby Street, Vancouver. Road to Recovery is a separate service listing."
  const [candidate] = evaluatePracticalLocationCandidates({ resource, sourceText: text, candidates: ["1190 Hornby Street"] })
  assert.equal(candidate.program_site_disposition, "site_context_unknown")
})

test("candidate ordering does not affect supported-site disposition", () => {
  const resource = { display_name: "Recovery Program" }
  const text = "Recovery Program at 100 Main Street. Corporate office at 300 Admin Avenue. Recovery Program at 200 Side Road."
  const forward = evaluatePracticalLocationCandidates({ resource, sourceText: text, candidates: ["100 Main Street", "300 Admin Avenue", "200 Side Road"] })
  const reverse = evaluatePracticalLocationCandidates({ resource, sourceText: text, candidates: ["200 Side Road", "300 Admin Avenue", "100 Main Street"] })
  const support = (items) => Object.fromEntries(items.map((item) => [item.address, item.program_site_disposition]))
  assert.deepEqual(support(forward), support(reverse))
  assert.deepEqual(support(forward), { "100 Main Street": "program_site_supported", "300 Admin Avenue": "site_context_unknown", "200 Side Road": "program_site_supported" })
})

test("a BC 211 result-page service record may link a split heading and contact card, but an agency page may not", () => {
  const resource = { display_name: "Recovery Program" }
  const text = `Recovery Program${" ".repeat(500)}Address 100 Main Street, Vancouver.`
  const [resultPage] = evaluatePracticalLocationCandidates({ resource, sourceText: text, sourceUrl: "https://bc.211.ca/result/recovery-program-123/", candidates: ["100 Main Street"] })
  const [agencyPage] = evaluatePracticalLocationCandidates({ resource, sourceText: text, sourceUrl: "https://bc.211.ca/agency-details/provider-123/", candidates: ["100 Main Street"], structure: [{ structure_id: "agency", kind: "section_block", heading: "Recovery Program", text: "Four services. Address 100 Main Street" }] })
  assert.equal(resultPage.program_site_disposition, "program_site_supported")
  assert.equal(agencyPage.program_site_disposition, "site_context_unknown")
})

test("multi-location helper publishes each independently supported site", async () => {
  const db = dbFor()
  const source = async () => ({ url: "https://provider.example.test/locations", source_quality: "credible_primary", fingerprint: "multi-fixture", segments: [{ text: "Practical Centre location: 100 Main Street. Practical Centre location: 200 Side Road." }] })
  const geocodeEach = async ({ street_address }) => ({ ok: true, status: "matched", features: [{ ...feature, properties: { ...feature.properties, fullAddress: `${street_address}, Vancouver, BC`, civicNumber: street_address.match(/^\d+/)?.[0], streetName: street_address.includes("Side") ? "Side" : "Main", streetType: street_address.includes("Road") ? "Road" : "Street" } }] })
  const output = await publishPracticalPublicLocations({ db, resourceId, source: { url: "https://provider.example.test/locations", locality: "Vancouver" }, readSource: source, geocode: geocodeEach })
  assert.equal(output.outcome, "multi_location_supported")
  assert.equal(output.publications.length, 2)
  assert.equal(output.publications.every((item) => item.outcome === "published"), true)
  assert.equal(db.calls.filter((call) => call.name === "publish_practical_public_location_v1").length, 2)
})

test("same-section structure supports an address beyond the 350-character fallback", () => {
  const text = `Practical Centre ${"details ".repeat(80)} 100 Main Street.`
  const [candidate] = evaluatePracticalLocationCandidates({ resource: { display_name: "Practical Centre" }, sourceText: text, candidates: ["100 Main Street"], structure: [{ structure_id: "s1", kind: "section_block", heading: "Practical Centre", text: `${"details ".repeat(80)} 100 Main Street` }] })
  assert.equal(candidate.current_rule_supported, false)
  assert.equal(candidate.structural_linkage_supported, true)
  assert.equal(candidate.program_site_disposition, "program_site_supported")
})

test("heading structure supports both heading-before and heading-after address cards", () => {
  const resource = { display_name: "Practical Centre" }
  const structure = [
    { structure_id: "before", kind: "div_block", heading: "Practical Centre", text: "100 Main Street", attributes: "location card" },
    { structure_id: "after", kind: "div_block", heading: "", text: "200 Side Road Practical Centre", attributes: "location card" },
  ]
  const result = evaluatePracticalLocationCandidates({ resource, sourceText: "100 Main Street. 200 Side Road.", candidates: ["100 Main Street", "200 Side Road"], structure })
  assert.deepEqual(result.map((item) => item.program_site_disposition), ["program_site_supported", "program_site_supported"])
})

test("structured reader blocks bridge a flat-text chunk boundary", () => {
  const [candidate] = evaluatePracticalLocationCandidates({ resource: { display_name: "Practical Centre" }, sourceText: `Practical Centre ${"x".repeat(1000)} 100 Main Street`, candidates: ["100 Main Street"], structure: [{ structure_id: "chunk", kind: "article_block", heading: "Practical Centre", text: "Contact at 100 Main Street" }] })
  assert.equal(candidate.program_site_disposition, "program_site_supported")
  assert.equal(candidate.linkage_reason, "same_structural_block")
})

test("parent office and footer blocks remain rejected despite structural proximity", () => {
  const resource = { display_name: "Practical Centre" }
  const structure = [
    { structure_id: "office", kind: "div_block", heading: "Practical Centre", text: "Corporate office 100 Main Street", attributes: "contact card" },
    { structure_id: "footer", kind: "section_block", heading: "Practical Centre", text: "Global footer head office 200 Side Road" },
  ]
  const result = evaluatePracticalLocationCandidates({ resource, sourceText: "Corporate office 100 Main Street. Global footer head office 200 Side Road. Practical Centre.", candidates: ["100 Main Street", "200 Side Road"], structure })
  assert.deepEqual(result.map((item) => item.program_site_disposition), ["site_context_unknown", "site_context_unknown"])
  assert.deepEqual(result.map((item) => item.linkage_reason), ["global_footer_or_admin", "global_footer_or_admin"])
})

test("another program's structured site is not linked to the target program", () => {
  const [candidate] = evaluatePracticalLocationCandidates({ resource: { display_name: "Practical Centre" }, sourceText: "Other Program at 100 Main Street. Practical Centre information.", candidates: ["100 Main Street"], structure: [{ structure_id: "other", kind: "section_block", heading: "Other Program", text: "100 Main Street" }] })
  assert.equal(candidate.program_site_disposition, "site_context_unknown")
})

test("multiple structured location cards remain independently supported", () => {
  const resource = { display_name: "Practical Centre" }
  const structure = ["100 Main Street", "200 Side Road"].map((address, index) => ({ structure_id: `site-${index}`, kind: "div_block", heading: "Practical Centre", text: address, attributes: "location card" }))
  const result = evaluatePracticalLocationCandidates({ resource, sourceText: "100 Main Street. 200 Side Road.", candidates: ["100 Main Street", "200 Side Road"], structure })
  assert.equal(result.every((item) => item.program_site_disposition === "program_site_supported"), true)
})

test("a literal Vancouver Island title suffix does not hide explicit provider service locations", () => {
  const resource = { display_name: "Harm Reduction Services on Vancouver Island - AVI Health" }
  const text = "You can access Harm Reduction Services at these AVI locations: Victoria 713 Johnson Street; Nanaimo 102-55 Victoria Road."
  const result = evaluatePracticalLocationCandidates({ resource, sourceText: text, sourceUrl: "https://avi.org/service/harm-reduction", candidates: ["713 Johnson Street", "Unit 102, 55 Victoria Road"] })
  assert.equal(result.every((candidate) => candidate.program_site_disposition === "program_site_supported"), true)
})

test("CORE name variants are detected as a semantic resource match", () => {
  assert.equal(semanticResourceIdentityOverlap("The CORE (VCH)", "The CORE (Community Outpatient Recovery Experience)"), 1)
  assert.equal(semanticResourceIdentityOverlap("The CORE (VCH)", "Unrelated Recovery Clinic"), 0)
})
