import { useState } from 'react'
import {
  Search,
  Gift,
  Bell,
  Menu,
  Sun,
  Moon,
} from 'lucide-react'
import type { SyncState } from '../../lib/offline/types'

interface TopBarProps {
  userName: string
  userRank: string
  userLevel: number
  theme?: 'dark' | 'light'
  onToggleTheme?: () => void
  onOpenMobileNav: () => void
  onOpenSettings: () => void
  onOpenAssistant: () => void
  syncState: SyncState
  isAuthenticated: boolean
  cloudEnabled: boolean
}

export function TopBar({
  userName,
  userRank,
  userLevel,
  theme = 'dark',
  onToggleTheme,
  onOpenMobileNav,
  onOpenSettings,
  onOpenAssistant,
  syncState,
  isAuthenticated,
  cloudEnabled,
}: TopBarProps) {
  const [searchVal, setSearchVal] = useState('')

  return (
    <header className="nexus-topbar">
      {/* Mobile Menu trigger */}
      <button
        type="button"
        className="mobile-menu-trigger"
        onClick={onOpenMobileNav}
        aria-label="Open Navigation Menu"
      >
        <Menu />
      </button>

      {/* Global Search Bar (Exact match to reference design) */}
      <div className="topbar-search-wrapper">
        <Search className="search-glyph" />
        <input
          type="text"
          className="topbar-search-input"
          placeholder="Search"
          value={searchVal}
          onChange={(e) => setSearchVal(e.target.value)}
        />
        <div className="search-shortcut-pill">
          <span>⌘ - F</span>
        </div>
      </div>

      {/* Right side live status chips & profile */}
      <div className="topbar-right-actions">
        <div className={`status-chip sync-state-${syncState}`} role="status" aria-live="polite">
          <span className="health-live-dot" />
          <span>{!cloudEnabled ? 'Local mode · cloud not configured' : !isAuthenticated ? 'Sign in to enable cloud sync' : ({ offline: 'Offline · queued locally', pending: 'Changes pending', syncing: 'Syncing to Supabase', synced: 'Synced to Supabase', failed: 'Sync needs attention', conflict: 'Conflict needs review' } as Record<SyncState, string>)[syncState]}</span>
        </div>

        {/* Gift / Milestone Trophy icon */}
        <button
          type="button"
          className="topbar-icon-action"
          aria-label="Streak Rewards & Milestones"
          onClick={onOpenAssistant}
        >
          <Gift />
        </button>

        {/* Notifications Bell */}
        <button
          type="button"
          className="topbar-icon-action notification-bell"
          aria-label="Notifications"
          onClick={onOpenSettings}
        >
          <Bell />
        </button>

        {/* Theme Toggle Button (Dark / Light) */}
        {onToggleTheme && (
          <button
            type="button"
            className="topbar-icon-action theme-toggle-btn"
            aria-label={theme === 'light' ? 'Switch to Midnight Dark Mode' : 'Switch to Cloud Light Mode'}
            title={theme === 'light' ? 'Switch to Midnight Dark Mode' : 'Switch to Cloud Light Mode'}
            onClick={onToggleTheme}
          >
            {theme === 'light' ? <Moon className="theme-toggle-icon" /> : <Sun className="theme-toggle-icon" />}
          </button>
        )}

        {/* User Profile Chip: Avatar + Name + Co-Founder/Rank */}
        <button
          type="button"
          className="topbar-profile-chip"
          onClick={onOpenSettings}
          aria-label={isAuthenticated ? 'Open account settings' : 'Sign in or create a MENYA account'}
        >
          <div className="profile-chip-avatar">
            <span>{(userName || 'L')[0].toUpperCase()}</span>
          </div>
          <div className="profile-chip-copy">
            <strong>{isAuthenticated ? userName || 'Learner' : 'Sign in / Sign up'}</strong>
            <small>{isAuthenticated ? `${userRank || 'Cadet'} · Lvl ${userLevel || 1}` : cloudEnabled ? 'Sync your learning across devices' : 'Account setup'}</small>
          </div>
        </button>
      </div>
    </header>
  )
}

