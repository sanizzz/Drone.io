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
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const detectionsRef = useRef<Map<string, DetectionMarker>>(new Map())
  const [locationStatus, setLocationStatus] = useState<"loading" | "granted" | "denied" | "unavailable">("loading")
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null)
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  
  // Detect performance mode for smoother rendering
  const [isPerformanceMode, setIsPerformanceMode] = useState(false)
  
  useEffect(() => {
    if (typeof window === "undefined") return
    
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const isSmallScreen = window.innerWidth < 768
    const isLowPerformance = prefersReducedMotion || isSmallScreen
    
    setIsPerformanceMode(isLowPerformance)
  }, [])

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

      // Use easeTo for smoother transitions
      mapRef.current.easeTo({
        center: [userLocation.lng, userLocation.lat],
        zoom: 16,
        pitch: isPerformanceMode ? 0 : 65,
        bearing: isPerformanceMode ? 0 : -20,
        duration: 1500,
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

    // Initialize map with performance-aware options
    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/standard",
      center: [-80.5425, 43.4695], // Fallback center
      zoom: 14,
      pitch: isPerformanceMode ? 0 : 65,
      bearing: isPerformanceMode ? 0 : -20,
      projection: isPerformanceMode ? "mercator" : ("globe" as any),
      antialias: !isPerformanceMode,
      cooperativeGestures: isPerformanceMode,
    })

    // Add navigation controls (zoom, compass, pitch)
    const navigationControl = new mapboxgl.NavigationControl({
      visualizePitch: true,
    })
    mapRef.current.addControl(navigationControl, "top-right")

    // Helper function to create radar marker element
    const createRadarMarkerElement = (accuracyMeters: number) => {
      const container = document.createElement("div")
      container.className = "user-radar-marker"
      
      // Make radius much bigger - 400px for better visibility
      const size = 800 // 400px radius = 800px diameter
      
      container.style.width = `${size}px`
      container.style.height = `${size}px`
      container.style.position = "relative"
      
      // Create core blue dot
      const core = document.createElement("div")
      core.className = "user-radar-core"
      container.appendChild(core)
      
      // Create four pulsing radar waves for better visibility
      for (let i = 0; i < 4; i++) {
        const wave = document.createElement("div")
        wave.className = "user-radar-wave"
        wave.style.width = `${size}px`
        wave.style.height = `${size}px`
        wave.style.position = "absolute"
        wave.style.top = "0"
        wave.style.left = "0"
        container.appendChild(wave)
      }
      
      // Add distance metric rings (1km, 2km, 3km)
      const distances = [
        { km: 1, percent: 33 },
        { km: 2, percent: 66 },
        { km: 3, percent: 100 }
      ]
      
      distances.forEach(({ km, percent }) => {
        const ringSize = (size * percent) / 100
        
        // Create ring
        const ring = document.createElement("div")
        ring.className = "radar-distance-ring"
        ring.style.width = `${ringSize}px`
        ring.style.height = `${ringSize}px`
        ring.style.position = "absolute"
        ring.style.top = "50%"
        ring.style.left = "50%"
        ring.style.transform = "translate(-50%, -50%)"
        ring.style.border = "1px solid rgba(255, 199, 0, 0.3)"
        ring.style.borderRadius = "50%"
        ring.style.pointerEvents = "none"
        container.appendChild(ring)
      })
      
      // Add compass directions around the outer ring
      const directions = [
        { label: "N", angle: 0 },
        { label: "NE", angle: 45 },
        { label: "E", angle: 90 },
        { label: "SE", angle: 135 },
        { label: "S", angle: 180 },
        { label: "SW", angle: 225 },
        { label: "W", angle: 270 },
        { label: "NW", angle: 315 }
      ]
      
      const radius = size / 2
      const labelOffset = 20 // Distance outside the circle
      
      directions.forEach(({ label, angle }) => {
        const angleRad = (angle - 90) * (Math.PI / 180) // -90 to start from top (North)
        const x = radius + Math.cos(angleRad) * (radius + labelOffset)
        const y = radius + Math.sin(angleRad) * (radius + labelOffset)
        
        const dirLabel = document.createElement("div")
        dirLabel.className = "radar-direction-label"
        dirLabel.textContent = label
        dirLabel.style.position = "absolute"
        dirLabel.style.left = `${x}px`
        dirLabel.style.top = `${y}px`
        dirLabel.style.transform = "translate(-50%, -50%)"
        dirLabel.style.color = "rgba(255, 199, 0, 1)"
        dirLabel.style.fontSize = "16px"
        dirLabel.style.fontWeight = "800"
        dirLabel.style.textShadow = "0 0 8px rgba(0, 0, 0, 1), 0 0 4px rgba(255, 199, 0, 0.6)"
        dirLabel.style.pointerEvents = "none"
        dirLabel.style.fontFamily = "monospace"
        dirLabel.style.letterSpacing = "1.5px"
        container.appendChild(dirLabel)
      })
      
      // Add distance labels at the North position on each ring
      distances.forEach(({ km, percent }) => {
        const ringSize = (size * percent) / 100
        
        const label = document.createElement("div")
        label.className = "radar-distance-label"
        label.textContent = `${km}km`
        label.style.position = "absolute"
        label.style.top = `calc(50% - ${ringSize / 2}px - 6px)`
        label.style.left = "50%"
        label.style.transform = "translateX(-50%)"
        label.style.color = "rgba(255, 199, 0, 0.9)"
        label.style.fontSize = "12px"
        label.style.fontWeight = "700"
        label.style.textShadow = "0 0 6px rgba(0, 0, 0, 1)"
        label.style.pointerEvents = "none"
        label.style.fontFamily = "monospace"
        label.style.backgroundColor = "rgba(0, 0, 0, 0.7)"
        label.style.padding = "2px 6px"
        label.style.borderRadius = "3px"
        label.style.border = "1px solid rgba(255, 199, 0, 0.3)"
        container.appendChild(label)
      })
      
      return container
    }

    // Helper function to update or create user marker
    const updateUserMarker = (lng: number, lat: number, accuracy: number) => {
      if (!mapRef.current) return
      
      // Remove existing marker if it exists
      if (userMarkerRef.current) {
        userMarkerRef.current.remove()
      }
      
      // Create new marker with radar effect
      const markerElement = createRadarMarkerElement(accuracy)
      userMarkerRef.current = new mapboxgl.Marker({
        element: markerElement,
        anchor: "center",
      })
        .setLngLat([lng, lat])
        .addTo(mapRef.current)
      
      console.log("Radar marker created at:", lng, lat, "with accuracy:", accuracy)
    }

    // Add geolocate control (disable default marker, we'll use custom radar)
    geolocateControlRef.current = new mapboxgl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true,
      },
      trackUserLocation: true,
      showUserHeading: false,
      showUserLocation: false, // Disable default marker
    })
    mapRef.current.addControl(geolocateControlRef.current, "top-right")

    // Listen to geolocation events
    geolocateControlRef.current.on("geolocate", (e: any) => {
      setLocationStatus("granted")
      const lng = e.coords.longitude
      const lat = e.coords.latitude
      const accuracy = e.coords.accuracy || 50
      
      setUserLocation({ lng, lat, accuracy })
      
      // Update custom radar marker
      updateUserMarker(lng, lat, accuracy)
      
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

      // Add atmospheric fog for depth (only in high-performance mode)
      if (!isPerformanceMode) {
        mapRef.current.setFog({
          color: "rgb(20, 20, 30)",
          "high-color": "rgb(10, 20, 40)",
          "horizon-blend": 0.02,
          "space-color": "rgb(5, 5, 15)",
          "star-intensity": 0.8,
        })
      }

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
      
      // Remove user marker
      if (userMarkerRef.current) {
        userMarkerRef.current.remove()
        userMarkerRef.current = null
      }
      
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
  }, [mapboxToken, isPerformanceMode])

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
