import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function isValidHexColor(value: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(value)
}

export async function PATCH(req: Request) {
  const supabase = await createClient()

  const body = await req.json()

  const organizationId = body.organizationId as string | undefined
  const name = body.name as string | undefined
  const logoUrl = body.logoUrl as string | null | undefined
  const primaryColor = body.primaryColor as string | undefined

  const publicDescription = body.publicDescription as string | null | undefined

  if (!organizationId) {
    return NextResponse.json(
      { error: 'Missing organization ID.' },
      { status: 400 }
    )
  }

  if (!name || name.trim().length < 2) {
    return NextResponse.json(
      { error: 'Organization name is required.' },
      { status: 400 }
    )
  }

  if (!primaryColor || !isValidHexColor(primaryColor)) {
    return NextResponse.json(
      { error: 'Primary color must be a valid hex color.' },
      { status: 400 }
    )
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json(
      { error: 'Unauthorized.' },
      { status: 401 }
    )
  }

  const { data: membership, error: membershipError } = await supabase
    .from('memberships')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', user.id)
    .eq('role', 'org_admin')
    .limit(1)
    .maybeSingle()

    if (membershipError || membership?.role !== 'org_admin') {
    return NextResponse.json(
        { error: 'You do not have permission to update this organization.' },
        { status: 403 }
    )
    }

  const { data: organization, error: updateError } = await supabase
    .from('organizations')
    .update({
      name: name.trim(),
      logo_url: logoUrl || null,
      primary_color: primaryColor,
      public_description: publicDescription?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', organizationId)
    .select('id, name, slug, logo_url, primary_color, public_description')
    .single()

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ organization })
}