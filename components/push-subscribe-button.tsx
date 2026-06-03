'use client'

import { useEffect, useState } from 'react'
import { useCurrentTeam } from '@/components/team-context'
import { useActiveOrg } from '@/components/org-context'

type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported' | 'subscribed' | 'needs_pwa'

// Helper: convert VAPID public key (base64url string) to Uint8Array for the browser API
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

// Detect whether the user is on iOS Safari but NOT in standalone (home screen) mode.
// iOS Safari requires the app to be installed to home screen for Web Push to work.
function isIOSWithoutPWA(): boolean {
  if (typeof window === 'undefined') return false
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  if (!isIOS) return false
  // Standalone mode = installed to home screen
  const isStandalone =
    (window.navigator as any).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  return !isStandalone
}

export function PushSubscribeButton() {
  const { currentTeam } = useCurrentTeam()
  const { membership } = useActiveOrg()
  const [state, setState] = useState<PermissionState>('default')
  const [message, setMessage] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const { org } = useActiveOrg()
  const brandColor = org?.primary_color || '#dc2626'

  // Detect support and current subscription state on mount and team change
  useEffect(() => {
    const detect = async () => {
      setMessage(null)

      // Feature detection
      if (typeof window === 'undefined') return
      if (isIOSWithoutPWA()) {
        setState('needs_pwa')
        return
      }
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setState('unsupported')
        return
      }
      

      // Permission state
      if (Notification.permission === 'denied') {
        setState('denied')
        return
      }

      // Check existing subscription
      try {
        const registration = await navigator.serviceWorker.getRegistration()
        if (registration) {
          const existing = await registration.pushManager.getSubscription()
          if (existing) {
            setState('subscribed')
            return
          }
        }
      } catch {
        // ignore — fall through to default
      }

      setState(Notification.permission === 'granted' ? 'granted' : 'default')
    }
    detect()
  }, [currentTeam.id])

  const handleSubscribe = async () => {
    setWorking(true)
    setMessage(null)
    try {
      // Register the service worker
      const registration = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      // Ask permission if not already granted
      if (Notification.permission !== 'granted') {
        const result = await Notification.requestPermission()
        if (result !== 'granted') {
          setState('denied')
          setMessage('Notification permission denied')
          setWorking(false)
          return
        }
      }

      // Subscribe
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidPublicKey) {
        setMessage('Missing VAPID public key configuration')
        setWorking(false)
        return
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      })

      // Send subscription to server
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: currentTeam.id,
          membershipId: membership?.id ?? null,
          subscription: subscription.toJSON(),
          userAgent: navigator.userAgent,
        }),
      })

      setState('subscribed')
      setMessage(`Subscribed to ${currentTeam.label} notifications`)
    } catch (err) {
      setMessage(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setWorking(false)
    }
  }

  const handleUnsubscribe = async () => {
    setWorking(true)
    setMessage(null)
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      if (!registration) {
        setState('default')
        setWorking(false)
        return
      }
      const subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        setState('default')
        setWorking(false)
        return
      }

      // Tell server to forget this subscription for this team
      await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: currentTeam.id,
          endpoint: subscription.endpoint,
        }),
      })

      // Unsubscribe from the browser (this removes ALL subscriptions on this device,
      // which is fine since we're keying by endpoint server-side)
      await subscription.unsubscribe()

      setState('default')
      setMessage('Unsubscribed')
    } catch (err) {
      setMessage(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setWorking(false)
    }
  }

  // ── Render based on state ─────────────────────────────────────────────────

  if (state === 'unsupported') {
    return null // Don't show anything on unsupported browsers
  }

  if (state === 'needs_pwa') {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 text-center">
        <p className="text-xs text-amber-300 font-semibold">📲 Add to Home Screen first</p>
        <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
          To get game day notifications on iPhone, tap the Share icon below and choose
          &quot;Add to Home Screen.&quot; Then open the app from your home screen.
        </p>
      </div>
    )
  }

  if (state === 'denied') {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center">
        <p className="text-xs text-slate-400">
          Notifications are blocked. Enable them in your browser settings to get game updates.
        </p>
      </div>
    )
  }

  if (state === 'subscribed') {
    return (
      <div className="rounded-2xl border border-green-500/30 bg-green-500/5 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-green-300 font-semibold">
            🔔 Notifications on for {currentTeam.label}
          </p>
          <button
            onClick={handleUnsubscribe}
            disabled={working}
            className="text-[11px] text-slate-400 hover:text-white transition disabled:opacity-50"
          >
            {working ? '...' : 'Turn off'}
          </button>
        </div>
        {message && <p className="mt-1 text-[11px] text-slate-500">{message}</p>}
      </div>
    )
  }

  // Default / granted but not subscribed
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-white font-semibold">🔔 Game day notifications</p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            Get a push when status changes for {currentTeam.label}
          </p>
        </div>
        <button
          onClick={handleSubscribe}
          disabled={working}
          className="flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-bold text-white transition disabled:opacity-50"
          style={{ backgroundColor: brandColor }}
          >
          {working ? '...' : 'Turn on'}
        </button>
      </div>
      {message && <p className="mt-2 text-[11px] text-slate-500">{message}</p>}
    </div>
  )
}
