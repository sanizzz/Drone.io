import type React from "react"
import type { Metadata } from "next"
import { Geist_Mono } from "next/font/google"
import localFont from "next/font/local"
import { Separator } from "@/components/ui/separator"
import "./globals.css"

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

const sentient = localFont({
  src: [
    {
      path: "../public/Sentient-Extralight.woff",
      weight: "200",
      style: "normal",
    },
    {
      path: "../public/Sentient-LightItalic.woff",
      weight: "300",
      style: "italic",
    },
  ],
  variable: "--font-sentient",
})

export const metadata: Metadata = {
  title: "Drone.io - Tactical Map",
  description: "Spots-style split interface with Mapbox Standard 3D",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${geistMono.variable} ${sentient.variable} antialiased`} suppressHydrationWarning>
        <header className="h-16 flex items-center px-6 bg-background border-b border-border">
          <h1 className="text-2xl font-light tracking-wide" style={{ fontFamily: "var(--font-sentient)" }}>
            <span className="text-primary">Drone</span>
            <span className="text-foreground">.io</span>
          </h1>
        </header>
        <Separator className="bg-border" />
        {children}
      </body>
    </html>
  )
}
