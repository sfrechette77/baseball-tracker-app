import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY
const weatherKey = process.env.OPENWEATHER_KEY

if (!supabaseUrl) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL is required.')
}

if (!serviceKey) {
  throw new Error('SUPABASE_SERVICE_KEY is required.')
}

if (!weatherKey) {
  throw new Error('OPENWEATHER_KEY is required.')
}

const supabase = createClient(supabaseUrl, serviceKey)

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

async function updateWeather() {
  console.log('Starting weather update...')
  console.log('Supabase URL:', supabaseUrl)

  const { data, error } = await supabase
    .from('fields')
    .select('id, name, latitude, longitude')

  if (error) {
    console.error('Error fetching fields:', error)
    process.exit(1)
  }

  const fields = (data ?? []) as FieldRow[]
  console.log(`Fields found: ${fields.length}`)

  for (const field of fields) {
    const fieldName = field.name ?? 'Unnamed field'

    if (field.latitude == null || field.longitude == null) {
      console.log(`Skipping ${fieldName} (missing coordinates)`)
      continue
    }

    console.log(`Fetching weather for ${fieldName}...`)

    const url =
      `https://api.openweathermap.org/data/2.5/forecast` +
      `?lat=${field.latitude}&lon=${field.longitude}&appid=${weatherKey}&units=imperial`

    try {
      const res = await fetch(url)

      if (!res.ok) {
        const errorText = await res.text()
        console.error(`Weather API error for ${fieldName}:`, errorText)
        continue
      }

      const forecast = (await res.json()) as ForecastResponse

      if (!forecast.list || !Array.isArray(forecast.list) || forecast.list.length === 0) {
        console.error(`No forecast data returned for ${fieldName}`)
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

      if (rows.length === 0) {
        console.log(`No usable forecast rows for ${fieldName}`)
        continue
      }

      console.log(
        `${fieldName}: ${rows.length} rows from ${rows[0].forecast_time} to ${rows[rows.length - 1].forecast_time}`
      )

      const { error: deleteError } = await supabase
        .from('weather_forecasts')
        .delete()
        .eq('field_id', field.id)

      if (deleteError) {
        console.error(`Delete error for ${fieldName}:`, deleteError)
        continue
      }

      const { error: insertError } = await supabase
        .from('weather_forecasts')
        .insert(rows)

      if (insertError) {
        console.error(`Insert error for ${fieldName}:`, insertError)
        continue
      }

      console.log(`Stored fresh weather for ${fieldName}`)
    } catch (err) {
      console.error(`Weather update failed for ${fieldName}:`, err)
    }
  }

  console.log('Weather update complete.')
}

updateWeather().catch(error => {
  console.error('Weather update failed:', error)
  process.exit(1)
})