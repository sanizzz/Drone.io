"use client"

import { useEffect, useRef, useState, useCallback } from "react"

interface MapMarker {
  id: string
  lat: number
  lng: number
  type: "target" | "drone" | "waypoint" | "user"
  label: string
}

interface AdvancedMapProps {
  latitude: number
  longitude: number
  zoom: number
  onLocationUpdate?: (lat: number, lng: number) => void
}

export function AdvancedMap({ latitude, longitude, zoom, onLocationUpdate }: AdvancedMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<any>(null)
  const [L, setL] = useState<any>(null)
  const [markers, setMarkers] = useState<MapMarker[]>([])
  const markersLayerRef = useRef<any>(null)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [isTracking, setIsTracking] = useState(false)
  const watchIdRef = useRef<number | null>(null)

  // Initialize map
  useEffect(() => {
    if (typeof window === "undefined" || !mapRef.current || map) return

    import("leaflet").then((LeafletModule) => {
      const LeafletInstance = LeafletModule.default
      setL(LeafletModule.default)

      // Initialize map
      const mapInstance = LeafletInstance.map(mapRef.current!, {
        center: [latitude, longitude],
        zoom: zoom,
        zoomControl: false,
        attributionControl: false,
      })

      // Add satellite/street toggle layers
      const streetLayer = LeafletInstance.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      })

      const satelliteLayer = LeafletInstance.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          maxZoom: 19,
        },
      )

      streetLayer.addTo(mapInstance)

      // Add custom zoom controls
      LeafletInstance.control
        .zoom({
          position: "topright",
        })
        .addTo(mapInstance)

      // Create layer for markers
      const markersLayer = LeafletInstance.layerGroup().addTo(mapInstance)
      markersLayerRef.current = markersLayer

      // Add initial target marker
      const initialMarker = LeafletInstance.marker([latitude, longitude], {
        draggable: true,
      })
        .addTo(markersLayer)
        .bindPopup(`<b>Target Location</b><br>Lat: ${latitude.toFixed(6)}°<br>Lon: ${longitude.toFixed(6)}°`)

      initialMarker.on("dragend", (e: any) => {
        const position = e.target.getLatLng()
        onLocationUpdate?.(position.lat, position.lng)
      })

      // Add layer control for toggling between street and satellite
      LeafletInstance.control
        .layers(
          {
            Street: streetLayer,
            Satellite: satelliteLayer,
          },
          {},
          { position: "topleft" },
        )
        .addTo(mapInstance)

      // Add scale control
      LeafletInstance.control.scale({ position: "bottomleft" }).addTo(mapInstance)

      setMap(mapInstance)

      // Cleanup
      return () => {
        mapInstance.remove()
      }
    })
  }, [])

  // Request user location
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      console.log("[v0] Geolocation not supported")
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude: lat, longitude: lng } = position.coords
        console.log("[v0] User location:", lat, lng)
        setUserLocation({ lat, lng })
        onLocationUpdate?.(lat, lng)

        if (map && L) {
          map.setView([lat, lng], 15)

          // Add user location marker
          const userMarker = L.marker([lat, lng], {
            icon: L.divIcon({
              className: "user-location-marker",
              html: '<div style="background: #3b82f6; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(59, 130, 246, 0.8);"></div>',
              iconSize: [16, 16],
            }),
          })
            .addTo(markersLayerRef.current)
            .bindPopup(`<b>Your Location</b><br>Lat: ${lat.toFixed(6)}°<br>Lon: ${lng.toFixed(6)}°`)
        }
      },
      (error) => {
        console.log("[v0] Location error:", error.message)
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
      },
    )
  }, [map, L, onLocationUpdate])

  // Start/stop live tracking
  const toggleTracking = useCallback(() => {
    if (!navigator.geolocation) return

    if (isTracking && watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
      setIsTracking(false)
      console.log("[v0] Stopped tracking")
    } else {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude: lat, longitude: lng } = position.coords
          setUserLocation({ lat, lng })
          onLocationUpdate?.(lat, lng)

          if (map && L) {
            map.setView([lat, lng], map.getZoom())

            // Update user marker
            markersLayerRef.current?.clearLayers()
            L.marker([lat, lng], {
              icon: L.divIcon({
                className: "user-location-marker",
                html: '<div style="background: #3b82f6; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(59, 130, 246, 0.8); animation: pulse 2s infinite;"></div>',
                iconSize: [16, 16],
              }),
            })
              .addTo(markersLayerRef.current)
              .bindPopup(`<b>Your Location (Live)</b><br>Lat: ${lat.toFixed(6)}°<br>Lon: ${lng.toFixed(6)}°`)
          }
        },
        (error) => {
          console.log("[v0] Tracking error:", error.message)
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0,
        },
      )

      watchIdRef.current = watchId
      setIsTracking(true)
      console.log("[v0] Started tracking")
    }
  }, [isTracking, map, L, onLocationUpdate])

  // Add waypoint at center
  const addWaypoint = useCallback(() => {
    if (!map || !L) return

    const center = map.getCenter()
    const waypoint = L.marker([center.lat, center.lng], {
      draggable: true,
      icon: L.divIcon({
        className: "waypoint-marker",
        html: '<div style="background: #f59e0b; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 8px rgba(245, 158, 11, 0.8);"></div>',
        iconSize: [12, 12],
      }),
    })
      .addTo(markersLayerRef.current)
      .bindPopup(`<b>Waypoint</b><br>Lat: ${center.lat.toFixed(6)}°<br>Lon: ${center.lng.toFixed(6)}°`)

    waypoint.on("dragend", (e: any) => {
      const position = e.target.getLatLng()
      waypoint.setPopupContent(
        `<b>Waypoint</b><br>Lat: ${position.lat.toFixed(6)}°<br>Lon: ${position.lng.toFixed(6)}°`,
      )
    })
  }, [map, L])

  // Clear all markers
  const clearMarkers = useCallback(() => {
    if (markersLayerRef.current) {
      markersLayerRef.current.clearLayers()
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [])

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="absolute inset-0 w-full h-full" />

      {/* Grid Overlay */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          background: `
            repeating-linear-gradient(0deg, transparent, transparent 49px, rgba(34, 197, 94, 0.4) 49px, rgba(34, 197, 94, 0.4) 50px),
            repeating-linear-gradient(90deg, transparent, transparent 49px, rgba(34, 197, 94, 0.4) 49px, rgba(34, 197, 94, 0.4) 50px)
          `,
        }}
      />

      {/* Map Controls Overlay */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-[1000]">
        <button
          onClick={requestLocation}
          className="bg-black/80 hover:bg-black text-white px-3 py-2 rounded text-xs uppercase font-mono border border-green-500/50 transition-all hover:border-green-500"
          title="Get Current Location"
        >
          📍 Locate
        </button>
        <button
          onClick={toggleTracking}
          className={`${isTracking ? "bg-blue-600" : "bg-black/80"} hover:bg-blue-700 text-white px-3 py-2 rounded text-xs uppercase font-mono border ${isTracking ? "border-blue-400" : "border-gray-500/50"} transition-all`}
          title="Toggle Live Tracking"
        >
          {isTracking ? "🔴 Tracking" : "⚪ Track"}
        </button>
        <button
          onClick={addWaypoint}
          className="bg-black/80 hover:bg-black text-white px-3 py-2 rounded text-xs uppercase font-mono border border-amber-500/50 transition-all hover:border-amber-500"
          title="Add Waypoint at Center"
        >
          ➕ Waypoint
        </button>
        <button
          onClick={clearMarkers}
          className="bg-black/80 hover:bg-red-900 text-white px-3 py-2 rounded text-xs uppercase font-mono border border-red-500/50 transition-all hover:border-red-500"
          title="Clear All Markers"
        >
          🗑️ Clear
        </button>
      </div>

      {/* Coordinates Display */}
      {userLocation && (
        <div className="absolute top-4 left-4 bg-black/90 text-white px-3 py-2 rounded border border-blue-500/50 text-xs font-mono z-[1000]">
          <div className="text-blue-400 uppercase text-[10px] mb-1">GPS Location</div>
          <div>Lat: {userLocation.lat.toFixed(6)}°</div>
          <div>Lng: {userLocation.lng.toFixed(6)}°</div>
        </div>
      )}

      <style jsx>{`
        @keyframes pulse {
          0%,
          100% {
            box-shadow: 0 0 10px rgba(59, 130, 246, 0.8);
          }
          50% {
            box-shadow: 0 0 20px rgba(59, 130, 246, 1);
          }
        }
      `}</style>
    </div>
  )
}
