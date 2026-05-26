'use client'

import { usePathname } from 'next/navigation'
import { Header } from './header'

// Routes that should NOT show the global header (pre-auth flows, signup, etc.)
function isPublicRoute(pathname: string): boolean {
  if (pathname === '/login') return true
  if (pathname.startsWith('/auth/')) return true
  // Org-scoped signup pages: /o/<slug>/signup and /o/<slug>/signup/complete
  if (/^\/o\/[^/]+\/signup(\/|$)/.test(pathname)) return true
  return false
}

export function AppShell({
  userMenu,
  children,
}: {
  userMenu: React.ReactNode
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const hideChrome = isPublicRoute(pathname)

  if (hideChrome) {
    return <main>{children}</main>
  }

  return (
    <>
      <Header userMenu={userMenu} />
      <main>{children}</main>
    </>
  )
}