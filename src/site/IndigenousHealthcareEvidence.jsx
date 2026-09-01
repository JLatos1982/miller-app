import { useMemo, useState } from "react"

import projection from "../data/indigenous-healthcare-evidence-public-v1.json"
import { INDIGENOUS_HEALTHCARE_EVIDENCE_MANIFEST } from "../data/indigenousHealthcareEvidenceManifest.js"
import { buildEvidenceCsv, buildEvidenceJson, describeEvidenceFilters, EVIDENCE_STATUS_LABELS as labels, filterEvidenceRecords, includesReportedAccounts, PROVINCE_LABELS as provinceLabels, sortCondensedEvidenceRecords, YEAR_FILTER_OPTIONS } from "./indigenousHealthcareEvidenceExport.js"
import "./IndigenousHealthcareEvidence.css"

const sourceText = (source) => [source.publisher, source.source_type, source.publication_date].filter(Boolean).join(" · ")
const downloadText = (content, type, filename) => {
  const link = document.createElement("a")
  link.href = URL.createObjectURL(new Blob([content], { type }))
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(link.href), 0)
}

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
  const [view, setView] = useState("detailed")
  const [condensedSort, setCondensedSort] = useState("newest")
  const records = projection.records
  const filters = useMemo(() => ({ status, province, careSetting, publisher, sourceType, year }), [status, province, careSetting, publisher, sourceType, year])
  const generatedOn = useMemo(() => new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }), [])
  const options = useMemo(() => ({
    provinces: [...new Set(records.map(record => record.province))].filter(Boolean).sort(),
    careSettings: [...new Set(records.map(record => record.care_setting || "Not specified"))].sort(),
    publishers: [...new Set(records.map(record => record.source.publisher))].sort(),
    sourceTypes: [...new Set(records.map(record => record.source.source_type || "Not specified"))].sort(),
    years: [...new Set(records.map(record => record.year).filter(Number.isInteger))].sort((a, b) => b - a),
  }), [records])
  const filteredRecords = useMemo(() => filterEvidenceRecords(records, filters), [records, filters])
  const condensedRecords = useMemo(() => sortCondensedEvidenceRecords(filteredRecords, condensedSort), [filteredRecords, condensedSort])
  const filterSummary = useMemo(() => describeEvidenceFilters(filters), [filters])
  const exportDate = new Date().toISOString().slice(0, 10)
  const reportedAccountsIncluded = includesReportedAccounts(filteredRecords)
  const printCondensed = () => {
    const previousView = view
    setView("condensed")
    window.requestAnimationFrame(() => {
      window.print()
      setView(previousView)
    })
  }

  return <main className="ihe-page" aria-labelledby="ihe-title">
    <header className="ihe-header"><a href="/" className="ihe-back">← Miller resource finder</a><p className="ihe-eyebrow">Public evidence library · approved records only</p><h1 id="ihe-title">First Nations Healthcare Evidence</h1><p className="ihe-lede">A source-first library of approved public evidence about First Nations health care. Evidence types are distinct: a reported account is not a formal finding, and sources remain authoritative over each summary.</p></header>
    <section className="ihe-methodology" aria-labelledby="ihe-about"><h2 id="ihe-about">About this evidence library</h2><p>Miller documents public sources while private collection and public publication remain separate. A publicly documented complaint can be shown as a complaint without treating its underlying allegation as proven. This library is not exhaustive, does not identify patients or professionals, and does not determine wrongdoing by any individual.</p></section>
    <section className="ihe-controls" aria-label="Evidence filters">
      <label>Province<select value={province} onChange={event => setProvince(event.target.value)}><option value="all">All provinces</option>{options.provinces.map(value => <option value={value} key={value}>{provinceLabels[value] || value}</option>)}</select></label>
      <label>Evidence status<select value={status} onChange={event => setStatus(event.target.value)}><option value="all">All evidence types</option>{Object.entries(labels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label>Care setting<select value={careSetting} onChange={event => setCareSetting(event.target.value)}><option value="all">All care settings</option>{options.careSettings.map(value => <option value={value} key={value}>{value}</option>)}</select></label>
      <label>Source organization<select value={publisher} onChange={event => setPublisher(event.target.value)}><option value="all">All organizations</option>{options.publishers.map(value => <option value={value} key={value}>{value}</option>)}</select></label>
      <label>Source type<select value={sourceType} onChange={event => setSourceType(event.target.value)}><option value="all">All source types</option>{options.sourceTypes.map(value => <option value={value} key={value}>{value}</option>)}</select></label>
      <label>Approximate year<select value={year} onChange={event => setYear(event.target.value)}><option value="all">All years</option>{YEAR_FILTER_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}{options.years.length > 0 && <optgroup label="Exact year">{options.years.map(value => <option value={String(value)} key={value}>{value}</option>)}</optgroup>}</select></label>
      <p className="ihe-count" aria-live="polite">{filteredRecords.length} approved public records</p>
    </section>
    <section className="ihe-exports" aria-label="Print and download filtered evidence"><div><strong>{filteredRecords.length} records match these filters</strong><p>{filterSummary}</p></div><div className="ihe-export-actions"><button type="button" onClick={() => window.print()} disabled={!filteredRecords.length}>Print / Save as PDF</button><button type="button" onClick={() => downloadText(buildEvidenceCsv(filteredRecords), "text/csv;charset=utf-8", `first-nations-healthcare-evidence-${exportDate}.csv`)} disabled={!filteredRecords.length}>Download CSV</button><button type="button" onClick={() => downloadText(buildEvidenceJson(filteredRecords), "application/json;charset=utf-8", `first-nations-healthcare-evidence-${exportDate}.json`)} disabled={!filteredRecords.length}>Download JSON</button></div></section>
    <section className="ihe-view-controls" aria-label="Evidence view"><div role="group" aria-label="Evidence view mode"><button type="button" aria-pressed={view === "detailed"} className={view === "detailed" ? "is-selected" : ""} onClick={() => setView("detailed")}>Detailed</button><button type="button" aria-pressed={view === "condensed"} className={view === "condensed" ? "is-selected" : ""} onClick={() => setView("condensed")}>Condensed</button></div>{view === "condensed" && <><label>Sort condensed reports<select value={condensedSort} onChange={event => setCondensedSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="province">Province</option><option value="care_setting">Care setting</option></select></label><button type="button" onClick={printCondensed} disabled={!filteredRecords.length}>Print condensed list</button></>}<p aria-live="polite">{filteredRecords.length} reports match these filters</p></section>
    <section className="ihe-print-header" aria-hidden="true"><h2>First Nations Healthcare Evidence</h2><p>Generated: {generatedOn}</p><p>Records: {filteredRecords.length}</p><p>Filters applied: {filterSummary}</p>{reportedAccountsIncluded && <p className="ihe-print-caution">Reported accounts document publicly reported experiences or allegations. Their inclusion records that the account was publicly made and does not mean Miller independently established the underlying event.</p>}</section>
    <section aria-labelledby="ihe-status-title" className="ihe-status"><h2 id="ihe-status-title">Evidence-status explanation</h2><dl><dt>Reported account</dt><dd>A public source reports an experience or allegation. Inclusion records that the account was made; it does not mean Miller independently established the underlying event.</dd><dt>Systemic evidence</dt><dd>Research, institutional material, or other evidence concerning broader patterns or experiences.</dd><dt>Official investigation</dt><dd>An official investigative or review process exists.</dd><dt>Formal finding</dt><dd>A finding made by an appropriate review, adjudicative, or investigative body.</dd><dt>Procedural context</dt><dd>Complaint, application, intervention, or proceeding information; it does not by itself establish the underlying allegation.</dd></dl></section>
    <section aria-labelledby="ihe-records-title"><h2 id="ihe-records-title">Evidence records</h2>{filteredRecords.length ? view === "detailed" ? <div className="ihe-grid">{filteredRecords.map(record => <article className={`ihe-card ihe-${record.evidence_status}`} key={record.public_record_id}><p className="ihe-badge">{labels[record.evidence_status]}</p><h3>{record.evidence_type}</h3><p>{record.summary}</p><dl><dt>Province</dt><dd>{provinceLabels[record.province] || record.province}</dd><dt>Year</dt><dd>{record.year || "Year not established"}</dd><dt>Care setting</dt><dd>{record.care_setting || "Not specified"}</dd>{record.organization && <><dt>Organization</dt><dd>{record.organization}</dd></>}</dl><p className="ihe-print-source"><strong>Source:</strong> {record.source.title}<br />{record.source.url}</p><button type="button" onClick={() => setSelected(record)}>Source and detail</button></article>)}</div> : <div className="ihe-condensed-list">{reportedAccountsIncluded && <p className="ihe-condensed-caution">Reported accounts document publicly reported experiences or allegations. Their inclusion records that the account was publicly made and does not mean Miller independently established the underlying event.</p>}{condensedRecords.map(record => <article className="ihe-condensed-row" key={record.public_record_id}><div><span className={`ihe-badge ihe-${record.evidence_status}`}>{labels[record.evidence_status]}</span><span className="ihe-condensed-meta">{record.year || "Year not established"} · {provinceLabels[record.province] || record.province} · {record.care_setting || "Care setting not specified"}</span></div><p>{record.summary}</p><footer><span>{record.source.publisher}</span><a href={record.source.url} target="_blank" rel="noreferrer" aria-label={`Open source: ${record.source.title}`}>{record.source.title}</a><code title="Public record reference">{record.public_record_id}</code></footer></article>)}</div> : <p className="ihe-empty">No approved public records match these filters. Private collection and publication review continue separately.</p>}</section>
    <section className="ihe-methodology"><h2>Sources and methodology</h2><p>Every public record links to its source. Multiple copies or mirrors do not become independent corroboration. Record counts do not estimate prevalence, and records may be updated when stronger evidence becomes available. Public safety, privacy, and provenance are assessed separately from evidentiary status.</p><p className="ihe-binding">Public projection: {INDIGENOUS_HEALTHCARE_EVIDENCE_MANIFEST.publicRecordCount} records · version {INDIGENOUS_HEALTHCARE_EVIDENCE_MANIFEST.projectionVersion}</p></section>
    <footer className="ihe-print-footer">First Nations Healthcare Evidence is a living evidence library compiled from public sources. Evidence status describes what the source establishes. Record counts should not be interpreted as prevalence estimates. Miller: /indigenous-healthcare-evidence</footer>
    {selected && <section className="ihe-detail" role="dialog" aria-modal="true" aria-labelledby="ihe-detail-title"><div><button className="ihe-close" type="button" onClick={() => setSelected(null)} aria-label="Close evidence detail">×</button><p className="ihe-badge">{labels[selected.evidence_status]}</p><h2 id="ihe-detail-title">{selected.evidence_type}</h2><p>{selected.summary}</p>{selected.caution && <p className="ihe-detail-note"><strong>Context:</strong> {selected.caution}</p>}{selected.recommendation_action && <p><strong>Related action:</strong> {selected.recommendation_action}</p>}<h3>Source</h3><p><a href={selected.source.url} target="_blank" rel="noreferrer">{selected.source.title}</a><br />{sourceText(selected.source)}</p><p className="ihe-detail-note">This source is the primary reference. The classification is a concise public summary, not a replacement for the source.</p></div></section>}
  </main>
}
