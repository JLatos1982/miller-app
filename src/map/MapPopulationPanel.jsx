import { useCallback, useEffect, useState } from "react"
import { adminFetch } from "../adminApi.js"

const labels = {
  public_services: "Public services",
  public_pins: "Public address pins",
  shared_address_groups: "Shared-address groups",
  eligible_for_automatic_publication: "Eligible for automatic publication",
  needs_human_review: "Needs human review",
  excluded_for_safety_privacy_or_manual_decision: "Excluded for safety, privacy, or a manual decision",
  failed_validation: "Failed validation",
  virtual_mobile_services: "Virtual/mobile directory services",
}

export default function MapPopulationPanel() {
  const [dashboard, setDashboard] = useState({ counts: {}, reconciliation: [] })
  const [preview, setPreview] = useState(null)
  const [status, setStatus] = useState("Loading map population status…")
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const response = await adminFetch("/api/admin/map-population")
    const body = await response.json().catch(() => ({}))
    if (!response.ok) return setStatus(body.error || "Map population status could not be loaded.")
    setDashboard(body)
    setStatus(`${body.counts.public_services} public services are represented by ${body.counts.public_pins} exact-address pins.`)
  }, [])
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer) }, [load])
  async function runPreview() {
    if (busy) return
    setBusy(true); setStatus("Preparing a read-only publication preview…")
    const response = await adminFetch("/api/admin/map-population/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
    const body = await response.json().catch(() => ({}))
    setBusy(false)
    if (!response.ok) return setStatus(body.error || "Preview failed. No records were changed.")
    setPreview(body)
    setStatus(`Dry run complete: ${body.counts.eligible} eligible; ${body.counts.needs_human_review} need review; ${body.counts.excluded} excluded; no records changed.`)
  }
  return <section className="address-evidence" aria-labelledby="map-population-title">
    <header><p className="eyebrow">Administrator only · one map workflow</p><h2 id="map-population-title">Map population</h2><p role="status">{status}</p><p>Directory and evidence decisions do not publish pins. Only a verified public-location decision changes the map.</p></header>
    <div className="map-population-counts">{Object.entries(labels).map(([key, label]) => <div key={key}><strong>{dashboard.counts?.[key] ?? "—"}</strong><span>{label}</span></div>)}</div>
    <div className="quick-review-toolbar"><button type="button" disabled={busy} onClick={runPreview}>{busy ? "Preparing preview…" : "Preview safe auto-publication batch"}</button><button type="button" disabled title="A reviewed preview and separate authorization are required">Publish eligible records — not authorized</button><span>The preview is read-only and sends no new geocoder requests.</span></div>
    {preview ? <details open><summary>Dry-run records ({preview.items.length})</summary><div className="evidence-cards">{preview.items.map((item) => <article className="evidence-card" key={item.canonical_resource_id}><div><h3>{item.resource_name}</h3><p><strong>{item.outcome.replaceAll("_", " ")}</strong> — {item.reasons.join(", ")}</p><p>{item.proposed_address} · {item.geocoder.score ?? "no score"} · {item.geocoder.precision || "no precision"}</p><small>{item.policy_version} · no writes performed</small></div></article>)}</div></details> : null}
    <details><summary>Reconcile approved locations ({dashboard.reconciliation?.length || 0})</summary><div className="evidence-cards">{(dashboard.reconciliation || []).map((item) => <article className="evidence-card" key={item.location_id}><div><h3>{item.resource_name}</h3><p>{item.address}, {item.city}<br/>{item.coordinates.latitude}, {item.coordinates.longitude}</p><p><strong>Map query:</strong> {item.appears_in_public_map_query ? "included" : `excluded — ${item.exclusion_reason}`}<br/><strong>Pin group:</strong> {item.shared_address_group} ({item.shared_address_service_count} service{item.shared_address_service_count === 1 ? "" : "s"})</p><small>Resource {item.resource_id} · location {item.location_id} · {item.source_type} · evidence {item.evidence_tier || "not recorded"}</small></div></article>)}</div></details>
  </section>
}
