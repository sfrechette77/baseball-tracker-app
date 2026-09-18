import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function SetupLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: membership, error: membershipError } = await supabase
    .from('memberships')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (membershipError) {
    throw membershipError
  }

  if (membership) {
    redirect('/admin')
  }

  return children
}
