import { useEffect } from "react"

import { MILLER_NORTH_PUBLIC_SECTIONS, resolveMillerNorthPublicSection } from "./millerNorthPublicTaxonomy.js"
import "./MillerNorthPublicPages.css"

export const MILLER_NORTH_HOME_HREF = "/indigenous-healthcare-evidence"

export function MillerNorthHomeLink({ className }) {
  return <a href={MILLER_NORTH_HOME_HREF} className={className}>← Miller North Home</a>
}

export default function MillerNorthPublicNav({ current }) {
  const activeSection = resolveMillerNorthPublicSection(current)
  useEffect(() => {
    let robots = document.querySelector('meta[name="robots"]')
    const created = !robots
    const previous = robots?.getAttribute("content")
    if (!robots) {
      robots = document.createElement("meta")
      robots.setAttribute("name", "robots")
      document.head.appendChild(robots)
    }
    robots.setAttribute("content", "noindex, nofollow")
    robots.setAttribute("data-miller-north-quiet-sharing", "true")
    return () => {
      if (created) robots.remove()
      else {
        if (previous === null) robots.removeAttribute("content")
        else robots.setAttribute("content", previous)
        robots.removeAttribute("data-miller-north-quiet-sharing")
      }
    }
  }, [])

  return <nav className="mn-public-nav" aria-label="Miller North">{MILLER_NORTH_PUBLIC_SECTIONS.map(({ id, href, label }) => <a key={id} href={href} aria-current={activeSection === id ? "page" : undefined}>{label}</a>)}</nav>
}
