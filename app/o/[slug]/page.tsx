import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'

type Props = {
  params: Promise<{ slug: string }>
}

type OrganizationLink = {
  id: string
  label: string
  url: string
  description: string | null
  sort_order: number
}

export default async function OrganizationPage({ params }: Props) {
  const { slug } = await params
  const supabase = createServiceClient()

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, name, slug, logo_url, primary_color')
    .eq('slug', slug)
    .maybeSingle()

  if (orgError || !org) {
    notFound()
  }

  const { data: links, error: linksError } = await supabase
    .from('organization_links')
    .select('id, label, url, description, sort_order')
    .eq('organization_id', org.id)
    .eq('is_active', true)
    .eq('is_public', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (linksError) {
    console.error('Failed to load public organization links:', linksError)
  }

  const brandColor = org.primary_color || '#dc2626'
  const publicLinks = (links ?? []) as OrganizationLink[]

  return (
    <main className="min-h-screen bg-black px-4 py-10 text-white">
      <div className="mx-auto max-w-sm space-y-6">
        <header className="text-center">
          {org.logo_url && (
            <img
              src={org.logo_url}
              alt={`${org.name} logo`}
              className="mx-auto mb-4 h-24 w-24 rounded-2xl bg-white object-contain p-2"
            />
          )}

          <p
            className="text-xs font-semibold uppercase tracking-[0.25em]"
            style={{ color: brandColor }}
          >
            Welcome
          </p>

          <h1 className="mt-2 text-3xl font-extrabold">{org.name}</h1>

          <p className="mt-3 text-sm text-slate-400">
            Team schedules, updates, scores, stats, and organization resources
            in one place.
          </p>
        </header>

        {publicLinks.length > 0 && (
          <section className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-500">
              Organization Resources
            </p>

            {publicLinks.map(link => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white">{link.label}</p>

                    {link.description && (
                      <p className="mt-1 text-xs text-slate-400">
                        {link.description}
                      </p>
                    )}
                  </div>

                  <span
                    className="shrink-0 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white"
                    style={{ backgroundColor: brandColor }}
                  >
                    Open
                  </span>
                </div>
              </a>
            ))}
          </section>
        )}

        <section className="space-y-3">
          <a
            href={`/o/${org.slug}/signup`}
            className="block w-full rounded-xl py-3 text-center text-sm font-bold text-white"
            style={{ backgroundColor: brandColor }}
          >
            Request App Access
          </a>

          <a
            href="/login"
            className="block text-center text-xs font-semibold"
            style={{ color: brandColor }}
          >
            Already approved? Sign in
          </a>
        </section>
      </div>
    </main>
  )
}