/**
 * StatsGrid — responsive KPI grid. 2026 styling, no icons.
 * stats: { label, value, sublabel, trend, trendUp, accent, onClick, key }
 * columns: { sm, md, lg }
 */
const smMap = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' }
const mdMap = { 1: 'md:grid-cols-1', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4', 5: 'md:grid-cols-5', 6: 'md:grid-cols-6' }
const lgMap = { 1: 'lg:grid-cols-1', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5', 6: 'lg:grid-cols-6' }

const StatsGrid = ({ stats = [], columns = { sm: 2, md: 2, lg: 4 }, className = '', onCardClick }) => {
  const gridClasses = [
    'grid gap-3 sm:gap-4 grid-cols-1',
    columns.sm ? smMap[columns.sm] : '',
    columns.md ? mdMap[columns.md] : '',
    columns.lg ? lgMap[columns.lg] : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={`${gridClasses} ${className}`}>
      {stats.map((stat, idx) => {
        const clickable = stat.onClick || onCardClick
        const active = stat.active
        return (
          <button
            key={stat.key ?? stat.label ?? idx}
            type="button"
            disabled={!clickable}
            onClick={clickable ? () => (stat.onClick ? stat.onClick(stat) : onCardClick(stat)) : undefined}
            className={`text-left bg-surface border rounded-2xl p-4 sm:p-5 shadow-soft transition-all ${
              active ? 'border-accent ring-2 ring-accent/20' : 'border-line'
            } ${clickable ? 'cursor-pointer hover:shadow-card active:scale-[0.99] tap-clean' : 'cursor-default'}`}
          >
            <div className="text-xs font-medium uppercase tracking-wide text-muted truncate">{stat.label}</div>
            <div className="mt-1 text-2xl lg:text-3xl font-semibold tracking-tight text-ink break-words nums">
              {stat.value}
            </div>
            {stat.sublabel && <div className="mt-1 text-xs text-muted truncate">{stat.sublabel}</div>}
            {stat.trend && (
              <div className={`mt-2 text-xs font-semibold ${stat.trendUp ? 'text-ok' : 'text-danger'}`}>
                {stat.trend}
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

export default StatsGrid
