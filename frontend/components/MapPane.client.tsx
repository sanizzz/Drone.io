"use client"

import React, { useRef, useEffect, useState } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"

export function MapPane() {
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const geolocateControlRef = useRef<mapboxgl.GeolocateControl | null>(null)
  const [locationStatus, setLocationStatus] = useState<"loading" | "granted" | "denied" | "unavailable">("loading")
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

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

    // Cleanup
    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [mapboxToken])

  return (
    <div className="h-full w-full relative bg-background">
      <div
        id="map-container"
        ref={mapContainerRef}
        className="w-full h-full"
        style={{ minHeight: "calc(100vh - 4rem)" }}
      />
      
      {/* Location status indicator */}
      <div className="absolute top-4 left-4 bg-background/90 backdrop-blur-sm border border-border rounded-lg px-3 py-2">
        <div className="flex items-center gap-2">
          {locationStatus === "loading" && (
            <>
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse"></div>
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
}

