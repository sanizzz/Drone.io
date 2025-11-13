"use client"

import React from "react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface RangeBadgeProps {
  straightKm: number
  matrixMin: number
  profile: string
  onClick?: () => void
  className?: string
}

export function RangeBadge({
  straightKm,
  matrixMin,
  profile,
  onClick,
  className,
}: RangeBadgeProps) {
  const profileLabel = profile.charAt(0).toUpperCase() + profile.slice(1)

  return (
    <Card
      className={cn(
        "range-label cursor-pointer border-primary/50 bg-background/95 backdrop-blur-sm px-2 py-1 shadow-lg transition-all hover:border-primary hover:bg-background",
        className
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-1.5 text-xs font-mono">
        <span className="text-primary font-semibold">{straightKm.toFixed(1)} km</span>
        <span className="text-muted-foreground">•</span>
        <span className="text-foreground">{Math.round(matrixMin)} min</span>
        <span className="text-muted-foreground">({profileLabel})</span>
      </div>
    </Card>
  )
}

