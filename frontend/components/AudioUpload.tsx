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
  onUploadComplete?: (result: {
    isDrone: boolean
    confidence?: number
    predictions?: ClassificationResult[]
    distance?: number | null
    ci?: [number, number] | null
    bpf_hz?: number | null
    binaryConfidence?: number
  }) => void
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
        // Update progress during upload
        const progressInterval = setInterval(() => {
          setUploadProgress((prev) => Math.min(prev + 10, 90))
        }, 200)

        // ===== DEMO MODE: Random Realistic Predictions =====
        console.log("🎬 Generating realistic demo predictions...")
        
        // Simulate upload progress
        await new Promise(resolve => setTimeout(resolve, 800))
        clearInterval(progressInterval)
        setUploadProgress(100)
        
        // Simulate processing delay (realistic API latency)
        await new Promise(resolve => setTimeout(resolve, 600))
        
        // Generate random drone class
        const droneClasses = ['drone_A', 'drone_B', 'drone_C', 'drone_D', 'drone_E', 
                             'drone_F', 'drone_G', 'drone_H', 'drone_I', 'drone_J']
        const topDrone = droneClasses[Math.floor(Math.random() * droneClasses.length)]
        
        // Generate realistic confidence scores (top prediction is highest)
        const topConfidence = 0.75 + Math.random() * 0.20 // 75-95%
        const secondConfidence = 0.03 + Math.random() * 0.08 // 3-11%
        const thirdConfidence = 0.01 + Math.random() * 0.04 // 1-5%
        
        // Pick 2 random other drones for second/third place
        const otherDrones = droneClasses.filter(d => d !== topDrone)
        const secondDrone = otherDrones[Math.floor(Math.random() * otherDrones.length)]
        const thirdDrone = otherDrones.filter(d => d !== secondDrone)[Math.floor(Math.random() * (otherDrones.length - 1))]
        
        // Generate random distance (50m - 300m)
        const distance = 50 + Math.random() * 250
        const uncertainty = 20 + Math.random() * 40 // ±20-60m
        const ciLow = distance - uncertainty
        const ciHigh = distance + uncertainty
        
        // Generate random BPF (80-600 Hz for small multirotors)
        const bpf = 80 + Math.random() * 520
        
        // Hardcoded drone detection response with RANDOM values
        const data = {
          is_drone: true,
          binary_confidence: 0.92 + Math.random() * 0.07, // 92-99%
          predictions: [
            { class: topDrone, confidence: topConfidence },
            { class: secondDrone, confidence: secondConfidence },
            { class: thirdDrone, confidence: thirdConfidence }
          ],
          distance_m: Math.round(distance * 10) / 10,
          ci: [Math.round(ciLow * 10) / 10, Math.round(ciHigh * 10) / 10],
          confidence_distance: 0.75 + Math.random() * 0.20, // 75-95%
          bpf_hz: Math.round(bpf * 10) / 10
        }
        
        console.log("📥 Demo Response:", data)
        
        const isDroneDetected = data.is_drone
        const predictions: ClassificationResult[] = data.predictions || []
        
        console.log("✅ Parsed data:", {
          isDrone: isDroneDetected,
          predictions: predictions,
          distance: data.distance_m,
          confidence: data.binary_confidence
        })
        
        setResult({
          predictions,
          isDrone: isDroneDetected,
        })

        // Trigger upload complete callback with full response data
        const confidence = predictions.length > 0 ? predictions[0].confidence : data.binary_confidence
        setTimeout(() => {
          onUploadComplete?.({
            isDrone: isDroneDetected,
            confidence,
            predictions,
            distance: data.distance_m,
            ci: data.ci,
            bpf_hz: data.bpf_hz,
            binaryConfidence: data.binary_confidence
          })
        }, 500)
        // ===== END DEMO MODE =====
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
    <Card className="border-border bg-card">
      <CardContent className="p-2">
        {/* Upload Area */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            "h-[50px] border border-dashed rounded-md flex items-center justify-center gap-2 px-2 transition-all",
            isDragging
              ? "border-primary bg-primary/10 scale-[1.02]"
              : "border-border hover:border-primary/50 hover:bg-primary/5",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          {isUploading ? (
            <div className="flex items-center gap-3 w-full">
              <Loader2 className="h-5 w-5 text-primary animate-spin flex-shrink-0" />
              <div className="flex-1 space-y-1">
                <Progress value={uploadProgress} className="h-1" />
                <p className="text-[10px] text-muted-foreground">
                  Analyzing... {uploadProgress}%
                </p>
              </div>
            </div>
          ) : (
            <>
              <Upload className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-foreground font-medium truncate">
                  Drag & drop .wav file
                </p>
                <p className="text-[9px] text-muted-foreground">
                  or click to browse
                </p>
              </div>
              <input
                id="file-upload"
                type="file"
                accept=".wav,audio/wav"
                className="hidden"
                onChange={handleFileInput}
                disabled={disabled}
              />
              <label htmlFor="file-upload" className="cursor-pointer flex-shrink-0">
                <Button
                  type="button"
                  size="sm"
                  className="border border-primary text-primary hover:bg-primary hover:text-primary-foreground bg-transparent h-6 text-[9px] px-2"
                  disabled={disabled}
                  asChild
                >
                  <span>Browse</span>
                </Button>
              </label>
            </>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="flex items-center gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/50">
            <AlertCircle className="h-3 w-3 text-destructive flex-shrink-0" />
            <p className="text-[10px] text-destructive">{error}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

