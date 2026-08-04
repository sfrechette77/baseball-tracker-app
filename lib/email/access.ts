import 'server-only'

import { createHash } from 'node:crypto'

import {
  getEmailDeliveryMode,
  sendTransactionalEmail,
  type EmailDeliveryMode,
  type SendTransactionalEmailResult,
} from '@/lib/email/send'

type OrganizationEmailBrand = {
  name: string
  slug: string
  primaryColor: string | null
  logoUrl: string | null
}

type ParentAccessApprovedEmailInput = {
  membershipId: string
  to: string
  recipientName: string | null
  organization: OrganizationEmailBrand
  teamNames: string[]
}

type TeamStaffAssignedEmailInput = {
  teamAdminMembershipId: string
  newlyAssignedTeamIds: string[]
  to: string
  recipientName: string | null
  organization: OrganizationEmailBrand
  teamNames: string[]
  staffTitle: string | null
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function getAppBaseUrl(): string | null {
  const configured = process.env.APP_BASE_URL?.trim()

  if (!configured) {
    return null
  }

  try {
    const url = new URL(configured)

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null
    }

    return url.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

function getBrandColor(value: string | null): string {
  const normalized = value?.trim() ?? ''

  return /^#[0-9a-fA-F]{6}$/.test(normalized)
    ? normalized
    : '#2563eb'
}

function getLogoUrl(value: string | null): string | null {
  const normalized = value?.trim()

  if (!normalized) {
    return null
  }

  try {
    const url = new URL(normalized)

    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : null
  } catch {
    return null
  }
}

function formatList(items: string[]): string {
  if (items.length === 0) {
    return 'No teams listed'
  }

  if (items.length === 1) {
    return items[0]
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`
  }

  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`
}

function createIdempotencyKey(
  prefix: string,
  stableParts: string[]
): string {
  const digest = createHash('sha256')
    .update(stableParts.join('|'))
    .digest('hex')
    .slice(0, 32)

  return `${prefix}:${digest}`
}

function buildEmailShell(input: {
  organization: OrganizationEmailBrand
  previewText: string
  heading: string
  bodyHtml: string
  buttonLabel: string
  buttonUrl: string
}): string {
  const organizationName = escapeHtml(input.organization.name)
  const brandColor = getBrandColor(input.organization.primaryColor)
  const logoUrl = getLogoUrl(input.organization.logoUrl)

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title>${escapeHtml(input.heading)}</title>
  </head>
  <body style="margin:0;background:#f4f4f5;color:#18181b;font-family:Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
      ${escapeHtml(input.previewText)}
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7;">
            <tr>
              <td style="padding:24px 32px;background:${brandColor};color:#ffffff;">
                ${
                  logoUrl
                    ? `<img src="${escapeHtml(logoUrl)}" alt="${organizationName}" style="display:block;max-height:56px;max-width:180px;margin-bottom:16px;">`
                    : ''
                }
                <div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.85;">
                  On Deck
                </div>
                <div style="margin-top:6px;font-size:22px;font-weight:700;">
                  ${organizationName}
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;color:#18181b;">
                  ${escapeHtml(input.heading)}
                </h1>

                <div style="font-size:16px;line-height:1.6;color:#3f3f46;">
                  ${input.bodyHtml}
                </div>

                <div style="margin-top:28px;">
                  <a href="${escapeHtml(input.buttonUrl)}" style="display:inline-block;border-radius:10px;background:${brandColor};padding:13px 20px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">
                    ${escapeHtml(input.buttonLabel)}
                  </a>
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:20px 32px;background:#fafafa;border-top:1px solid #e4e4e7;font-size:12px;line-height:1.5;color:#71717a;">
                This message was sent because your access to ${organizationName} changed in On Deck.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function missingAppUrlResult(
  mode: EmailDeliveryMode
): SendTransactionalEmailResult {
  return {
    ok: false,
    mode,
    recipient: null,
    error: 'Missing or invalid APP_BASE_URL',
  }
}

export async function sendParentAccessApprovedEmail(
  input: ParentAccessApprovedEmailInput
): Promise<SendTransactionalEmailResult> {
  const mode = getEmailDeliveryMode()

  if (mode === 'disabled') {
    return {
      ok: true,
      skipped: true,
      mode,
      recipient: null,
    }
  }

  const appBaseUrl = getAppBaseUrl()

  if (!appBaseUrl) {
    return missingAppUrlResult(mode)
  }

  const signInUrl = `${appBaseUrl}/login`
  const recipientName = input.recipientName?.trim() || 'there'
  const teamList = formatList(input.teamNames)

  return sendTransactionalEmail({
    to: input.to,
    subject: `Your ${input.organization.name} access is approved`,
    idempotencyKey: createIdempotencyKey(
      'parent-access-approved',
      [input.membershipId]
    ),
    text: [
      `Hi ${recipientName},`,
      '',
      `Your access to ${input.organization.name} has been approved.`,
      `Teams: ${teamList}`,
      '',
      `Sign in: ${signInUrl}`,
    ].join('\n'),
    html: buildEmailShell({
      organization: input.organization,
      previewText: `Your access to ${input.organization.name} has been approved.`,
      heading: 'Your access is approved',
      bodyHtml: `
        <p style="margin:0 0 16px;">Hi ${escapeHtml(recipientName)},</p>
        <p style="margin:0 0 16px;">
          Your access to <strong>${escapeHtml(input.organization.name)}</strong> has been approved.
        </p>
        <p style="margin:0;">
          <strong>Teams:</strong> ${escapeHtml(teamList)}
        </p>
      `,
      buttonLabel: 'Sign in to On Deck',
      buttonUrl: signInUrl,
    }),
  })
}

export async function sendTeamStaffAssignedEmail(
  input: TeamStaffAssignedEmailInput
): Promise<SendTransactionalEmailResult> {
  const mode = getEmailDeliveryMode()

  if (mode === 'disabled') {
    return {
      ok: true,
      skipped: true,
      mode,
      recipient: null,
    }
  }

  const appBaseUrl = getAppBaseUrl()

  if (!appBaseUrl) {
    return missingAppUrlResult(mode)
  }

  const signInUrl = `${appBaseUrl}/login`
  const recipientName = input.recipientName?.trim() || 'there'
  const teamList = formatList(input.teamNames)
  const staffTitle =
    input.staffTitle?.trim() || 'Coach / Team Staff'

  const sortedTeamIds = [...input.newlyAssignedTeamIds].sort()

  return sendTransactionalEmail({
    to: input.to,
    subject: `You were added to ${input.organization.name} team staff`,
    idempotencyKey: createIdempotencyKey(
      'team-staff-assigned',
      [input.teamAdminMembershipId, ...sortedTeamIds]
    ),
    text: [
      `Hi ${recipientName},`,
      '',
      `You were added to the ${input.organization.name} team staff.`,
      `Role: ${staffTitle}`,
      `Teams: ${teamList}`,
      '',
      `Sign in: ${signInUrl}`,
    ].join('\n'),
    html: buildEmailShell({
      organization: input.organization,
      previewText: `You were added to the ${input.organization.name} team staff.`,
      heading: 'You were added to team staff',
      bodyHtml: `
        <p style="margin:0 0 16px;">Hi ${escapeHtml(recipientName)},</p>
        <p style="margin:0 0 16px;">
          You were added to the <strong>${escapeHtml(input.organization.name)}</strong> team staff.
        </p>
        <p style="margin:0 0 8px;">
          <strong>Role:</strong> ${escapeHtml(staffTitle)}
        </p>
        <p style="margin:0;">
          <strong>Teams:</strong> ${escapeHtml(teamList)}
        </p>
      `,
      buttonLabel: 'Sign in to On Deck',
      buttonUrl: signInUrl,
    }),
  })
}
