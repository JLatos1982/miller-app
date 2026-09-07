export const MILLER_NORTH_PUBLIC_SECTIONS = Object.freeze([
  Object.freeze({ id: "evidence", label: "Evidence", href: "/indigenous-healthcare-evidence" }),
  Object.freeze({ id: "incidents", label: "Incidents", href: "/indigenous-healthcare-evidence/serious-harm" }),
  Object.freeze({ id: "accountability", label: "Accountability", href: "/indigenous-healthcare-evidence/accountability-watch" }),
  Object.freeze({ id: "watching", label: "Watching", href: "/indigenous-healthcare-evidence/watching-now" }),
])

export const MILLER_NORTH_PUBLIC_SECTION_ALIASES = Object.freeze({
  evidence: "evidence",
  methodology: "evidence",
  official: "incidents",
  incidents: "incidents",
  research: "accountability",
  accountability: "accountability",
  emerging: "watching",
  listening: "watching",
  watching: "watching",
})

export const MILLER_NORTH_PUBLIC_PLACEMENT_RULES = Object.freeze({
  evidence: Object.freeze({
    primary_home: "systemic reports, research, policy documents, aggregate findings, and background evidence",
    includes: Object.freeze(["evidence_group", "research_report", "policy_record", "aggregate_finding"]),
  }),
  incidents: Object.freeze({
    primary_home: "privacy-safe individual events and formal incident records",
    includes: Object.freeze(["incident", "coroner_record", "inquest_record", "regulator_record", "institutional_acknowledgement"]),
  }),
  accountability: Object.freeze({
    primary_home: "concerns with recommendations, commitments, responses, implementation, or outcomes worth tracking",
    includes: Object.freeze(["accountability_chain", "implementation_record", "recommendation_tracker"]),
  }),
  watching: Object.freeze({
    primary_home: "incomplete public processes with a concrete future question or milestone",
    includes: Object.freeze(["active_inquiry", "pending_verdict", "open_review", "pending_response"]),
  }),
})

export function resolveMillerNorthPublicSection(current) {
  return MILLER_NORTH_PUBLIC_SECTION_ALIASES[current] || current
}
