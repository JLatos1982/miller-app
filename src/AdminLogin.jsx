import { useEffect, useState } from "react"
import { supabase } from "./supabaseClient.js"
import { getVerifiedAdminSession } from "./adminApi.js"
import { requestAdminMagicLink } from "./adminAuthFlow.js"
import "./AdminLogin.css"

export default function AdminLogin() {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true
    getVerifiedAdminSession().then((session) => { if (active && session) window.location.replace("/admin") }).catch(() => {})
    return () => { active = false }
  }, [])

  async function submit(event) {
    event.preventDefault()
    setLoading(true)
    setStatus("")

    try {
      const { error } = await requestAdminMagicLink({ supabase, email, origin: window.location.origin })
      setStatus(error ? "The secure sign-in link could not be sent." : "Check your email and open the secure sign-in link in this browser.")
    } catch {
      setStatus("Sign-in is temporarily unavailable.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="admin-login-shell">
      <form className="admin-login-card" onSubmit={submit}>
        <p className="admin-login-kicker">Private access</p>
        <h1>Administrator sign in</h1>
        <p>Enter your Supabase account email. Only an allowlisted administrator can open the dashboard.</p>
        <label>
          <span>Email</span>
          <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <button type="submit" disabled={loading}>{loading ? "Sending…" : "Email secure sign-in link"}</button>
        <p className="admin-login-status" role="status" aria-live="polite">{status}</p>
        <a href="/">Return to Miller</a>
      </form>
    </main>
  )
}
