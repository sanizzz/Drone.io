"use client"

import React, { type RefObject } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { RadarCard, type Detection } from "./RadarCard"
import { RangeCard } from "./RangeCard"
import { AudioUpload } from "./AudioUpload"
import type { MapPaneRef } from "./MapPane.client"
import { randomPointInRadius } from "@/lib/geo"

interface LeftSliderProps {
  mapRef: RefObject<MapPaneRef | null>
  detections: Detection[]
  userLocation: { lng: number; lat: number } | null
  onDetectionClick: (detection: Detection) => void
  onAddDetection: (lng: number, lat: number, label?: string, confidence?: number) => void
}

export function LeftSlider({ 
  mapRef, 
  detections, 
  userLocation, 
  onDetectionClick,
  onAddDetection 
}: LeftSliderProps) {
  function handleUploadComplete(result: { isDrone: boolean; confidence?: number }) {
    const userLoc = mapRef.current?.getUserLocation()
    
    if (!userLoc) {
      console.warn("User location not available yet")
      return
    }

    // Generate a random point within the accuracy circle
    const targetPoint = randomPointInRadius([userLoc.lng, userLoc.lat], userLoc.accuracy)
    
    // Determine label based on detection result
    const label = result.isDrone ? "Drone Detection" : "Audio Detection"
    
    // Always add detection marker
    onAddDetection(
      targetPoint[0], 
      targetPoint[1], 
      label, 
      result.confidence
    )
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <ScrollArea className="flex-1">
        <div className="p-6 md:p-8 space-y-6">
          {/* Header */}
          <div>
            <h2
              className="text-3xl md:text-4xl font-light tracking-wide"
              style={{ fontFamily: "var(--font-sentient)" }}
            >
              <span className="text-primary">Tactical</span>
              <br />
              <span className="text-foreground italic">Operations</span>
            </h2>
          </div>

          <Separator className="bg-border" />

          {/* Audio Upload Section */}
          <div>
            <AudioUpload
              onUploadComplete={handleUploadComplete}
              disabled={!userLocation}
            />
          </div>

          <Separator className="bg-border" />

          {/* Radar Card Section */}
          <div>
            <RadarCard
              detections={detections}
              userLocation={userLocation}
              onDetectionClick={onDetectionClick}
            />
          </div>

          <Separator className="bg-border" />

          {/* Range Card Section */}
          <div>
            <RangeCard
              detections={detections}
              mapRef={mapRef}
              onRecompute={(detectionId, profile) => {
                const userLoc = mapRef.current?.getUserLocation()
                const detection = detections.find((d) => d.id === detectionId)
                if (userLoc && detection && mapRef.current) {
                  mapRef.current.drawRange(
                    [userLoc.lng, userLoc.lat],
                    [detection.lng, detection.lat],
                    profile,
                    detectionId
                  )
                }
              }}
            />
          </div>

        </div>
      </ScrollArea>
    </div>
  )
}
