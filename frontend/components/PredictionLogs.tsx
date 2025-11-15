"use client"

import React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Activity, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface PredictionLog {
  id: string
  timestamp: number
  isDrone: boolean
  confidence: number
}

interface PredictionLogsProps {
  logs: PredictionLog[]
  onDeleteLog: (logId: string) => void
}

export function PredictionLogs({ logs, onDeleteLog }: PredictionLogsProps) {
  return (
    <div className="absolute bottom-4 right-4 w-80 max-w-[calc(100vw-2rem)] z-[1000] pointer-events-auto">
      <Card className="border-border bg-card/95 backdrop-blur-sm shadow-xl">
        <CardHeader className="pb-1.5 pt-1.5 sm:pb-2 sm:pt-2 px-2 sm:px-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Activity className="h-3 w-3 text-primary" />
              <CardTitle className="text-[10px] sm:text-xs text-primary font-medium">PREDICTION LOGS</CardTitle>
            </div>
            {logs.length > 0 && (
              <Badge variant="outline" className="text-[10px]">
                {logs.length}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-2 sm:px-3 pb-2 sm:pb-3 pt-0">
          {logs.length > 0 ? (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {logs.map((log) => {
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
                      "flex items-center justify-between p-1.5 sm:p-2 rounded-md border transition-colors group",
                      log.isDrone 
                        ? "bg-primary/5 border-primary/30 hover:border-primary/50" 
                        : "bg-secondary/30 border-border hover:border-border/70"
                    )}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className={cn(
                        "h-1.5 w-1.5 rounded-full flex-shrink-0",
                        log.isDrone ? "bg-primary" : "bg-muted-foreground"
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "text-[10px] sm:text-xs font-medium truncate",
                          log.isDrone ? "text-primary" : "text-foreground"
                        )}>
                          {log.isDrone ? "Drone" : "No Drone"}
                        </p>
                        <p className="text-[9px] text-muted-foreground">
                          {timeStr}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] font-bold",
                          log.confidence > 0.7 
                            ? "border-primary/50 text-primary bg-primary/10" 
                            : "border-border text-muted-foreground"
                        )}
                      >
                        {Math.round(log.confidence * 100)}%
                      </Badge>
                      <Button
                        size="sm"
                        className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive bg-transparent border-0"
                        onClick={() => onDeleteLog(log.id)}
                      >
                        <X className="h-2.5 w-2.5" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-4">
              <Activity className="h-6 w-6 text-muted-foreground/30 mx-auto mb-1" />
              <p className="text-[10px] text-muted-foreground">NO PREDICTIONS YET</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
