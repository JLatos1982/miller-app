import { createHash } from "node:crypto"
import { normalizeIdentityText, normalizePhone, normalizePublicUrl } from "./resourceIdentity.js"

const compact = (value) => normalizeIdentityText(value)
export const reconciliationFingerprint = (left, right) => createHash("sha256").update(JSON.stringify([left.id, right.id].sort().map(String).concat([compact(left.name), compact(right.name), normalizePublicUrl(left.website || left.source_url), normalizePublicUrl(right.website || right.source_url), normalizePhone(left.phone), normalizePhone(right.phone)]))).digest("hex")
export function compareShelterCandidates(left = {}, right = {}) {
  const sameProgram = Boolean(compact(left.name) && compact(left.name) === compact(right.name))
  const sameOperator = Boolean(compact(left.operator) && compact(left.operator) === compact(right.operator))
  const sameUrl = Boolean(normalizePublicUrl(left.website || left.source_url) && normalizePublicUrl(left.website || left.source_url) === normalizePublicUrl(right.website || right.source_url))
  const samePhone = Boolean(normalizePhone(left.phone) && normalizePhone(left.phone) === normalizePhone(right.phone))
  const sameAddress = Boolean(compact(left.public_address) && compact(left.public_address) === compact(right.public_address))
  const sameCommunity = Boolean(compact(left.community) && compact(left.community) === compact(right.community))
  const reasons = []
  if (sameProgram) reasons.push("exact_normalized_program_name")
  if (sameOperator) reasons.push("same_operator")
  if (sameUrl) reasons.push("same_normalized_url")
  if (samePhone) reasons.push("same_phone")
  if (sameAddress) reasons.push("same_public_address")
  if (sameCommunity) reasons.push("same_community")
  const distinct = sameOperator && !sameProgram && (!sameCommunity || !sameAddress) ? "shared_operator_different_program" : null
  const exact = sameProgram && sameOperator && sameCommunity && (sameUrl || samePhone || sameAddress)
  const classification = exact ? "same_program_duplicate" : distinct ? "different_program" : reasons.length >= 2 ? "possible_duplicate" : "insufficient_identity_evidence"
  return { classification, reasons, fingerprint: reconciliationFingerprint(left, right) }
}
export function clustersFromPairs(pairs = []) { const graph = new Map(); for (const pair of pairs) { if (pair.comparison.classification === "insufficient_identity_evidence") continue; for (const id of [pair.left.id, pair.right.id]) graph.set(id, new Set([...(graph.get(id) || []), pair.left.id, pair.right.id])); } const seen = new Set(), clusters = []; for (const id of graph.keys()) { if (seen.has(id)) continue; const queue=[id], group=[]; seen.add(id); while(queue.length){const next=queue.pop();group.push(next);for(const peer of graph.get(next)||[])if(!seen.has(peer)){seen.add(peer);queue.push(peer)}} clusters.push(group.sort((a,b)=>a-b)); } return clusters }
