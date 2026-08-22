export const MAX_SUGGESTION_ATTACHMENTS = 2
export const MAX_SUGGESTION_ATTACHMENT_BYTES = 5 * 1024 * 1024

const ACCEPTED_EXTENSIONS = new Set(["pdf", "png", "jpg", "jpeg", "txt"])
const ACCEPTED_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "text/plain"])

export function validateResourceAttachmentSelection(files) {
  if (files.length > MAX_SUGGESTION_ATTACHMENTS) return "You can attach up to 2 files."
  for (const file of files) {
    const extension = String(file.name || "").split(".").pop().toLowerCase()
    if (!ACCEPTED_EXTENSIONS.has(extension) || (file.type && !ACCEPTED_TYPES.has(file.type))) {
      return "That file type isn't supported. Please choose a PDF, JPG, PNG, or TXT file."
    }
    if (file.size > MAX_SUGGESTION_ATTACHMENT_BYTES) return "Files must be 5 MB or smaller."
  }
  return ""
}

export function formatAttachmentSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`
}
