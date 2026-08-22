import { useEffect, useRef } from "react"

const focusableSelector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export default function AccessibleModal({ title, children, onClose, labelledBy, className = "" }) {
  const panelRef = useRef(null)
  const openerRef = useRef(typeof document !== "undefined" ? document.activeElement : null)

  useEffect(() => {
    const opener = openerRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const closeButton = panelRef.current?.querySelector("button")
    closeButton?.focus()

    function keydown(event) {
      if (event.key === "Escape") return onClose()
      if (event.key !== "Tab") return
      const controls = [...(panelRef.current?.querySelectorAll(focusableSelector) || [])]
      if (!controls.length) return
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }

    document.addEventListener("keydown", keydown)
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", keydown); opener?.focus?.() }
  }, [onClose])

  return <div className="site-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className={`site-modal ${className}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy} ref={panelRef} tabIndex="-1">
      <header className="site-modal-header"><h2 id={labelledBy}>{title}</h2><button type="button" className="site-modal-close" onClick={onClose} aria-label={`Close ${title}`}>×</button></header>
      <div className="site-modal-content">{children}</div>
    </section>
  </div>
}
