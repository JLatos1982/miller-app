import { createHash } from "node:crypto"

const LESSON_TYPES = new Set(["source_access_pattern", "document_structure", "date_field_convention", "recommendation_numbering", "false_positive", "parser_rule", "institution_alias", "pagination", "stopping_rule", "document_role", "access_blocker"])
const clean = (value, limit = 400) => String(value ?? "").normalize("NFKC").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, limit)
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex")

export function createPalantirLearningLesson(input = {}, { now = new Date() } = {}) {
  const lessonType = clean(input.lesson_type, 80)
  const sourceId = clean(input.source_id, 180)
  const observation = clean(input.observation, 400)
  if (!LESSON_TYPES.has(lessonType) || !sourceId || !observation) throw new Error("palantir_learning_lesson_invalid")
  const examples = (input.examples || []).map(item => ({ source_id: clean(item.source_id || sourceId, 180), document_id: clean(item.document_id, 180), evidence: clean(item.evidence, 300) })).filter(item => item.document_id && item.evidence)
  return Object.freeze({ schema_version: "palantir-operational-learning-lesson-v1", lesson_id: `palantir-lesson:${hash({ lessonType, sourceId, observation }).slice(0, 24)}`, lesson_type: lessonType, source_id: sourceId, observation, examples, applicability: clean(input.applicability || "source_specific", 80), proposed_rule: clean(input.proposed_rule, 300) || null, created_at: new Date(now).toISOString(), promoted: false, owner_review_required: Boolean(input.proposed_rule), model_training: false, mutation_authority: false })
}

export function buildPalantirLearningLedger(lessons = [], { now = new Date() } = {}) {
  const unique = lessons.filter((item, index, values) => values.findIndex(candidate => candidate.lesson_id === item.lesson_id) === index)
  return Object.freeze({ schema_version: "palantir-operational-learning-ledger-v1", display_name: "Palantír", lessons: unique, generated_at: new Date(now).toISOString(), model_training: false, automatic_rule_changes: false })
}

export function proposePalantirRulePromotion(lesson, { regressionTest, reviewedBy = null } = {}) {
  if (lesson?.schema_version !== "palantir-operational-learning-lesson-v1" || !lesson.proposed_rule) throw new Error("palantir_learning_rule_missing")
  const distinctEvidence = new Set(lesson.examples.map(item => `${item.source_id}:${item.document_id}`))
  if (distinctEvidence.size < 2) throw new Error("palantir_learning_evidence_insufficient")
  if (regressionTest !== true) throw new Error("palantir_learning_regression_required")
  if (!reviewedBy) throw new Error("palantir_learning_owner_review_required")
  return Object.freeze({ ...lesson, promoted: true, promoted_at: new Date().toISOString(), reviewed_by: clean(reviewedBy, 80), regression_tested: true, automatic_change: false })
}

export function calculatePalantirLearningImpact({ beforeFalsePositives = 0, afterFalsePositives = 0 } = {}) {
  const before = Math.max(0, Number(beforeFalsePositives || 0)); const after = Math.max(0, Number(afterFalsePositives || 0))
  return Object.freeze({ before_false_positives: before, after_false_positives: after, reduced_by: Math.max(0, before - after), opaque_ai_score: false })
}
