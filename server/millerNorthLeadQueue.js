import { createHash } from "node:crypto"

export const millerNorthLeadId = url => createHash("sha256").update(String(url || "").trim().toLowerCase()).digest("hex").slice(0, 24)

export function rankMillerNorthIncidentLead({ title = "", excerpt = "", province = "", regionalContext = "", sourceClassification = "" }) {
  const text = `${title} ${excerpt}`.toLowerCase()
  let score = 0
  if (/(family|mother|father|woman|man|elder|patient|baby|child|widow)/.test(text)) score += 4
  if (/(hospital|emergency|clinic|health centre|health center|health authority)/.test(text)) score += 3
  if (/(\b20\d{2}\b|october|november|december|january|february|march|april|may|june|july|august|september)/.test(text)) score += 2
  if (/(complaint|human rights|lawsuit|tribunal|ombud|investigation|apolog)/.test(text)) score += 3
  if (/(died|death|removed|cut off|denied|delayed|pain|stereotyp|security)/.test(text)) score += 3
  if (province === "saskatchewan") score += 2
  if (province === "alberta" && regionalContext === "Treaty 6 research geography") score += 2
  if (sourceClassification === "multi_incident_source") score += 2
  return score
}

// This is deliberately a routing aid, not an evidence classifier.  It keeps
// known-case reporting out of the scarce manual *new incident* lane while
// retaining it for later corroboration work.
export function routeMillerNorthIncidentLead({ title = "", excerpt = "", province = "", regionalContext = "", knownIncidentSource = false, knownCaseMatch = false }) {
  const text = `${title} ${excerpt}`.toLowerCase()
  const systemic = /(study|survey|systemic|prevalence|policy|framework|report finds|research|analysis|apology|training|strategy|engagement|guidance|qualitative|medical association|anti-racism in|racism in health|equity in|impacts of racism|evidence of racism|healing racism|current problems)/.test(text)
  const concrete = /(family|patient|elder|woman|man|mother|father|son|daughter|baby|complaint|lawsuit|hospital|emergency|clinic|died|death|denied|refusal|removed|assault|mistreat)/.test(text)
  const directNarrative = /(family|alleges|complaint against|files? (a )?complaint|lawsuit|died|death|refusal|denied|removed|assault|mistreat)/.test(text)
  const outsideScope = /(windsor|kingston|manitoba|ontario|quebec|echequan)/.test(text)
  const recent = /\b202[4-6]\b/.test(text)
  const baseScore = rankMillerNorthIncidentLead({ title, excerpt, province, regionalContext })
  if (knownIncidentSource || knownCaseMatch) return { route: "likely_existing_incident_support", priority: baseScore - 12, recent }
  if (outsideScope) return { route: "insufficient", priority: baseScore - 10, recent }
  if (systemic && !directNarrative) return { route: "systemic_or_context", priority: baseScore - 8, recent }
  if (!concrete) return { route: "insufficient", priority: baseScore - 6, recent }
  return { route: "likely_new_incident", priority: baseScore + (recent ? 3 : 0), recent }
}
