import dotenv from 'dotenv'
dotenv.config()

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY
const weatherKey = process.env.OPENWEATHER_KEY

if (!supabaseUrl) {
  throw new Error('supabaseUrl is required.')
}

if (!serviceKey) {
  throw new Error('supabase key is required.')
}

if (!weatherKey) {
  throw new Error('OpenWeather API key is required.')
}

const supabase = createClient(supabaseUrl, serviceKey)

async function updateWeather() {

  console.log("Starting weather update...")

  const { data: fields, error } = await supabase
    .from('fields')
    .select('id, name, latitude, longitude')

  if (error) {
    console.error("Error fetching fields:", error)
    return
  }

  console.log("Fields found:", fields?.length)

  for (const field of fields || []) {

    if (!field.latitude || !field.longitude) {
      console.log(`Skipping ${field.name} (missing coordinates)`)
      continue
    }

    console.log(`Fetching weather for ${field.name}`)

    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${field.latitude}&lon=${field.longitude}&appid=${weatherKey}&units=imperial`

    const res = await fetch(url)

    const forecast = await res.json()

    if (!forecast.list) {
      console.error("Weather API error response:", forecast)
      continue
    }

    console.log(`Forecast entries received: ${forecast.list.length}`)

    for (const item of forecast.list.slice(0, 8)) {

      const forecastTime = new Date(item.dt * 1000)
      const rainProbability = item.pop
      const temperature = item.main.temp

      const { error: insertError } = await supabase
        .from('weather_forecasts')
        .insert({
          field_id: field.id,
          forecast_time: forecastTime,
          rain_probability: rainProbability,
          temperature: temperature
        })

      if (insertError) {
        console.error("Insert error:", insertError)
      }

    }

    console.log(`Weather stored for ${field.name}`)

  }

  console.log("Weather update complete.")
}

updateWeather()