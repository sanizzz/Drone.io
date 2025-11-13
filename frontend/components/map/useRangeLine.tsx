"use client"

import React, { useRef, useCallback } from "react"
import mapboxgl from "mapbox-gl"
import * as turf from "@turf/turf"
import { createRoot } from "react-dom/client"
import { RangeBadge } from "@/components/RangeBadge"

interface RangeData {
  detectionId: string
  sourceId: string
  layerIds: string[]
  midpointMarker: mapboxgl.Marker | null
  straightDistanceKm: number
  matrixDistanceMeters: number | null
  matrixDurationSeconds: number | null
  profile: string
  coordinates: [number, number][]
}

interface UseRangeLineOptions {
  map: mapboxgl.Map | null
  mapRef?: React.RefObject<mapboxgl.Map | null>
}

export function useRangeLine({ map, mapRef }: UseRangeLineOptions) {
  const rangesRef = useRef<Map<string, RangeData>>(new Map())

  const drawRange = useCallback(
    async (
      origin: [number, number],
      target: [number, number],
      profile: string,
      detectionId: string
    ) => {
      const currentMap = mapRef?.current || map
      if (!currentMap) {
        console.warn("Map not available for drawing range")
        return
      }

      // Calculate straight-line distance using Turf
      const straightDistanceKm = turf.distance(origin, target, { units: "kilometers" })
      const straightDistanceMeters = straightDistanceKm * 1000

      // Create LineString GeoJSON
      const lineString: GeoJSON.LineString = {
        type: "LineString",
        coordinates: [origin, target],
      }

      const sourceId = `range-src-${detectionId}`
      const glowLayerId = `range-glow-${detectionId}`
      const coreLayerId = `range-core-${detectionId}`
      const dotsLayerId = `range-dots-${detectionId}`

      // Remove existing source/layers if they exist
      if (currentMap.getSource(sourceId)) {
        rangesRef.current.get(detectionId)?.layerIds.forEach((layerId) => {
          if (currentMap.getLayer(layerId)) {
            currentMap.removeLayer(layerId)
          }
        })
        currentMap.removeSource(sourceId)
      }

      // Add GeoJSON source
      currentMap.addSource(sourceId, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: lineString,
              properties: {},
            },
          ],
        },
      })

      // Add glow layer (gold outer)
      currentMap.addLayer({
        id: glowLayerId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": "#FFC700", // Gold color matching primary
          "line-width": 10,
          "line-blur": 3,
          "line-opacity": 0.6,
        },
      })

      // Add core layer (white inner)
      currentMap.addLayer({
        id: coreLayerId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": "#ffffff",
          "line-width": 3,
          "line-opacity": 0.9,
        },
      })

      // Create dashed line for first 20% of path (dotted tail near origin)
      const totalDistance = straightDistanceMeters
      const dashDistance = totalDistance * 0.2
      const dashDistanceKm = dashDistance / 1000

      // Get point at 20% distance from origin
      const dashPoint = turf.along(
        turf.lineString(lineString.coordinates),
        dashDistanceKm,
        { units: "kilometers" }
      )

      const dashLineString: GeoJSON.LineString = {
        type: "LineString",
        coordinates: [origin, dashPoint.geometry.coordinates as [number, number]],
      }

      // Add dashed layer source
      const dashSourceId = `${sourceId}-dash`
      if (currentMap.getSource(dashSourceId)) {
        currentMap.removeSource(dashSourceId)
      }

      currentMap.addSource(dashSourceId, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: dashLineString,
              properties: {},
            },
          ],
        },
      })

      // Add dots layer
      currentMap.addLayer({
        id: dotsLayerId,
        type: "line",
        source: dashSourceId,
        paint: {
          "line-color": "#FFC700",
          "line-width": 2,
          "line-dasharray": [0.5, 1],
          "line-opacity": 0.5,
        },
      })

      // Fetch Matrix API data (optional - gracefully degrade if unavailable)
      let matrixDistanceMeters: number | null = null
      let matrixDurationSeconds: number | null = null

      try {
        const originStr = `${origin[0]},${origin[1]}`
        const targetStr = `${target[0]},${target[1]}`
        const response = await fetch(
          `/api/matrix?profile=${profile}&origin=${originStr}&target=${targetStr}`
        )

        if (response.ok) {
          const data = await response.json()
          matrixDistanceMeters = data.distance
          matrixDurationSeconds = data.duration
          console.log(`Matrix API: ${(data.distance / 1000).toFixed(2)}km in ${Math.round(data.duration / 60)} min`)
        } else {
          const errorData = await response.json().catch(() => ({ error: "Unknown error" }))
          console.warn("Matrix API unavailable:", errorData.error)
        }
      } catch (error) {
        console.warn("Matrix API unavailable (using straight-line distance only):", error instanceof Error ? error.message : String(error))
      }

      // Calculate midpoint
      const midpoint = turf.along(
        turf.lineString(lineString.coordinates),
        straightDistanceKm / 2,
        { units: "kilometers" }
      )
      const midpointCoords = midpoint.geometry.coordinates as [number, number]

      // Create midpoint marker with RangeBadge
      const markerElement = document.createElement("div")
      markerElement.className = "range-marker-container"

      // Use Matrix API time if available, otherwise estimate based on straight-line distance
      let matrixMin = 0
      if (matrixDurationSeconds) {
        matrixMin = Math.round(matrixDurationSeconds / 60)
      } else if (straightDistanceKm > 0) {
        // Rough estimate: 40 km/h average for driving
        const estimatedMinutes = (straightDistanceKm / 40) * 60
        matrixMin = Math.round(estimatedMinutes)
      }

      const root = createRoot(markerElement)
      root.render(
        <RangeBadge
          straightKm={straightDistanceKm}
          matrixMin={matrixMin}
          profile={profile}
        />
      )

      const midpointMarker = new mapboxgl.Marker({
        element: markerElement,
        anchor: "center",
      })
        .setLngLat(midpointCoords)
        .addTo(currentMap)

      // Store range data
      rangesRef.current.set(detectionId, {
        detectionId,
        sourceId,
        layerIds: [glowLayerId, coreLayerId, dotsLayerId],
        midpointMarker,
        straightDistanceKm,
        matrixDistanceMeters,
        matrixDurationSeconds,
        profile,
        coordinates: lineString.coordinates as [number, number][],
      })
    },
    [map, mapRef]
  )

  const fitRange = useCallback(
    (detectionId: string) => {
      const currentMap = mapRef?.current || map
      const rangeData = rangesRef.current.get(detectionId)
      if (!rangeData || !currentMap || !rangeData.coordinates.length) return

      // Calculate bounds from stored coordinates
      const coordinates = rangeData.coordinates
      const bounds = coordinates.reduce(
        (bounds, coord) => {
          return bounds.extend(coord as any)
        },
        new mapboxgl.LngLatBounds(coordinates[0] as any, coordinates[0] as any)
      )

      currentMap.fitBounds(bounds, {
        padding: { top: 50, bottom: 50, left: 50, right: 50 },
        duration: 1000,
      })
    },
    [map, mapRef]
  )

  const disposeRange = useCallback(
    (detectionId: string) => {
      const currentMap = mapRef?.current || map
      const rangeData = rangesRef.current.get(detectionId)
      if (!rangeData || !currentMap) return

      // Remove midpoint marker
      if (rangeData.midpointMarker) {
        rangeData.midpointMarker.remove()
      }

      // Remove layers
      rangeData.layerIds.forEach((layerId) => {
        if (currentMap.getLayer(layerId)) {
          currentMap.removeLayer(layerId)
        }
      })

      // Remove dash source if exists
      const dashSourceId = `${rangeData.sourceId}-dash`
      if (currentMap.getSource(dashSourceId)) {
        currentMap.removeSource(dashSourceId)
      }

      // Remove main source
      if (currentMap.getSource(rangeData.sourceId)) {
        currentMap.removeSource(rangeData.sourceId)
      }

      rangesRef.current.delete(detectionId)
    },
    [map, mapRef]
  )

  const getRangeData = useCallback((detectionId: string) => {
    return rangesRef.current.get(detectionId) || null
  }, [])

  const getAllRanges = useCallback(() => {
    return Array.from(rangesRef.current.values())
  }, [])

  return {
    drawRange,
    fitRange,
    disposeRange,
    getRangeData,
    getAllRanges,
  }
}
