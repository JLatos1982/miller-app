import { useEffect, useMemo, useState } from "react"

import presentation from "../data/indigenous-healthcare-evidence-groups-public-v1.json"
import { INDIGENOUS_HEALTHCARE_EVIDENCE_MANIFEST } from "../data/indigenousHealthcareEvidenceManifest.js"
import { dateSemantics, displayDateSemantics } from "../millerNorthDateSemantics.js"
import { buildEvidenceCsv, buildEvidenceJson, describeEvidenceFilters, EVIDENCE_STATUS_LABELS as labels, filterEvidenceRecords, includesReportedAccounts, PROVINCE_LABELS as provinceLabels, sortCondensedEvidenceRecords, YEAR_FILTER_OPTIONS } from "./indigenousHealthcareEvidenceExport.js"
import MillerNorthPublicNav from "./MillerNorthPublicNav.jsx"
import "./IndigenousHealthcareEvidence.css"
import "./IndigenousHealthcareEvidenceSearch.css"
import "./IndigenousHealthcareEvidenceLibrarySearch.css"
import "./IndigenousHealthcareEvidenceLaunch.css"

const sourceText = (source) => [source.publisher, source.source_type, source.publication_date].filter(Boolean).join(" · ")
const EVIDENCE_SEARCH_EXAMPLES = ["Emergency departments in Alberta", "Reported accounts in BC", "Maternity care discrimination", "Racism in Saskatchewan healthcare"]
const LAST_VISIT_KEY = "miller_north_evidence_last_visit_v1"
const approvedAt = record => record.publication_approved_at || ""
const visibleDate = record => displayDateSemantics(dateSemantics(record))
const downloadText = (content, type, filename) => {
  const link = document.createElement("a")
  link.href = URL.createObjectURL(new Blob([content], { type }))
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(link.href), 0)
}

export default function IndigenousHealthcareEvidence() {
  const [status, setStatus] = useState("all")
  const [province, setProvince] = useState("all")
  const [careSetting, setCareSetting] = useState("all")
  const [publisher, setPublisher] = useState("all")
  const [sourceType, setSourceType] = useState("all")
  const [year, setYear] = useState("all")
  const [selected, setSelected] = useState(() => { if (typeof window === "undefined") return null; const id = new URLSearchParams(window.location.search).get("group"); return presentation.groups.find(record => record.public_record_id === id) || null })
  const [view, setView] = useState("detailed")
  const [condensedSort, setCondensedSort] = useState("newest")
  const [ordering, setOrdering] = useState("added")
  const [libraryQuery, setLibraryQuery] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [evidenceSearch, setEvidenceSearch] = useState(null)
  const [searchState, setSearchState] = useState("idle")
  const [lastVisit] = useState(() => { try { return window.localStorage.getItem(LAST_VISIT_KEY) || "" } catch { return "" } })
  const records = presentation.groups
  useEffect(() => { try { window.localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString()) } catch { /* storage unavailable */ } }, [])
  const filters = useMemo(() => ({ status, province, careSetting, publisher, sourceType, year }), [status, province, careSetting, publisher, sourceType, year])
  const generatedOn = useMemo(() => new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }), [])
  const options = useMemo(() => ({
    provinces: [...new Set(records.map(record => record.province))].filter(Boolean).sort(),
    careSettings: [...new Set(records.map(record => record.care_setting || "Not specified"))].sort(),
    publishers: [...new Set(records.map(record => record.source.publisher))].sort(),
    sourceTypes: [...new Set(records.map(record => record.source.source_type || "Not specified"))].sort(),
    years: [...new Set(records.map(record => record.year).filter(Number.isInteger))].sort((a, b) => b - a),
  }), [records])
  const filteredRecords = useMemo(() => {
    const query = libraryQuery.trim().toLowerCase()
    return filterEvidenceRecords(records, filters).filter(record => !query || [record.summary, record.evidence_type, record.source?.title, record.source?.publisher, record.source?.source_type, record.province, record.care_setting, record.evidence_status].filter(Boolean).join(' ').toLowerCase().includes(query))
  }, [records, filters, libraryQuery])
  const displayedRecords = useMemo(() => {
    const ordered = [...filteredRecords].sort((a, b) => {
      const left = ordering === "source" ? (a.source?.publication_date || "") : approvedAt(a)
      const right = ordering === "source" ? (b.source?.publication_date || "") : approvedAt(b)
      return right.localeCompare(left) || a.public_record_id.localeCompare(b.public_record_id)
    })
    if (!evidenceSearch?.record_ids?.length) return ordered
    const byId = new Map(ordered.flatMap(record => [[record.public_record_id, record], ...record.member_public_record_ids.map(id => [id, record])]))
    const retrieved = [...new Set(evidenceSearch.record_ids.map(id => byId.get(id)).filter(Boolean))]
    const retrievedIds = new Set(retrieved.map(record => record.public_record_id))
    return [...retrieved, ...ordered.filter(record => !retrievedIds.has(record.public_record_id))]
  }, [filteredRecords, evidenceSearch, ordering])
  const condensedRecords = useMemo(() => sortCondensedEvidenceRecords(displayedRecords, condensedSort), [displayedRecords, condensedSort])
  const filterSummary = useMemo(() => describeEvidenceFilters(filters), [filters])
  const exportDate = new Date().toISOString().slice(0, 10)
  const reportedAccountsIncluded = includesReportedAccounts(filteredRecords)
  const newSinceLastVisit = useMemo(() => new Set(records.filter(record => lastVisit && approvedAt(record) > lastVisit).map(record => record.public_record_id)), [records, lastVisit])
  const submitEvidenceSearch = async (event) => {
    event.preventDefault()
    const query = searchQuery.trim()
    if (!query || searchState === "loading") return
    setSearchState("loading")
    setEvidenceSearch(null)
    try {
      const response = await fetch("/api/indigenous-healthcare-evidence/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Search is unavailable.")
      setEvidenceSearch(result)
      setSearchState(result.summary_available === false ? "fallback" : "complete")
    } catch (error) {
      setEvidenceSearch({ answer: error.message || "Search is unavailable. You can continue using the evidence filters below.", record_ids: [], match_count: 0, summary_available: false })
      setSearchState("error")
    }
  }
  const clearEvidenceSearch = () => { setSearchQuery(""); setEvidenceSearch(null); setSearchState("idle") }
  const closeSelected = () => { setSelected(null); if (typeof window !== "undefined") { const url = new URL(window.location.href); url.searchParams.delete("group"); window.history.replaceState({}, "", `${url.pathname}${url.search}`) } }
  const printCondensed = () => {
    const previousView = view
    setView("condensed")
    window.requestAnimationFrame(() => {
      window.print()
      setView(previousView)
    })
  }

  return <main className="ihe-page" aria-labelledby="ihe-title">
    <header className="ihe-header"><a href="/" className="ihe-back">← Miller resource finder</a><MillerNorthPublicNav current="evidence"/><p className="ihe-eyebrow">Evidence Library · reconciled public records</p><h1 id="ihe-title">First Nations Healthcare Evidence</h1><p className="ihe-lede">A source-first library of reviewed public evidence about racism, discrimination, and related harmful or inequitable First Nations healthcare experiences. Multiple source rows can be presented together when they clearly describe the same evidence context.</p></header>
    <section className="ihe-layer-context" aria-label="Miller North evidence layers"><strong>Looking for recent reports?</strong><a href="/indigenous-healthcare-evidence/live-listening">Open Live Listening</a><span>Looking for what institutions did afterward?</span><a href="/indigenous-healthcare-evidence/research-policy">Open Research &amp; Policy</a><span>Looking for practical support?</span><a href="/indigenous-healthcare-evidence/first-nations-supports">Find First Nations Supports</a></section>
    <section className="ihe-library-search" aria-label="Search the evidence"><label htmlFor="ihe-library-query">Search reviewed evidence</label><input id="ihe-library-query" type="search" value={libraryQuery} onChange={event => setLibraryQuery(event.target.value)} placeholder="Type here to search the evidence…" />{libraryQuery && <button type="button" onClick={() => setLibraryQuery("")}>Clear</button>}</section>
    <section className="ihe-search" aria-labelledby="ihe-search-title"><h2 id="ihe-search-title">Ask the evidence library</h2><form onSubmit={submitEvidenceSearch}><label className="ihe-search-label" htmlFor="ihe-evidence-query">Ask a question about the approved public evidence</label><div><input id="ihe-evidence-query" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} maxLength="500" placeholder="Ask about patterns, sources, places, or evidence…" disabled={searchState === "loading"} /><button type="submit" disabled={!searchQuery.trim() || searchState === "loading"}>{searchState === "loading" ? "Searching…" : "Search"}</button>{evidenceSearch && <button className="ihe-clear-search" type="button" onClick={clearEvidenceSearch}>Clear search</button>}</div></form><div className="ihe-search-examples" aria-label="Example searches"><span>Examples:</span>{EVIDENCE_SEARCH_EXAMPLES.map(example => <button type="button" key={example} onClick={() => setSearchQuery(example)} disabled={searchState === "loading"}>{example}</button>)}</div>{evidenceSearch && <div className={`ihe-search-answer ${searchState === "error" || searchState === "fallback" ? "ihe-search-unavailable" : ""}`} aria-live="polite">{searchState !== "error" && evidenceSearch.match_count > 0 && <p className="ihe-search-match-count">{evidenceSearch.match_count} relevant record{evidenceSearch.match_count === 1 ? "" : "s"} found</p>}{evidenceSearch.answer.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>}</section>
    {newSinceLastVisit.size > 0 && <section className="ihe-new-since" aria-label="New since last visit"><h2>New Since Last Visit</h2><p>{newSinceLastVisit.size} reviewed evidence record{newSinceLastVisit.size === 1 ? "" : "s"} entered the public library since your previous visit.</p></section>}
    <section className="ihe-methodology" aria-labelledby="ihe-about"><h2 id="ihe-about">About this evidence library</h2><p>Miller North documents public sources while private research and public presentation remain separate. A publicly documented complaint can be shown as a complaint without treating its underlying allegation as proven. The library does not try to identify anonymized patients or determine wrongdoing by an individual.</p><p><a href="/indigenous-healthcare-evidence/methodology">Read how evidence, dates, duplicates and implementation labels are handled →</a></p></section>
    <section className="ihe-controls" aria-label="Evidence filters">
      <label>Province<select value={province} onChange={event => setProvince(event.target.value)}><option value="all">All provinces</option>{options.provinces.map(value => <option value={value} key={value}>{provinceLabels[value] || value}</option>)}</select></label>
      <label>Evidence status<select value={status} onChange={event => setStatus(event.target.value)}><option value="all">All evidence types</option>{Object.entries(labels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label>Care setting<select value={careSetting} onChange={event => setCareSetting(event.target.value)}><option value="all">All care settings</option>{options.careSettings.map(value => <option value={value} key={value}>{value}</option>)}</select></label>
      <label>Source organization<select value={publisher} onChange={event => setPublisher(event.target.value)}><option value="all">All organizations</option>{options.publishers.map(value => <option value={value} key={value}>{value}</option>)}</select></label>
      <label>Source type<select value={sourceType} onChange={event => setSourceType(event.target.value)}><option value="all">All source types</option>{options.sourceTypes.map(value => <option value={value} key={value}>{value}</option>)}</select></label>
      <label>Event year<select value={year} onChange={event => setYear(event.target.value)}><option value="all">All years</option>{YEAR_FILTER_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}{options.years.length > 0 && <optgroup label="Exact event year">{options.years.map(value => <option value={String(value)} key={value}>{value}</option>)}</optgroup>}</select></label>
      <p className="ihe-count" aria-live="polite">{filteredRecords.length} public evidence groups</p>
    </section>
    <section className="ihe-ordering" aria-label="Evidence ordering"><span>Order by:</span><button type="button" className={ordering === "added" ? "is-selected" : ""} onClick={() => setOrdering("added")}>Recently Added</button><button type="button" className={ordering === "source" ? "is-selected" : ""} onClick={() => setOrdering("source")}>Newest source dates</button><span>{ordering === "added" ? "When a record entered the public library" : "By source publication date; this is not an event date."}</span></section>
    <section className="ihe-exports" aria-label="Print and download filtered evidence"><div><strong>{filteredRecords.length} evidence groups match these filters</strong><p>{filterSummary}</p></div><div className="ihe-export-actions"><button type="button" onClick={() => window.print()} disabled={!filteredRecords.length}>Print / Save as PDF</button><button type="button" onClick={() => downloadText(buildEvidenceCsv(filteredRecords), "text/csv;charset=utf-8", `first-nations-healthcare-evidence-${exportDate}.csv`)} disabled={!filteredRecords.length}>Download CSV</button><button type="button" onClick={() => downloadText(buildEvidenceJson(filteredRecords), "application/json;charset=utf-8", `first-nations-healthcare-evidence-${exportDate}.json`)} disabled={!filteredRecords.length}>Download JSON</button></div></section>
    <section className="ihe-view-controls" aria-label="Evidence view"><div role="group" aria-label="Evidence view mode"><button type="button" aria-pressed={view === "detailed"} className={view === "detailed" ? "is-selected" : ""} onClick={() => setView("detailed")}>Detailed</button><button type="button" aria-pressed={view === "condensed"} className={view === "condensed" ? "is-selected" : ""} onClick={() => setView("condensed")}>Condensed</button></div>{view === "condensed" && <><label>Sort condensed evidence<select value={condensedSort} onChange={event => setCondensedSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="province">Province</option><option value="care_setting">Care setting</option></select></label><button type="button" onClick={printCondensed} disabled={!filteredRecords.length}>Print condensed list</button></>}<p aria-live="polite">{filteredRecords.length} evidence groups match these filters</p></section>
    <section className="ihe-print-header" aria-hidden="true"><h2>First Nations Healthcare Racism &amp; Discrimination Evidence</h2><p>Generated: {generatedOn}</p><p>Records: {filteredRecords.length}</p><p>Filters applied: {filterSummary}</p>{reportedAccountsIncluded && <p className="ihe-print-caution">Reported accounts document publicly reported experiences or allegations. Their inclusion records that the account was publicly made and does not mean Miller independently established the underlying event.</p>}</section>
    <section aria-labelledby="ihe-status-title" className="ihe-status"><h2 id="ihe-status-title">Evidence-status explanation</h2><dl><dt>Reported account</dt><dd>A public source reports an experience or allegation. Inclusion records that the account was made; it does not mean Miller independently established the underlying event.</dd><dt>Systemic evidence</dt><dd>Research, institutional material, or other evidence concerning broader patterns or experiences.</dd><dt>Official investigation</dt><dd>An official investigative or review process exists.</dd><dt>Formal finding</dt><dd>A finding made by an appropriate review, adjudicative, or investigative body.</dd><dt>Procedural context</dt><dd>Complaint, application, intervention, or proceeding information; it does not by itself establish the underlying allegation.</dd></dl></section>
    <section aria-labelledby="ihe-records-title"><h2 id="ihe-records-title">Reviewed evidence</h2>{displayedRecords.length ? view === "detailed" ? <div className="ihe-grid">{displayedRecords.map(record => <article className={`ihe-card ihe-${record.evidence_status}`} key={record.public_record_id}><p className="ihe-badge">{labels[record.evidence_status]}</p><h3>{record.evidence_type}</h3><p>{record.summary}</p><dl><dt>Province</dt><dd>{provinceLabels[record.province] || record.province}</dd><dt>Incident timing</dt><dd>{visibleDate(record)}</dd><dt>Care setting</dt><dd>{record.care_setting || "Not specified"}</dd><dt>Sources</dt><dd>{record.source_count}</dd>{record.organization && <><dt>Organization</dt><dd>{record.organization}</dd></>}</dl><p className="ihe-print-source"><strong>Source:</strong> {record.source.title}<br />{record.source.url}</p><button type="button" onClick={() => setSelected(record)}>Sources and detail</button></article>)}</div> : <div className="ihe-condensed-list">{reportedAccountsIncluded && <p className="ihe-condensed-caution">Reported accounts document publicly reported experiences or allegations. Their inclusion records that the account was made and does not mean Miller North independently established the underlying event.</p>}{condensedRecords.map(record => <article className="ihe-condensed-row" key={record.public_record_id}><div><span className={`ihe-badge ihe-${record.evidence_status}`}>{labels[record.evidence_status]}</span><span className="ihe-condensed-meta">{visibleDate(record)} · {provinceLabels[record.province] || record.province} · {record.care_setting || "Care setting not specified"}</span></div><p>{record.summary}</p><footer><span>{record.source_count} source{record.source_count === 1 ? "" : "s"}</span><a href={record.source.url} target="_blank" rel="noreferrer" aria-label={`Open source: ${record.source.title}`}>{record.source.title}</a></footer></article>)}</div> : <p className="ihe-empty">No public evidence groups match these filters. Private research and publication review continue separately.</p>}</section>
    <section className="ihe-methodology"><h2>Sources and reconciliation</h2><p>Every public evidence group links to its source material. Deterministic presentation grouping currently turns {presentation.metrics.raw_source_records} approved source-derived rows into {presentation.metrics.public_evidence_groups} public evidence groups. That is not a claim that the library contains the same number of distinct incidents.</p><p>Copies, excerpts and mirrors do not become independent corroboration merely because they appear more than once. Ambiguous possible duplicates stay separate pending review.</p><p className="ihe-binding">Underlying approved projection: {INDIGENOUS_HEALTHCARE_EVIDENCE_MANIFEST.publicRecordCount} source-derived records · presentation version {presentation.schema_version}</p></section>
    <footer className="ihe-print-footer">Miller North is a living public-source evidence library. Evidence status describes what sources establish. Record counts should not be interpreted as prevalence estimates.</footer>
    {selected && <section className="ihe-detail" role="dialog" aria-modal="true" aria-labelledby="ihe-detail-title"><div><button className="ihe-close" type="button" onClick={closeSelected} aria-label="Close evidence detail" autoFocus>×</button><p className="ihe-badge">{labels[selected.evidence_status]}</p><h2 id="ihe-detail-title">{selected.evidence_type}</h2><p>{selected.summary}</p>{selected.caution && <p className="ihe-detail-note"><strong>Context:</strong> {selected.caution}</p>}{selected.recommendation_action && <p><strong>Related action:</strong> {selected.recommendation_action}</p>}<h3>{selected.source_count === 1 ? "Source" : `${selected.source_count} sources`}</h3><ul className="ihe-detail-sources">{selected.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a><span>{sourceText(source)}</span></li>)}</ul><p className="ihe-detail-note">This is a concise public presentation of {selected.source_record_count} approved source-derived record{selected.source_record_count === 1 ? "" : "s"}; it does not replace the underlying sources.</p></div></section>}
  </main>
}
