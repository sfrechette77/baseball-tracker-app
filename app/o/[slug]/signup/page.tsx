import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import { SignupForm } from './SignupForm'

type Props = {
  params: Promise<{ slug: string }>
}

export default async function SignupPage({ params }: Props) {
  const { slug } = await params

  const supabase = await createServiceClient()

  // Look up the org by slug. Use the public anon role so RLS doesn't matter
  // (organizations table SELECT policy will be permissive for slug lookups).
  // For now RLS is dormant, so any read works.
  const { data: org, error } = await supabase
    .from('organizations')
    .select('id, name, slug, primary_color')
    .eq('slug', slug)
    .maybeSingle()

  if (error || !org) {
    notFound()
  }

  const brandColor = org.primary_color || '#dc2626'

  return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white p-6">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <p
            className="text-xs uppercase tracking-[0.25em] font-semibold"
            style={{ color: brandColor }}
          >
            Join the team
          </p>
          <h1 className="mt-1 text-2xl font-extrabold">{org.name}</h1>
          <p className="mt-2 text-sm text-slate-400">
            Sign up with your Google account. An admin will review your request
            and add you to your kid&apos;s team.
          </p>
        </div>

        <SignupForm orgSlug={org.slug} orgName={org.name} />

        <p className="text-xs text-slate-500 text-center">
          Already approved?{' '}
          <a
            href="/login"
            className="font-semibold"
            style={{ color: brandColor }}
          >
            Sign in here
          </a>
        </p>
      </div>
    </main>
  )
}