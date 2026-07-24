import { useState } from "react"
import { supabase } from "./supabaseClient.js"
import { getVerifiedAdminSession } from "./adminApi.js"
import "./AdminLogin.css"

export default function AdminLogin() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [status, setStatus] = useState("")
  const [loading, setLoading] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setLoading(true)
    setStatus("")

    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error || !(await getVerifiedAdminSession())) {
        await supabase.auth.signOut({ scope: "local" })
        setStatus("Sign-in was not accepted.")
        return
      }
      window.location.replace("/")
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
        <p>Use the administrator account configured for Miller.</p>
        <label>
          <span>Email</span>
          <input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          <span>Password</span>
          <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <button type="submit" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
        <p className="admin-login-status" role="status" aria-live="polite">{status}</p>
        <a href="/">Return to Miller</a>
      </form>
    </main>
  )
}
