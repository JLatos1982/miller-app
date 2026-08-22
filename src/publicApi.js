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

function publicSubmissionError(body) {
  const messages = {
    unsupported_attachment: "That file type isn't supported. Please choose a PDF, JPG, PNG, or TXT file.",
    attachment_too_large: "Files must be 5 MB or smaller.",
    attachments_too_large: "Attachments must not exceed 10 MB in total.",
    too_many_attachments: "You can attach up to 2 files.",
    invalid_attachment: "Please check the selected files and try again.",
    attachment_submission_failed: "Something went wrong sending the submission. Please try again.",
  }
  return messages[body?.code] || "Something went wrong sending the submission. Please try again."
}

export async function submitResource(payload, { fetchImpl = fetch } = {}) {
  const { attachments, ...submission } = payload
  const files = Array.from(attachments || [])
  const hasAttachments = files.length > 0
  const body = hasAttachments ? new FormData() : JSON.stringify(submission)

  if (hasAttachments) {
    body.append("resource_name", submission.resource_name || "")
    body.append("city", submission.city || "")
    body.append("note", submission.note || "")
    for (const file of files) body.append("attachments", file, file.name)
  }

  const response = await fetchImpl("/api/resource-submissions", {
    method: "POST",
    credentials: "include",
    ...(hasAttachments ? {} : { headers: { "Content-Type": "application/json" } }),
    body,
  })
  if (!response.ok) {
    const responseBody = await response.json().catch(() => ({}))
    const error = new Error(publicSubmissionError(responseBody))
    error.code = responseBody?.code || "submission_failed"
    throw error
  }
  return response.json()
}
