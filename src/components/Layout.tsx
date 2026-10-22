import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

const NAV = [
  { to: '/', label: 'Overview', icon: '◎' },
  { to: '/runs', label: 'CI Runs', icon: '▶' },
  { to: '/services', label: 'Service Catalog', icon: '▦' },
  { to: '/deployments', label: 'Deployments', icon: '⇪' },
  { to: '/environments', label: 'Dev Environments', icon: '⌂' },
]

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden><rect width="32" height="32" rx="7" fill="#29b5e8" /><path d="M7 9l6 14h2l10-14h-4l-7 10-3-10z" fill="#fff" /></svg>
          <div>
            <div className="brand-name">Velocity</div>
            <div className="brand-sub">Developer Portal</div>
          </div>
        </div>
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
              <span className="nav-icon">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">Engineering Productivity · DevEx</div>
      </aside>
      <main className="content">{children}</main>
    </div>
  )
}
