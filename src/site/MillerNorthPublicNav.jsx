import { useEffect } from "react"

import "./MillerNorthPublicPages.css"

export const MILLER_NORTH_HOME_HREF = "/indigenous-healthcare-evidence"

const links = [
  ["evidence", "/indigenous-healthcare-evidence", "Evidence Library"],
  ["listening", "/indigenous-healthcare-evidence/live-listening", "Live Listening"],
  ["emerging", "/indigenous-healthcare-evidence/watching-now", "Watching Now"],
  ["research", "/indigenous-healthcare-evidence/research-policy", "Research & Policy"],
  ["supports", "/indigenous-healthcare-evidence/first-nations-supports", "First Nations Supports"],
  ["funding", "/indigenous-healthcare-evidence/funding-assistance", "Funding & Assistance"],
  ["methodology", "/indigenous-healthcare-evidence/methodology", "How evidence works"],
]

export function MillerNorthHomeLink({ className }) {
  return <a href={MILLER_NORTH_HOME_HREF} className={className}>← Miller North Home</a>
}

export default function MillerNorthPublicNav({ current }) {
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

  return <nav className="mn-public-nav" aria-label="Miller North">{links.map(([id, href, label]) => <a key={id} href={href} aria-current={current === id ? "page" : undefined}>{label}</a>)}</nav>
}
