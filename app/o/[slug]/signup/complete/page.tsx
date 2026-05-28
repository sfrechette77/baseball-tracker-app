import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { PendingChecker } from './PendingChecker'

type Props = {
  params: Promise<{ slug: string }>
}

export default async function SignupCompletePage({ params }: Props) {
  const { slug } = await params

  // Authenticated client — used only to read the current user's session.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/o/${slug}/signup?error=not_authenticated`)
  }

  // Service client — bypasses RLS. Safe here: trusted post-OAuth server route.
  // A brand-new user has no memberships yet, so the authenticated client can't
  // read the org (RLS) or insert the profile (no INSERT policy). Service key fixes both.
  const admin = createServiceClient()

  const { data: org, error: orgError } = await admin
    .from('organizations')
    .select('id, name, slug')
    .eq('slug', slug)
    .maybeSingle()
  if (orgError || !org) {
    redirect('/login?error=org_not_found')
  }

  const { data: existingMemberships } = await admin
    .from('memberships')
    .select('id, role, status')
    .eq('user_id', user.id)
    .eq('organization_id', org.id)

  const hasApproved = existingMemberships?.some(m => m.status === 'approved')
  const hasPending = existingMemberships?.some(m => m.status === 'pending')

  if (hasApproved) {
    redirect('/')
  }

  if (!hasPending) {
    const fullName =
      (user.user_metadata?.full_name as string | undefined) ??
      (user.user_metadata?.name as string | undefined) ??
      null

    await admin
      .from('profiles')
      .upsert(
        {
          id: user.id,
          email: user.email,
          full_name: fullName,
        },
        { onConflict: 'id' }
      )

    const { error: insertError } = await admin.from('memberships').insert({
      user_id: user.id,
      organization_id: org.id,
      role: 'parent',
      status: 'pending',
    })

    if (insertError) {
      console.error('Failed to create pending membership:', insertError)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white p-6">
      <PendingChecker orgId={org.id} />
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="text-6xl">⏳</div>
        <div>
          <h1 className="text-2xl font-extrabold">You&apos;re almost in</h1>
          <p className="mt-3 text-sm text-slate-400 leading-relaxed">
            Thanks for signing up to <span className="text-white font-semibold">{org.name}</span>.
            An admin will review your request and add you to your kid&apos;s team.
            You&apos;ll have access as soon as that&apos;s done.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left">
          <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
            Your account
          </p>
          <p className="mt-1 text-sm text-white">{user.email}</p>
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="text-xs text-slate-500 hover:text-slate-300 transition"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  )
}
