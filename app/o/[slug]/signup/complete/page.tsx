import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PendingChecker } from './PendingChecker'

type Props = {
  params: Promise<{ slug: string }>
}

export default async function SignupCompletePage({ params }: Props) {
  const { slug } = await params

  const supabase = await createClient()

  // Must be authenticated by now (we just came back from OAuth callback)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    // Something went wrong with the OAuth flow. Send them back to signup.
    redirect(`/o/${slug}/signup?error=not_authenticated`)
  }

  // Look up the org
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, name, slug')
    .eq('slug', slug)
    .maybeSingle()

  if (orgError || !org) {
    redirect('/login?error=org_not_found')
  }

  // Check whether this user already has a membership in this org
  const { data: existingMemberships } = await supabase
    .from('memberships')
    .select('id, role, status')
    .eq('user_id', user.id)
    .eq('organization_id', org.id)

  const hasApproved = existingMemberships?.some(m => m.status === 'approved')
  const hasPending = existingMemberships?.some(m => m.status === 'pending')

  // Already approved → send to dashboard
  if (hasApproved) {
    redirect('/')
  }

  // Not pending yet → create the profile (idempotent) and pending membership
  if (!hasPending) {
    // Upsert the profile so we have name + email for the admin queue.
    // Use the Google-provided metadata.
    const fullName =
      (user.user_metadata?.full_name as string | undefined) ??
      (user.user_metadata?.name as string | undefined) ??
      null

    await supabase
      .from('profiles')
      .upsert(
        {
          id: user.id,
          email: user.email,
          full_name: fullName,
        },
        { onConflict: 'id' }
      )

    // Create the pending membership.
    // RLS on memberships allows users to insert their own pending row.
    const { error: insertError } = await supabase.from('memberships').insert({
      user_id: user.id,
      organization_id: org.id,
      role: 'parent',
      status: 'pending',
    })

    if (insertError) {
      // Most common cause: race condition where two requests inserted at once.
      // Anything else, we still want to show the user the pending screen so
      // they're not stranded — admin queue can deal with it.
      console.error('Failed to create pending membership:', insertError)
    }
  }

  // Render the pending screen
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