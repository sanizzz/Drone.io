"use client"

import React, { type RefObject, useState, useMemo } from "react"
import { Separator } from "@/components/ui/separator"
import { RadarCard, type Detection } from "./RadarCard"
import { RangeCard } from "./RangeCard"
import { AudioUpload } from "./AudioUpload"
import { ThreatLevel } from "./ThreatLevel"
import type { MapPaneRef } from "./MapPane.client"
import { randomPointInRadius } from "@/lib/geo"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Activity, TrendingUp, Radio, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { drones } from "@/data/drones"

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
  onAddDetection: (lng: number, lat: number, label?: string, confidence?: number, isDrone?: boolean) => void
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

  function handleUploadComplete(result: { isDrone: boolean; confidence?: number; predictions?: ClassificationResult[] }) {
    const userLoc = mapRef.current?.getUserLocation()
    
    if (!userLoc) {
      console.warn("User location not available yet")
      return
    }

    // Store predictions for display
    if (result.predictions) {
      setPredictions(result.predictions)
      setIsDroneDetected(result.isDrone)
    }

    // Show toast notification for drone detection
    if (result.isDrone) {
      const topPrediction = result.predictions?.[0]
      const confidencePercent = Math.round((result.confidence || 0) * 100)

      // try a few candidate keys to find matching entry in drones.ts
      const candidates = [
        topPrediction?.class,
        topPrediction?.class?.replace(/\s+/g, "_"),
        topPrediction?.class?.replace(/-/g, "_"),
        topPrediction?.class?.toLowerCase?.(),
      ]

      let droneInfo = null
      for (const c of candidates) {
        if (c && (drones as any)[c]) {
          droneInfo = (drones as any)[c]
          break
        }
      }

      const description = droneInfo ? (
        <div className="text-sm space-y-0.5">
          <div className="font-semibold">{droneInfo.modelName}</div>
          <div className="text-[12px] text-muted-foreground">Confidence: {confidencePercent}%</div>
          <div className="text-[12px]">Top speed: <strong>{droneInfo.maximumSpeed} km/h</strong></div>
          <div className="text-[12px]">Range: <strong>{droneInfo.operationalRange} km</strong></div>
          <div className="text-[12px]">Max altitude: <strong>{droneInfo.maximumAltitude} m</strong></div>
          <div className="text-[12px]">Endurance: <strong>{droneInfo.endurance} min</strong></div>
          <div className="text-[12px]">Payload: <strong>{droneInfo.payloadCapacity} kg</strong></div>
          <div className="text-[12px] text-muted-foreground">Detection marked on map.</div>
        </div>
      ) : (
        <div className="text-sm">
          {topPrediction?.class.replace(/_/g, " ")} detected with {confidencePercent}% confidence. Detection marked on map.
        </div>
      )

      toast({
        title: "🚨 Drone Detected!",
        description,
        duration: 5000,
      })
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
      result.confidence,
      result.isDrone
    )
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
                <CardTitle className="text-[9px] sm:text-[10px] text-primary font-medium">TOP PREDICTIONS</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-1.5 sm:px-2 pb-1.5 sm:pb-2 pt-0">
              {predictions && predictions.length > 0 ? (
                <div className="space-y-1">
                  {predictions.slice(0, 3).map((pred, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-1 sm:p-1.5 rounded-md bg-secondary/50 border border-border hover:border-primary/30 transition-colors"
                    >
                      <div className="flex items-center gap-1 flex-1 min-w-0">
                        <span className="text-[9px] font-medium text-muted-foreground w-2.5">
                          {index + 1}
                        </span>
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
                  ))}
                  
                  {/* Detection Status */}
                  <div className={cn(
                    "mt-1 p-1 sm:p-1.5 rounded-md border-2 flex items-center gap-1",
                    isDroneDetected 
                      ? "border-primary bg-primary/5" 
                      : "border-muted bg-muted/20"
                  )}>
                    <TrendingUp className={cn(
                      "h-2.5 w-2.5",
                      isDroneDetected ? "text-primary" : "text-muted-foreground"
                    )} />
                    <span className={cn(
                      "text-[9px] font-bold",
                      isDroneDetected ? "text-primary" : "text-muted-foreground"
                    )}>
                      {isDroneDetected ? "DRONE DETECTED" : "NO DRONE DETECTED"}
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

          {/* Threat Level */}
          <ThreatLevel 
            detections={detections.length}
            recentDroneDetections={recentDroneDetections}
          />

        </div>
      </div>
    </div>
  )
}
