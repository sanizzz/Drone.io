"use client"

import React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from "recharts"
import { formatDistance, bearingToDirection } from "@/lib/geo"
import { Target, Clock } from "lucide-react"

export interface Detection {
  id: string
  lng: number
  lat: number
  distanceMeters: number
  bearingDeg: number
  timestamp: number
  label?: string
  confidence?: number
}

interface RadarCardProps {
  detections: Detection[]
  userLocation: { lng: number; lat: number } | null
  onDetectionClick: (detection: Detection) => void
}

export function RadarCard({ detections = [], userLocation, onDetectionClick }: RadarCardProps) {
  // Prepare radar chart data (8 compass directions)
  const radarData = React.useMemo(() => {
    const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    const data = directions.map((direction, index) => {
      const bearing = index * 45
      
      // Find detections in this direction (±22.5 degrees)
      const detectionsInDirection = (detections || []).filter((d) => {
        const diff = Math.abs(d.bearingDeg - bearing)
        return diff <= 22.5 || diff >= 337.5
      })
      
      // Get the nearest detection in this direction
      const nearest = detectionsInDirection.sort((a, b) => a.distanceMeters - b.distanceMeters)[0]
      
      return {
        direction,
        bearing,
        distance: nearest ? nearest.distanceMeters : 0,
        count: detectionsInDirection.length,
      }
    })
    
    return data
  }, [detections])

  // Sort detections by distance (nearest first)
  const sortedDetections = React.useMemo(() => {
    return [...(detections || [])].sort((a, b) => a.distanceMeters - b.distanceMeters)
  }, [detections])

  // Format relative time
  function formatRelativeTime(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000)
    if (seconds < 60) return "just now"
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    return `${hours}h ago`
  }

  return (
    <Card className="border-border bg-card flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl text-primary font-light flex items-center gap-2">
            <Target className="h-5 w-5" />
            Detections
          </CardTitle>
          <Badge variant="outline" className="bg-primary/20 text-primary border-primary">
            {detections?.length || 0}
          </Badge>
        </div>
        <CardDescription className="text-xs text-muted-foreground">
          {userLocation ? "Real-time detection radar" : "Waiting for location..."}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col space-y-3 pt-0">
        {/* Radar Chart */}
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData}>
              <PolarGrid stroke="var(--border)" strokeOpacity={0.3} />
              <PolarAngleAxis
                dataKey="direction"
                tick={{ fill: "var(--foreground)", fontSize: 12 }}
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, "auto"]}
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                tickFormatter={(value) => (value > 0 ? `${Math.round(value)}m` : "")}
              />
              <Radar
                name="Detection Distance"
                dataKey="distance"
                stroke="var(--primary)"
                fill="var(--primary)"
                fillOpacity={0.3}
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <Separator className="bg-border" />

        {/* Detection List */}
        <div>
          <h3 className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-2">
            Recent Detections
          </h3>
          
          {!detections || detections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Target className="h-10 w-10 text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">No detections yet</p>
              <p className="text-[10px] text-muted-foreground/70 mt-1">
                Upload audio to see detections
              </p>
            </div>
          ) : (
            <ScrollArea className="h-40">
              <div className="space-y-2">
                {sortedDetections.map((detection, index) => (
                  <div
                    key={detection.id}
                    onClick={() => onDetectionClick(detection)}
                    className="group p-2 rounded-lg border border-border bg-background hover:bg-primary/10 hover:border-primary/50 cursor-pointer transition-all duration-200"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <div className="h-1.5 w-1.5 rounded-full bg-primary"></div>
                          <span className="text-xs font-medium text-foreground truncate">
                            {detection.label || `Detection ${index + 1}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span className="font-mono">{formatDistance(detection.distanceMeters)}</span>
                          <span>•</span>
                          <span>{bearingToDirection(detection.bearingDeg)}</span>
                          {detection.confidence && (
                            <>
                              <span>•</span>
                              <span>{Math.round(detection.confidence * 100)}%</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="h-2.5 w-2.5" />
                        <span>{formatRelativeTime(detection.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

