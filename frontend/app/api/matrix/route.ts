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

