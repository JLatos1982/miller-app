export const MILLER_CATEGORIES = [
  "Detox / Withdrawal",
  "Counselling",
  "Crisis Support",
  "OAT / Med Support",
  "Harm Reduction",
  "Treatment Programs",
  "Peer Support / Recovery",
  "Housing / Outreach",
  "Youth Support",
  "Indigenous Support",
]

export const REVIEW_SCHEMA_VERSION = "miller-resource-review-v1"

export const REVIEW_MODEL = process.env.OPENAI_REVIEW_MODEL || process.env.OPENAI_MODEL || "gpt-5.4-mini"

export const MAX_RESOURCE_TEXT_LENGTH = 4000
export const MAX_DUPLICATE_CANDIDATES = 8

