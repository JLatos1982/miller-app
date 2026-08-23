const STALE_MS = 15 * 60 * 1000

export function staleSecurityPulseNeed(run, now = Date.now()) {
  if (!run || run.status !== "running" || now - new Date(run.started_at).getTime() <= STALE_MS) return null
  return { id: `stale_security_pulse:${run.id}`, domain: "security", action_id: "recover_stale_security_pulse_run", target_type: "security_pulse_run", target_id: run.id, severity: "medium", value: 90, before: { status: run.status, started_at: run.started_at }, expected: { status: "failed", completeness: "failed", public_effect: "none" }, reason_codes: ["stale_private_security_ledger", "no_security_control_change", "no_external_request"] }
}

export async function recoverStaleSecurityPulseRun({ store, run, now = Date.now() } = {}) {
  const need = staleSecurityPulseNeed(run, now)
  if (!need) return { classification: "not_applicable", verified: false, reason: "security_pulse_not_stale_running" }
  const before = need.before
  await store.fail(run, { summary: { failure_code: "stale_run_recovered", recovered_by: "maintenance_security_v1" } })
  const after = await store.inspectRun(run.id)
  const verified = after?.status === "failed" && after?.completed_at && after?.completeness === "failed"
  return { classification: verified ? "resolved" : "inconclusive", verified, action_id: need.action_id, target_id: run.id, before, after: after ? { status: after.status, completed_at: after.completed_at, completeness: after.completeness } : null }
}

export function classifySecurityMaintenance({ pulse = null, findings = [], now = Date.now() } = {}) {
  const healing = staleSecurityPulseNeed(pulse, now)
  const items = []
  if (healing) items.push({ id: healing.id, classification: "safely_repairable_tier1", reason: "A private Security Pulse run is stale; closing its ledger cannot alter a protection.", action_id: healing.action_id, executable: true })
  else if (!pulse) items.push({ id: "security_pulse_never_run", classification: "recommendation", reason: "No manual Security Pulse is available yet.", executable: false })
  else if (pulse.status === "failed" || pulse.status === "degraded") items.push({ id: `security_pulse:${pulse.id}`, classification: "human_action_required", reason: "The latest Security Pulse did not complete cleanly and needs a manual review.", executable: false })
  for (const finding of findings.slice(0, 20)) {
    const lifecycle = String(finding.lifecycle || "")
    const severity = String(finding.severity || "informational")
    items.push({ id: `security_finding:${finding.finding_fingerprint || finding.id}`, classification: ["critical", "high"].includes(severity) ? "human_action_required" : lifecycle === "expected_behavior" ? "informational" : "recommendation", reason: finding.recommended_action || "Review this private security finding.", executable: false })
  }
  return { domain: "security", items: items.slice(0, 20), healing_needs: healing ? [healing] : [], external_requests: 0, mutation_scope: healing ? "finalize_private_stale_run_only" : "none" }
}
