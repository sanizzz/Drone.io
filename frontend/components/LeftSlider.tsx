"use client"

import React, { type RefObject, useState, useMemo } from "react"
import { Separator } from "@/components/ui/separator"
import { RadarCard, type Detection } from "./RadarCard"
import { RangeCard } from "./RangeCard"
import { AudioUpload } from "./AudioUpload"
import { OperatorAnalytics } from "./OperatorAnalytics"
import type { MapPaneRef } from "./MapPane.client"
import { randomPointInRadius } from "@/lib/geo"
import * as turf from "@turf/turf"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Activity, TrendingUp, Radio, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { drones } from "@/common/drones"

interface PredictionLog {
  id: string
  timestamp: number
  isDrone: boolean
  confidence: number
}

interface LeftSliderProps {
  mapRef: RefObject<MapPaneRef | null>
  detections: Detection[]
  userLocation: { lng: number; lat: number } | null
  predictionLogs: PredictionLog[]
  onDetectionClick: (detection: Detection) => void
  onAddDetection: (lng: number, lat: number, label?: string, confidence?: number, isDrone?: boolean, radiusMeters?: number) => void
}

interface ClassificationResult {
  class: string
  confidence: number
}

export function LeftSlider({ 
  mapRef, 
  detections, 
  userLocation, 
  predictionLogs,
  onDetectionClick,
  onAddDetection 
}: LeftSliderProps) {
  const [predictions, setPredictions] = useState<ClassificationResult[] | null>(null)
  const [isDroneDetected, setIsDroneDetected] = useState<boolean | null>(null)
  const { toast } = useToast()

  // Calculate recent drone detections for threat level
  const recentDroneDetections = useMemo(() => {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
    return predictionLogs.filter(log => log.isDrone && log.timestamp > fiveMinutesAgo).length
  }, [predictionLogs])

  function handleUploadComplete(result: {
    isDrone: boolean
    confidence?: number
    predictions?: ClassificationResult[]
    distance?: number | null
    ci?: [number, number] | null
    bpf_hz?: number | null
    binaryConfidence?: number
  }) {
    const userLoc = mapRef.current?.getUserLocation()
    
    if (!userLoc) {
      console.warn("User location not available yet")
      return
    }

    // Store predictions for display (always update state)
    console.log("🎯 Updating predictions state:", {
      predictions: result.predictions,
      isDrone: result.isDrone,
      distance: result.distance,
      binaryConfidence: result.binaryConfidence
    })
    
    setPredictions(result.predictions || [])
    setIsDroneDetected(result.isDrone)

    // Show toast notification
    if (result.isDrone) {
      // Anomaly detected - possible drone
      const confidencePercent = Math.round((result.confidence || result.binaryConfidence || 0) * 100)

      toast({
        title: "🚨 Drone Detected!",
        description: (
          <div className="text-sm space-y-0.5">
            <div className="font-semibold">Anomalous sound detected</div>
            <div className="text-[12px] text-muted-foreground">
              Detection confidence: {confidencePercent}%
            </div>
            <div className="text-[12px] text-muted-foreground">
              Unknown sound pattern (not in training dataset)
            </div>
            <div className="text-[12px] text-primary font-bold mt-1">
              Detection marked on map.
            </div>
          </div>
        ),
        duration: 30000,
      })
    } else {
      // Known ESC-50 sound - not a drone
      const topPrediction = result.predictions?.[0]
      const confidencePercent = Math.round((topPrediction?.confidence || result.binaryConfidence || 0) * 100)
      
      toast({
        title: "Audio Analyzed",
        description: (
          <div className="text-sm">
            <div className="font-semibold">
              {topPrediction ? topPrediction.class.replace(/_/g, " ") : "Unknown"}
            </div>
            <div className="text-[12px] text-muted-foreground mt-1">
              Confidence: {confidencePercent}%
            </div>
            <div className="text-[12px] text-green-600 dark:text-green-400 mt-1">
              ✓ Not identified as a drone
            </div>
          </div>
        ),
        duration: 3000,
      })
    }

    // Determine target point based on distance estimation
    let targetPoint: [number, number]

    if (result.isDrone && result.distance && result.distance > 0) {
      // Use acoustic distance at random bearing (for MVP)
      const bearing = Math.random() * 360
      const destinationPoint = turf.destination(
        [userLoc.lng, userLoc.lat],
        result.distance / 1000, // meters to km
        bearing,
        { units: "kilometers" }
      )
      targetPoint = destinationPoint.geometry.coordinates as [number, number]
      console.log(`🎯 Drone placed at ${Math.round(result.distance)}m distance (bearing: ${Math.round(bearing)}°)`)
      
      // Log confidence interval if available
      if (result.ci) {
        const uncertainty = Math.round((result.ci[1] - result.ci[0]) / 2)
        console.log(`   Distance range: ${Math.round(result.ci[0])}m - ${Math.round(result.ci[1])}m (±${uncertainty}m)`)
      }
      
      // Log BPF if available
      if (result.bpf_hz) {
        console.log(`   BPF detected: ${result.bpf_hz.toFixed(1)} Hz`)
      }
    } else {
      // Fallback: Random point within GPS accuracy circle
      const cappedAccuracy = Math.min(userLoc.accuracy, 500)
      targetPoint = randomPointInRadius([userLoc.lng, userLoc.lat], cappedAccuracy)
      console.log(`📍 Detection placed at random point within ${cappedAccuracy}m GPS accuracy`)
    }

    // Only add marker if drone detected
    if (result.isDrone) {
      const label = "Drone Detection"
      
      // Calculate radius based on confidence interval (uncertainty)
      let radiusMeters = 50 // Default small radius
      if (result.ci && result.ci.length === 2) {
        // Use the uncertainty as the radius (half the CI range)
        radiusMeters = Math.round((result.ci[1] - result.ci[0]) / 2)
        // Clamp between 30m and 150m to keep markers visible but not overlapping
        radiusMeters = Math.max(30, Math.min(150, radiusMeters))
      }
      
      onAddDetection(
        targetPoint[0],
        targetPoint[1],
        label,
        result.confidence,
        true,
        radiusMeters
      )
    }
  }

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden border-r border-border">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex flex-col h-full p-1.5 sm:p-2 md:p-3 gap-1.5 sm:gap-2">
          {/* Header and Audio Upload */}
          <div className="flex flex-col gap-1 sm:gap-1.5 flex-shrink-0">
            <div className="flex-shrink-0">
              <h2
                className="text-xs sm:text-sm md:text-base font-light tracking-wide leading-tight"
                style={{ fontFamily: "var(--font-sentient)" }}
              >
                <span className="text-foreground">Early</span>
                {" "}
                <span className="text-primary italic">Warnings</span>
                {" "}
                <span className="text-foreground italic">Detection</span>
              </h2>
            </div>

            <div className="w-full">
              <AudioUpload
                onUploadComplete={handleUploadComplete}
                disabled={!userLocation}
              />
            </div>
          </div>

          <Separator className="bg-border flex-shrink-0 my-0.5" />

          {/* Predictions Display Card */}
          <Card className="border-border bg-card flex-shrink-0">
            <CardHeader className="pb-1 pt-1 sm:pb-1.5 sm:pt-1.5 px-1.5 sm:px-2">
              <div className="flex items-center gap-1">
                <Activity className="h-2.5 w-2.5 text-primary" />
                <CardTitle className="text-[9px] sm:text-[10px] text-primary font-medium">
                  TOP PREDICTIONS {predictions && `(${predictions.length})`}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-1.5 sm:px-2 pb-1.5 sm:pb-2 pt-0">
              {(() => {
                console.log("🔍 Render check:", {
                  isDroneDetected,
                  predictions,
                  predictionsLength: predictions?.length
                })
                return null
              })()}
              {isDroneDetected !== null ? (
                <div className="space-y-1">
                  {/* Show predictions if available */}
                  {predictions && predictions.length > 0 ? (
                    predictions.slice(0, 3).map((pred, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-1 sm:p-1.5 rounded-md bg-secondary/50 border border-border hover:border-primary/30 transition-colors"
                      >
                        <div className="flex items-center gap-1 flex-1 min-w-0">
                          <span className="text-[9px] sm:text-[10px] text-foreground font-medium truncate">
                            {pred.class.replace(/_/g, " ")}
                          </span>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[9px] font-bold px-1 py-0",
                            pred.confidence > 0.7 
                              ? "border-primary/50 text-primary bg-primary/10" 
                              : "border-border text-muted-foreground"
                          )}
                        >
                          {Math.round(pred.confidence * 100)}%
                        </Badge>
                      </div>
                    ))
                  ) : isDroneDetected ? (
                    <div className="p-1 sm:p-1.5 rounded-md bg-primary/10 border border-primary/30">
                      <p className="text-[9px] sm:text-[10px] text-primary font-medium text-center">
                        Anomalous sound pattern detected
                      </p>
                      <p className="text-[8px] text-muted-foreground text-center mt-0.5">
                        Not matching any known ESC-50 classes
                      </p>
                    </div>
                  ) : null}
                  
                  {/* Detection Status */}
                  <div className={cn(
                    "mt-1 p-1 sm:p-1.5 rounded-md border-2 flex items-center gap-1",
                    isDroneDetected 
                      ? "border-primary bg-primary/5" 
                      : "border-green-500/50 bg-green-500/5"
                  )}>
                    <TrendingUp className={cn(
                      "h-2.5 w-2.5",
                      isDroneDetected ? "text-primary" : "text-green-600 dark:text-green-400"
                    )} />
                    <span className={cn(
                      "text-[9px] font-bold",
                      isDroneDetected ? "text-primary" : "text-green-600 dark:text-green-400"
                    )}>
                      {isDroneDetected ? "DRONE DETECTED (ANOMALY)" : "KNOWN SOUND - NOT DRONE"}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-2">
                  <Activity className="h-5 w-5 text-muted-foreground/30 mx-auto mb-0.5" />
                  <p className="text-[9px] text-muted-foreground">UPLOAD AUDIO TO SEE PREDICTIONS</p>
                </div>
              )}
            </CardContent>
          </Card>
          
          <Separator className="bg-border flex-shrink-0 my-0.5" />

          {/* Operator Analytics */}
          <div className="flex flex-col gap-1.5 sm:gap-2 overflow-y-auto">
            <OperatorAnalytics 
              detections={detections.length}
              recentDroneDetections={recentDroneDetections}
            />
          </div>

        </div>
      </div>
    </div>
  )
}
