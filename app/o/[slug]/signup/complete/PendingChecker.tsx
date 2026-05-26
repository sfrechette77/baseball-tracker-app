'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Props = {
  orgId: string
}

/**
 * Checks the user's membership status in this org on mount and on tab focus.
 * If the user is now approved, redirects them to the dashboard.
 *
 * This component renders nothing visible — it just runs the check in the background.
 */
export function PendingChecker({ orgId }: Props) {
  const router = useRouter()

  useEffect(() => {
    const check = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: memberships } = await supabase
        .from('memberships')
        .select('status')
        .eq('user_id', user.id)
        .eq('organization_id', orgId)
        .eq('status', 'approved')
        .limit(1)

      if (memberships && memberships.length > 0) {
        // They're approved — bounce to the dashboard
        router.push('/')
        router.refresh()
      }
    }

    // Check on mount
    check()

    // Check when the tab regains focus (user comes back from another tab/app)
    const handleFocus = () => check()
    window.addEventListener('focus', handleFocus)

    return () => {
      window.removeEventListener('focus', handleFocus)
    }
  }, [orgId, router])

  return null
}