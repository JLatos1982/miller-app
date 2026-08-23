const key = (item) => String(item.finding_type || item.observation_type || "")
const auth = (item) => /protected_route|authorization|auth_negative_probe/.test(key(item))
const headers = (item) => /missing_|header|content_type/.test(key(item))
export function correlateSecurityEvidence({ findings = [], external = [] } = {}) {
  const incidents = []
  const add = (category, members, reason_codes) => { if (members.length) incidents.push({ correlation_key: `${category}:${members.map((item) => item.finding_fingerprint || item.observation_key).sort().join(":")}`, category, state: members.some((item) => item.lifecycle !== "resolved" && item.status !== "pass") ? "active" : "resolved", members: members.map((item) => ({ source: item.observation_key ? "external_observation" : "internal_finding", key: item.observation_key || item.finding_fingerprint })), reason_codes }) }
  const internalAuth = findings.filter(auth), externalAuth = external.filter((item) => item.observation_type === "auth_negative_probe")
  add("auth_boundary", [...internalAuth, ...externalAuth.filter((item) => item.status === "fail")], ["auth_boundary_evidence"])
  add("http_posture", findings.filter(headers), ["http_contract_evidence"])
  add("deployment", findings.filter((item) => /build_identity|schema_|required_schema_capability|deployment_compatibility/.test(key(item))), ["deployment_schema_evidence"])
  const availability = external.filter((item) => item.observation_type === "availability" && item.status === "fail")
  add("availability", availability, ["external_availability_evidence"])
  return incidents.sort((a, b) => a.correlation_key.localeCompare(b.correlation_key))
}
export function internalExternalAgreement({ internal = [], external = [] } = {}) {
  const internalAuthProblem = internal.some(auth), externalAuth = external.filter((item) => item.observation_type === "auth_negative_probe").at(-1)
  if (!externalAuth) return { check: "auth_boundary", state: "external_evidence_missing" }
  const externalProblem = externalAuth.status === "fail"
  if (internalAuthProblem === externalProblem) return { check: "auth_boundary", state: internalAuthProblem ? "internal_external_agree_problem" : "internal_external_agree_healthy" }
  return { check: "auth_boundary", state: "internal_external_disagree" }
}
