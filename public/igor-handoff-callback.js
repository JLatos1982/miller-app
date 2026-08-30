(() => {
  const codeValues = new URLSearchParams(window.location.search).getAll("code")
  const code = codeValues.length === 1 && /^[A-Za-z0-9_-]{16,2048}$/.test(codeValues[0]) ? codeValues[0] : null
  // Remove query and fragment data before rendering anything to the owner.
  window.history.replaceState(null, "", "/auth/igor-handoff-callback")
  const result = document.getElementById("result")
  const error = document.getElementById("error")
  if (!code) { error.hidden = false; return }
  const output = document.getElementById("authorization-code")
  output.value = code
  result.hidden = false
  document.getElementById("copy-code").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(code); document.getElementById("copy-status").textContent = "Copied." } catch { document.getElementById("copy-status").textContent = "Copy the code from the field above." }
  })
})()
