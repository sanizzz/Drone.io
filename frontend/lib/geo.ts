import * as turf from "@turf/turf"

/**
 * Creates a GeoJSON polygon representing a circle with the given radius in meters
 */
export function createCirclePolygon(
  center: [number, number],
  radiusMeters: number,
  steps: number = 64
): GeoJSON.Feature<GeoJSON.Polygon> {
  const radiusKm = radiusMeters / 1000
  return turf.circle(center, radiusKm, { steps, units: "kilometers" })
}

/**
 * Generates a random point within the specified radius from the origin
 * Uses random bearing and distance for uniform distribution
 */
export function randomPointInRadius(
  origin: [number, number],
  radiusMeters: number
): [number, number] {
  // Random bearing (0-360 degrees)
  const bearing = Math.random() * 360
  
  // Random distance (0 to radius), with sqrt for uniform distribution in circle
  const distanceMeters = Math.sqrt(Math.random()) * radiusMeters
  const distanceKm = distanceMeters / 1000
  
  const point = turf.destination(origin, distanceKm, bearing, { units: "kilometers" })
  return point.geometry.coordinates as [number, number]
}

/**
 * Calculates the bearing (compass direction) from one point to another
 * Returns value in degrees (0-360, where 0/360 = North, 90 = East, 180 = South, 270 = West)
 */
export function calculateBearing(
  from: [number, number],
  to: [number, number]
): number {
  const bearing = turf.bearing(from, to)
  // Convert from Turf's -180 to 180 range to 0-360 range
  return (bearing + 360) % 360
}

/**
 * Calculates the distance between two points in meters
 */
export function calculateDistance(
  from: [number, number],
  to: [number, number]
): number {
  const distanceKm = turf.distance(from, to, { units: "kilometers" })
  return distanceKm * 1000 // Convert to meters
}

/**
 * Converts bearing to compass direction label
 */
export function bearingToDirection(bearing: number): string {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
  const index = Math.round(bearing / 45) % 8
  return directions[index]
}

/**
 * Formats distance in meters to human-readable string
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`
  }
  return `${(meters / 1000).toFixed(1)} km`
}

