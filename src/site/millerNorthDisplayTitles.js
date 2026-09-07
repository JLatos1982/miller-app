const clean = value => String(value || "").replace(/\s+/g, " ").trim()
const sentence = value => {
  const text = clean(value).replace(/[.]+$/, "")
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : ""
}

const GENERIC_EVIDENCE_TITLES = new Set([
  "official investigation",
  "reported account",
  "systemic evidence",
  "formal finding",
  "recommendation or action",
  "procedural adjudicative context",
  "health",
])

function concernFromText(value) {
  const text = clean(value).toLowerCase()
  if (/emergency.{0,80}(discharg|sent home)|discharg.{0,80}emergency/.test(text)) return "emergency discharge and follow-up care"
  if (/ambulance|paramedic|ems|medevac|medical transport/.test(text)) return "paramedic care and access to medical transport"
  if (/consent|reproductive|gynecolo|steriliz/.test(text)) return "consent and culturally safe reproductive care"
  if (/security|police|custod|restraint|use of force/.test(text)) return "custody, security and healthcare response"
  if (/mental health|psychiatr|suicid|seclusion/.test(text)) return "mental-health care and continuity of support"
  if (/rural|remote|nursing station|transfer/.test(text)) return "rural and remote access to care"
  if (/primary care|family physician/.test(text)) return "access and cultural safety in primary care"
  if (/pain|drug.?seeking|intoxicat/.test(text)) return "assessment, pain care and stereotyping concerns"
  if (/racis|discrimin|cultural saf/.test(text)) return "Indigenous patient experiences and cultural safety"
  return "Indigenous healthcare experiences and accountability"
}

export function evidenceDisplayTitle(record = {}) {
  const sourceTitle = clean(record.source?.title)
  const supplied = clean(record.display_title)
  if (supplied) return sentence(supplied)
  if (sourceTitle && !GENERIC_EVIDENCE_TITLES.has(sourceTitle.toLowerCase())) {
    return sourceTitle.length <= 108 ? sentence(sourceTitle) : `${sourceTitle.slice(0, 105).trim()}…`
  }
  const context = [record.summary, record.care_setting, record.recommendation_action].filter(Boolean).join(" ")
  const concern = concernFromText(context)
  if (record.evidence_status === "official_investigation") return `Official review examined ${concern}`
  if (record.evidence_status === "formal_finding") return `Formal finding addressed ${concern}`
  if (record.evidence_status === "reported_account") return `Public account described ${concern}`
  if (record.evidence_status === "procedural_adjudicative_context") return `Public proceeding concerned ${concern}`
  return `Public evidence examined ${concern}`
}

const NAMED_INCIDENTS = Object.freeze({
  mnsh_nadine_solonas_2017: "Nadine Marcy Solonas",
  mnsh_trevor_dubois_2026: "Trevor Dubois",
  mnsh_randy_lampreau_2019: "Randy Lampreau",
  mnsh_lindsey_izony_2019: "Lindsey Izony",
  mnsh_julian_jones_2021: "Julian Jones",
  mnsh_jocelyn_george_2016: "Jocelyn George",
  mnsh_alyssa_george_2013: "Alyssa Josephine Talina George",
  mnsh_jacob_setah_2014: "Jacob George Setah",
})

export function incidentAffectedPerson(record = {}) {
  if (record.affected_person === "Not publicly named") return "Anonymous affected person"
  return NAMED_INCIDENTS[record.public_incident_id] || "Affected person not named"
}

export function incidentDisplayTitle(record = {}) {
  const supplied = clean(record.display_title)
  if (supplied) return sentence(supplied)
  const title = clean(record.title)
  if (/rural emergency discharge/i.test(title)) return "Rural emergency discharge reviewed after mental-health assessment"
  if (/reproductive-care cultural-safety/i.test(title)) return "Regulator reviewed cultural safety in reproductive care"
  if (/procedure consent and pain/i.test(title)) return "Regulator reviewed consent and pain during a procedure"
  if (/professional-boundaries/i.test(title)) return "Consent agreement addressed professional boundaries in Indigenous care"
  if (/trauma-informed gynecology/i.test(title)) return "Regulator reviewed trauma-informed gynecological care"
  if (/outpatient mental-health communication/i.test(title)) return "Regulator reviewed communication in outpatient mental-health care"
  if (/primary-care generalization/i.test(title)) return "Regulator reviewed a generalization about Indigenous patients in primary care"
  if (/emergency-department assessment and resuscitation/i.test(title)) return "Consent agreement addressed emergency assessment and resuscitation"
  if (/consent and Indigenous-heritage/i.test(title)) return "Consent agreement addressed culturally unsafe professional conduct"
  if (/community-care documentation and supervision/i.test(title)) return "Consent agreement addressed documentation and supervision in community care"
  if (/discriminatory-comments nursing/i.test(title)) return "Consent agreement addressed discriminatory workplace comments"
  if (/hospital death and ongoing reviews/i.test(title)) return "Hospital death remained under multiple public reviews"
  if (/silent world of jordan/i.test(title)) return "Statutory investigation examined youth-custody healthcare failures"
  if (/inquest/i.test(title)) return `Inquest examined ${concernFromText(`${title} ${record.care_setting}`)}`
  return sentence(title.replace(/^Anonymous (?:Indigenous|Métis) (?:patient|client)\s*[—-]\s*/i, ""))
}

export function incidentMetadata(record = {}) {
  const process = record.sources?.some(source => source.role === "jury_verdict")
    ? "Inquest"
    : record.sources?.some(source => /regulator/.test(source.role))
      ? "Regulator review"
      : record.sources?.some(source => /advocate/.test(source.role))
        ? "Statutory investigation"
        : "Official record"
  return [incidentAffectedPerson(record), record.province, process, record.event_date?.slice(0, 4)].filter(Boolean).join(" · ")
}

export function isGenericEvidenceTitle(value) {
  return GENERIC_EVIDENCE_TITLES.has(clean(value).toLowerCase())
}
