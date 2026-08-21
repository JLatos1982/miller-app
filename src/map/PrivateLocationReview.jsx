import { useCallback, useEffect, useState } from "react"
import { adminFetch } from "../adminApi.js"

const readable = (value) => String(value || "unknown").replaceAll("_", " ")

export default function PrivateLocationReview() {
  const [items, setItems] = useState([]), [status, setStatus] = useState("Loading private location candidates…"), [saving, setSaving] = useState("")
  const load = useCallback(async () => {
    const response = await adminFetch("/api/admin/private-location-candidates")
    const body = await response.json().catch(() => ({}))
    if (!response.ok) return setStatus(body.error || "Private location candidates could not be loaded.")
    setItems(body.items || [])
    setStatus(`${body.eligible_count || 0} reviewed candidates can create a private location. Creating one never publishes a map pin.`)
  }, [])
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer) }, [load])
  async function confirm(item) {
    if (!item.eligible || saving) return
    const message = `Create a private location record for ${item.resource_name}? This does not publish the location on Miller's public map.`
    if (!window.confirm(message)) return
    setSaving(item.canonical_uuid); setStatus("Creating the private location record…")
    const response = await adminFetch(`/api/admin/private-location-candidates/${item.canonical_uuid}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmed_private_location: true, expected_qc_version: item.qc.version }) })
    const body = await response.json().catch(() => ({})); setSaving("")
    setStatus(body.error || (body.code === "private_location_already_exists" ? "That private location record already exists. It remains non-public." : "Private location record created. It remains non-public and requires a separate publication decision."))
    if (response.ok) await load()
  }
  return <section className="address-evidence private-location-review" aria-labelledby="private-location-title"><header><p className="eyebrow">Administrator only · human confirmation required</p><h2 id="private-location-title">Create private location record</h2><p role="status">{status}</p><p><strong>This creates a private location record. It does not publish the location on Miller&apos;s public map.</strong></p></header><div className="evidence-cards">{items.map((item) => <article className="evidence-card" key={item.canonical_uuid}><div><h3>{item.resource_name}</h3><p><strong>{item.eligible ? "Ready for explicit confirmation" : "Not eligible"}</strong> · QC {readable(item.qc.decision)}</p><dl><dt>Proposed address</dt><dd>{item.proposed.submitted_address || "Not available"}</dd><dt>BC standardized address</dt><dd>{item.proposed.standardized_address || "Not available"}</dd><dt>Unit / precision</dt><dd>{item.proposed.precision || "Unknown"} · {item.proposed.descriptor || "Unknown"}</dd><dt>Proposed point (private preview)</dt><dd>{Number.isFinite(Number(item.proposed.coordinates?.latitude)) ? `${item.proposed.coordinates.latitude}, ${item.proposed.coordinates.longitude}` : "No valid point"}</dd><dt>Occupancy evidence</dt><dd>{item.proposed.source_url ? <a href={item.proposed.source_url} target="_blank" rel="noreferrer">Open source</a> : "Not available"} · {item.proposed.occupancy_confidence || "Unknown"}</dd><dt>Caveats</dt><dd>{[...(item.proposed.warnings || []), ...(item.proposed.conflicts || []), ...(item.proposed.sensitivity_flags || [])].map(readable).join(", ") || "None recorded"}</dd><dt>Nearby Miller locations</dt><dd>{item.nearby_locations?.length ? item.nearby_locations.map((nearby) => `${nearby.resource_name} (${nearby.public_map ? "public" : "private"})`).join(", ") : "None at nearby coordinates"}</dd><dt>Existing records for this resource</dt><dd>{item.existing_locations?.length ? item.existing_locations.map((existing) => `${existing.street_address || "address withheld"} (${existing.public_map ? "public" : "private"})`).join(", ") : "None"}</dd></dl>{item.eligible ? <button type="button" disabled={saving === item.canonical_uuid} onClick={() => confirm(item)}>Create private location record</button> : <p>Blocked: {item.reason_codes.map(readable).join(", ")}</p>}</div></article>)}</div></section>
}
