'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { sendPushToTeam } from '@/lib/push/send'

// ─── Types ─────────────────────────────────────────────────────────────────

export type ChatMessage = {
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

export type SendMessageResult =
  | { ok: true; message: ChatMessage }
  | { ok: false; error: string }

export type SimpleResult = { ok: true } | { ok: false; error: string }

const MAX_BODY_LENGTH = 2000
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024 // 5MB
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']
const CHAT_PAGE_SIZE = 50

// ─── Helpers ───────────────────────────────────────────────────────────────

type AnyMembershipContext =
  | { ok: false; error: string }
  | {
      ok: true
      membership: { id: string; organization_id: string; role: string; status: string }
      user: { id: string }
    }

/**
 * Get the current user's approved membership in the org that contains the
 * given team. Unlike the Feed helper (which limits to admin roles), this one
 * accepts ANY approved membership — parent, team_admin, or org_admin.
 * RLS still gates whether the user can act on the specific team.
 */
async function getCurrentMembershipForTeam(teamId: string): Promise<AnyMembershipContext> {
  const supabase = await createClient()

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return { ok: false, error: 'Not authenticated' }

  // Look up the team's organization
  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('id, organization_id')
    .eq('id', teamId)
    .maybeSingle()

  if (teamError) return { ok: false, error: teamError.message }
  if (!team) return { ok: false, error: 'Team not found' }

  // Find the caller's approved membership in that org.
  // Prefer admin roles when the user has multiple memberships (e.g. coach + parent),
  // so the `author_membership_id` carries the higher signal where applicable.
  const { data: memberships, error: memError } = await supabase
    .from('memberships')
    .select('id, organization_id, role, status')
    .eq('user_id', user.id)
    .eq('organization_id', team.organization_id)
    .eq('status', 'approved')

  if (memError) return { ok: false, error: memError.message }
  if (!memberships || memberships.length === 0) {
    return { ok: false, error: 'No approved membership in this org' }
  }

  // Role priority: org_admin > team_admin > parent
  const rolePriority: Record<string, number> = {
    org_admin: 3,
    team_admin: 2,
    parent: 1,
  }
  const chosen = [...memberships].sort(
    (a, b) => (rolePriority[b.role] ?? 0) - (rolePriority[a.role] ?? 0)
  )[0]

  return { ok: true, membership: chosen, user: { id: user.id } }
}

// ─── sendMessage ───────────────────────────────────────────────────────────

export async function sendMessage(formData: FormData): Promise<SendMessageResult> {
  const teamId = formData.get('teamId') as string
  const body = (formData.get('body') as string)?.trim()
  const imageFile = formData.get('image') as File | null

  // Validation
  if (!teamId) return { ok: false, error: 'Missing teamId' }
  if (!body && !(imageFile && imageFile.size > 0)) {
    return { ok: false, error: 'Message cannot be empty' }
  }
  if (body && body.length > MAX_BODY_LENGTH) {
    return { ok: false, error: `Message too long (max ${MAX_BODY_LENGTH} chars)` }
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
  const ctx = await getCurrentMembershipForTeam(teamId)
  if (!ctx.ok) return { ok: false, error: ctx.error }

  // Step 1: insert the message (RLS rejects if user can't post to this team)
  const { data: inserted, error: insertError } = await supabase
    .from('team_messages')
    .insert({
      team_id: teamId,
      author_membership_id: ctx.membership.id,
      body: body || '', // empty body is fine if there's an image
    })
    .select('id, team_id, organization_id, author_membership_id, body, created_at')
    .single()

  if (insertError || !inserted) {
    return { ok: false, error: insertError?.message ?? 'Failed to send message' }
  }

  let image_url: string | null = null
  let image_path: string | null = null

  // Step 2 (optional): upload image, update message with URL
  if (imageFile && imageFile.size > 0) {
    const ext = imageFile.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${inserted.organization_id}/${inserted.team_id}/${inserted.id}.${ext}`

    const arrayBuffer = await imageFile.arrayBuffer()
    const { error: uploadError } = await supabase.storage
      .from('team-messages')
      .upload(path, arrayBuffer, {
        contentType: imageFile.type,
        upsert: false,
      })

    if (!uploadError) {
      const { data: signed } = await supabase.storage
        .from('team-messages')
        .createSignedUrl(path, 60 * 60 * 24 * 365) // 1 year

      if (signed?.signedUrl) {
        image_url = signed.signedUrl
        image_path = path

        await supabase
          .from('team_messages')
          .update({ image_url, image_path })
          .eq('id', inserted.id)
      }
    }
    // If upload failed, message still exists without an image.
  }

  // Revalidate the chat page cache
  revalidatePath('/messages')

  // Fire push notification.
  // Wrapped in try/catch so a push failure doesn't fail the message send.
  try {
    const preview =
      body && body.length > 0
        ? body.length > 80
          ? body.slice(0, 77) + '...'
          : body
        : '📷 Sent a photo'

    await sendPushToTeam(inserted.team_id, {
      title: 'New chat message',
      body: preview,
      url: '/messages?view=chat',
      tag: `team-chat-${inserted.team_id}`, // same tag per team — newest replaces older on iOS
    })
  } catch (err) {
    console.error('Push send failed (message still sent):', err)
  }

  return {
    ok: true,
    message: {
      id: inserted.id,
      team_id: inserted.team_id,
      author_membership_id: inserted.author_membership_id,
      body: inserted.body,
      image_url,
      image_path,
      created_at: inserted.created_at,
      author_name: null, // UI fetches via getMessages
      reactions: [],
      my_reactions: [],
    },
  }
}

// ─── deleteMessage ─────────────────────────────────────────────────────────

export async function deleteMessage(messageId: string): Promise<SimpleResult> {
  const supabase = await createClient()

  // RLS rejects if user isn't the author
  const { data, error } = await supabase
    .from('team_messages')
    .delete()
    .eq('id', messageId)
    .select('id')

  if (error) return { ok: false, error: error.message }

  if (!data || data.length === 0) {
    return { ok: false, error: 'Delete affected 0 rows — likely not the author or wrong message ID' }
  }

  revalidatePath('/messages')
  return { ok: true }
}

// ─── addReaction ───────────────────────────────────────────────────────────

export async function addReaction(messageId: string, emoji: string): Promise<SimpleResult> {
  if (!emoji) return { ok: false, error: 'Missing emoji' }

  const supabase = await createClient()

  // Need to know the message's team_id to find the right membership
  const { data: message, error: msgError } = await supabase
    .from('team_messages')
    .select('team_id')
    .eq('id', messageId)
    .maybeSingle()

  if (msgError) return { ok: false, error: msgError.message }
  if (!message) return { ok: false, error: 'Message not found' }

  const ctx = await getCurrentMembershipForTeam(message.team_id)
  if (!ctx.ok) return { ok: false, error: ctx.error }

  const { error } = await supabase
    .from('team_message_reactions')
    .insert({
      message_id: messageId,
      membership_id: ctx.membership.id,
      emoji,
    })

  // Ignore duplicate-key errors (already reacted with this emoji)
  if (error && !error.message.includes('duplicate key')) {
    return { ok: false, error: error.message }
  }

  revalidatePath('/messages')
  return { ok: true }
}

// ─── removeReaction ────────────────────────────────────────────────────────

export async function removeReaction(messageId: string, emoji: string): Promise<SimpleResult> {
  const supabase = await createClient()

  const { data: message, error: msgError } = await supabase
    .from('team_messages')
    .select('team_id')
    .eq('id', messageId)
    .maybeSingle()

  if (msgError) return { ok: false, error: msgError.message }
  if (!message) return { ok: false, error: 'Message not found' }

  const ctx = await getCurrentMembershipForTeam(message.team_id)
  if (!ctx.ok) return { ok: false, error: ctx.error }

  const { error } = await supabase
    .from('team_message_reactions')
    .delete()
    .eq('message_id', messageId)
    .eq('membership_id', ctx.membership.id)
    .eq('emoji', emoji)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/messages')
  return { ok: true }
}

// ─── getMutedChats ─────────────────────────────────────────────────────────

/**
 * Get the team_ids that the current user has muted in this org.
 */
export async function getMutedChats(teamId: string): Promise<
  { ok: true; muted: boolean } | { ok: false; error: string }
> {
  if (!teamId) return { ok: false, error: 'Missing teamId' }

  const supabase = await createClient()
  const ctx = await getCurrentMembershipForTeam(teamId)
  if (!ctx.ok) return { ok: false, error: ctx.error }

  const { data, error } = await supabase
    .from('memberships')
    .select('muted_chats')
    .eq('id', ctx.membership.id)
    .single()

  if (error) return { ok: false, error: error.message }

  const mutedChats = (data?.muted_chats ?? []) as string[]
  return { ok: true, muted: mutedChats.includes(teamId) }
}

// ─── toggleMuteChat ────────────────────────────────────────────────────────

/**
 * Toggle whether the current user has chat notifications muted for this team.
 * Returns the new muted state after the toggle.
 */
export async function toggleMuteChat(teamId: string): Promise<
  { ok: true; muted: boolean } | { ok: false; error: string }
> {
  if (!teamId) return { ok: false, error: 'Missing teamId' }

  const supabase = await createClient()
  const ctx = await getCurrentMembershipForTeam(teamId)
  if (!ctx.ok) return { ok: false, error: ctx.error }

  // Read current state
  const { data: current, error: readError } = await supabase
    .from('memberships')
    .select('muted_chats')
    .eq('id', ctx.membership.id)
    .single()

  if (readError) return { ok: false, error: readError.message }

  const mutedChats = (current?.muted_chats ?? []) as string[]
  const isMuted = mutedChats.includes(teamId)

  // Toggle
  const newMutedChats = isMuted
    ? mutedChats.filter(id => id !== teamId)
    : [...mutedChats, teamId]

  const { error: updateError } = await supabase
    .from('memberships')
    .update({ muted_chats: newMutedChats })
    .eq('id', ctx.membership.id)

  if (updateError) return { ok: false, error: updateError.message }

  return { ok: true, muted: !isMuted }
}

// ─── getMessages ───────────────────────────────────────────────────────────

export async function getMessages(
  teamId: string,
  before?: string,
): Promise<{ ok: true; messages: ChatMessage[] } | { ok: false; error: string }> {
  if (!teamId) return { ok: false, error: 'Missing teamId' }

  const supabase = await createClient()
  const ctx = await getCurrentMembershipForTeam(teamId)
  if (!ctx.ok) return { ok: false, error: ctx.error }

  // Fetch the latest CHAT_PAGE_SIZE messages, oldest within the window first.
  // Chat shows newest at bottom — we paginate by going BACK in time.
  // For the initial load: take the most recent page (no `before`).
  // For "load older": pass the oldest visible created_at as `before`.

  let query = supabase
    .from('team_messages')
    .select(`
      id,
      team_id,
      author_membership_id,
      body,
      image_url,
      image_path,
      created_at,
      team_message_reactions ( emoji, membership_id )
    `)
    .eq('team_id', teamId)
    .order('created_at', { ascending: false }) // get the latest N first
    .limit(CHAT_PAGE_SIZE)

  if (before) query = query.lt('created_at', before)

  const { data, error } = await query

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: true, messages: [] }

  // Reverse so the UI gets oldest-first (chronological)
  const rows = [...data].reverse()

  // Author name lookup (same pattern as Feed)
  const authorMembershipIds = Array.from(
    new Set(rows.map((row: any) => row.author_membership_id).filter(Boolean))
  )

  const authorNameByMembershipId: Record<string, string | null> = {}

  if (authorMembershipIds.length > 0) {
    const { data: memberships } = await supabase
      .from('memberships')
      .select('id, user_id')
      .in('id', authorMembershipIds)

    const userIdByMembershipId: Record<string, string> = {}
    for (const m of memberships ?? []) {
      userIdByMembershipId[m.id] = m.user_id
    }

    const userIds = Object.values(userIdByMembershipId)

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds)

      const fullNameByUserId: Record<string, string | null> = {}
      for (const p of profiles ?? []) {
        fullNameByUserId[p.id] = p.full_name
      }

      for (const [membershipId, userId] of Object.entries(userIdByMembershipId)) {
        authorNameByMembershipId[membershipId] = fullNameByUserId[userId] ?? null
      }
    }
  }

  // Normalize into ChatMessage[]
  const messages: ChatMessage[] = rows.map((row: any) => {
    const reactionsByEmoji: Record<string, number> = {}
    const myReactionsSet = new Set<string>()
    for (const r of (row.team_message_reactions ?? []) as { emoji: string; membership_id: string }[]) {
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
      author_name: authorNameByMembershipId[row.author_membership_id] ?? null,
      reactions,
      my_reactions: Array.from(myReactionsSet),
    }
  })

  return { ok: true, messages }
}