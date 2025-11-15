import type React from "react"
import type { Metadata } from "next"
import { Separator } from "@/components/ui/separator"
import { Toaster } from "@/components/ui/toaster"
import "./globals.css"

export const metadata: Metadata = {
  title: "AURALIS",
  description: "Spots-style split interface with Mapbox Standard 3D",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="antialiased" suppressHydrationWarning>
        <header className="h-16 flex items-center px-6 bg-background border-b border-border">
          <h1 className="text-2xl font-light tracking-wide">
            <span className="text-foreground">ARUAL</span>
            <span className="text-primary">IS</span>
          </h1>
        </header>
        <Separator className="bg-border" />
        {children}
        <Toaster />
      </body>
    </html>
  )
}
