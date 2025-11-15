"use client"

import React, { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, Shield, AlertOctagon, Radio, Eye, Activity } from "lucide-react"
import { cn } from "@/lib/utils"

interface OperatorAnalyticsProps {
  detections: number
  recentDroneDetections: number
}

export function OperatorAnalytics({ detections, recentDroneDetections }: OperatorAnalyticsProps) {
  const analytics = useMemo(() => {
    if (recentDroneDetections >= 3) {
      return {
        level: "HIGH",
        color: "text-red-500",
        bgColor: "bg-red-500/10",
        borderColor: "border-red-500/50",
        icon: AlertOctagon,
        status: "CRITICAL ALERT",
        recommendation: "Multiple drone threats detected. Increase surveillance and prepare countermeasures.",
        actions: [
          "Activate perimeter defense",
          "Alert security personnel",
          "Initiate tracking protocols"
        ]
      }
    } else if (recentDroneDetections >= 1) {
      return {
        level: "MEDIUM",
        color: "text-yellow-500",
        bgColor: "bg-yellow-500/10",
        borderColor: "border-yellow-500/50",
        icon: AlertTriangle,
        status: "ELEVATED ALERT",
        recommendation: "Drone activity detected. Monitor closely and verify threat classification.",
        actions: [
          "Enhance monitoring range",
          "Verify target identification",
          "Prepare response teams"
        ]
      }
    } else {
      return {
        level: "LOW",
        color: "text-green-500",
        bgColor: "bg-green-500/10",
        borderColor: "border-green-500/50",
        icon: Shield,
        status: "NORMAL OPERATIONS",
        recommendation: "No immediate threats detected. Continue routine surveillance and monitoring.",
        actions: [
          "Maintain standard patrol",
          "Regular system checks",
          "Continue audio monitoring"
        ]
      }
    }
  }, [recentDroneDetections])

  const Icon = analytics.icon

  return (
    <Card className="border-border bg-card flex-shrink-0">
      <CardHeader className="pb-1 pt-1 sm:pb-1.5 sm:pt-1.5 px-1.5 sm:px-2">
        <div className="flex items-center gap-1">
          <Activity className="h-2.5 w-2.5 text-primary" />
          <CardTitle className="text-[9px] sm:text-[10px] text-primary font-medium">OPERATOR ANALYTICS</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-1.5 sm:px-2 pb-1.5 sm:pb-2 pt-0 space-y-1.5">
        {/* Threat Level Badge */}
        <div className={cn(
          "p-1.5 sm:p-2 rounded-md border-2 flex items-center justify-between",
          analytics.borderColor,
          analytics.bgColor
        )}>
          <div className="flex items-center gap-1.5">
            <Icon className={cn("h-3.5 w-3.5", analytics.color)} />
            <div className="flex flex-col">
              <span className={cn("text-[10px] font-bold leading-tight", analytics.color)}>
                {analytics.status}
              </span>
              <span className="text-[8px] text-muted-foreground">Threat Level: {analytics.level}</span>
            </div>
          </div>
          <div className="flex gap-1.5">
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-bold text-foreground">{detections}</span>
              <span className="text-[7px] text-muted-foreground">TOTAL</span>
            </div>
            <div className="w-px bg-border" />
            <div className="flex flex-col items-center">
              <span className={cn("text-[10px] font-bold", analytics.color)}>{recentDroneDetections}</span>
              <span className="text-[7px] text-muted-foreground">ACTIVE</span>
            </div>
          </div>
        </div>

        {/* Recommendation */}
        <div className="p-1.5 sm:p-2 rounded-md bg-secondary/50 border border-border">
          <div className="flex items-start gap-1">
            <Eye className="h-2.5 w-2.5 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-[8px] font-medium text-primary mb-0.5">RECOMMENDATION</p>
              <p className="text-[9px] text-foreground leading-relaxed">
                {analytics.recommendation}
              </p>
            </div>
          </div>
        </div>

        {/* Suggested Actions */}
        <div className="p-1.5 sm:p-2 rounded-md bg-secondary/30 border border-border">
          <div className="flex items-start gap-1">
            <Radio className="h-2.5 w-2.5 text-primary mt-0.5 flex-shrink-0" />
            <div className="w-full">
              <p className="text-[8px] font-medium text-primary mb-1">SUGGESTED ACTIONS</p>
              <div className="space-y-0.5">
                {analytics.actions.map((action, index) => (
                  <div key={index} className="flex items-start gap-1">
                    <span className="text-[8px] text-muted-foreground mt-0.5">•</span>
                    <span className="text-[9px] text-foreground leading-relaxed">{action}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
