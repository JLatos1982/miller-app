export const PALANTIR_PRIMITIVES = Object.freeze([
  { primitive_id: "listener", module: "palantirListenerPrimitive", origin: "Farm listener framework", status: "promoted", scheduler: "farm_job_scheduler" },
  { primitive_id: "research_memory", module: "samwiseResearchMemoryStore", origin: "Samwise supervised research", status: "already_generic" },
  { primitive_id: "event_identity", module: "palantirEventIdentity", origin: "Miller North event reconciliation", status: "promoted" },
  { primitive_id: "evidence_roles", module: "palantirEvidenceRoles", origin: "Miller North legal/evidence roles", status: "promoted" },
  { primitive_id: "recommendation_intelligence", module: "palantirRecommendationIntelligence", origin: "child/youth, corrections and fatality ledgers", status: "promoted" },
  { primitive_id: "milestone_intelligence", module: "palantirMilestoneIntelligence", origin: "Watching and Saskatchewan milestone listeners", status: "promoted" },
  { primitive_id: "coverage_gap_intelligence", module: "palantirCoverageGapIntelligence", origin: "Miller North coverage matrices", status: "promoted" },
  { primitive_id: "structural_inequality_intelligence", module: "palantirStructuralInequality", origin: "Miller North access, workforce and accountability research", status: "promoted" },
  { primitive_id: "missing_evidence_acquisition", module: "palantirStructuralInequality", origin: "Miller North privacy-safe evidence-gap acquisition", status: "promoted" },
  { primitive_id: "cross_domain_relevance", module: "samwisePublicRecordsIntelligence", origin: "Farm cross-lane routing", status: "already_generic" },
  { primitive_id: "institutional_mapping", module: "samwiseEntityResolution", origin: "Samwise institutional map", status: "already_generic" },
  { primitive_id: "owner_review", module: "palantirOwnerReview", origin: "private Farm owner review", status: "promoted" },
  { primitive_id: "resource_routing", module: "palantirResourceRouting", origin: "shared resource discovery", status: "promoted" },
  { primitive_id: "change_intelligence", module: "palantirChangeIntelligence", origin: "Watch and resource diffing", status: "promoted" },
  { primitive_id: "claim_provenance_intelligence", module: "palantirClaimProvenance", origin: "legal, audit, recommendation and accountability claim tracking", status: "promoted" },
  { primitive_id: "source_yield", module: "samwisePublicRecordsIntelligence", origin: "Farm source-yield dashboard", status: "already_generic" },
  { primitive_id: "igor_orchestration", module: "farmIgorWorker", origin: "Farm worker v1", status: "already_generic" },
  { primitive_id: "conversational_control", module: "samwiseConversationalPublicRecords", origin: "private Farm/Supabase interface", status: "already_generic" },
])

export function validatePalantirPrimitiveRegistry(primitives = PALANTIR_PRIMITIVES) {
  const ids = new Set()
  for (const primitive of primitives) {
    if (!/^[a-z][a-z0-9_]{2,60}$/.test(primitive.primitive_id) || !primitive.module || ids.has(primitive.primitive_id)) throw new Error("palantir_primitive_registry_invalid")
    ids.add(primitive.primitive_id)
  }
  return Object.freeze({ schema_version: "palantir-primitive-registry-v1", valid: true, primitives: primitives.length, promoted: primitives.filter(item => item.status === "promoted").length, already_generic: primitives.filter(item => item.status === "already_generic").length, mutation_authority: false, publication_authority: false })
}

export function palantirPrimitiveIndependence({ moduleSources = {} } = {}) {
  const productUiImports = PALANTIR_PRIMITIVES.filter(item => /(?:from\s+["'][^"']*(?:src\/(?!data)|components|pages)|\.jsx["']|\breact\b)/i.test(String(moduleSources[item.module] || "")))
  return Object.freeze({ independently_testable: productUiImports.length === 0, product_ui_dependencies: productUiImports.map(item => item.primitive_id), shared_dependencies: ["farm_job_scheduler", "igor_worker_v1", "private_supabase_interaction", "shared_server_utilities"], repository_extraction_recommended_now: false })
}
