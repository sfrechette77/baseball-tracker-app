import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type FieldRow = {
  id: string
  name: string | null
  latitude: number | null
  longitude: number | null
}

type ForecastItem = {
  dt: number
  pop?: number
  main?: {
    temp?: number
  }
}

type ForecastResponse = {
  list?: ForecastItem[]
}

export async function GET(req: NextRequest) {
  // Protect the endpoint — only Vercel cron or requests with the secret can trigger it
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  const weatherKey = process.env.OPENWEATHER_KEY

  if (!supabaseUrl || !serviceKey || !weatherKey) {
    return NextResponse.json(
      { error: 'Missing environment variables' },
      { status: 500 }
    )
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  const { data, error } = await supabase
    .from('fields')
    .select('id, name, latitude, longitude')

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch fields' }, { status: 500 })
  }

  const fields = (data ?? []) as FieldRow[]
  const results: string[] = []

  for (const field of fields) {
    const fieldName = field.name ?? 'Unnamed field'

    if (field.latitude == null || field.longitude == null) {
      results.push(`Skipped ${fieldName} (missing coordinates)`)
      continue
    }

    const url =
      `https://api.openweathermap.org/data/2.5/forecast` +
      `?lat=${field.latitude}&lon=${field.longitude}&appid=${weatherKey}&units=imperial`

    try {
      const res = await fetch(url)

      if (!res.ok) {
        const errorText = await res.text()
        results.push(`Error for ${fieldName}: ${errorText}`)
        continue
      }

      const forecast = (await res.json()) as ForecastResponse

      if (!forecast.list?.length) {
        results.push(`No forecast data for ${fieldName}`)
        continue
      }

      const rows = forecast.list
        .filter(item => typeof item.dt === 'number')
        .map(item => ({
          field_id: field.id,
          forecast_time: new Date(item.dt * 1000).toISOString(),
          rain_probability: typeof item.pop === 'number' ? item.pop : 0,
          temperature: typeof item.main?.temp === 'number' ? item.main.temp : null
        }))

      // Delete old forecasts for this field then insert fresh ones
      const { error: deleteError } = await supabase
        .from('weather_forecasts')
        .delete()
        .eq('field_id', field.id)

      if (deleteError) {
        results.push(`Delete error for ${fieldName}: ${deleteError.message}`)
        continue
      }

      const { error: insertError } = await supabase
        .from('weather_forecasts')
        .insert(rows)

      if (insertError) {
        results.push(`Insert error for ${fieldName}: ${insertError.message}`)
        continue
      }

      results.push(`Updated ${fieldName}: ${rows.length} forecast rows`)
    } catch (err) {
      results.push(`Failed for ${fieldName}: ${String(err)}`)
    }
  }

  return NextResponse.json({ ok: true, results })
}
