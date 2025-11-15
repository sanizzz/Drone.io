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
  onUploadComplete?: (result: { isDrone: boolean; confidence?: number; predictions?: ClassificationResult[] }) => void
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

        // ===== MOCK DATA FOR TESTING (Comment out to use real API) =====
        await new Promise(resolve => setTimeout(resolve, 1500)) // Simulate API delay
        clearInterval(progressInterval)
        setUploadProgress(100)

        // Generate random mock predictions
        const mockClasses = [
          { class: "commercial_drone", drone: true },
          { class: "helicopter", drone: true },
          { class: "racing_drone", drone: true },
          { class: "bird", drone: false },
          { class: "airplane", drone: false },
          { class: "car_engine", drone: false },
          { class: "wind", drone: false },
        ]

        const shuffled = [...mockClasses].sort(() => Math.random() - 0.5)
        const predictions: ClassificationResult[] = shuffled.slice(0, 3).map((item, idx) => ({
          class: item.class,
          confidence: Math.random() * 0.4 + (idx === 0 ? 0.5 : 0.3), // First one gets higher confidence
        }))

        const droneDetection = predictions.find((p) => 
          p.class.toLowerCase().includes("drone") || 
          p.class.toLowerCase().includes("helicopter")
        )
        
        const isDroneDetected = droneDetection !== undefined
        
        setResult({
          predictions,
          isDrone: isDroneDetected,
        })

        const confidence = droneDetection?.confidence
        setTimeout(() => {
          onUploadComplete?.({
            isDrone: isDroneDetected,
            confidence,
            predictions,
          })
        }, 500)
        // ===== END MOCK DATA =====

        // ===== REAL API CALL (Uncomment when backend is ready) =====
        // const formData = new FormData()
        // formData.append("file", file)

        // const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL
        // if (!backendUrl) {
        //   throw new Error("Backend API URL not configured")
        // }

        // const response = await fetch(`${backendUrl}/inference`, {
        //   method: "POST",
        //   body: formData,
        // })

        // clearInterval(progressInterval)
        // setUploadProgress(100)

        // if (!response.ok) {
        //   throw new Error(`API error: ${response.status}`)
        // }

        // const data = await response.json()
        
        // // Backend returns top 3 predictions with actual confidence scores
        // const predictions: ClassificationResult[] = data.predictions || []
        
        // // Check if drone or helicopter is detected in the predictions
        // const droneDetection = predictions.find((p) => 
        //   p.class.toLowerCase().includes("drone") || 
        //   p.class.toLowerCase().includes("helicopter")
        // )
        
        // const isDroneDetected = droneDetection !== undefined
        
        // setResult({
        //   predictions,
        //   isDrone: isDroneDetected,
        // })

        // // Trigger upload complete callback to create ONE marker
        // const confidence = droneDetection?.confidence
        // setTimeout(() => {
        //   onUploadComplete?.({
        //     isDrone: isDroneDetected,
        //     confidence,
        //     predictions,
        //   })
        // }, 500)
        // ===== END REAL API CALL =====
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
      <CardContent className="p-3">
        {/* Upload Area */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            "h-[60px] border border-dashed rounded-md flex items-center justify-center gap-3 px-3 transition-all",
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
              <Upload className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-foreground font-medium truncate">
                  Drag & drop .wav file
                </p>
                <p className="text-[10px] text-muted-foreground">
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
                  className="border border-primary text-primary hover:bg-primary hover:text-primary-foreground bg-transparent h-7 text-[10px] px-3"
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

