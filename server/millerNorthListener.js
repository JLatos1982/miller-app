import { createHash } from "node:crypto"

const normalized = value => String(value || "").replace(/\s+/g, " ").trim()
export const millerNorthSourceFingerprint = ({ url, title, text }) => createHash("sha256").update([normalized(url), normalized(title), normalized(text)].join("\u001f")).digest("hex")

// Compatible with Samwise's observation/fingerprint pattern, but deliberately has no scheduler or writer.
export function planMillerNorthSourceObservation({ source, previous = null }) {
  const fingerprint = millerNorthSourceFingerprint(source)
  if (previous?.source_fingerprint === fingerprint) return { decision: "unchanged_no_repetitive_work", source_fingerprint: fingerprint, enqueue: false, proposal_write: false, publication_write: false }
  return { decision: previous ? "materially_changed_enqueue_bounded_revisit" : "new_source_stage_discovery_candidate", source_fingerprint: fingerprint, enqueue: true, proposal_write: false, publication_write: false }
}
