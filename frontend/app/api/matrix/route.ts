import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const profile = searchParams.get("profile") || "driving"
  const origin = searchParams.get("origin")
  const target = searchParams.get("target")

  if (!origin || !target) {
    return NextResponse.json(
      { error: "Missing origin or target parameters" },
      { status: 400 }
    )
  }

  // Parse and validate coordinates
  const [originLng, originLat] = origin.split(",").map(Number)
  const [targetLng, targetLat] = target.split(",").map(Number)

  if (isNaN(originLng) || isNaN(originLat) || isNaN(targetLng) || isNaN(targetLat)) {
    return NextResponse.json(
      { error: "Invalid coordinate format" },
      { status: 400 }
    )
  }

  // Validate coordinate ranges
  if (Math.abs(originLat) > 90 || Math.abs(targetLat) > 90) {
    return NextResponse.json(
      { error: "Latitude must be between -90 and 90" },
      { status: 400 }
    )
  }

  if (Math.abs(originLng) > 180 || Math.abs(targetLng) > 180) {
    return NextResponse.json(
      { error: "Longitude must be between -180 and 180" },
      { status: 400 }
    )
  }

  // Calculate straight-line distance to check if route is reasonable
  const R = 6371 // Earth radius in km
  const dLat = (targetLat - originLat) * Math.PI / 180
  const dLon = (targetLng - originLng) * Math.PI / 180
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(originLat * Math.PI / 180) * Math.cos(targetLat * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  const distanceKm = R * c

  // Reject requests for routes over 100km (unreasonable for drone detection)
  if (distanceKm > 100) {
    console.warn(`Route too long: ${distanceKm.toFixed(2)}km from (${originLng},${originLat}) to (${targetLng},${targetLat})`)
    return NextResponse.json(
      { error: `Route distance (${distanceKm.toFixed(1)}km) exceeds maximum allowed (100km). This may indicate GPS accuracy issues.` },
      { status: 400 }
    )
  }

  const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN

  if (!mapboxToken) {
    console.error("MAPBOX_ACCESS_TOKEN environment variable is not set")
    return NextResponse.json(
      { error: "Mapbox access token not configured on server. Please set MAPBOX_ACCESS_TOKEN in .env.local" },
      { status: 500 }
    )
  }

  // Validate profile
  const validProfiles = ["driving", "walking", "cycling"]
  if (!validProfiles.includes(profile)) {
    return NextResponse.json(
      { error: `Invalid profile. Must be one of: ${validProfiles.join(", ")}` },
      { status: 400 }
    )
  }

  try {
    // Format coordinates for Matrix API: originLng,originLat;targetLng,targetLat
    const coordinates = `${origin};${target}`

    // Mapbox Matrix API endpoint
    const url = `https://api.mapbox.com/directions-matrix/v1/mapbox/${profile}/${coordinates}?annotations=distance,duration&access_token=${mapboxToken}`

    const response = await fetch(url)

    if (!response.ok) {
      const errorText = await response.text()
      console.error("Mapbox Matrix API error:", response.status, errorText)
      console.error("Request URL:", url.replace(mapboxToken, "***TOKEN***"))
      return NextResponse.json(
        { error: "Failed to fetch matrix data from Mapbox", details: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()

    // Extract distance and duration from Matrix API response
    // Response format: { distances: [[0, distanceMeters]], durations: [[0, durationSeconds]] }
    const distance = data.distances?.[0]?.[1] ?? null
    const duration = data.durations?.[0]?.[1] ?? null

    if (distance === null || duration === null) {
      return NextResponse.json(
        { error: "Invalid response format from Matrix API" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      distance, // meters
      duration, // seconds
    })
  } catch (error) {
    console.error("Matrix API error:", error)
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

