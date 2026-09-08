// Public-safe structural regression cases. These encode interpretation rules, not case narratives.
export const palantirHarvestLessons = Object.freeze({
  maskwacis_recommendations: { expected: "many_responders_one_recommendation", response_is_implementation: false },
  jordans_principle: { roles: ["merits_finding", "recommendation", "response", "implementation_evidence", "measured_outcome"], legal_order_is_implementation: false },
  spirit_matters: { expected: "recommendation_chain", response_is_independent_verification: false },
  child_youth: { expected: "recommendation_responsible_body_response_gap", government_response_is_outcome: false },
  trevor_dubois: { expected: "milestone_targeted_recheck", broad_daily_search: false },
  coroner_inquest: { expected: "hearing_then_verdict_milestones", hearing_is_verdict: false },
  regulator: { expected: "regulator_finding", allegation_is_finding: false },
  legal: { expected: "procedural_and_merits_roles_distinct", procedural_decision_establishes_merits: false },
  resource_verification: { expected: "separate_verified_resource_candidate", research_record_becomes_resource: false },
})
