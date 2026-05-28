import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Service-role client. Bypasses RLS entirely. Use ONLY in trusted
// server-side paths (public routes that must read before auth, cron, admin).
// Never expose to the browser.
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase service env vars')
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
