import { useEffect } from "react"

const pilotStats = [
  ["Records reviewed", "500"], ["Health score", "89/100"], ["Stale", "57"], ["Missing fields", "18"],
  ["Duplicate pairs", "2"], ["Conflicts", "3"], ["Suspicious/broken websites", "6"], ["High-confidence corrections", "6"], ["Human-review cases", "6"],
]

const readiness = [
  ["GO", "Read-only audit method and ranked evidence-backed backlog are defined."],
  ["GO", "Synthetic demo covers stale, missing, duplicate, conflict, and suspicious-site findings."],
  ["NO-GO", "Secure transfer workflow is not finalized."],
  ["NO-GO", "Privacy, legal/commercial review, pricing, and client terms are not finalized."],
  ["NO-GO", "A real design-partner pilot and public intake flow are not yet approved."],
]

export default function DirectoryHealthAuditBackPage({ onSignOut }) {
  useEffect(() => {
    const priorTitle = document.title
    document.title = "Directory Health Audit — Internal draft"
    let robots = document.querySelector('meta[name="robots"]')
    const created = !robots
    if (!robots) { robots = document.createElement("meta"); robots.name = "robots"; document.head.append(robots) }
    const priorContent = robots.getAttribute("content")
    robots.setAttribute("content", "noindex,nofollow,noarchive")
    return () => {
      document.title = priorTitle
      if (created) robots.remove()
      else if (priorContent === null) robots.removeAttribute("content")
      else robots.setAttribute("content", priorContent)
    }
  }, [])

  return <main className="directory-audit-draft" data-internal-only="true">
    <header className="directory-audit-header">
      <a href="/admin">← Internal operations</a>
      <div><p className="eyebrow">Internal draft — not public</p><h1>Directory Health Audit</h1></div>
      <button type="button" onClick={onSignOut}>Sign out</button>
    </header>

    <section className="directory-audit-lead"><p>We help organizations review public-facing directories for stale, missing, conflicting, duplicated, or suspicious records and return a prioritized, evidence-backed correction backlog.</p><p className="directory-audit-note">Read-only planning offer. This page is internal and intentionally excluded from public navigation and search indexing.</p></section>

    <section><h2>Who it is for</h2><ul><li>Nonprofits</li><li>Community directories</li><li>Associations</li><li>Service directories</li><li>Small organizations maintaining public listings</li></ul></section>
    <section><h2>Pilot scope</h2><ul><li>Up to 500–1,000 records</li><li>CSV, JSON, or XLSX</li><li>Public, non-sensitive data only</li><li>Read-only audit</li><li>No automatic database writes</li></ul></section>
    <section><h2>What the client receives</h2><ul><li>Directory health summary</li><li>Stale, missing, duplicate, and conflict findings</li><li>Suspicious or broken website findings</li><li>Ranked correction backlog</li><li>Human-review queue</li><li>Machine-readable CSV and JSON results</li></ul></section>

    <section className="directory-audit-demo" aria-labelledby="directory-audit-demo-title"><div><p className="eyebrow">Fictional synthetic demo — not client data</p><h2 id="directory-audit-demo-title">Example pilot result</h2></div><dl>{pilotStats.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>

    <section><h2>Pilot workflow</h2><ol className="directory-audit-workflow"><li>Intake</li><li>Validation</li><li>Audit</li><li>Evidence review</li><li>Ranked findings</li><li>Client decisions</li><li>Final package</li></ol></section>
    <section><h2>Safety</h2><ul><li>Public, non-sensitive data only</li><li>AI may assist research; AI alone does not authorize corrections</li><li>Client retains final approval</li><li>Original client data is not automatically modified</li></ul></section>
    <section><h2>Illustrative pricing <span className="draft-label">Draft — not final</span></h2><ul><li>Design-partner pilot</li><li>Small paid audit: $750–$1,500</li><li>Larger audit: $2,500–$5,000</li></ul></section>

    <section><h2>Design-partner readiness</h2><div className="directory-audit-readiness">{readiness.map(([state, detail]) => <p key={detail} className={state === "GO" ? "is-go" : "is-no-go"}><strong>{state}</strong><span>{detail}</span></p>)}</div></section>
    <section className="directory-audit-refinement"><h2>Needs refinement before public launch</h2><ul><li>Secure-transfer workflow</li><li>Privacy/security review</li><li>Legal/commercial review</li><li>Final pricing</li><li>Client terms</li><li>Real design-partner pilot</li><li>Public contact/intake flow</li></ul></section>
    <section><h2>Internal pilot/demo artifacts</h2><p>Related internal labels: synthetic correction-readiness backlog, owner backlog report, and readiness change digest. They remain internal operational artifacts and are not public downloads.</p><a className="directory-audit-internal-link" href="/admin">Open internal operations dashboard</a></section>
    <section><h2>Next prospect ideas</h2><ul><li>Community nonprofit directory</li><li>Counselling/service association</li><li>Seniors resource directory</li><li>Volunteer/community organization</li><li>Local professional/member directory</li></ul></section>
  </main>
}
