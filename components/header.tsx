'use client'

import { useEffect, useRef, useState, ReactNode } from 'react'
import { useCurrentTeam } from '@/components/team-context'
import { useActiveOrg } from '@/components/org-context'

function ChevronDownIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      className="w-3.5 h-3.5"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

export function Header({ userMenu }: { userMenu: ReactNode }) {
  const { currentTeam, setCurrentTeamId, availableTeams } = useCurrentTeam()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { org } = useActiveOrg()
  const brandColor = org?.primary_color || '#dc2626'

  // Close dropdown on click outside
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  // Close dropdown on Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // Logged-out / pending / no-team: render a bare header so we never read
  // a null currentTeam.
  if (!currentTeam) {
    return (
      <header className="border-b border-slate-800 bg-black px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <span />
          {userMenu}
        </div>
      </header>
    )
  }
  
  const onlyOneTeam = availableTeams.length <= 1

  return (
    <header className="border-b border-slate-800 bg-black px-4 py-3 sticky top-0 z-10">
      <div className="flex items-center justify-between max-w-6xl mx-auto">
        <div className="relative" ref={ref}>
          {onlyOneTeam ? (
            <h1 className="text-slate-100 font-semibold text-sm sm:text-base">
              {currentTeam.fullName}
            </h1>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(o => !o)}
              className="flex items-center gap-1.5 text-slate-100 font-semibold text-sm sm:text-base hover:text-white transition"
              aria-haspopup="listbox"
              aria-expanded={open}
            >
              <span>{currentTeam.fullName}</span>
              <span className={`transition-transform ${open ? 'rotate-180' : ''}`}>
                <ChevronDownIcon />
              </span>
            </button>
          )}

          {open && !onlyOneTeam && (
            <ul
              role="listbox"
              className="absolute left-0 top-full mt-2 min-w-[220px] rounded-xl border border-slate-700 bg-slate-900 shadow-2xl py-1 z-20"
            >
              {availableTeams.map(team => {
                const isActive = team.id === currentTeam.id
                return (
                  <li key={team.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => {
                        setCurrentTeamId(team.id)
                        setOpen(false)
                      }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition ${
                        isActive
                          ? 'text-white font-semibold'
                          : 'text-slate-300 hover:bg-white/5'
                      }`}
                      style={isActive ? { backgroundColor: `${brandColor}33` } : undefined}
                                          >
                      <div className="flex items-center justify-between gap-2">
                        <span>{team.fullName}</span>
                        {isActive && (
                          <span className="text-xs" style={{ color: brandColor }}>
                            ✓
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {team.division}
                      </p>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {userMenu}
      </div>
    </header>
  )
}
