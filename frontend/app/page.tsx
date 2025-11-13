"use client"

import React, { useRef, useState, useCallback, useEffect } from "react"
import dynamic from "next/dynamic"
import { LeftSlider } from "@/components/LeftSlider"
import type { MapPaneRef } from "@/components/MapPane.client"
import type { Detection } from "@/components/RadarCard"
import { calculateBearing, calculateDistance } from "@/lib/geo"

const MapPane = dynamic(() => import("@/components/MapPane.client").then((mod) => ({ default: mod.MapPane })), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-background flex items-center justify-center">
      <div className="text-muted-foreground">Loading map...</div>
    </div>
  ),
})

export default function Home() {
  const mapRef = useRef<MapPaneRef>(null)
  const [detections, setDetections] = useState<Detection[]>([])
  const [userLocation, setUserLocation] = useState<{ lng: number; lat: number } | null>(null)

  // Poll for user location updates
  useEffect(() => {
    const checkLocation = setInterval(() => {
      const loc = mapRef.current?.getUserLocation()
      if (loc) {
        setUserLocation({ lng: loc.lng, lat: loc.lat })
      }
    }, 1000)

    return () => clearInterval(checkLocation)
  }, [])

  // Add a new detection
  const handleAddDetection = useCallback((
    lng: number,
    lat: number,
    label?: string,
    confidence?: number
  ) => {
    console.log("Adding detection at:", { lng, lat, label, confidence })
    
    if (!mapRef.current) {
      console.error("Map ref not available")
      return
    }

    // Add marker to map
    const detectionId = mapRef.current.addDetection({
      lng,
      lat,
      radiusMeters: 100,
      label,
      confidence,
    })

    console.log("Detection added with ID:", detectionId)

    // Calculate bearing and distance from user
    const userLoc = mapRef.current.getUserLocation()
    const distanceMeters = userLoc
      ? calculateDistance([userLoc.lng, userLoc.lat], [lng, lat])
      : 0
    const bearingDeg = userLoc
      ? calculateBearing([userLoc.lng, userLoc.lat], [lng, lat])
      : 0

    console.log("Detection calculated:", { distanceMeters, bearingDeg })

    // Add to detections list
    const newDetection: Detection = {
      id: detectionId,
      lng,
      lat,
      distanceMeters,
      bearingDeg,
      timestamp: Date.now(),
      label,
      confidence,
    }

    setDetections((prev) => {
      const updated = [...prev, newDetection]
      console.log("Total detections:", updated.length)
      return updated
    })

    // Draw range line from user to detection
    if (userLoc) {
      mapRef.current.drawRange(
        [userLoc.lng, userLoc.lat],
        [lng, lat],
        "driving", // Default profile
        detectionId
      )
    }
  }, [])

  // Remove a detection
  const handleRemoveDetection = useCallback((id: string) => {
    mapRef.current?.removeDetection(id)
    setDetections((prev) => prev.filter((d) => d.id !== id))
  }, [])

  // Fly to a detection when clicked
  const handleDetectionClick = useCallback((detection: Detection) => {
    if (!mapRef.current) return

    mapRef.current.flyToUser()
    
    // Alternative: fly directly to the detection
    // mapRef.current.flyTo(detection.lng, detection.lat)
  }, [])

  return (
    <main className="split">
      <LeftSlider
        mapRef={mapRef}
        detections={detections}
        userLocation={userLocation}
        onDetectionClick={handleDetectionClick}
        onAddDetection={handleAddDetection}
      />
      <MapPane ref={mapRef} />
    </main>
  )
}
