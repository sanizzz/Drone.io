"use client"

import React, { useRef, useState, useCallback, useEffect } from "react"
import dynamic from "next/dynamic"
import { LeftSlider } from "@/components/LeftSlider"
import { PredictionLogs } from "@/components/PredictionLogs"
import type { MapPaneRef } from "@/components/MapPane.client"
import type { Detection } from "@/components/RadarCard"
import { calculateBearing, calculateDistance } from "@/lib/geo"

interface PredictionLog {
  id: string
  timestamp: number
  isDrone: boolean
  confidence: number
}

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
  const [predictionLogs, setPredictionLogs] = useState<PredictionLog[]>([])

  const handleDeleteLog = useCallback((logId: string) => {
    setPredictionLogs(prev => prev.filter(log => log.id !== logId))
  }, [])

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
    confidence?: number,
    isDrone?: boolean,
    radiusMeters?: number
  ) => {
    console.log("Adding detection at:", { lng, lat, label, confidence, radiusMeters })
    
    if (!mapRef.current) {
      console.error("Map ref not available")
      return
    }

    // Add to prediction logs if provided
    if (isDrone !== undefined && confidence !== undefined) {
      const newLog: PredictionLog = {
        id: `log-${Date.now()}`,
        timestamp: Date.now(),
        isDrone,
        confidence
      }
      setPredictionLogs(prev => [newLog, ...prev])
    }

    // Add marker to map
    const detectionId = mapRef.current.addDetection({
      lng,
      lat,
      radiusMeters: radiusMeters || 50, // Use smaller default radius
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
      <div className="h-full overflow-hidden">
        <LeftSlider
          mapRef={mapRef}
          detections={detections}
          userLocation={userLocation}
          predictionLogs={predictionLogs}
          onDetectionClick={handleDetectionClick}
          onAddDetection={handleAddDetection}
        />
      </div>
      <div className="h-full overflow-hidden relative">
        <MapPane ref={mapRef} />
        <PredictionLogs logs={predictionLogs} onDeleteLog={handleDeleteLog} />
      </div>
    </main>
  )
}
