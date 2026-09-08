export const PALANTIR_EVIDENCE_ROLES = Object.freeze([
  "allegation_report",
  "institutional_acknowledgement",
  "procedural_decision",
  "merits_finding",
  "investigation",
  "regulator_finding",
  "audit_finding",
  "recommendation",
  "response",
  "implementation_evidence",
  "measured_outcome",
  "settlement",
  "appeal_judicial_review",
  "systemic_context",
])

const ROLES = new Set(PALANTIR_EVIDENCE_ROLES)
const LEGACY = Object.freeze({
  allegation: "allegation_report",
  complaint: "allegation_report",
  procedural_ruling: "procedural_decision",
  merits_decision: "merits_finding",
  formal_finding: "merits_finding",
  regulator_outcome: "regulator_finding",
  audit: "audit_finding",
  government_response: "response",
  implementation: "implementation_evidence",
  outcome: "measured_outcome",
  judicial_review: "appeal_judicial_review",
  appeal: "appeal_judicial_review",
})

const clean = value => String(value ?? "").normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")

export function normalizePalantirEvidenceRole(value) {
  const normalized = clean(value)
  const role = LEGACY[normalized] || normalized
  if (!ROLES.has(role)) throw new Error("palantir_evidence_role_unsupported")
  return role
}

export function interpretPalantirEvidenceRole(value) {
  const role = normalizePalantirEvidenceRole(value)
  return Object.freeze({
    role,
    establishes_merits: ["merits_finding", "regulator_finding", "audit_finding"].includes(role),
    proves_implementation: role === "implementation_evidence" || role === "measured_outcome",
    proves_outcome: role === "measured_outcome",
    is_only_procedural: ["procedural_decision", "appeal_judicial_review"].includes(role),
    is_only_response: role === "response",
    settlement_is_admission: false,
    allegation_is_fact: false,
  })
}

export function assertPalantirEvidenceClaim({ role, claim = "context" } = {}) {
  const interpretation = interpretPalantirEvidenceRole(role)
  if (claim === "merits" && !interpretation.establishes_merits) throw new Error("palantir_evidence_role_does_not_establish_merits")
  if (claim === "implementation" && !interpretation.proves_implementation) throw new Error("palantir_evidence_role_does_not_prove_implementation")
  if (claim === "outcome" && !interpretation.proves_outcome) throw new Error("palantir_evidence_role_does_not_prove_outcome")
  if (claim === "admission" && interpretation.role === "settlement") throw new Error("palantir_settlement_not_admission")
  return interpretation
}
