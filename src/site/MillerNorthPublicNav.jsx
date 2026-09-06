import "./MillerNorthPublicPages.css"

const links = [
  ["evidence", "/indigenous-healthcare-evidence", "Evidence Library"],
  ["listening", "/indigenous-healthcare-evidence/live-listening", "Live Listening"],
  ["research", "/indigenous-healthcare-evidence/research-policy", "Research & Policy"],
  ["methodology", "/indigenous-healthcare-evidence/methodology", "How evidence works"],
]

export default function MillerNorthPublicNav({ current }) {
  return <nav className="mn-public-nav" aria-label="Miller North">{links.map(([id, href, label]) => <a key={id} href={href} aria-current={current === id ? "page" : undefined}>{label}</a>)}</nav>
}
