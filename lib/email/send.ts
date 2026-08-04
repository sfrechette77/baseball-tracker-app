import 'server-only'

import { Resend } from 'resend'

export type EmailDeliveryMode = 'disabled' | 'test' | 'live'

type SendTransactionalEmailInput = {
  to: string
  subject: string
  html: string
  text: string
  idempotencyKey: string
}

export type SendTransactionalEmailResult =
  | {
      ok: true
      skipped: boolean
      mode: EmailDeliveryMode
      recipient: string | null
      id?: string
    }
  | {
      ok: false
      mode: EmailDeliveryMode
      recipient: string | null
      error: string
    }

export function getEmailDeliveryMode(): EmailDeliveryMode {
  const value =
    process.env.EMAIL_DELIVERY_MODE?.trim().toLowerCase()

  if (value === 'test' || value === 'live') {
    return value
  }

  return 'disabled'
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

export async function sendTransactionalEmail(
  input: SendTransactionalEmailInput
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

  const apiKey = process.env.RESEND_API_KEY?.trim()

  if (!apiKey) {
    return {
      ok: false,
      mode,
      recipient: null,
      error: 'Missing RESEND_API_KEY',
    }
  }

  const from =
    process.env.EMAIL_FROM?.trim() ||
    (mode === 'test'
      ? 'On Deck <onboarding@resend.dev>'
      : '')

  if (!from) {
    return {
      ok: false,
      mode,
      recipient: null,
      error: 'Missing EMAIL_FROM',
    }
  }

  const recipient =
    mode === 'test'
      ? process.env.EMAIL_TEST_RECIPIENT?.trim() ||
        'delivered@resend.dev'
      : input.to.trim().toLowerCase()

  if (!recipient) {
    return {
      ok: false,
      mode,
      recipient: null,
      error: 'Missing email recipient',
    }
  }

  const idempotencyKey = input.idempotencyKey.trim()

  if (!idempotencyKey) {
    return {
      ok: false,
      mode,
      recipient,
      error: 'Missing email idempotency key',
    }
  }

  if (idempotencyKey.length > 256) {
    return {
      ok: false,
      mode,
      recipient,
      error: 'Email idempotency key exceeds 256 characters',
    }
  }

  try {
    const resend = new Resend(apiKey)

    const { data, error } = await resend.emails.send(
      {
        from,
        to: [recipient],
        subject: input.subject,
        html: input.html,
        text: input.text,
      },
      {
        idempotencyKey,
      }
    )

    if (error) {
      return {
        ok: false,
        mode,
        recipient,
        error: error.message,
      }
    }

    if (!data?.id) {
      return {
        ok: false,
        mode,
        recipient,
        error: 'Resend did not return an email ID',
      }
    }

    return {
      ok: true,
      skipped: false,
      mode,
      recipient,
      id: data.id,
    }
  } catch (error) {
    return {
      ok: false,
      mode,
      recipient,
      error: getErrorMessage(error),
    }
  }
}
