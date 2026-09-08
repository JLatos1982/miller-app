const GAP_TYPES = new Set(["evidence_present", "true_evidence_scarcity", "no_source_coverage", "insufficient_coding", "source_acquisition_failure", "unreviewed_backlog", "not_yet_reviewed"])
const clean = (value, limit = 180) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, limit)

export function classifyPalantirCoverageGap(observation = {}) {
  if (Number(observation.verified_evidence || 0) > 0) return "evidence_present"
  if (Number(observation.unreviewed_documents || 0) > 0) return "unreviewed_backlog"
  if (Number(observation.acquisition_failures || 0) > 0) return "source_acquisition_failure"
  if (observation.source_coverage === false) return "no_source_coverage"
  if (observation.coding_complete === false && Number(observation.documents_checked || 0) > 0) return "insufficient_coding"
  if (observation.review_started !== true) return "not_yet_reviewed"
  return "true_evidence_scarcity"
}

export function buildPalantirCoverageMatrix({ matrixId, domain, dimensions = [], cells = [], generatedAt = new Date().toISOString() } = {}) {
  if (!matrixId || !domain || !dimensions.length) throw new Error("palantir_coverage_matrix_required_fields_missing")
  const normalizedCells = cells.map((cell, index) => {
    const coordinates = Object.fromEntries(dimensions.map(dimension => [dimension, clean(cell.coordinates?.[dimension], 100) || "unspecified"]))
    const gapType = cell.gap_type || classifyPalantirCoverageGap(cell)
    if (!GAP_TYPES.has(gapType)) throw new Error("palantir_coverage_gap_type_invalid")
    return Object.freeze({ cell_id: clean(cell.cell_id, 180) || `${clean(matrixId)}:${index + 1}`, coordinates, documents_checked: Number(cell.documents_checked || 0), full_documents_reviewed: Number(cell.full_documents_reviewed || 0), verified_evidence: Number(cell.verified_evidence || 0), unreviewed_documents: Number(cell.unreviewed_documents || 0), acquisition_failures: Number(cell.acquisition_failures || 0), gap_type: gapType, blocker: clean(cell.blocker, 240) || null })
  })
  return Object.freeze({
    schema_version: "palantir-coverage-matrix-v1",
    matrix_id: clean(matrixId),
    domain: clean(domain, 80),
    dimensions: dimensions.map(item => clean(item, 80)),
    generated_at: new Date(generatedAt).toISOString(),
    cells: normalizedCells,
    counts: Object.fromEntries([...GAP_TYPES].map(type => [type, normalizedCells.filter(cell => cell.gap_type === type).length])),
    mutation_authority: false,
    automatic_research: false,
  })
}

export function recommendPalantirGapResearch(matrix, { maxRecommendations = 6 } = {}) {
  if (matrix?.schema_version !== "palantir-coverage-matrix-v1") throw new Error("palantir_coverage_matrix_invalid")
  const priority = { source_acquisition_failure: 0, unreviewed_backlog: 1, no_source_coverage: 2, insufficient_coding: 3, not_yet_reviewed: 4, true_evidence_scarcity: 5 }
  const recommendations = matrix.cells.filter(cell => cell.gap_type !== "evidence_present").sort((a, b) => (priority[a.gap_type] ?? 9) - (priority[b.gap_type] ?? 9)).slice(0, Math.max(1, Math.min(12, maxRecommendations))).map(cell => ({
    cell_id: cell.cell_id,
    gap_type: cell.gap_type,
    coordinates: cell.coordinates,
    recommended_action: cell.gap_type === "source_acquisition_failure" ? "repair_or_replace_source_adapter" : cell.gap_type === "unreviewed_backlog" ? "review_checkpointed_backlog" : cell.gap_type === "insufficient_coding" ? "improve_metadata_coding_before_more_search" : cell.gap_type === "no_source_coverage" ? "identify_registered_official_source" : "propose_bounded_research_plan",
    automatic_execution: false,
    owner_approval_required: true,
  }))
  return Object.freeze({ schema_version: "palantir-gap-research-recommendations-v1", matrix_id: matrix.matrix_id, recommendations, automatic_execution: false })
}
