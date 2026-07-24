import { supabase } from "./supabaseClient.js"

export async function getVerifiedAdminSession() {
  const { data } = await supabase.auth.getSession()
  const session = data?.session
  if (!session?.access_token) return null

  const response = await fetch("/api/admin/session", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    credentials: "include",
  })
  return response.ok ? session : null
}

export async function adminFetch(url, options = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  const headers = new Headers(options.headers || {})
  headers.set("Authorization", `Bearer ${token}`)
  return fetch(url, { ...options, headers, credentials: "include" })
}
