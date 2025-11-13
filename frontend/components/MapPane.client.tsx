"use client"

import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { createCirclePolygon } from "@/lib/geo"
import { useRangeLine } from "./map/useRangeLine.tsx"

export interface MapPaneRef {
  addDetection: (params: {
    lng: number
    lat: number
    radiusMeters?: number
    label?: string
    confidence?: number
  }) => string
  removeDetection: (id: string) => void
  flyToUser: () => void
  getCenter: () => [number, number]
  getUserLocation: () => { lng: number; lat: number; accuracy: number } | null
  drawRange: (origin: [number, number], target: [number, number], profile: string, detectionId: string) => void
  fitRange: (detectionId: string) => void
  disposeRange: (detectionId: string) => void
}

export interface UserLocation {
  lng: number
  lat: number
  accuracy: number
}

interface DetectionMarker {
  id: string
  marker: mapboxgl.Marker
  sourceId: string
  layerIds: string[]
}

export const MapPane = forwardRef<MapPaneRef, {}>((props, ref) => {
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const geolocateControlRef = useRef<mapboxgl.GeolocateControl | null>(null)
  const detectionsRef = useRef<Map<string, DetectionMarker>>(new Map())
  const [locationStatus, setLocationStatus] = useState<"loading" | "granted" | "denied" | "unavailable">("loading")
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null)
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

  // Initialize range line hook (map will be set after initialization)
  const { drawRange: drawRangeLine, fitRange, disposeRange } = useRangeLine({
    map: mapRef.current,
    mapRef: mapRef,
  })

  // Expose imperative API via ref
  useImperativeHandle(ref, () => ({
    addDetection: ({ lng, lat, radiusMeters = 100, label = "Detection", confidence }) => {
      if (!mapRef.current) return ""

      const detectionId = `detection-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

      // Create marker element
      const el = document.createElement("div")
      el.style.width = "20px"
      el.style.height = "20px"
      el.style.borderRadius = "50%"
      el.style.backgroundColor = "var(--primary)"
      el.style.border = "2px solid #000"
      el.style.cursor = "pointer"
      el.style.boxShadow = "0 0 4px 1px var(--primary)"
      el.title = confidence ? `${label} (${Math.round(confidence * 100)}%)` : label

      // Add marker to map
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(mapRef.current)

      // Create radius ring
      const sourceId = `${detectionId}-source`
      const fillLayerId = `${detectionId}-fill`
      const outlineLayerId = `${detectionId}-outline`

      const circleGeoJSON = createCirclePolygon([lng, lat], radiusMeters)

      mapRef.current.addSource(sourceId, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [circleGeoJSON],
        },
      })

      mapRef.current.addLayer({
        id: fillLayerId,
        type: "fill",
        source: sourceId,
        paint: {
          "fill-color": "#60a5fa",
          "fill-opacity": 0.2,
        },
      })

      mapRef.current.addLayer({
        id: outlineLayerId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": "#60a5fa",
          "line-width": 2,
          "line-opacity": 0.6,
        },
      })

      // Store detection data
      detectionsRef.current.set(detectionId, {
        id: detectionId,
        marker,
        sourceId,
        layerIds: [fillLayerId, outlineLayerId],
      })

      return detectionId
    },

    removeDetection: (id: string) => {
      const detection = detectionsRef.current.get(id)
      if (!detection || !mapRef.current) return

      // Remove range line if it exists
      disposeRange(id)

      // Remove marker
      detection.marker.remove()

      // Remove layers
      detection.layerIds.forEach((layerId) => {
        if (mapRef.current?.getLayer(layerId)) {
          mapRef.current.removeLayer(layerId)
        }
      })

      // Remove source
      if (mapRef.current.getSource(detection.sourceId)) {
        mapRef.current.removeSource(detection.sourceId)
      }

      detectionsRef.current.delete(id)
    },

    flyToUser: () => {
      if (!mapRef.current || !userLocation) return

      mapRef.current.flyTo({
        center: [userLocation.lng, userLocation.lat],
        zoom: 16,
        pitch: 65,
        bearing: -20,
        duration: 2000,
      })
    },

    getCenter: () => {
      if (!mapRef.current) return [0, 0]
      const center = mapRef.current.getCenter()
      return [center.lng, center.lat]
    },

    getUserLocation: () => {
      return userLocation
    },

    drawRange: (origin: [number, number], target: [number, number], profile: string, detectionId: string) => {
      drawRangeLine(origin, target, profile, detectionId)
    },

    fitRange: (detectionId: string) => {
      fitRange(detectionId)
    },

    disposeRange: (detectionId: string) => {
      disposeRange(detectionId)
    },
  }))

  useEffect(() => {
    if (!mapboxToken) {
      console.error("Mapbox token is not defined. Please set NEXT_PUBLIC_MAPBOX_TOKEN in your .env.local file")
      return
    }

    if (!mapContainerRef.current) return

    mapboxgl.accessToken = mapboxToken

    // Initialize map with Mapbox Standard style in 3D
    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/standard",
      center: [-80.5425, 43.4695], // Fallback center
      zoom: 14,
      pitch: 65,
      bearing: -20,
      projection: "globe" as any,
      antialias: true,
    })

    // Add navigation controls (zoom, compass, pitch)
    const navigationControl = new mapboxgl.NavigationControl({
      visualizePitch: true,
    })
    mapRef.current.addControl(navigationControl, "top-right")

    // Add geolocate control
    geolocateControlRef.current = new mapboxgl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true,
      },
      trackUserLocation: true,
      showUserHeading: true,
      showUserLocation: true,
    })
    mapRef.current.addControl(geolocateControlRef.current, "top-right")

    // Listen to geolocation events
    geolocateControlRef.current.on("geolocate", (e: any) => {
      setLocationStatus("granted")
      setUserLocation({
        lng: e.coords.longitude,
        lat: e.coords.latitude,
        accuracy: e.coords.accuracy || 50, // Default to 50m if not available
      })
      console.log("User location:", e.coords)
    })

    geolocateControlRef.current.on("error", (e: any) => {
      setLocationStatus("denied")
      console.warn("Geolocation error:", e)
    })

    mapRef.current.on("load", () => {
      if (!mapRef.current) return

      // Configure Mapbox Standard style for dark/night mode
      mapRef.current.setConfigProperty("basemap", "lightPreset", "night")

      // Add atmospheric fog for depth
      mapRef.current.setFog({
        color: "rgb(20, 20, 30)",
        "high-color": "rgb(10, 20, 40)",
        "horizon-blend": 0.02,
        "space-color": "rgb(5, 5, 15)",
        "star-intensity": 0.8,
      })

      // Auto-trigger geolocation on load
      setTimeout(() => {
        if (geolocateControlRef.current) {
          geolocateControlRef.current.trigger()
        }
      }, 500)
    })

    // Add resize observer to handle container size changes
    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.resize()
      }
    })

    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current)
    }

    // Cleanup
    return () => {
      resizeObserver.disconnect()
      // Remove all detections
      detectionsRef.current.forEach((detection) => {
        detection.marker.remove()
      })
      detectionsRef.current.clear()

      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [mapboxToken])

  return (
    <div className="h-full w-full relative bg-background overflow-hidden">
      <div
        id="map-container"
        ref={mapContainerRef}
        className="absolute inset-0 w-full h-full"
      />
      
      {/* Location status indicator */}
      <div className="absolute top-4 left-4 bg-background/90 backdrop-blur-sm border border-border rounded-lg px-3 py-2">
        <div className="flex items-center gap-2">
          {locationStatus === "loading" && (
            <>
              <div className="h-2 w-2 rounded-full bg-primary"></div>
              <span className="text-xs text-foreground">Detecting location...</span>
            </>
          )}
          {locationStatus === "granted" && (
            <>
              <div className="h-2 w-2 rounded-full bg-green-500 glow"></div>
              <span className="text-xs text-green-500">Location active</span>
            </>
          )}
          {locationStatus === "denied" && (
            <>
              <div className="h-2 w-2 rounded-full bg-red-500"></div>
              <span className="text-xs text-red-500">Location denied</span>
            </>
          )}
        </div>
      </div>

      {/* Map controls legend */}
      <div className="absolute bottom-8 left-4 bg-background/90 backdrop-blur-sm border border-border rounded-lg p-3 space-y-2">
        <div className="text-xs text-muted-foreground font-mono uppercase tracking-wide">
          Map Controls
        </div>
        <div className="text-xs text-foreground space-y-1">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary glow"></div>
            <span className="text-primary">Your Location</span>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 text-[10px] bg-muted border border-border rounded">
              Scroll
            </kbd>
            <span>Zoom</span>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 text-[10px] bg-muted border border-border rounded">
              Drag
            </kbd>
            <span>Pan</span>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 text-[10px] bg-muted border border-border rounded">
              Ctrl+Drag
            </kbd>
            <span>Rotate/Pitch</span>
          </div>
        </div>
      </div>
    </div>
  )
})

MapPane.displayName = "MapPane"
