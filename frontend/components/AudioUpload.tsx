"use client"

import React, { useCallback, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Upload, FileAudio, CheckCircle2, XCircle, Loader2, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface AudioUploadProps {
  onDroneDetected?: (confidence: number) => void
  onUploadComplete?: (result: { isDrone: boolean; confidence?: number }) => void
  disabled?: boolean
}

interface ClassificationResult {
  class: string
  confidence: number
}

export function AudioUpload({ onDroneDetected, onUploadComplete, disabled }: AudioUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [result, setResult] = useState<{
    predictions: ClassificationResult[]
    isDrone: boolean
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith(".wav")) {
        setError("Please upload a .wav file")
        return
      }

      setIsUploading(true)
      setUploadProgress(0)
      setResult(null)
      setError(null)

      try {
        // Simulate upload and processing
        const progressInterval = setInterval(() => {
          setUploadProgress((prev) => Math.min(prev + 10, 90))
        }, 100)

        // Simulate processing delay
        await new Promise((resolve) => setTimeout(resolve, 2000))

        clearInterval(progressInterval)
        setUploadProgress(100)

        // DEMO MODE: Generate random predictions
        // 60% chance of detecting a drone for demo purposes
        const isDroneDetected = Math.random() > 0.4
        
        const predictions: ClassificationResult[] = isDroneDetected
          ? [
              { class: "drone", confidence: 0.75 + Math.random() * 0.2 },
              { class: "helicopter", confidence: 0.15 + Math.random() * 0.1 },
              { class: "airplane", confidence: 0.08 + Math.random() * 0.05 },
              { class: "engine", confidence: 0.05 + Math.random() * 0.03 },
              { class: "wind", confidence: 0.02 + Math.random() * 0.02 },
            ]
          : [
              { class: "wind", confidence: 0.45 + Math.random() * 0.2 },
              { class: "birds", confidence: 0.25 + Math.random() * 0.15 },
              { class: "traffic", confidence: 0.15 + Math.random() * 0.1 },
              { class: "rain", confidence: 0.08 + Math.random() * 0.05 },
              { class: "voices", confidence: 0.04 + Math.random() * 0.03 },
            ]

        const droneDetection = predictions.find((p) => 
          p.class.toLowerCase().includes("drone") || 
          p.class.toLowerCase().includes("helicopter")
        )
        
        setResult({
          predictions,
          isDrone: isDroneDetected,
        })

        // Trigger upload complete callback to create ONE marker
        const confidence = droneDetection?.confidence
        setTimeout(() => {
          onUploadComplete?.({
            isDrone: isDroneDetected,
            confidence,
          })
        }, 500)
      } catch (err) {
        console.error("Upload error:", err)
        setError(err instanceof Error ? err.message : "Upload failed")
      } finally {
        setIsUploading(false)
        setTimeout(() => setUploadProgress(0), 2000)
      }
    },
    [onDroneDetected, onUploadComplete]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)

      const file = e.dataTransfer.files[0]
      if (file) {
        handleFile(file)
      }
    },
    [handleFile]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        handleFile(file)
      }
    },
    [handleFile]
  )

  return (
    <Card className="border-border bg-card flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl text-primary font-light flex items-center gap-2">
          <FileAudio className="h-5 w-5" />
          Audio Upload
        </CardTitle>
        <CardDescription className="text-xs text-muted-foreground">
          Upload .wav audio to simulate drone detection (Demo Mode)
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col space-y-3 pt-0">
        {/* Upload Area */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            "min-h-[150px] border-2 border-dashed rounded-lg flex flex-col items-center justify-center p-4 transition-colors",
            isDragging
              ? "border-primary bg-primary/10"
              : "border-border hover:border-primary/50",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          {isUploading ? (
            <div className="flex flex-col items-center gap-3 w-full">
              <Loader2 className="h-10 w-10 text-primary animate-spin" />
              <div className="w-full space-y-1.5">
                <Progress value={uploadProgress} className="h-1.5" />
                <p className="text-xs text-center text-muted-foreground">
                  Analyzing... {uploadProgress}%
                </p>
              </div>
            </div>
          ) : (
            <>
              <Upload className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-xs text-center text-foreground mb-1.5">
                Drag & drop .wav file
              </p>
              <p className="text-[10px] text-center text-muted-foreground mb-3">or</p>
              <label htmlFor="file-upload" className="cursor-pointer">
                <Button
                  type="button"
                  size="sm"
                  className="border border-primary text-primary hover:bg-primary hover:text-primary-foreground bg-transparent"
                  disabled={disabled}
                >
                  Browse Files
                </Button>
              </label>
              <input
                id="file-upload"
                type="file"
                accept=".wav,audio/wav"
                className="hidden"
                onChange={handleFileInput}
                disabled={disabled}
              />
              <p className="text-[10px] text-center text-muted-foreground mt-3">
                Demo: 60% detection rate
              </p>
            </>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/50">
            <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Results Display */}
        {result && (
          <div className="space-y-3">
            <div
              className={cn(
                "flex items-center gap-2 p-3 rounded-lg border",
                result.isDrone
                  ? "bg-primary/10 border-primary/50"
                  : "bg-muted border-border"
              )}
            >
              {result.isDrone ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-primary">Drone Detected!</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Marker added to map
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">No Drone Detected</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Try another audio file
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Top Predictions */}
            <div className="space-y-2">
              <h4 className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
                Top Predictions
              </h4>
              <div className="space-y-1.5">
                {result.predictions.map((pred, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 rounded bg-muted/50"
                  >
                    <span className="text-sm text-foreground capitalize">
                      {pred.class.replace(/_/g, " ")}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        pred.confidence > 0.7 ? "border-primary/50 text-primary" : ""
                      )}
                    >
                      {Math.round(pred.confidence * 100)}%
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

