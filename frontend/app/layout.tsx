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
    <html lang="en" className="h-full overflow-hidden">
      <body className="antialiased overflow-hidden h-full" suppressHydrationWarning>
        <header className="h-14 sm:h-16 flex items-center px-3 sm:px-4 md:px-6 bg-background border-b border-border flex-shrink-0">
          <h1 className="text-xl sm:text-2xl font-light tracking-wide">
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
