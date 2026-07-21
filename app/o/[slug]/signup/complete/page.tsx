import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { PendingChecker } from './PendingChecker'
import { requestAccessAgain } from './actions'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{
    error?: string
    requested?: string
  }>
}

export default async function SignupCompletePage({
  params,
  searchParams,
}: Props) {
  const { slug } = await params
  const query = await searchParams

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
    .select('id, name, slug, primary_color')
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

  const parentMemberships =
    existingMemberships?.filter(
      membership => membership.role === 'parent'
    ) ?? []

  const hasApproved = parentMemberships.some(
    membership => membership.status === 'approved'
  )

  const hasPending = parentMemberships.some(
    membership => membership.status === 'pending'
  )

  const rejectedParentMembership =
    parentMemberships.find(
      membership => membership.status === 'rejected'
    )

  if (hasApproved) {
    redirect('/')
  }

  if (!hasPending && rejectedParentMembership) {
    const requestAgainAction =
      requestAccessAgain.bind(null, slug)

    return (
      <main className="flex min-h-screen items-center justify-center bg-black p-6 text-white">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-400">
              Access request not approved
            </p>

            <h1 className="mt-2 text-2xl font-extrabold">
              Your request was declined
            </h1>

            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Your request to join{' '}
              <span className="font-semibold text-white">
                {org.name}
              </span>{' '}
              was not approved. Contact an organization admin if
              you believe this was a mistake.
            </p>
          </div>

          {query.error && (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              We could not submit another request. Please try again.
            </p>
          )}

          <form action={requestAgainAction}>
            <button
              type="submit"
              className="w-full rounded-xl py-3 text-sm font-bold text-white"
              style={{
                backgroundColor:
                  org.primary_color ?? '#2563eb',
              }}
            >
              Request access again
            </button>
          </form>

          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-xs text-slate-500 transition hover:text-slate-300"
            >
              Sign out
            </button>
          </form>
        </div>
      </main>
    )
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

        {query.requested === '1' && (
          <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
            Your access request was submitted again.
          </p>
        )}

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
