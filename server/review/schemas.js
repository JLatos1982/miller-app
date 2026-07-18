const stringArray = {
  type: "array",
  items: { type: "string" },
  maxItems: 8,
}

export const resourceReviewSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "recommendation", "confidence", "reason", "positive_signals", "concerns",
    "missing_information", "provider_type",
  ],
  properties: {
    recommendation: { type: "string", enum: ["approve", "reject", "manual_review"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reason: { type: "string" },
    positive_signals: stringArray,
    concerns: stringArray,
    missing_information: stringArray,
    provider_type: {
      type: "string",
      enum: [
        "official_provider", "government", "healthcare", "nonprofit", "commercial_service",
        "informational_article", "directory", "irrelevant", "uncertain",
      ],
    },
  },
}

export const taggingSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "suggested_tags", "primary_category", "secondary_categories", "intended_population",
    "geographic_coverage", "confidence", "reasoning",
  ],
  properties: {
    suggested_tags: stringArray,
    primary_category: { type: ["string", "null"] },
    secondary_categories: stringArray,
    intended_population: stringArray,
    geographic_coverage: stringArray,
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reasoning: { type: "string" },
  },
}

export const duplicateSchema = {
  type: "object",
  additionalProperties: false,
  required: ["matches"],
  properties: {
    matches: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["candidate_resource_id", "match_type", "confidence", "explanation", "fields_matched", "suggested_action"],
        properties: {
          candidate_resource_id: { type: "integer" },
          match_type: {
            type: "string",
            enum: ["exact_duplicate", "likely_duplicate", "same_organization_different_program", "related_resource", "not_duplicate", "uncertain"],
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          explanation: { type: "string" },
          fields_matched: stringArray,
          suggested_action: { type: "string" },
        },
      },
    },
  },
}

