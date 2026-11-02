import {
  LayoutDashboard,
  BookOpen,
  CalendarDays,
  Activity,
  BarChart3,
  Users,
  Trophy,
  BrainCircuit,
  Settings,
  ShieldCheck,
  HelpCircle,
  X,
} from 'lucide-react'

export type NavPage =
  | 'Dashboard'
  | 'My Learning'
  | 'Study Planner'
  | 'Analytics & Insights'
  | 'Weekly Review'
  | 'Learning Groups'
  | 'Achievements'
  | 'AI Learning Assistant'
  | 'Profile & Settings'

interface SidebarProps {
  currentPage: NavPage
  onNavigate: (page: NavPage) => void
  mobileOpen: boolean
  onCloseMobile: () => void
}

interface NavItem {
  page: NavPage
  label: string
  displayLabel: string
  icon: typeof LayoutDashboard
  badge?: string
  badgeColor?: 'gold' | 'violet'
}

export function Sidebar({
  currentPage,
  onNavigate,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const generalNav: NavItem[] = [
    { page: 'Dashboard', label: 'Dashboard', displayLabel: 'Dashboard', icon: LayoutDashboard },
    { page: 'My Learning', label: 'Payment', displayLabel: 'Curriculum', icon: BookOpen },
    { page: 'Study Planner', label: 'Customers', displayLabel: 'Study Planner', icon: CalendarDays },
    {
      page: 'Analytics & Insights',
      label: 'Message',
      displayLabel: 'Analytics',
      icon: Activity,
    },
  ]

  const toolsNav: NavItem[] = [
    { page: 'Weekly Review', label: 'Product', displayLabel: 'Weekly Review', icon: BarChart3 },
    { page: 'Learning Groups', label: 'Invoice', displayLabel: 'Learning Groups', icon: Users },
    { page: 'Achievements', label: 'Analytics', displayLabel: 'Achievements', icon: Trophy },
    {
      page: 'AI Learning Assistant',
      label: 'Automation',
      displayLabel: 'Automation',
      icon: BrainCircuit,
      badge: 'BETA',
      badgeColor: 'violet',
    },
  ]

  const supportNav: NavItem[] = [
    { page: 'Profile & Settings', label: 'Settings', displayLabel: 'Settings', icon: Settings },
    { page: 'Profile & Settings', label: 'Security', displayLabel: 'Security', icon: ShieldCheck },
    { page: 'Profile & Settings', label: 'Help', displayLabel: 'Help', icon: HelpCircle },
  ]

  const handleSelect = (page: NavPage) => {
    onNavigate(page)
    onCloseMobile()
  }

  return (
    <aside className={`quantix-sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
      {/* Brand Header */}
      <div className="sidebar-brand-head">
        <div className="brand-logo-glow">
          <img src="/LOGO.png" alt="MENYA" className="brand-logo-img" />
        </div>
        <div className="brand-title-wrap">
          <strong className="brand-name">MENYA</strong>
          <span className="brand-sub">LEARNING PLATFORM</span>
        </div>
        <button
          type="button"
          className="sidebar-close-btn"
          onClick={onCloseMobile}
          aria-label="Close navigation"
        >
          <X />
        </button>
      </div>

      {/* Navigation Sections */}
      <div className="sidebar-scrollable-nav">
        {/* Section 1: GENERAL */}
        <div className="nav-section-group">
          <span className="section-label">GENERAL</span>
          <nav className="nav-items-list" aria-label="General">
            {generalNav.map((item) => {
              const Icon = item.icon
              const isActive = currentPage === item.page
              return (
                <button
                  key={item.label}
                  type="button"
                  className={`quantix-nav-btn ${isActive ? 'active' : ''}`}
                  onClick={() => handleSelect(item.page)}
                >
                  <Icon className="nav-icon" />
                  <span className="nav-label">{item.displayLabel}</span>
                  {isActive && <span className="active-glow-indicator" />}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Section 2: TOOLS */}
        <div className="nav-section-group">
          <span className="section-label">TOOLS</span>
          <nav className="nav-items-list" aria-label="Tools">
            {toolsNav.map((item) => {
              const Icon = item.icon
              const isActive = currentPage === item.page
              return (
                <button
                  key={item.label}
                  type="button"
                  className={`quantix-nav-btn ${isActive ? 'active' : ''}`}
                  onClick={() => handleSelect(item.page)}
                >
                  <Icon className="nav-icon" />
                  <span className="nav-label">{item.displayLabel}</span>
                  {item.badge && (
                    <span className={`nav-badge-pill ${item.badgeColor ?? 'violet'}`}>
                      {item.badge}
                    </span>
                  )}
                  {isActive && <span className="active-glow-indicator" />}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Section 3: SUPPORT */}
        <div className="nav-section-group">
          <span className="section-label">SUPPORT</span>
          <nav className="nav-items-list" aria-label="Support">
            {supportNav.map((item) => {
              const Icon = item.icon
              const isActive = currentPage === item.page && item.label === 'Settings'
              return (
                <button
                  key={item.label}
                  type="button"
                  className={`quantix-nav-btn ${isActive ? 'active' : ''}`}
                  onClick={() => handleSelect(item.page)}
                >
                  <Icon className="nav-icon" />
                  <span className="nav-label">{item.displayLabel}</span>
                </button>
              )
            })}
          </nav>
        </div>
      </div>

      <div className="sidebar-promo-card-wrapper">
        <div className="sidebar-footer-copy">
          <small>© 2026 Menya Inc.</small>
        </div>
      </div>
    </aside>
  )
}
