"use client"

import React, { useRef, useEffect } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"

export function MapPane() {
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

  useEffect(() => {
    if (!mapboxToken) {
      console.error("Mapbox token is not defined. Please set NEXT_PUBLIC_MAPBOX_TOKEN in your .env.local file")
      return
    }

    if (!mapContainerRef.current) return

    mapboxgl.accessToken = mapboxToken

    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/standard",
      center: [-80.5425, 43.4695], // Default center (can be changed later)
      zoom: 14,
      pitch: 65,
      bearing: -20,
      antialias: true,
    })

    mapRef.current.on("load", () => {
      if (!mapRef.current) return

      // Add fog for atmospheric depth
      mapRef.current.setFog({
        color: "rgb(186, 210, 235)",
        "high-color": "rgb(36, 92, 223)",
        "horizon-blend": 0.02,
        "space-color": "rgb(11, 11, 25)",
        "star-intensity": 0.6,
      })

      // Optional: Add custom 3D terrain (uncomment if using terrain-enabled style)
      // mapRef.current.addSource("mapbox-dem", {
      //   type: "raster-dem",
      //   url: "mapbox://mapbox.mapbox-terrain-dem-v1",
      //   tileSize: 512,
      //   maxzoom: 14,
      // })
      // mapRef.current.setTerrain({ source: "mapbox-dem", exaggeration: 1.5 })
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
      
      {/* Optional: Map controls legend */}
      <div className="absolute bottom-8 left-4 bg-background/90 backdrop-blur-sm border border-border rounded-lg p-3 space-y-2">
        <div className="text-xs text-muted-foreground font-mono uppercase tracking-wide">
          Map Controls
        </div>
        <div className="text-xs text-foreground space-y-1">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary glow"></div>
            <span className="text-primary">Drone Location</span>
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
            <span>Rotate</span>
          </div>
        </div>
      </div>
    </div>
  )
}

