import { createClient } from "@supabase/supabase-js"
import dotenv from "dotenv"

dotenv.config()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY
const googleMapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY

if (!supabaseUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is required")
}

if (!supabaseKey) {
  throw new Error("SUPABASE_SERVICE_KEY is required")
}

if (!googleMapsKey) {
  throw new Error("NEXT_PUBLIC_GOOGLE_MAPS_KEY is required")
}

const HOME_LAT = Number(process.env.HOME_LAT)
const HOME_LNG = Number(process.env.HOME_LNG)

if (Number.isNaN(HOME_LAT) || Number.isNaN(HOME_LNG)) {
  throw new Error("HOME_LAT and HOME_LNG must be set in .env")
}

const supabase = createClient(supabaseUrl, supabaseKey)

type FieldRecord = {
  name: string | null
  latitude: number | null
  longitude: number | null
}

type EventRecord = {
  id: string | number
  field_id: string | number | null
  fields: FieldRecord | FieldRecord[] | null
}

function normalizeField(fields: EventRecord["fields"]): FieldRecord | null {
  if (!fields) return null
  if (Array.isArray(fields)) return fields[0] ?? null
  return fields
}

function parseGoogleDurationToMinutes(duration: string): number {
  const match = duration.match(/^(\d+)(?:\.\d+)?s$/)

  if (!match) {
    throw new Error(`Unexpected route duration format: ${duration}`)
  }

  const seconds = Number(match[1])
  return Math.round(seconds / 60)
}

async function getDriveStats(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number
) {
  const response = await fetch(
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": googleMapsKey,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters"
      },
      body: JSON.stringify({
        origin: {
          location: {
            latLng: {
              latitude: originLat,
              longitude: originLng
            }
          }
        },
        destination: {
          location: {
            latLng: {
              latitude: destLat,
              longitude: destLng
            }
          }
        },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE"
      })
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Google Routes API error ${response.status}: ${errorText}`)
  }

  const data = await response.json()
  const route = data?.routes?.[0]

  if (!route) {
    throw new Error("No route returned from Google Routes API")
  }

  const travelMinutes = parseGoogleDurationToMinutes(route.duration)
  const travelMiles = Math.round((route.distanceMeters || 0) / 1609.344)

  return { travelMinutes, travelMiles }
}

async function updateTravelTimes() {
  console.log("Starting travel time update...")

  const { data: events, error } = await supabase
    .from("events")
    .select(
      `
      id,
      field_id,
      fields (
        name,
        latitude,
        longitude
      )
    `
    )

  if (error) {
    console.error("Error loading events:", error.message)
    return
  }

  if (!events || events.length === 0) {
    console.log("No events found.")
    return
  }

  for (const event of events as EventRecord[]) {
    const field = normalizeField(event.fields)

    if (!field) {
      console.log(`Skipping event ${event.id} — no related field found`)
      continue
    }

    if (field.latitude == null || field.longitude == null) {
      console.log(`Skipping event ${event.id} — field is missing coordinates`)
      continue
    }

    try {
      const { travelMinutes, travelMiles } = await getDriveStats(
        HOME_LAT,
        HOME_LNG,
        field.latitude,
        field.longitude
      )

      console.log(
        `Event ${event.id} -> ${field.name ?? "Unknown field"}: ${travelMinutes} min (${travelMiles} mi)`
      )

      const { error: updateError } = await supabase
        .from("events")
        .update({
          travel_minutes: travelMinutes,
          travel_miles: travelMiles
        })
        .eq("id", event.id)

      if (updateError) {
        console.error(
          `Failed to update event ${event.id}:`,
          updateError.message
        )
      }
    } catch (err) {
      console.error(`Error updating event ${event.id}:`, err)
    }
  }

  console.log("Travel time update complete.")
}

updateTravelTimes().catch((err) => {
  console.error("Fatal error running travel time update:", err)
  process.exit(1)
})