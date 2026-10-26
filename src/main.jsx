import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import EventApp from './EventApp.jsx'
import './index.css'

const isEventPage = window.location.pathname === '/event' || window.location.pathname.startsWith('/event/')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isEventPage ? <EventApp /> : <App />}
  </StrictMode>,
)