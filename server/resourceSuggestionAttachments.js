import { createHash, randomUUID } from "node:crypto"

export const RESOURCE_SUGGESTION_ATTACHMENT_BUCKET = "resource-suggestion-attachments"
export const MAX_RESOURCE_SUGGESTION_ATTACHMENTS = 2
export const MAX_RESOURCE_SUGGESTION_ATTACHMENT_BYTES = 5 * 1024 * 1024
export const MAX_RESOURCE_SUGGESTION_ATTACHMENT_TOTAL_BYTES = 10 * 1024 * 1024

const ALLOWED_TYPES = {
  pdf: { mime: "application/pdf", extension: "pdf" },
  png: { mime: "image/png", extension: "png" },
  jpeg: { mime: "image/jpeg", extension: "jpg" },
  txt: { mime: "text/plain", extension: "txt" },
}
const CONTROL_CHARACTERS = /\p{Cc}/gu

export class ResourceSuggestionAttachmentError extends Error {
  constructor(message, { status = 400, code = "invalid_attachment" } = {}) {
    super(message)
    this.status = status
    this.code = code
  }
}

function extensionFromFilename(filename) {
  const match = /\.([a-z0-9]+)$/i.exec(String(filename || "").trim())
  if (!match) return ""
  const extension = match[1].toLowerCase()
  return extension === "jpg" || extension === "jpeg" ? "jpeg" : extension
}

function declaredMime(mimetype) {
  return String(mimetype || "").split(";", 1)[0].trim().toLowerCase()
}

function detectedType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return ""
  if (/^%PDF-\d\.\d/.test(buffer.subarray(0, 8).toString("ascii"))) return "pdf"
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png"
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg"

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer)
    if (!text || text.includes("\0")) return ""
    let controls = 0
    for (const character of text) {
      const code = character.codePointAt(0)
      if (code < 32 && character !== "\n" && character !== "\r" && character !== "\t") controls += 1
    }
    return controls / Math.max(text.length, 1) > 0.01 ? "" : "txt"
  } catch {
    return ""
  }
}

export function sanitizeAttachmentFilename(filename, extension) {
  const leaf = String(filename || "").split(/[\\/]/).pop() || ""
  const cleaned = leaf
    .replace(CONTROL_CHARACTERS, "")
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim()
  const base = cleaned.replace(/\.[^.]*$/, "").slice(0, 140).trim() || "attachment"
  return `${base}.${extension}`
}

export function prepareResourceSuggestionAttachments(files) {
  if (!Array.isArray(files)) throw new ResourceSuggestionAttachmentError("Invalid attachment upload.")
  if (files.length > MAX_RESOURCE_SUGGESTION_ATTACHMENTS) {
    throw new ResourceSuggestionAttachmentError("A submission can include at most 2 attachments.", { code: "too_many_attachments" })
  }

  let totalBytes = 0
  return files.map((file) => {
    if (!file || !Buffer.isBuffer(file.buffer)) throw new ResourceSuggestionAttachmentError("Invalid attachment upload.")
    if (file.buffer.length > MAX_RESOURCE_SUGGESTION_ATTACHMENT_BYTES) {
      throw new ResourceSuggestionAttachmentError("Each attachment must be 5 MB or smaller.", { status: 413, code: "attachment_too_large" })
    }
    totalBytes += file.buffer.length
    if (totalBytes > MAX_RESOURCE_SUGGESTION_ATTACHMENT_TOTAL_BYTES) {
      throw new ResourceSuggestionAttachmentError("Attachments must not exceed 10 MB in total.", { status: 413, code: "attachments_too_large" })
    }

    const extension = extensionFromFilename(file.originalname)
    const type = detectedType(file.buffer)
    const expected = ALLOWED_TYPES[type]
    if (!expected || extension !== type || declaredMime(file.mimetype) !== expected.mime) {
      throw new ResourceSuggestionAttachmentError("Attachments must be PDF, PNG, JPEG, or TXT files with matching file content.", { code: "unsupported_attachment" })
    }

    return {
      id: randomUUID(),
      buffer: file.buffer,
      byteSize: file.buffer.length,
      mimeType: expected.mime,
      extension: expected.extension,
      displayFilename: sanitizeAttachmentFilename(file.originalname, expected.extension),
      sha256: createHash("sha256").update(file.buffer).digest("hex"),
    }
  })
}

async function removeUploadedObjects(storage, paths, log) {
  if (!paths.length) return
  try {
    const { error } = await storage.remove(paths)
    if (error) throw error
  } catch (error) {
    log.error("Resource attachment cleanup failed:", error?.code || "storage_cleanup_error")
  }
}

export async function createResourceSubmissionWithAttachments({ supabase, submission, attachments, log = console }) {
  const submissionInsert = await supabase.from("resource_submissions").insert([submission]).select("id").single()
  if (submissionInsert.error || !submissionInsert.data?.id) throw submissionInsert.error || new Error("submission_insert_failed")

  const submissionId = submissionInsert.data.id
  const storage = supabase.storage.from(RESOURCE_SUGGESTION_ATTACHMENT_BUCKET)
  const uploadedPaths = []

  try {
    const rows = []
    for (const attachment of attachments) {
      const storagePath = `${submissionId}/${attachment.id}.${attachment.extension}`
      const uploaded = await storage.upload(storagePath, attachment.buffer, { contentType: attachment.mimeType, upsert: false })
      if (uploaded.error) throw uploaded.error
      uploadedPaths.push(storagePath)
      rows.push({
        id: attachment.id,
        submission_id: submissionId,
        storage_path: storagePath,
        display_filename: attachment.displayFilename,
        byte_size: attachment.byteSize,
        detected_mime_type: attachment.mimeType,
        content_sha256: attachment.sha256,
        status: "pending_scan",
      })
    }

    const metadata = await supabase.from("resource_submission_attachments").insert(rows)
    if (metadata.error) throw metadata.error
    return { submitted: true, attachment_count: rows.length }
  } catch (error) {
    await removeUploadedObjects(storage, uploadedPaths, log)
    try {
      const { error: rollbackError } = await supabase.from("resource_submissions").delete().eq("id", submissionId)
      if (rollbackError) throw rollbackError
    } catch (rollbackError) {
      log.error("Resource attachment submission rollback failed:", rollbackError?.code || "database_rollback_error")
    }
    throw error
  }
}
