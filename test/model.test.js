import test from "node:test"
import assert from "node:assert/strict"
import { parseStructuredOutput } from "../server/review/model.js"
import { reviewResource } from "../server/review/agents.js"

test("rejects malformed agent output", () => {
  assert.throws(() => parseStructuredOutput({ output_text: "not json" }), /malformed/)
})

test("low-confidence recommendations fall back to manual review", async () => {
  const openai = {
    responses: {
      create: async () => ({ output_text: JSON.stringify({
        recommendation: "approve",
        confidence: 0.4,
        reason: "Some evidence is missing.",
        positive_signals: [],
        concerns: [],
        missing_information: ["ownership"],
        provider_type: "uncertain",
      }) }),
    },
  }
  const result = await reviewResource({ name: "Example" }, { openai })
  assert.equal(result.recommendation, "manual_review")
})

