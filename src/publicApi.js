export async function trackEvent(payload) {
  try {
    await fetch("/api/events", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  } catch {
    // Analytics must never interrupt the public resource-finding workflow.
  }
}

export async function submitResource(payload) {
  const response = await fetch("/api/resource-submissions", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error("Submission failed.")
  return response.json()
}
