import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AdminLogin from './AdminLogin.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {window.location.pathname === '/admin/login' ? <AdminLogin /> : <App />}
  </StrictMode>,
)
