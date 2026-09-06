import { useEffect, useMemo, useState } from "react"
import AccessibleModal from "./AccessibleModal.jsx"
import { emailResultsStatus, isEmailResultEligible, MAX_EMAIL_RESULTS, sendEmailResults } from "../emailResultsApi.js"
import "./EmailResultsDialog.css"

const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim())

export default function EmailResultsDialog({ results, city, onClose }) {
  const eligible = useMemo(() => results.filter(isEmailResultEligible).slice(0, MAX_EMAIL_RESULTS), [results])
  const [selectedIds, setSelectedIds] = useState(() => new Set(eligible.map((item) => item.id)))
  const [recipient, setRecipient] = useState("")
  const [serviceStatus, setServiceStatus] = useState({ enabled: false, loading: true })
  const [sendState, setSendState] = useState({ status: "idle", message: "" })
  const selected = eligible.filter((item) => selectedIds.has(item.id))
  const fundingOnly = selected.length > 0 && selected.every((item) => item.kind === "funding")
  const mixed = selected.some((item) => item.kind === "funding") && !fundingOnly
  const categories = [...new Set(selected.map((item) => item.category || item.serviceType).filter(Boolean))].slice(0, 5)
  const safeCity = city && city !== "All Cities" ? city : ""
  const subject = fundingOnly ? "Funding opportunities from Miller" : mixed ? "Selected Miller resources and funding" : safeCity ? `Miller resources for ${safeCity}` : "Selected Miller resources"

  useEffect(() => {
    emailResultsStatus()
      .then((status) => setServiceStatus({ ...status, loading: false }))
      .catch(() => setServiceStatus({ enabled: false, loading: false }))
  }, [])

  const toggle = (id) => setSelectedIds((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const submit = async (event) => {
    event.preventDefault()
    if (!validEmail(recipient)) return setSendState({ status: "error", message: "Enter a valid email address." })
    if (!selected.length) return setSendState({ status: "error", message: "Select at least one resource." })
    setSendState({ status: "sending", message: "Sending…" })
    try {
      await sendEmailResults({ recipient: recipient.trim(), resultIds: selected.map((item) => item.id), city: safeCity, categories })
      setRecipient("")
      setSendState({ status: "sent", message: "Your selected resources were sent." })
    } catch (error) {
      setSendState({ status: "error", message: error.message })
    }
  }

  return <AccessibleModal title="Email these results" labelledBy="email-results-title" onClose={onClose} className="email-results-modal">
    <form onSubmit={submit} className="email-results-form">
      <p className="email-results-intro">Choose the resources to include, enter one email address, and review the summary before sending.</p>
      <div className="email-results-actions">
        <button type="button" onClick={() => setSelectedIds(new Set(eligible.map((item) => item.id)))}>Select all</button>
        <button type="button" onClick={() => setSelectedIds(new Set())}>Deselect all</button>
        <span aria-live="polite">{selected.length} selected</span>
      </div>
      <fieldset className="email-results-selection">
        <legend>{fundingOnly ? "Funding opportunities" : "Resources"}</legend>
        {eligible.map((resource) => <label key={resource.id}>
          <input type="checkbox" checked={selectedIds.has(resource.id)} onChange={() => toggle(resource.id)} />
          <span><strong>{resource.name}</strong>{resource.city ? <small>{resource.city}</small> : null}</span>
        </label>)}
      </fieldset>
      <label className="email-recipient-label" htmlFor="email-results-recipient">Recipient email</label>
      <input id="email-results-recipient" type="email" autoComplete="email" inputMode="email" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="name@example.com" maxLength="254" required />
      <section className="email-results-preview" aria-labelledby="email-preview-title">
        <h3 id="email-preview-title">Preview</h3>
        <dl>
          <div><dt>To</dt><dd>{recipient || "Enter an email address"}</dd></div>
          <div><dt>Subject</dt><dd>{subject}</dd></div>
          <div><dt>Included</dt><dd>{selected.length} resource{selected.length === 1 ? "" : "s"}</dd></div>
        </dl>
        <p>{categories.length ? `This list includes ${categories.join(", ")} supports${safeCity ? ` around ${safeCity}` : ""}.` : "The email will contain the selected resource names, access details, and public links."}</p>
        <p className="email-results-privacy">Only resource information is sent. Your search text, health details, and internal Miller data are not included.</p>
      </section>
      {!serviceStatus.loading && !serviceStatus.enabled ? <p className="email-results-setup" role="status">Email delivery is not enabled yet. The review and selection flow is ready; a server-side mail provider must be configured before sending.</p> : null}
      {sendState.message ? <p className={`email-results-status ${sendState.status}`} role="status">{sendState.message}</p> : null}
      <div className="email-results-submit-row">
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="submit" className="primary-button" disabled={!serviceStatus.enabled || sendState.status === "sending" || !selected.length}>Send email</button>
      </div>
    </form>
  </AccessibleModal>
}
