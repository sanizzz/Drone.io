"use client"

import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from "react"
import mapboxgl from "mapbox-gl"
import * as turf from "@turf/turf"
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
      el.style.backgroundColor = "#ff3131"
      el.style.border = "2px solid #fff"
      el.style.cursor = "pointer"
      el.style.boxShadow = "0 0 8px 2px rgba(255, 49, 49, 0.8)"
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
          "fill-color": "#ff3131",
          "fill-opacity": 0.2,
        },
      })

      mapRef.current.addLayer({
        id: outlineLayerId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": "#ff3131",
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

    // Initialize map with performance-optimized options
    console.log("🗺️ Initializing map with fallback center (will update to your actual location)...")
    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/standard",
      center: [0, 0], // Neutral fallback - will be replaced by actual location
      zoom: 2,
      pitch: isPerformanceMode ? 0 : 65,
      bearing: isPerformanceMode ? 0 : -20,
      projection: isPerformanceMode ? "mercator" : ("globe" as any),
      antialias: !isPerformanceMode,
      cooperativeGestures: isPerformanceMode,
      // Performance optimizations
      fadeDuration: 100, // Faster tile transitions
      renderWorldCopies: false, // Don't render duplicate world copies
      maxTileCacheSize: 50, // Reduce tile cache for memory efficiency
      preserveDrawingBuffer: false, // Better performance
      refreshExpiredTiles: false, // Don't auto-refresh old tiles
      trackResize: true, // Auto-handle container resize
    })

    // Add navigation controls (zoom, compass, pitch)
    const navigationControl = new mapboxgl.NavigationControl({
      visualizePitch: true,
    })
    mapRef.current.addControl(navigationControl, "top-right")

    // Helper function to create radar marker element with proper distance scaling
    const createRadarMarkerElement = (accuracyMeters: number, map: mapboxgl.Map) => {
      const container = document.createElement("div")
      container.className = "user-radar-marker"
      container.style.position = "absolute"
      container.style.pointerEvents = "none"
      
      // Distance ranges to display: 1km, 2km, 3km
      const distances = [1000, 2000, 3000] // meters
      
      // Create core red dot
      const core = document.createElement("div")
      core.className = "user-radar-core"
      container.appendChild(core)
      
      // Create four pulsing radar waves for better visibility
      for (let i = 0; i < 4; i++) {
        const wave = document.createElement("div")
        wave.className = "user-radar-wave"
        wave.style.position = "absolute"
        container.appendChild(wave)
      }
      
      // Store ring elements for updates
      const ringElements: Array<{ ring: HTMLElement; label: HTMLElement; distance: number }> = []
      
      // Add distance metric rings
      distances.forEach((distanceMeters, index) => {
        // Create ring
        const ring = document.createElement("div")
        ring.className = "radar-distance-ring"
        ring.style.position = "absolute"
        ring.style.border = "2px solid rgba(255, 49, 49, 0.4)"
        ring.style.borderRadius = "50%"
        ring.style.pointerEvents = "none"
        ring.style.transform = "translate(-50%, -50%)"
        container.appendChild(ring)
        
        // Create distance label
        const labelElement = document.createElement("div")
        labelElement.className = "radar-distance-label"
        labelElement.textContent = `${distanceMeters / 1000}KM`
        labelElement.style.position = "absolute"
        labelElement.style.color = "rgba(255, 49, 49, 0.9)"
        labelElement.style.fontSize = "11px"
        labelElement.style.fontWeight = "700"
        labelElement.style.textShadow = "0 0 6px rgba(0, 0, 0, 1)"
        labelElement.style.pointerEvents = "none"
        labelElement.style.fontFamily = "monospace"
        labelElement.style.backgroundColor = "rgba(0, 0, 0, 0.7)"
        labelElement.style.padding = "2px 5px"
        labelElement.style.borderRadius = "3px"
        labelElement.style.border = "1px solid rgba(255, 49, 49, 0.3)"
        labelElement.style.whiteSpace = "nowrap"
        container.appendChild(labelElement)
        
        ringElements.push({ ring, label: labelElement, distance: distanceMeters })
      })
      
      // Add compass directions
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
      
      const directionElements: Array<{ element: HTMLElement; angle: number }> = []
      
      directions.forEach(({ label, angle }) => {
        const dirLabel = document.createElement("div")
        dirLabel.className = "radar-direction-label"
        dirLabel.textContent = label
        dirLabel.style.position = "absolute"
        dirLabel.style.color = "rgba(255, 49, 49, 1)"
        dirLabel.style.fontSize = "14px"
        dirLabel.style.fontWeight = "800"
        dirLabel.style.textShadow = "0 0 8px rgba(0, 0, 0, 1), 0 0 4px rgba(255, 49, 49, 0.6)"
        dirLabel.style.pointerEvents = "none"
        dirLabel.style.fontFamily = "monospace"
        dirLabel.style.letterSpacing = "1.5px"
        container.appendChild(dirLabel)
        
        directionElements.push({ element: dirLabel, angle })
      })
      
      // Function to update ring sizes based on current zoom
      const updateRingSizes = () => {
        if (!map || !userMarkerRef.current) return
        
        const center = userMarkerRef.current.getLngLat()
        const bearing = map.getBearing() // Get map rotation in degrees
        
        // Update each ring based on actual distance
        ringElements.forEach(({ ring, label, distance }) => {
          // Calculate a point at the distance from center (using North as reference)
          const point = turf.destination(
            [center.lng, center.lat],
            distance / 1000,
            0, // North direction (0 degrees = true North)
            { units: "kilometers" }
          )
          
          // Convert both points to screen pixels
          const centerPixel = map.project([center.lng, center.lat])
          const edgePixel = map.project(point.geometry.coordinates as [number, number])
          
          // Calculate pixel radius
          const radiusPixels = Math.sqrt(
            Math.pow(edgePixel.x - centerPixel.x, 2) +
            Math.pow(edgePixel.y - centerPixel.y, 2)
          )
          
          const diameter = radiusPixels * 2
          
          // Update ring size
          ring.style.width = `${diameter}px`
          ring.style.height = `${diameter}px`
          ring.style.left = "0"
          ring.style.top = "0"
          
          // Position label at true North on the ring - calculate where North appears on screen
          // The map.project() already accounts for map rotation, so we just use the projected edge point
          const dx = edgePixel.x - centerPixel.x
          const dy = edgePixel.y - centerPixel.y
          
          label.style.left = `${dx}px`
          label.style.top = `${dy - 6}px`
          label.style.transform = "translate(-50%, -50%)"
        })
        
        // Update direction labels to point to true cardinal directions
        if (ringElements.length > 0) {
          const outerRing = ringElements[ringElements.length - 1]
          const outerDistance = outerRing.distance
          const labelOffset = 25
          
          directionElements.forEach(({ element, angle }) => {
            // Calculate actual geographic point in each cardinal direction
            const directionPoint = turf.destination(
              [center.lng, center.lat],
              (outerDistance + labelOffset * (outerDistance / 1000)) / 1000,
              angle, // Use true bearing angle
              { units: "kilometers" }
            )
            
            // Project to screen coordinates
            const centerPixel = map.project([center.lng, center.lat])
            const dirPixel = map.project(directionPoint.geometry.coordinates as [number, number])
            
            const x = dirPixel.x - centerPixel.x
            const y = dirPixel.y - centerPixel.y
            
            element.style.left = `${x}px`
            element.style.top = `${y}px`
            element.style.transform = "translate(-50%, -50%)"
          })
        }
      }
      
      // Initial update
      setTimeout(updateRingSizes, 100)
      
      // Store update function for later use
      ;(container as any).updateRingSizes = updateRingSizes
      
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
      const markerElement = createRadarMarkerElement(accuracy, mapRef.current)
      userMarkerRef.current = new mapboxgl.Marker({
        element: markerElement,
        anchor: "center",
      })
        .setLngLat([lng, lat])
        .addTo(mapRef.current)
      
      console.log("Radar marker created at:", lng, lat, "with accuracy:", accuracy)
    }

    // Add geolocate control with maximum accuracy settings
    geolocateControlRef.current = new mapboxgl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true,
        timeout: 10000, // 10 seconds timeout
        maximumAge: 0, // Don't use cached position
      },
      trackUserLocation: true,
      showUserHeading: true, // Show heading if available
      showUserLocation: false, // Disable default marker
      showAccuracyCircle: false, // We have our own radar
    })
    mapRef.current.addControl(geolocateControlRef.current, "top-right")

    // Listen to geolocation events
    geolocateControlRef.current.on("geolocate", (e: any) => {
      setLocationStatus("granted")
      const lng = e.coords.longitude
      const lat = e.coords.latitude
      const accuracy = e.coords.accuracy || 50
      
      console.log("✅ Location acquired! Your actual coordinates:", {
        lng: lng.toFixed(6),
        lat: lat.toFixed(6),
        accuracy: `${accuracy.toFixed(2)}m`,
        heading: e.coords.heading,
        speed: e.coords.speed,
        altitude: e.coords.altitude,
      })
      
      setUserLocation({ lng, lat, accuracy })
      
      // Update custom radar marker
      updateUserMarker(lng, lat, accuracy)
      
      // Fly to user's actual location
      if (mapRef.current) {
        mapRef.current.flyTo({
          center: [lng, lat],
          zoom: 14,
          duration: 2000
        })
      }
    })
    
    geolocateControlRef.current.on("trackuserlocationstart", () => {
      console.log("📍 Started tracking your location...")
    })
    
    geolocateControlRef.current.on("trackuserlocationend", () => {
      console.log("⏸️ Stopped tracking location")
    })

    geolocateControlRef.current.on("error", (e: any) => {
      setLocationStatus("denied")
      console.error("❌ Geolocation error:", e)
      console.error("Error code:", e.code)
      console.error("Error message:", e.message)
      
      if (e.code === 1) {
        console.error("🚫 User denied location permission - Click the location button or allow in browser settings")
      } else if (e.code === 2) {
        console.error("📍 Position unavailable - Check GPS/location services")
      } else if (e.code === 3) {
        console.error("⏱️ Timeout - Location request took too long")
      }
      
      console.warn("💡 Solutions:")
      console.warn("1. Click the location icon (crosshair) in the top-right corner of the map")
      console.warn("2. Make sure location permissions are enabled in your browser")
      console.warn("3. If using Chrome, check chrome://settings/content/location")
      console.warn("4. Ensure you're using HTTPS or localhost")
    })

    // Listen to zoom and move events to update ring sizes
    mapRef.current.on("zoom", () => {
      if (userMarkerRef.current) {
        const markerElement = userMarkerRef.current.getElement()
        if ((markerElement as any).updateRingSizes) {
          ;(markerElement as any).updateRingSizes()
        }
      }
    })

    mapRef.current.on("move", () => {
      if (userMarkerRef.current) {
        const markerElement = userMarkerRef.current.getElement()
        if ((markerElement as any).updateRingSizes) {
          ;(markerElement as any).updateRingSizes()
        }
      }
    })

    // Listen to rotation events to update cardinal directions
    mapRef.current.on("rotate", () => {
      if (userMarkerRef.current) {
        const markerElement = userMarkerRef.current.getElement()
        if ((markerElement as any).updateRingSizes) {
          ;(markerElement as any).updateRingSizes()
        }
      }
    })

    // Listen to pitch changes to update directions
    mapRef.current.on("pitch", () => {
      if (userMarkerRef.current) {
        const markerElement = userMarkerRef.current.getElement()
        if ((markerElement as any).updateRingSizes) {
          ;(markerElement as any).updateRingSizes()
        }
      }
    })

    // Optimize map loading with idle event
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

      // Wait for map to be fully idle before triggering geolocation
      mapRef.current.once("idle", () => {
        console.log("🎯 Map loaded - requesting your location...")
        console.log("💡 Please allow location access when prompted by your browser")
        
        // Immediate trigger
        if (geolocateControlRef.current) {
          geolocateControlRef.current.trigger()
        }
        
        // Retry after 1 second if location not granted
        setTimeout(() => {
          if (!userLocation && geolocateControlRef.current) {
            console.log("🔄 Retrying location request...")
            geolocateControlRef.current.trigger()
          }
        }, 1000)
        
        // Final retry after 3 seconds
        setTimeout(() => {
          if (!userLocation && geolocateControlRef.current) {
            console.log("🔄 Final location request attempt...")
            geolocateControlRef.current.trigger()
          }
        }, 3000)
      })
    })

    // No zoom listeners needed - radar is fixed size and works perfectly

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
              <span className="text-xs text-primary">Location active</span>
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
