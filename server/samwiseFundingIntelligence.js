import { createHash } from "node:crypto"

const STATUS = new Set(["active", "temporarily_closed", "closed", "expired", "unclear", "needs_review"])
const clean = (value, limit = 500) => String(value ?? "").normalize("NFKC").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, limit)
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex")
const safeUrl = value => {
  try { return new URL(value).protocol === "https:" }
  catch { return false }
}

export function normalizeSamwiseFundingProgram(input = {}) {
  const sourceUrl = clean(input.source_url, 500)
  if (!safeUrl(sourceUrl)) throw new Error("samwise_funding_official_source_required")
  const status = clean(input.status, 40)
  if (!STATUS.has(status)) throw new Error("samwise_funding_status_invalid")
  if (!input.canonical_program_id || !input.administrator || !input.program_name || !input.jurisdiction || !input.purpose) throw new Error("samwise_funding_required_field_missing")
  const record = {
    schema_version: "samwise-funding-program-v1",
    canonical_program_id: clean(input.canonical_program_id, 180),
    administrator: clean(input.administrator, 180),
    program_name: clean(input.program_name, 180),
    purpose: clean(input.purpose, 600),
    eligibility: clean(input.eligibility, 800) || null,
    jurisdiction: clean(input.jurisdiction, 100),
    amount_range: clean(input.amount_range, 180) || null,
    deadline: clean(input.deadline, 80) || null,
    application_path: clean(input.application_path, 500) || null,
    status,
    source_url: sourceUrl,
    last_verified: clean(input.last_verified, 40) || null,
    project_opportunities: Array.isArray(input.project_opportunities) ? input.project_opportunities.filter(value => ["miller", "miller_north", "both", "future_project"].includes(value)) : [],
    verification: input.verified_from_official_source === true ? "official_source" : "needs_review",
    mutation_authority: false,
    publication_authority: false,
  }
  record.record_fingerprint = hash(record)
  return Object.freeze(record)
}

export function diffSamwiseFundingProgram(previous, current) {
  if (previous?.canonical_program_id !== current?.canonical_program_id) throw new Error("samwise_funding_program_mismatch")
  const fields = ["administrator", "program_name", "purpose", "eligibility", "jurisdiction", "amount_range", "deadline", "application_path", "status", "source_url"]
  const changes = fields.filter(field => previous[field] !== current[field]).map(field => ({ field, before: previous[field] ?? null, after: current[field] ?? null }))
  const materialFields = new Set(["eligibility", "amount_range", "deadline", "application_path", "status", "source_url"])
  return Object.freeze({
    schema_version: "samwise-funding-program-change-v1",
    canonical_program_id: current.canonical_program_id,
    changed: changes.length > 0,
    change_types: changes.map(change => change.field),
    material_change: changes.some(change => materialFields.has(change.field)),
    changes,
    owner_review_required: changes.length > 0,
    automatic_publication: false,
    mutation_authority: false,
  })
}

export function routeSamwiseFundingProgram(program) {
  if (program?.schema_version !== "samwise-funding-program-v1") throw new Error("samwise_funding_program_required")
  const activeAndVerified = program.status === "active" && program.verification === "official_source"
  const routes = new Set(["owner_intelligence"])
  if (activeAndVerified && program.project_opportunities.includes("miller")) routes.add("miller_resource_candidate")
  if (activeAndVerified && program.project_opportunities.includes("miller_north")) routes.add("shared_resource_candidate")
  if (activeAndVerified && program.project_opportunities.includes("both")) routes.add("shared_resource_candidate")
  if (program.project_opportunities.includes("future_project")) routes.add("future_project_candidate")
  return Object.freeze({ canonical_program_id: program.canonical_program_id, routes: [...routes], resource_verification_required: true, automatic_publication: false, mutation_authority: false, publication_authority: false })
}
