import { createHash } from "node:crypto"

const NON_MATERIAL_KEYS = new Set(["last_checked", "last_reviewed", "checked_at", "updated_at", "generated_at", "formatting", "page_order"])
const OWNER_REVIEW_KEYS = new Set(["contradiction", "procedural_stage", "status_correction", "source_role", "evidence_role"])
const clean = value => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim()
const stable = value => {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== "object") return typeof value === "string" ? clean(value) : value
  return Object.fromEntries(Object.entries(value).filter(([key]) => !NON_MATERIAL_KEYS.has(key)).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]))
}

export function palantirMaterialFingerprint(value) {
  return createHash("sha256").update(JSON.stringify(stable(value)) ?? "undefined").digest("hex")
}

export function classifyPalantirChange({ field, previous, current, sourceSupported = true } = {}) {
  const key = clean(field).toLowerCase()
  if (NON_MATERIAL_KEYS.has(key) || palantirMaterialFingerprint(previous) === palantirMaterialFingerprint(current)) return Object.freeze({ field: key, classification: "non_material", owner_review_required: false })
  if (!sourceSupported) return Object.freeze({ field: key, classification: "uncertain", owner_review_required: true })
  if (OWNER_REVIEW_KEYS.has(key)) return Object.freeze({ field: key, classification: "owner_review", owner_review_required: true })
  return Object.freeze({ field: key, classification: "material", owner_review_required: false })
}

export function diffPalantirRecord(previous = {}, current = {}) {
  const fields = [...new Set([...Object.keys(previous), ...Object.keys(current)])].sort()
  const changes = fields.map(field => classifyPalantirChange({ field, previous: previous[field], current: current[field], sourceSupported: current.source_supported !== false })).filter(change => change.classification !== "non_material")
  return Object.freeze({
    schema_version: "palantir-change-intelligence-v1",
    changed: changes.length > 0,
    changes,
    material: changes.filter(item => item.classification === "material").length,
    uncertain: changes.filter(item => item.classification === "uncertain").length,
    owner_review: changes.filter(item => item.owner_review_required).length,
    mutation_authority: false,
    publication_authority: false,
  })
}
