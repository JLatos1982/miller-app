import { REVIEW_MODEL } from "./constants.js"

function parseStructuredOutput(response) {
  const raw = String(response?.output_text || "").trim()
  if (!raw) throw new Error("The review model returned no structured output.")

  try {
    return JSON.parse(raw)
  } catch {
    throw new Error("The review model returned malformed structured output.")
  }
}

export async function callStructuredReview({ openai, name, schema, instructions, input }) {
  const response = await openai.responses.create({
    model: REVIEW_MODEL,
    instructions,
    input,
    max_output_tokens: 1200,
    text: {
      format: {
        type: "json_schema",
        name,
        strict: true,
        schema,
      },
    },
  })

  return parseStructuredOutput(response)
}

export { parseStructuredOutput }

