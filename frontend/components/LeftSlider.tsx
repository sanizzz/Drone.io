"use client"

import React, { type RefObject, useState } from "react"
import { Separator } from "@/components/ui/separator"
import { RadarCard, type Detection } from "./RadarCard"
import { RangeCard } from "./RangeCard"
import { AudioUpload } from "./AudioUpload"
import type { MapPaneRef } from "./MapPane.client"
import { randomPointInRadius } from "@/lib/geo"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Activity, TrendingUp, Radio, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"

interface LeftSliderProps {
  mapRef: RefObject<MapPaneRef | null>
  detections: Detection[]
  userLocation: { lng: number; lat: number } | null
  onDetectionClick: (detection: Detection) => void
  onAddDetection: (lng: number, lat: number, label?: string, confidence?: number) => void
}

interface ClassificationResult {
  class: string
  confidence: number
}

interface PredictionLog {
  id: string
  timestamp: number
  isDrone: boolean
  confidence: number
}

export function LeftSlider({ 
  mapRef, 
  detections, 
  userLocation, 
  onDetectionClick,
  onAddDetection 
}: LeftSliderProps) {
  const [predictions, setPredictions] = useState<ClassificationResult[] | null>(null)
  const [isDroneDetected, setIsDroneDetected] = useState<boolean | null>(null)
  const [predictionLogs, setPredictionLogs] = useState<PredictionLog[]>([])
  const { toast } = useToast()

  function handleDeleteLog(logId: string) {
    setPredictionLogs(prev => prev.filter(log => log.id !== logId))
  }

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

    // Add to prediction log
    const newLog: PredictionLog = {
      id: `log-${Date.now()}`,
      timestamp: Date.now(),
      isDrone: result.isDrone,
      confidence: result.confidence || 0
    }
    setPredictionLogs(prev => [newLog, ...prev])

    // Show toast notification for drone detection
    if (result.isDrone) {
      const topPrediction = result.predictions?.[0]
      const confidencePercent = Math.round((result.confidence || 0) * 100)
      
      toast({
        title: "🚨 Drone Detected!",
        description: `${topPrediction?.class.replace(/_/g, " ")} detected with ${confidencePercent}% confidence. Detection marked on map.`,
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
      result.confidence
    )
  }

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 md:p-8 space-y-6">
          {/* Header and Audio Upload Side by Side */}
          <div className="flex flex-col md:flex-row justify-between gap-6 md:items-stretch">
            <div className="flex-shrink-0">
              <h2
                className="text-3xl md:text-4xl font-light tracking-wide"
                style={{ fontFamily: "var(--font-sentient)" }}
              >
                <span className="text-foreground">Early</span>
                <br />
                <span className="text-primary italic">Warnings</span>
                <br />
                <span className="text-foreground italic">Detection</span>
              </h2>
            </div>

            {/* let it expand instead of w-64 */}
            <div className="flex-1 max-w-md md:max-w-lg">
              <AudioUpload
                onUploadComplete={handleUploadComplete}
                disabled={!userLocation}
              />
            </div>
          </div>

          <Separator className="bg-border" />

          {/* Predictions Display Card */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-3 pt-3 px-4">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm text-primary font-medium">TOP PREDICTIONS</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              {predictions && predictions.length > 0 ? (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {predictions.map((pred, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 rounded-md bg-secondary/50 border border-border hover:border-primary/30 transition-colors"
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <span className="text-xs font-medium text-muted-foreground w-4">
                          {index + 1}
                        </span>
                        <span className="text-sm text-foreground font-medium">
                          {pred.class.replace(/_/g, " ")}
                        </span>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs font-bold",
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
                    "mt-4 p-3 rounded-md border-2 flex items-center gap-2",
                    isDroneDetected 
                      ? "border-primary bg-primary/5" 
                      : "border-muted bg-muted/20"
                  )}>
                    <TrendingUp className={cn(
                      "h-4 w-4",
                      isDroneDetected ? "text-primary" : "text-muted-foreground"
                    )} />
                    <span className={cn(
                      "text-xs font-bold",
                      isDroneDetected ? "text-primary" : "text-muted-foreground"
                    )}>
                      {isDroneDetected ? "DRONE DETECTED" : "NO DRONE DETECTED"}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Activity className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">UPLOAD AUDIO TO SEE PREDICTIONS</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Prediction Logs */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-3 pt-3 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  <CardTitle className="text-sm text-primary font-medium">PREDICTION LOGS</CardTitle>
                </div>
                {predictionLogs.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {predictionLogs.length}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              {predictionLogs.length > 0 ? (
                <div className="space-y-2 max-h-[250px] overflow-y-auto">
                  {predictionLogs.map((log) => {
                    const date = new Date(log.timestamp)
                    const timeStr = date.toLocaleTimeString('en-US', { 
                      hour: '2-digit', 
                      minute: '2-digit',
                      second: '2-digit'
                    })
                    
                    return (
                      <div
                        key={log.id}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-md border transition-colors group",
                          log.isDrone 
                            ? "bg-primary/5 border-primary/30 hover:border-primary/50" 
                            : "bg-secondary/30 border-border hover:border-border/70"
                        )}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <div className={cn(
                            "h-2 w-2 rounded-full",
                            log.isDrone ? "bg-primary" : "bg-muted-foreground"
                          )} />
                          <div className="flex-1">
                            <p className={cn(
                              "text-sm font-medium",
                              log.isDrone ? "text-primary" : "text-foreground"
                            )}>
                              {log.isDrone ? "Drone" : "No Drone"}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {timeStr}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs font-bold",
                              log.confidence > 0.7 
                                ? "border-primary/50 text-primary bg-primary/10" 
                                : "border-border text-muted-foreground"
                            )}
                          >
                            {Math.round(log.confidence * 100)}%
                          </Badge>
                          <Button
                            size="sm"
                            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive bg-transparent border-0"
                            onClick={() => handleDeleteLog(log.id)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Activity className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">NO PREDICTIONS YET</p>
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  )
}
