// components/user-menu.tsx
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/auth/actions'

export async function UserMenu() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  // Pull the display name from profiles, fall back to email
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const displayName = profile?.full_name ?? user.email ?? 'User'

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-slate-400 hidden sm:inline">
        {displayName}
      </span>
      <form action={signOut}>
        <button
          type="submit"
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-slate-200 hover:bg-slate-800 transition-colors"
        >
          Sign out
        </button>
      </form>
    </div>
  )
}
