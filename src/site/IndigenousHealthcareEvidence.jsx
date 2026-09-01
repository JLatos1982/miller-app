import { useMemo, useState } from "react"

import projection from "../data/indigenous-healthcare-evidence-public-v1.json"
import { INDIGENOUS_HEALTHCARE_EVIDENCE_MANIFEST } from "../data/indigenousHealthcareEvidenceManifest.js"
import "./IndigenousHealthcareEvidence.css"

const labels = {
  reported_account: "Reported account",
  corroborated_account: "Corroborated account",
  official_investigation: "Official investigation",
  formal_finding: "Formal finding",
  systemic_evidence: "Systemic evidence",
  procedural_adjudicative_context: "Procedural context",
}

const provinceLabels = {
  british_columbia: "British Columbia",
  alberta: "Alberta",
  saskatchewan: "Saskatchewan",
}

const sourceText = (source) => [source.publisher, source.source_type, source.publication_date].filter(Boolean).join(" · ")

export function FirstNationsHealthcareEvidenceFeather() {
  return <a className="ihe-feather" href="/indigenous-healthcare-evidence" aria-label="First Nations Healthcare Evidence" title="First Nations Healthcare Evidence"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 3C11 3 5 8 5 16c0 2 .7 3.7 2 5 0-6 4-10 10-12-4 2-6.5 5-7.5 9.5M7 21l-4 0" /></svg></a>
}

export default function IndigenousHealthcareEvidence() {
  const [status, setStatus] = useState("all")
  const [province, setProvince] = useState("all")
  const [careSetting, setCareSetting] = useState("all")
  const [publisher, setPublisher] = useState("all")
  const [sourceType, setSourceType] = useState("all")
  const [year, setYear] = useState("all")
  const [selected, setSelected] = useState(null)
  const records = projection.records
  const options = useMemo(() => ({
    provinces: [...new Set(records.map(record => record.province))].filter(Boolean).sort(),
    careSettings: [...new Set(records.map(record => record.care_setting || "Not specified"))].sort(),
    publishers: [...new Set(records.map(record => record.source.publisher))].sort(),
    sourceTypes: [...new Set(records.map(record => record.source.source_type || "Not specified"))].sort(),
    years: [...new Set(records.map(record => String(record.year || "Not specified")))].sort(),
  }), [records])
  const filteredRecords = useMemo(() => records.filter(record => (
    (status === "all" || record.evidence_status === status) &&
    (province === "all" || record.province === province) &&
    (careSetting === "all" || (record.care_setting || "Not specified") === careSetting) &&
    (publisher === "all" || record.source.publisher === publisher) &&
    (sourceType === "all" || (record.source.source_type || "Not specified") === sourceType) &&
    (year === "all" || String(record.year || "Not specified") === year)
  )), [records, status, province, careSetting, publisher, sourceType, year])

  return <main className="ihe-page" aria-labelledby="ihe-title">
    <header className="ihe-header"><a href="/" className="ihe-back">← Miller resource finder</a><p className="ihe-eyebrow">Public evidence library · approved records only</p><h1 id="ihe-title">First Nations Healthcare Evidence</h1><p className="ihe-lede">A source-first library of approved public evidence about First Nations health care. Evidence types are distinct: a reported account is not a formal finding, and sources remain authoritative over each summary.</p></header>
    <section className="ihe-methodology" aria-labelledby="ihe-about"><h2 id="ihe-about">About this evidence library</h2><p>Miller documents public sources while private collection and public publication remain separate. A publicly documented complaint can be shown as a complaint without treating its underlying allegation as proven. This library is not exhaustive, does not identify patients or professionals, and does not determine wrongdoing by any individual.</p></section>
    <section className="ihe-controls" aria-label="Evidence filters">
      <label>Province<select value={province} onChange={event => setProvince(event.target.value)}><option value="all">All provinces</option>{options.provinces.map(value => <option value={value} key={value}>{provinceLabels[value] || value}</option>)}</select></label>
      <label>Evidence status<select value={status} onChange={event => setStatus(event.target.value)}><option value="all">All evidence types</option>{Object.entries(labels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label>Care setting<select value={careSetting} onChange={event => setCareSetting(event.target.value)}><option value="all">All care settings</option>{options.careSettings.map(value => <option value={value} key={value}>{value}</option>)}</select></label>
      <label>Source organization<select value={publisher} onChange={event => setPublisher(event.target.value)}><option value="all">All organizations</option>{options.publishers.map(value => <option value={value} key={value}>{value}</option>)}</select></label>
      <label>Source type<select value={sourceType} onChange={event => setSourceType(event.target.value)}><option value="all">All source types</option>{options.sourceTypes.map(value => <option value={value} key={value}>{value}</option>)}</select></label>
      <label>Approximate year<select value={year} onChange={event => setYear(event.target.value)}><option value="all">All years</option>{options.years.map(value => <option value={value} key={value}>{value}</option>)}</select></label>
      <p className="ihe-count" aria-live="polite">{filteredRecords.length} approved public records</p>
    </section>
    <section aria-labelledby="ihe-status-title" className="ihe-status"><h2 id="ihe-status-title">Evidence-status explanation</h2><dl><dt>Reported account</dt><dd>A public source reports an experience or allegation. Inclusion records that the account was made; it does not mean Miller independently established the underlying event.</dd><dt>Systemic evidence</dt><dd>Research, institutional material, or other evidence concerning broader patterns or experiences.</dd><dt>Official investigation</dt><dd>An official investigative or review process exists.</dd><dt>Formal finding</dt><dd>A finding made by an appropriate review, adjudicative, or investigative body.</dd><dt>Procedural context</dt><dd>Complaint, application, intervention, or proceeding information; it does not by itself establish the underlying allegation.</dd></dl></section>
    <section aria-labelledby="ihe-records-title"><h2 id="ihe-records-title">Evidence records</h2>{filteredRecords.length ? <div className="ihe-grid">{filteredRecords.map(record => <article className={`ihe-card ihe-${record.evidence_status}`} key={record.public_record_id}><p className="ihe-badge">{labels[record.evidence_status]}</p><h3>{record.evidence_type}</h3><p>{record.summary}</p><dl><dt>Province</dt><dd>{provinceLabels[record.province] || record.province}</dd><dt>Year</dt><dd>{record.year || "Not specified"}</dd><dt>Care setting</dt><dd>{record.care_setting || "Not specified"}</dd>{record.organization && <><dt>Organization</dt><dd>{record.organization}</dd></>}</dl><button type="button" onClick={() => setSelected(record)}>Source and detail</button></article>)}</div> : <p className="ihe-empty">No approved public records match these filters. Private collection and publication review continue separately.</p>}</section>
    <section className="ihe-methodology"><h2>Sources and methodology</h2><p>Every public record links to its source. Multiple copies or mirrors do not become independent corroboration. Record counts do not estimate prevalence, and records may be updated when stronger evidence becomes available. Public safety, privacy, and provenance are assessed separately from evidentiary status.</p><p className="ihe-binding">Public projection: {INDIGENOUS_HEALTHCARE_EVIDENCE_MANIFEST.publicRecordCount} records · version {INDIGENOUS_HEALTHCARE_EVIDENCE_MANIFEST.projectionVersion}</p></section>
    {selected && <section className="ihe-detail" role="dialog" aria-modal="true" aria-labelledby="ihe-detail-title"><div><button className="ihe-close" type="button" onClick={() => setSelected(null)} aria-label="Close evidence detail">×</button><p className="ihe-badge">{labels[selected.evidence_status]}</p><h2 id="ihe-detail-title">{selected.evidence_type}</h2><p>{selected.summary}</p>{selected.caution && <p className="ihe-detail-note"><strong>Context:</strong> {selected.caution}</p>}{selected.recommendation_action && <p><strong>Related action:</strong> {selected.recommendation_action}</p>}<h3>Source</h3><p><a href={selected.source.url} target="_blank" rel="noreferrer">{selected.source.title}</a><br />{sourceText(selected.source)}</p><p className="ihe-detail-note">This source is the primary reference. The classification is a concise public summary, not a replacement for the source.</p></div></section>}
  </main>
}
