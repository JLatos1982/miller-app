const safeText = (value, limit = 180) => String(value ?? "").normalize("NFKC").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, limit)
const MATERIAL = ["new_documents", "updated_documents", "new_events", "existing_events_strengthened", "publication_safe", "material_changes", "owner_review", "errors"]

export function privacySafeFarmRun(run = {}) {
  return {
    listener_id: safeText(run.listener_id, 100),
    source_family: safeText(run.source_family, 100),
    project_scope: safeText(run.project_scope, 40),
    target_worker: safeText(run.target_worker, 40),
    status: safeText(run.status, 40),
    completed_at: safeText(run.completed_at, 40),
    checked: Number(run.checked || 0),
    new_documents: Number(run.new_documents || 0),
    updated_documents: Number(run.updated_documents || 0),
    new_events: Number(run.new_events || 0),
    existing_events_strengthened: Number(run.existing_events_strengthened || 0),
    duplicates_suppressed: Number(run.duplicates_suppressed || 0),
    publication_safe: Number(run.publication_safe || 0),
    material_changes: Number(run.material_changes || 0),
    owner_review: Number(run.owner_review || 0),
    errors: Number(run.errors || 0),
    output_titles: Array.isArray(run.output_titles) ? run.output_titles.map(item => safeText(item, 120)).filter(Boolean).slice(0, 6) : [],
  }
}

export function buildFarmWeeklyOwnerEmail({ runs = [], now = new Date(), periodDays = 7 } = {}) {
  const cutoff = new Date(now).getTime() - periodDays * 86_400_000
  const items = runs.filter(run => new Date(run.completed_at || 0).getTime() >= cutoff).map(privacySafeFarmRun)
  const operationalAttention = items.filter(run => ["failed", "quarantined"].includes(run.status) || (run.status === "deferred" && run.target_worker === "igor"))
  const material = items.filter(run => MATERIAL.some(field => Number(run[field] || 0) > 0) || operationalAttention.includes(run))
  const total = field => items.reduce((sum, item) => sum + Number(item[field] || 0), 0)
  const dataQualityRuns = items.filter(item => ["miller_resource_data_quality", "miller_location_data_quality"].includes(item.source_family))
  const securityRuns = items.filter(item => ["security_and_operations", "production_health", "listener_state_integrity", "dependency_security"].includes(item.source_family))
  const igorRuns = items.filter(item => item.target_worker === "igor")
  const sections = {
    research: { new_incidents: total("new_events"), strengthened_evidence: total("existing_events_strengthened"), new_or_updated_documents: total("new_documents") + total("updated_documents") },
    resources: { publication_safe: total("publication_safe") },
    miller_data_quality: { runs: dataQualityRuns.length, proposed_corrections: dataQualityRuns.reduce((sum, item) => sum + item.material_changes, 0), owner_review: dataQualityRuns.reduce((sum, item) => sum + item.owner_review, 0) },
    listeners: { run_count: items.length, failed: items.filter(item => item.status === "failed").length, quarantined: items.filter(item => item.status === "quarantined").length, deferred: items.filter(item => item.status === "deferred").length, checked: total("checked"), duplicates_suppressed: total("duplicates_suppressed") },
    igor: { jobs: igorRuns.length, completed: igorRuns.filter(item => ["completed", "no_material_change"].includes(item.status)).length, deferred: igorRuns.filter(item => item.status === "deferred").length, failed: igorRuns.filter(item => item.status === "failed").length },
    security: { checks: securityRuns.length, issues: securityRuns.reduce((sum, item) => sum + item.errors + item.owner_review, 0) },
    owner_attention: { count: total("owner_review") + operationalAttention.length, labels: [...new Set([...material.flatMap(item => item.output_titles), ...operationalAttention.map(item => `${item.listener_id}: ${item.status}`)])].slice(0, 10) },
  }
  const nothingChanged = material.length === 0
  const lines = nothingChanged
    ? ["Farm Weekly", "", "No material Farm changes were recorded this week.", `${items.length} read-only job run(s) checked ${total("checked")} item(s); no owner action is required.`]
    : [
        "Farm Weekly", "",
        "Research", `- New incidents: ${sections.research.new_incidents}`, `- Existing evidence strengthened: ${sections.research.strengthened_evidence}`, `- New or updated documents: ${sections.research.new_or_updated_documents}`, "",
        "Resources", `- Publication-safe resource changes: ${sections.resources.publication_safe}`, "",
        "Miller data quality", `- Proposed corrections: ${sections.miller_data_quality.proposed_corrections}; owner review: ${sections.miller_data_quality.owner_review}`, "",
        "Listeners", `- Runs: ${sections.listeners.run_count}; checked: ${sections.listeners.checked}; failed: ${sections.listeners.failed}; quarantined: ${sections.listeners.quarantined}; deferred: ${sections.listeners.deferred}`, "",
        "Igor", `- Jobs: ${sections.igor.jobs}; completed: ${sections.igor.completed}; deferred: ${sections.igor.deferred}; failed: ${sections.igor.failed}`, "",
        "Security", `- Read-only checks: ${sections.security.checks}; material issues: ${sections.security.issues}`, "",
        "Owner attention", `- ${sections.owner_attention.count} item(s) require review.`, ...sections.owner_attention.labels.map(label => `- ${label}`), "",
        "Next", "- Continue the highest-yield due listener; milestone-only cases remain deferred until their trigger.",
      ]
  const text = lines.join("\n")
  const html = `<main style="font-family:Arial,sans-serif;line-height:1.5;max-width:680px;margin:auto;padding:24px;color:#20231f">${lines.map(line => line ? `<p>${escapeHtml(line)}</p>` : "").join("")}</main>`
  return { schema_version: "farm-weekly-owner-email-v1", generated_at: new Date(now).toISOString(), period_days: periodDays, nothing_material_changed: nothingChanged, subject: nothingChanged ? "Farm Weekly — no material changes" : `Farm Weekly — ${sections.owner_attention.count} item(s) for review`, text, html, sections, privacy: { raw_source_bodies: false, credentials: false, personal_medical_details: false, unpublished_allegations: false } }
}

export async function deliverFarmWeeklyOwnerEmail({ email, recipient, send } = {}) {
  const address = safeText(recipient, 254)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error("farm_owner_email_recipient_missing")
  if (typeof send !== "function") throw new Error("farm_owner_email_provider_unavailable")
  if (!email || email.schema_version !== "farm-weekly-owner-email-v1" || email.privacy?.credentials !== false || email.privacy?.unpublished_allegations !== false) throw new Error("farm_owner_email_payload_unsafe")
  await send({ recipient: address, subject: email.subject, text: email.text, html: email.html })
  return { status: "sent", recipient_configured: true, provider_configured: true, sensitive_fields_included: false }
}

const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char])
