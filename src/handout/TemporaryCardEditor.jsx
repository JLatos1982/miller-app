import { useEffect, useId, useRef, useState } from "react"
import {
  buildTemporaryCardPayload,
  createManualTemporaryDraft,
  createTemporaryResource,
  sanitizeTemporaryDraft,
  TEMPORARY_CARD_FIELDS,
  TEMPORARY_CARD_NOTICE,
} from "./temporaryCard.js"

const LABELS = {
  name: "Resource name", organization: "Organization", category: "Category / service type", city: "City",
  serviceArea: "Service area", description: "Short description", address: "Address", phone: "Phone",
  email: "Email", website: "Website", hours: "Hours", eligibility: "Eligibility",
  referralProcess: "Referral or intake process", cost: "Cost", accessibility: "Accessibility",
  languages: "Languages", limitations: "Limitations or important caveats", callBeforeNote: "Call-before-you-go note",
}

const TEXTAREAS = new Set(["description", "eligibility", "referralProcess", "accessibility", "limitations", "callBeforeNote"])

export default function TemporaryCardEditor({ source, onCancel, onAdd }) {
  const titleId = useId()
  const closeRef = useRef(null)
  const [draft, setDraft] = useState(() => createManualTemporaryDraft(source))
  const [status, setStatus] = useState("loading")
  const [error, setError] = useState("")
  const [aiAssisted, setAiAssisted] = useState(false)
  const [verificationStatus, setVerificationStatus] = useState("unconfirmed")
  const [showVerificationNote, setShowVerificationNote] = useState(true)
  const [handoutNote, setHandoutNote] = useState("")

  useEffect(() => {
    closeRef.current?.focus()
    function closeOnEscape(event) {
      if (event.key === "Escape") onCancel()
    }
    document.addEventListener("keydown", closeOnEscape)
    return () => document.removeEventListener("keydown", closeOnEscape)
  }, [onCancel])

  useEffect(() => {
    const controller = new AbortController()
    async function generate() {
      try {
        const response = await fetch("/api/handout-card-draft", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildTemporaryCardPayload(source)),
          signal: controller.signal,
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || "Miller could not structure this result.")
        setDraft(sanitizeTemporaryDraft(data.draft, source))
        setAiAssisted(true)
        setStatus("ready")
      } catch (requestError) {
        if (requestError.name === "AbortError") return
        setError(`${requestError.message} A source-based draft is available for you to edit.`)
        setStatus("fallback")
      }
    }
    generate()
    return () => controller.abort()
  }, [source])

  function submit(event) {
    event.preventDefault()
    if (!draft.name.trim() || !draft.website.trim()) {
      setError("Resource name and website are required.")
      return
    }
    onAdd(createTemporaryResource(draft, source, { aiAssisted, verificationStatus, showVerificationNote, handoutNote }))
  }

  return (
    <div className="temporary-card-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <section className="temporary-card-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="temporary-card-dialog-header">
          <div><p className="handout-kicker">Temporary handout resource</p><h2 id={titleId}>Create handout card</h2></div>
          <button ref={closeRef} type="button" className="temporary-card-close" onClick={onCancel} aria-label="Close temporary card editor">×</button>
        </div>

        <div className="temporary-source-box">
          <strong>Source:</strong> <a href={source.website} target="_blank" rel="noreferrer">{source.name}</a>
          <span>Retrieved {new Date().toLocaleDateString()}</span>
          <span>{aiAssisted ? "AI helped structure this draft." : "Draft copied from the public result."}</span>
        </div>

        {status === "loading" ? <p className="temporary-card-status" role="status">Miller is structuring the public resource details…</p> : null}
        {error ? <p className="temporary-card-error" role="alert">{error}</p> : null}

        <form onSubmit={submit}>
          <div className="temporary-card-fields">
            {TEMPORARY_CARD_FIELDS.map((field) => (
              <label key={field} className={TEXTAREAS.has(field) ? "is-wide" : ""}>
                <span>{LABELS[field]}</span>
                {TEXTAREAS.has(field) ? <textarea rows={field === "description" ? 4 : 3} value={draft[field]} onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))} />
                  : <input type={field === "email" ? "email" : field === "website" ? "url" : "text"} value={draft[field]} onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))} />}
              </label>
            ))}
          </div>

          <div className="temporary-verification-box">
            <label><span>Verification status</span><select value={verificationStatus} onChange={(event) => setVerificationStatus(event.target.value)}><option value="unconfirmed">Temporary / unverified</option><option value="confirmed">Confirmed by handout preparer</option></select></label>
            <label className="temporary-checkbox"><input type="checkbox" checked={showVerificationNote} onChange={(event) => setShowVerificationNote(event.target.checked)} /> Include the general verification reminder</label>
            <p>{TEMPORARY_CARD_NOTICE} Temporary and source badges remain even if this reminder is hidden.</p>
          </div>

          <label className="temporary-handout-note"><span>Handout-only note (never sent to AI or review)</span><textarea rows="3" value={handoutNote} onChange={(event) => setHandoutNote(event.target.value)} /></label>

          <div className="temporary-review-disabled"><button type="button" disabled>Submit to Miller review</button><span>Unavailable until Miller has staff-specific authentication. This card stays temporary.</span></div>
          <div className="temporary-card-actions"><button type="button" onClick={onCancel}>Cancel</button><button type="submit" className="primary-button">Add temporary card</button></div>
        </form>
      </section>
    </div>
  )
}
