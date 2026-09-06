import { createHash } from "node:crypto"

const clean = value => String(value || "").trim()
const hash = values => createHash("sha256").update(values.map(value => clean(value).toLowerCase()).join("\u001f")).digest("hex")
export const millerNorthSocialLeadId = sourceUrl => `msl_${hash([sourceUrl]).slice(0, 24)}`
export const millerNorthSocialFingerprint = ({ platform, sourceUrl, excerpt }) => hash([platform, sourceUrl, excerpt])

const timingFor = lead => {
  if (lead.event_date) return { event_date: lead.event_date, event_year: Number(String(lead.event_date).slice(0, 4)), approximate_event_year: null, timing_semantic: "exact_event_date" }
  if (lead.event_year) return { event_date: null, event_year: lead.event_year, approximate_event_year: null, timing_semantic: "event_year" }
  if (lead.approximate_event_year) return { event_date: null, event_year: null, approximate_event_year: lead.approximate_event_year, timing_semantic: "approximate_event_year" }
  return { event_date: null, event_year: null, approximate_event_year: null, timing_semantic: "unknown" }
}

export function buildMillerNorthSocialLeadBatch({ leads = [] } = {}) {
  const urls = new Set()
  return leads.map(lead => {
    if (!/^https:\/\//.test(clean(lead.source_url)) || !clean(lead.platform) || !clean(lead.public_excerpt) || !clean(lead.lead_status)) throw new Error("miller_north_invalid_social_lead")
    const source_url = clean(lead.source_url)
    if (urls.has(source_url)) throw new Error("miller_north_duplicate_social_lead")
    urls.add(source_url)
    return {
      social_lead_id: lead.social_lead_id || millerNorthSocialLeadId(source_url),
      platform: lead.platform,
      source_url,
      public_account_name: clean(lead.public_account_name) || null,
      province: lead.province || null,
      municipality: clean(lead.municipality) || null,
      facility: clean(lead.facility) || null,
      ...timingFor(lead),
      public_excerpt: clean(lead.public_excerpt).slice(0, 3000),
      lead_status: lead.lead_status,
      source_fingerprint: lead.source_fingerprint || millerNorthSocialFingerprint({ platform: lead.platform, sourceUrl: source_url, excerpt: lead.public_excerpt }),
      potential_incident_id: lead.potential_incident_id || null,
      verification_state: lead.verification_state || "unverified",
      change_revisit_state: lead.change_revisit_state || "current",
      provenance: { ...lead.provenance, private_social_lead_only: true },
    }
  })
}

export async function syncMillerNorthSocialLeadBatch({ supabase, batch }) {
  const { data, error } = await supabase.from("miller_north_social_leads").upsert(batch, { onConflict: "source_url" }).select("id,source_url")
  if (error) throw error
  if ((data || []).length !== batch.length) throw new Error("miller_north_social_lead_upsert_incomplete")
  return { social_lead_count: data.length }
}
