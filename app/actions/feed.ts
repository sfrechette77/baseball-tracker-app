'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ─── Types ─────────────────────────────────────────────────────────────────

export type Post = {
  id: string
  team_id: string
  author_membership_id: string
  body: string
  image_url: string | null
  image_path: string | null
  created_at: string
  // Joined from memberships → profiles
  author_name: string | null
  // Aggregated from reactions
  reactions: ReactionSummary[]
  // True if the current user has reacted with this emoji
  my_reactions: string[]
}

export type ReactionSummary = {
  emoji: string
  count: number
}

export type CreatePostResult =
  | { ok: true; post: Post }
  | { ok: false; error: string }

export type SimpleResult = { ok: true } | { ok: false; error: string }

const MAX_BODY_LENGTH = 2000
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024 // 5MB
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']

// ─── Helpers ───────────────────────────────────────────────────────────────

type MembershipContext =
  | { ok: false; error: string }
  | { ok: true; membership: { id: string; organization_id: string; role: string; status: string }; user: { id: string } }

async function getCurrentMembership(orgId?: string): Promise<MembershipContext> {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return { ok: false, error: 'Not authenticated' }

  // Pick the user's approved membership (one per org per design)
  const query = supabase
    .from('memberships')
    .select('id, organization_id, role, status')
    .eq('user_id', user.id)
    .eq('status', 'approved')

  if (orgId) query.eq('organization_id', orgId)

  const { data, error } = await query.limit(1).maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'No approved membership found' }

  return { ok: true, membership: data, user: { id: user.id } }
}

// ─── createPost ────────────────────────────────────────────────────────────

export async function createPost(formData: FormData): Promise<CreatePostResult> {
  const teamId = formData.get('teamId') as string
  const body = (formData.get('body') as string)?.trim()
  const imageFile = formData.get('image') as File | null

  // Validation
  if (!teamId) return { ok: false, error: 'Missing teamId' }
  if (!body) return { ok: false, error: 'Post body cannot be empty' }
  if (body.length > MAX_BODY_LENGTH) {
    return { ok: false, error: `Post too long (max ${MAX_BODY_LENGTH} chars)` }
  }
  if (imageFile && imageFile.size > 0) {
    if (imageFile.size > MAX_IMAGE_SIZE_BYTES) {
      return { ok: false, error: 'Image too large (max 5MB)' }
    }
    if (!ALLOWED_MIME.includes(imageFile.type)) {
      return { ok: false, error: 'Unsupported image type' }
    }
  }

  const supabase = await createClient()
  const ctx = await getCurrentMembership()
  if (!ctx.ok) return { ok: false, error: ctx.error }

  // Step 1: insert the post (RLS will reject if not admin of this team)
  const { data: inserted, error: insertError } = await supabase
    .from('team_posts')
    .insert({
      team_id: teamId,
      author_membership_id: ctx.membership.id,
      body,
    })
    .select('id, team_id, organization_id, author_membership_id, body, created_at')
    .single()

  if (insertError || !inserted) {
    return { ok: false, error: insertError?.message ?? 'Failed to create post' }
  }

  let image_url: string | null = null
  let image_path: string | null = null

  // Step 2 (optional): upload image, update post with URL
  if (imageFile && imageFile.size > 0) {
    const ext = imageFile.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${inserted.organization_id}/${inserted.team_id}/${inserted.id}.${ext}`

    const arrayBuffer = await imageFile.arrayBuffer()
    const { error: uploadError } = await supabase.storage
      .from('team-posts')
      .upload(path, arrayBuffer, {
        contentType: imageFile.type,
        upsert: false,
      })

    if (!uploadError) {
      // Generate a signed URL valid for a long time
      // (bucket is private; we need signed URLs to display images)
      const { data: signed } = await supabase.storage
        .from('team-posts')
        .createSignedUrl(path, 60 * 60 * 24 * 365) // 1 year

      if (signed?.signedUrl) {
        image_url = signed.signedUrl
        image_path = path

        // Update the post with the image URL
        await supabase
          .from('team_posts')
          .update({ image_url, image_path })
          .eq('id', inserted.id)
      }
    }
    // If upload failed, leave the post without an image. User can retry by editing.
  }

  // Revalidate the feed page cache
  revalidatePath('/feed')

  return {
    ok: true,
    post: {
      id: inserted.id,
      team_id: inserted.team_id,
      author_membership_id: inserted.author_membership_id,
      body: inserted.body,
      image_url,
      image_path,
      created_at: inserted.created_at,
      author_name: null, // UI fetches this via the feed query
      reactions: [],
      my_reactions: [],
    },
  }
}

// ─── deletePost (soft delete) ──────────────────────────────────────────────

export async function deletePost(postId: string): Promise<SimpleResult> {
  const supabase = await createClient()
  const ctx = await getCurrentMembership()
  if (!ctx.ok) return { ok: false, error: ctx.error }

  // RLS will refuse if user isn't admin of the post's team.
  // Use .select() so we get back the affected rows and can verify the update landed.
  const { data, error } = await supabase
    .from('team_posts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', postId)
    .select('id, deleted_at')

  if (error) return { ok: false, error: error.message }

  if (!data || data.length === 0) {
    return { ok: false, error: 'Delete affected 0 rows — likely RLS or wrong post ID' }
  }

  revalidatePath('/feed')
  return { ok: true }
}

// ─── addReaction ───────────────────────────────────────────────────────────

export async function addReaction(postId: string, emoji: string): Promise<SimpleResult> {
  if (!emoji) return { ok: false, error: 'Missing emoji' }

  const supabase = await createClient()
  const ctx = await getCurrentMembership()
  if (!ctx.ok) return { ok: false, error: ctx.error }

  // RLS gates this — the user must be a member who can read the post
  const { error } = await supabase
    .from('team_post_reactions')
    .insert({
      post_id: postId,
      membership_id: ctx.membership.id,
      emoji,
    })

  // Ignore duplicate-key errors (user already reacted with this emoji)
  if (error && !error.message.includes('duplicate key')) {
    return { ok: false, error: error.message }
  }

  revalidatePath('/feed')
  return { ok: true }
}

// ─── removeReaction ────────────────────────────────────────────────────────

export async function removeReaction(postId: string, emoji: string): Promise<SimpleResult> {
  const supabase = await createClient()
  const ctx = await getCurrentMembership()
  if (!ctx.ok) return { ok: false, error: ctx.error }

  const { error } = await supabase
    .from('team_post_reactions')
    .delete()
    .eq('post_id', postId)
    .eq('membership_id', ctx.membership.id)
    .eq('emoji', emoji)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/feed')
  return { ok: true }
}

// ─── getFeed ───────────────────────────────────────────────────────────────

const FEED_PAGE_SIZE = 20

export async function getFeed(
  teamId: string,
  before?: string,
): Promise<{ ok: true; posts: Post[] } | { ok: false; error: string }> {
  if (!teamId) return { ok: false, error: 'Missing teamId' }

  const supabase = await createClient()
  const ctx = await getCurrentMembership()
  if (!ctx.ok) return { ok: false, error: ctx.error }

  // Fetch posts (RLS will scope to ones the user can see)
  let query = supabase
    .from('team_posts')
    .select(`
      id,
      team_id,
      author_membership_id,
      body,
      image_url,
      image_path,
      created_at,
      team_post_reactions ( emoji, membership_id )
    `)
    .eq('team_id', teamId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(FEED_PAGE_SIZE)

  if (before) query = query.lt('created_at', before)

  const { data, error } = await query

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: true, posts: [] }

  /// Normalize the data into our Post shape
  const posts: Post[] = data.map((row: any) => {

    // Aggregate reactions by emoji
    const reactionsByEmoji: Record<string, number> = {}
    const myReactionsSet = new Set<string>()
    for (const r of (row.team_post_reactions ?? []) as { emoji: string; membership_id: string }[]) {
      reactionsByEmoji[r.emoji] = (reactionsByEmoji[r.emoji] ?? 0) + 1
      if (r.membership_id === ctx.membership.id) {
        myReactionsSet.add(r.emoji)
      }
    }
    const reactions: ReactionSummary[] = Object.entries(reactionsByEmoji)
      .map(([emoji, count]) => ({ emoji, count }))
      .sort((a, b) => b.count - a.count)

    return {
      id: row.id,
      team_id: row.team_id,
      author_membership_id: row.author_membership_id,
      body: row.body,
      image_url: row.image_url,
      image_path: row.image_path,
      created_at: row.created_at,
      author_name: null, // TODO: fetch separately to get author display name
      reactions,
      my_reactions: Array.from(myReactionsSet),
    }
  })

  return { ok: true, posts }
}