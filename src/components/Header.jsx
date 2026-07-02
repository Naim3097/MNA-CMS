function Header({ onLogout, onToggleSidebar, title }) {
  const today = new Date().toLocaleDateString('en-MY', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })

  return (
    <header className="app-bar min-h-[56px] py-2 shrink-0">
      <button
        onClick={onToggleSidebar}
        className="lg:hidden btn-ghost btn-sm px-3 -ml-1"
        aria-label="Open menu"
      >
        Menu
      </button>

      <div className="min-w-0 flex-1">
        <h1 className="text-base sm:text-lg font-semibold tracking-tight text-ink truncate">
          {title || 'Dashboard'}
        </h1>
        <p className="hidden sm:block text-xs text-muted">MNA Dynamic Torque</p>
      </div>

      <div className="hidden md:block text-right">
        <div className="text-[11px] uppercase tracking-wide text-faint">Today</div>
        <div className="text-sm font-medium text-ink nums">{today}</div>
      </div>

      {onLogout && (
        <button onClick={onLogout} className="btn-secondary btn-sm hidden sm:inline-flex">
          Log out
        </button>
      )}
    </header>
  )
}

export default Header
