"use client"

import React, { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, Shield, AlertOctagon } from "lucide-react"
import { cn } from "@/lib/utils"

interface ThreatLevelProps {
  detections: number
  recentDroneDetections: number
}

export function ThreatLevel({ detections, recentDroneDetections }: ThreatLevelProps) {
  const threatLevel = useMemo(() => {
    if (recentDroneDetections >= 3) {
      return { level: "HIGH", color: "text-red-500", bgColor: "bg-red-500/10", borderColor: "border-red-500/50", icon: AlertOctagon }
    } else if (recentDroneDetections >= 1) {
      return { level: "MEDIUM", color: "text-yellow-500", bgColor: "bg-yellow-500/10", borderColor: "border-yellow-500/50", icon: AlertTriangle }
    } else {
      return { level: "LOW", color: "text-green-500", bgColor: "bg-green-500/10", borderColor: "border-green-500/50", icon: Shield }
    }
  }, [recentDroneDetections])

  const Icon = threatLevel.icon

  return (
    <Card className="border-border bg-card flex-shrink-0">
      <CardHeader className="pb-1 pt-1 sm:pb-1.5 sm:pt-1.5 px-1.5 sm:px-2">
        <div className="flex items-center gap-1">
          <Icon className="h-2.5 w-2.5 text-primary" />
          <CardTitle className="text-[9px] sm:text-[10px] text-primary font-medium">THREAT LEVEL</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-1.5 sm:px-2 pb-1.5 sm:pb-2 pt-0">
        <div className={cn(
          "p-1.5 sm:p-2 rounded-md border-2 flex flex-col items-center gap-1",
          threatLevel.borderColor,
          threatLevel.bgColor
        )}>
          <Icon className={cn("h-5 w-5 sm:h-6 sm:w-6", threatLevel.color)} />
          <span className={cn("text-sm sm:text-base font-bold", threatLevel.color)}>
            {threatLevel.level}
          </span>
          <div className="flex gap-1.5 text-center w-full justify-center">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-foreground">{detections}</span>
              <span className="text-[8px] text-muted-foreground">TOTAL</span>
            </div>
            <div className="w-px bg-border" />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-foreground">{recentDroneDetections}</span>
              <span className="text-[8px] text-muted-foreground">DRONES</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
