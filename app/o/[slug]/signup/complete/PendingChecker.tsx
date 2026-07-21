'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Props = {
  orgId: string
}

/**
 * Checks the user's membership status on mount and when the tab
 * regains focus. Approved users are redirected to the app.
 * Rejected requests refresh the server page so the rejection
 * state is displayed.
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
        .eq('role', 'parent')
        .in('status', ['approved', 'rejected'])

      const statuses = new Set(
        (memberships ?? []).map(
          membership => membership.status
        )
      )

      if (statuses.has('approved')) {
        router.push('/')
        router.refresh()
        return
      }

      if (statuses.has('rejected')) {
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