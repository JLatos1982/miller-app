import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AdminLogin from './AdminLogin.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Suspense fallback={<main className="route-loading" role="status" aria-live="polite">Loading Miller…</main>}>
      {window.location.pathname === '/admin/login' ? <AdminLogin /> : <App />}
    </Suspense>
  </StrictMode>,
)
