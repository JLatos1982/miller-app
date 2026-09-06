export const MAX_EMAIL_RESULTS = 15

export const isEmailResultEligible = (resource) => Boolean(
  resource &&
  /^(curated:|support:|funding:)/.test(String(resource.id || "")) &&
  resource.approved !== false &&
  resource.hidden !== true,
)

export const emailResultsStatus = async () => {
  const response = await fetch("/api/email-results/status", { credentials: "same-origin" })
  if (!response.ok) throw new Error("status_unavailable")
  return response.json()
}

export const sendEmailResults = async ({ recipient, resultIds, city, categories }) => {
  const response = await fetch("/api/email-results", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient,
      result_ids: resultIds,
      search_context: { city, categories },
      confirm: true,
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || "We couldn’t send that email right now. Your results are still here.")
  return payload
}
