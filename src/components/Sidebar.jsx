import { logoBase64 } from '../assets/logo'

const Sidebar = ({ navGroups = [], activeSection, onNavigate, isMobileOpen, setIsMobileOpen, userEmail, onLogout }) => {
  return (
    <>
      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-ink/40 z-40 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          fixed z-50 top-0 left-0 h-dvh w-72 max-w-[85vw] bg-surface border-r border-line flex flex-col
          transition-transform duration-300 ease-out
          lg:static lg:h-auto lg:w-64 lg:max-w-none lg:translate-x-0
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Brand */}
        <div className="flex items-start justify-between px-4 pt-4 pb-3 safe-pt">
          <div className="min-w-0">
            {logoBase64 ? (
              <img src={logoBase64} alt="MNA Dynamic Torque" className="h-9 w-auto" />
            ) : (
              <div className="font-semibold tracking-tight text-ink leading-tight">MNA Dynamic Torque</div>
            )}
            <div className="text-xs text-muted mt-1">Workshop Manager</div>
          </div>
          <button
            onClick={() => setIsMobileOpen(false)}
            className="lg:hidden text-sm font-medium text-muted hover:text-ink min-h-touch px-2 -mr-2 tap-clean"
            aria-label="Close menu"
          >
            Close
          </button>
        </div>

        <div className="mx-4 border-t border-line" />

        {/* Grouped navigation (text-only, no icons) */}
        <nav className="flex-1 overflow-y-auto touch-scroll px-3 py-3">
          {navGroups.map((group, gi) => (
            <div key={group.title || gi} className={gi > 0 ? 'mt-2' : ''}>
              {group.title && <div className="nav-section">{group.title}</div>}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = activeSection === item.id
                  return (
                    <button
                      key={item.id}
                      onClick={() => onNavigate(item)}
                      className={`nav-link w-full text-left ${active ? 'nav-link-active' : ''}`}
                      aria-current={active ? 'page' : undefined}
                    >
                      {active && (
                        <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-accent" aria-hidden="true" />
                      )}
                      {item.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-line p-3 safe-pb">
          <div className="px-2 pb-2">
            <div className="text-xs text-muted">Signed in</div>
            <div className="text-sm font-medium text-ink truncate">{userEmail || 'Staff'}</div>
          </div>
          <button onClick={onLogout} className="btn-secondary btn-sm btn-block">Log out</button>
        </div>
      </aside>
    </>
  )
}

export default Sidebar
