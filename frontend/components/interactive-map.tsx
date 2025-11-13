"use client"

import { useEffect, useRef, useState } from "react"

interface InteractiveMapProps {
  latitude: number
  longitude: number
  zoom: number
}

export function InteractiveMap({ latitude, longitude, zoom }: InteractiveMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<any>(null)

  useEffect(() => {
    if (typeof window === "undefined" || !mapRef.current) return

    // Dynamically import Leaflet on client side
    import("leaflet").then((L) => {
      // Initialize map
      const mapInstance = L.map(mapRef.current!, {
        center: [latitude, longitude],
        zoom: zoom,
        zoomControl: true,
        attributionControl: false,
      })

      // Add OpenStreetMap tile layer
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(mapInstance)

      // Add a marker at the center
      const marker = L.marker([latitude, longitude]).addTo(mapInstance)
      marker.bindPopup(`<b>Target Location</b><br>Lat: ${latitude.toFixed(4)}°<br>Lon: ${longitude.toFixed(4)}°`)

      setMap(mapInstance)

      // Cleanup
      return () => {
        mapInstance.remove()
      }
    })
  }, [latitude, longitude, zoom])

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="w-full h-full" />
      {/* Grid Overlay */}
      <div
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          background: `
            repeating-linear-gradient(0deg, transparent, transparent 49px, rgba(100, 150, 200, 0.3) 49px, rgba(100, 150, 200, 0.3) 50px),
            repeating-linear-gradient(90deg, transparent, transparent 49px, rgba(100, 150, 200, 0.3) 49px, rgba(100, 150, 200, 0.3) 50px)
          `,
        }}
      />
    </div>
  )
}
