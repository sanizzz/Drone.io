"use client"

import React, { useState, type RefObject } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Navigation, RefreshCw } from "lucide-react"
import type { Detection } from "./RadarCard"
import type { MapPaneRef } from "./MapPane.client"
import { formatDistance } from "@/lib/geo"

interface RangeCardProps {
  detections: Detection[]
  mapRef: RefObject<MapPaneRef | null>
  onRecompute?: (detectionId: string, profile: string) => void
}

export function RangeCard({ detections, mapRef, onRecompute }: RangeCardProps) {
  const [profile, setProfile] = useState<string>("driving")
  const [hoveredDetectionId, setHoveredDetectionId] = useState<string | null>(null)

  function handleProfileChange(newProfile: string) {
    setProfile(newProfile)
    // Optionally trigger recompute for all detections
    // This could be done automatically or via a button
  }

  function handleFitRange(detectionId: string) {
    mapRef.current?.fitRange?.(detectionId)
  }

  function handleRecompute(detectionId: string) {
    if (onRecompute) {
      onRecompute(detectionId, profile)
    } else {
      // Fallback: try to get range data and redraw
      const userLoc = mapRef.current?.getUserLocation()
      if (userLoc) {
        const detection = detections.find((d) => d.id === detectionId)
        if (detection) {
          mapRef.current?.drawRange?.(
            [userLoc.lng, userLoc.lat],
            [detection.lng, detection.lat],
            profile,
            detectionId
          )
        }
      }
    }
  }

  function handleMouseEnter(detectionId: string) {
    setHoveredDetectionId(detectionId)
    // Could highlight the line here by increasing opacity
  }

  function handleMouseLeave() {
    setHoveredDetectionId(null)
  }

  // Get range data for a detection (if available via mapRef)
  function getRangeData(detectionId: string) {
    // This would ideally come from the map component
    // For now, we'll use the straight-line distance from Detection
    const detection = detections.find((d) => d.id === detectionId)
    if (!detection) return null

    return {
      straightKm: detection.distanceMeters / 1000,
      matrixMin: null as number | null, // Would come from Matrix API
      profile,
    }
  }

  return (
    <Card className="border-border bg-card flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl text-primary font-light flex items-center gap-2">
            <Navigation className="h-5 w-5" />
            Range
          </CardTitle>
          <Badge variant="outline" className="bg-primary/20 text-primary border-primary">
            {detections.length}
          </Badge>
        </div>
        <CardDescription className="text-xs text-muted-foreground">
          Travel distance and time estimates
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col space-y-3 pt-0">
        {/* Profile Selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground font-mono uppercase tracking-wide">
            Profile:
          </label>
          <Select value={profile} onValueChange={handleProfileChange}>
            <SelectTrigger className="h-8 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="driving">Driving</SelectItem>
              <SelectItem value="walking">Walking</SelectItem>
              <SelectItem value="cycling">Cycling</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Separator className="bg-border" />

        {/* Range List */}
        <div>
          <h3 className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-2">
            Detection Ranges
          </h3>

          {detections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Navigation className="h-10 w-10 text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">No ranges yet</p>
              <p className="text-[10px] text-muted-foreground/70 mt-1">
                Add detections to see ranges
              </p>
            </div>
          ) : (
            <ScrollArea className="h-48">
              <div className="space-y-2">
                {detections.map((detection) => {
                  const rangeData = getRangeData(detection.id)
                  const isHovered = hoveredDetectionId === detection.id

                  return (
                    <div
                      key={detection.id}
                      onMouseEnter={() => handleMouseEnter(detection.id)}
                      onMouseLeave={handleMouseLeave}
                      className={`
                        group p-2 rounded-lg border transition-all duration-200 cursor-pointer
                        ${
                          isHovered
                            ? "border-primary/50 bg-primary/10"
                            : "border-border bg-background hover:bg-primary/5"
                        }
                      `}
                      onClick={() => handleFitRange(detection.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <div
                              className={`h-1.5 w-1.5 rounded-full ${
                                isHovered ? "bg-primary glow" : "bg-primary"
                              }`}
                            ></div>
                            <span className="text-xs font-medium text-foreground truncate">
                              {detection.label || `Detection ${detection.id.slice(-6)}`}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span className="font-mono">
                              {formatDistance(detection.distanceMeters)} straight
                            </span>
                            {rangeData?.matrixMin !== null && (
                              <>
                                <span>•</span>
                                <span className="font-mono">
                                  ~{rangeData?.matrixMin} min ({profile})
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRecompute(detection.id)
                            }}
                            title="Recompute range"
                          >
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

