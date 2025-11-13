"use client"

import { useState, useEffect } from "react"
import dynamic from "next/dynamic"

const AdvancedMap = dynamic(() => import("@/components/advanced-map").then((mod) => mod.AdvancedMap), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-gray-900 flex items-center justify-center text-white">Loading map...</div>
  ),
})

export default function TacticalMapDashboard() {
  const [trackingStatus, setTrackingStatus] = useState<"active" | "inactive">("active")
  const [controlMode, setControlMode] = useState<"manual" | "auto">("manual")
  const [lockStatus, setLockStatus] = useState<"enabled" | "disabled">("disabled")

  const [coordinates, setCoordinates] = useState({
    latitude: 45.4215,
    longitude: -75.6972,
    altitude: 314.6,
  })

  const [currentTime, setCurrentTime] = useState("5:31")
  const [interceptTime, setInterceptTime] = useState({ hours: 0, minutes: 33, seconds: 17 })
  const [distance, setDistance] = useState(14.8)

  const [droneLevels, setDroneLevels] = useState([
    { name: "DRONE 1", value: 85 },
    { name: "DRONE 2", value: 62 },
    { name: "DRONE 3", value: 94 },
    { name: "DRONE 4", value: 45 },
  ])

  const [spectrumBars, setSpectrumBars] = useState(
    Array.from({ length: 15 }, () => Math.floor(Math.random() * 70) + 30),
  )

  useEffect(() => {
    const timeInterval = setInterval(() => {
      const now = new Date()
      const hours = now.getHours()
      const minutes = now.getMinutes()
      setCurrentTime(`${hours}:${minutes.toString().padStart(2, "0")}`)
    }, 1000)

    return () => clearInterval(timeInterval)
  }, [])

  useEffect(() => {
    const interceptInterval = setInterval(() => {
      setInterceptTime((prev) => {
        let { hours, minutes, seconds } = prev
        if (seconds > 0) {
          seconds--
        } else if (minutes > 0) {
          minutes--
          seconds = 59
        } else if (hours > 0) {
          hours--
          minutes = 59
          seconds = 59
        }
        return { hours, minutes, seconds }
      })
    }, 1000)

    return () => clearInterval(interceptInterval)
  }, [])

  useEffect(() => {
    const spectrumInterval = setInterval(() => {
      setSpectrumBars((prev) => prev.map(() => Math.floor(Math.random() * 70) + 30))
    }, 200)

    return () => clearInterval(spectrumInterval)
  }, [])

  useEffect(() => {
    const droneInterval = setInterval(() => {
      setDroneLevels((prev) =>
        prev.map((drone) => ({
          ...drone,
          value: Math.max(0, Math.min(100, drone.value + (Math.random() - 0.5) * 5)),
        })),
      )
    }, 3000)

    return () => clearInterval(droneInterval)
  }, [])

  useEffect(() => {
    const distanceInterval = setInterval(() => {
      setDistance((prev) => Math.max(0, prev - 0.01))
    }, 1000)

    return () => clearInterval(distanceInterval)
  }, [])

  const handleLocationUpdate = (lat: number, lng: number) => {
    setCoordinates((prev) => ({
      ...prev,
      latitude: lat,
      longitude: lng,
    }))
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      {/* Tablet Bezel */}
      <div className="relative w-full max-w-[1100px] aspect-[16/10] bg-gray-800 rounded-3xl p-6 shadow-2xl">
        {/* Screen */}
        <div className="relative w-full h-full bg-black rounded-2xl border border-gray-700 overflow-hidden flex flex-col">
          {/* Top Tick Marks */}
          <div
            className="h-2 w-full"
            style={{
              background:
                "repeating-linear-gradient(90deg, #4b5563 0px, #4b5563 1px, transparent 1px, transparent 8px)",
            }}
          />

          {/* Main Content Area */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left Panel - HUD */}
            <div className="w-1/3 bg-black border-r border-gray-800 overflow-hidden flex flex-col text-[10px] leading-tight">
              {/* Sector Header */}
              <div className="bg-gray-900 px-2 py-1.5 flex items-center justify-between border-b border-gray-800">
                <div className="border border-white px-1.5 py-0.5 rounded text-white uppercase font-mono text-[9px]">
                  SECTOR
                </div>
                <div className="text-white uppercase font-mono text-[9px]">OTT-0070 GMT {currentTime}</div>
              </div>

              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Coordinates and Thumbnail */}
                <div className="p-2 border-b border-gray-800 flex gap-2 flex-shrink-0">
                  <div className="flex-1 space-y-2">
                    <div className="border-b border-gray-800 pb-1.5">
                      <div className="text-gray-500 uppercase text-[8px]">LATITUDE (º)</div>
                      <div className="text-white font-mono">{coordinates.latitude.toFixed(4)}º</div>
                    </div>
                    <div className="border-b border-gray-800 pb-1.5">
                      <div className="text-gray-500 uppercase text-[8px]">LONGITUDE (º)</div>
                      <div className="text-white font-mono">{coordinates.longitude.toFixed(4)}º</div>
                    </div>
                    <div>
                      <div className="text-gray-500 uppercase text-[8px]">ALTITUDE</div>
                      <div className="text-white font-mono">{coordinates.altitude} km</div>
                    </div>
                  </div>
                  <div
                    className="w-12 h-16 border border-green-500 overflow-hidden flex-shrink-0"
                    style={{ clipPath: "polygon(0 0, 100% 0, 100% 85%, 85% 100%, 0 100%)" }}
                  >
                    <img src="/map-dubai.jpg" alt="Satellite" className="w-full h-full object-cover" />
                  </div>
                </div>

                {/* SATCOM Status */}
                <div className="p-2 border-b border-gray-800 space-y-2 flex-shrink-0">
                  <div className="font-mono text-white text-[10px]">SATCOM 2-54</div>
                  <div className="text-green-500 font-bold uppercase text-[11px]">CONNECTED</div>
                  <div className="text-green-500 text-[8px] font-mono space-y-0.5">
                    <div>TX: 14.2 GHz</div>
                    <div>RX: 11.7 GHz</div>
                  </div>

                  {/* Emission Gauges */}
                  <div className="flex gap-2 pt-1">
                    <div className="flex-1">
                      <div className="relative w-10 h-10 mx-auto border border-gray-600 rounded-full flex items-center justify-center flex-shrink-0">
                        <div className="absolute w-0.5 h-5 bg-gray-600" />
                        <div className="absolute w-5 h-0.5 bg-gray-600" />
                      </div>
                      <div className="text-gray-400 text-[7px] text-center mt-0.5">EMISSION A</div>
                      <div className="text-white text-[8px] text-center font-mono">3.2º</div>
                    </div>
                    <div className="flex-1">
                      <div className="relative w-10 h-10 mx-auto border border-gray-600 rounded-full flex items-center justify-center flex-shrink-0">
                        <div className="absolute w-0.5 h-5 bg-gray-600" />
                        <div className="absolute w-5 h-0.5 bg-gray-600" />
                      </div>
                      <div className="text-gray-400 text-[7px] text-center mt-0.5">PHASE A</div>
                      <div className="text-white text-[8px] text-center font-mono">84.4º</div>
                    </div>
                  </div>
                </div>

                {/* Drones Deployed */}
                <div className="mx-2 my-1 border border-gray-700 p-2 space-y-1 flex-shrink-0">
                  <div className="text-white uppercase text-[9px] border-l-2 border-red-500 pl-1">DRONES DEPLOYED</div>
                  {droneLevels.map((drone) => (
                    <div key={drone.name} className="space-y-0.5">
                      <div className="text-gray-400 text-[8px]">{drone.name}</div>
                      <div className="h-1 border border-gray-600 rounded-sm overflow-hidden">
                        <div
                          className="h-full bg-green-500 transition-all duration-1000"
                          style={{ width: `${drone.value}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Intercept and Distance */}
                <div className="px-2 py-1.5 border-b border-gray-800 grid grid-cols-2 gap-1.5 text-[8px] flex-shrink-0">
                  <div className="space-y-1">
                    <div className="text-gray-500 uppercase">INTERCEPT</div>
                    <div className="text-white font-mono text-[9px]">
                      {String(interceptTime.hours).padStart(2, "0")}:{String(interceptTime.minutes).padStart(2, "0")}:
                      {String(interceptTime.seconds).padStart(2, "0")}
                    </div>
                    <div className="text-gray-500 uppercase text-[7px] mt-1">CURRENT</div>
                    <div className="text-gray-400 font-mono space-y-0.5 text-[7px]">
                      <div>{coordinates.latitude.toFixed(3)}º N</div>
                      <div>{Math.abs(coordinates.longitude).toFixed(3)}º W</div>
                      <div>{Math.floor(coordinates.altitude)} km</div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-gray-500 uppercase">DIST.</div>
                    <div className="text-white font-mono text-[9px]">{distance.toFixed(1)}km</div>
                    <div className="text-gray-500 uppercase text-[7px] mt-1">PROJECTED</div>
                    <div className="text-gray-400 font-mono space-y-0.5 text-[7px]">
                      <div>{(coordinates.latitude + 0.013).toFixed(3)}º N</div>
                      <div>{Math.abs(coordinates.longitude - 0.016).toFixed(3)}º W</div>
                      <div>{Math.floor(coordinates.altitude) + 1} km</div>
                    </div>
                  </div>
                </div>

                {/* Tracking Control Lock */}
                <div className="px-2 py-1 border-b border-gray-800 space-y-1 flex-shrink-0">
                  <button
                    onClick={() => setTrackingStatus((prev) => (prev === "active" ? "inactive" : "active"))}
                    className="w-full flex items-center justify-between hover:bg-gray-900 px-1 py-0.5 rounded transition-colors"
                  >
                    <span className="text-gray-400 uppercase text-[8px]">TRACKING</span>
                    <span
                      className={`${trackingStatus === "active" ? "bg-green-500" : "bg-gray-500"} text-white px-1.5 py-0.5 rounded text-[8px] uppercase font-bold`}
                    >
                      {trackingStatus === "active" ? "Active" : "Inactive"}
                    </span>
                  </button>
                  <button
                    onClick={() => setControlMode((prev) => (prev === "manual" ? "auto" : "manual"))}
                    className="w-full flex items-center justify-between hover:bg-gray-900 px-1 py-0.5 rounded transition-colors"
                  >
                    <span className="text-gray-400 uppercase text-[8px]">CONTROL</span>
                    <span
                      className={`${controlMode === "manual" ? "bg-amber-500" : "bg-blue-500"} text-white px-1.5 py-0.5 rounded text-[8px] uppercase font-bold`}
                    >
                      {controlMode === "manual" ? "Manual" : "Auto"}
                    </span>
                  </button>
                  <button
                    onClick={() => setLockStatus((prev) => (prev === "enabled" ? "disabled" : "enabled"))}
                    className="w-full flex items-center justify-between hover:bg-gray-900 px-1 py-0.5 rounded transition-colors"
                  >
                    <span className="text-gray-400 uppercase text-[8px]">LOCK</span>
                    <span
                      className={`${lockStatus === "enabled" ? "bg-green-500" : "bg-red-500"} text-white px-1.5 py-0.5 rounded text-[8px] uppercase font-bold`}
                    >
                      {lockStatus === "enabled" ? "Enabled" : "Disabled"}
                    </span>
                  </button>
                </div>

                {/* System Status Bar */}
                <div className="mx-2 my-1 flex-shrink-0">
                  <div
                    className="bg-green-500 px-2 py-1 rounded flex items-center justify-between text-white text-[8px] uppercase font-bold"
                    style={{ boxShadow: "0 0 12px rgba(34, 197, 94, 0.6)" }}
                  >
                    <span>Functional</span>
                    <span>Running Smoothly</span>
                  </div>
                </div>

                {/* Audio Spectrum */}
                <div className="px-2 py-1.5 border-b border-gray-800 flex-shrink-0">
                  <div className="border border-gray-700 p-1.5 rounded">
                    <div className="flex items-end justify-between gap-0.5 h-10">
                      {spectrumBars.map((height, i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-sm transition-all duration-200"
                          style={{
                            height: `${height}%`,
                            background: "linear-gradient(to top, #22c55e, #eab308, #ef4444)",
                          }}
                        />
                      ))}
                    </div>
                    <div className="text-gray-500 text-[7px] uppercase mt-0.5 text-center">SPECTRUM</div>
                  </div>
                </div>

                {/* Circular Control Joystick */}
                <div className="p-1.5 flex-1 flex flex-col justify-end">
                  <div className="bg-gray-900 border border-gray-700 rounded p-1.5">
                    <div className="text-white uppercase text-[8px] mb-1">CONTROL</div>
                    <div className="flex gap-1">
                      <div className="flex-1">
                        <div className="relative w-full aspect-square border border-gray-500 rounded-full flex items-center justify-center">
                          <div className="absolute w-0.5 h-full bg-gray-600" />
                          <div className="absolute w-full h-0.5 bg-gray-600" />
                          <div className="w-0.5 h-0.5 bg-gray-400 rounded-full" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-0.5">
                        {[1, 2, 3, 4].map((i) => (
                          <button
                            key={i}
                            className="w-4 h-4 border border-gray-500 rounded flex items-center justify-center hover:bg-gray-700 transition-colors"
                          >
                            <div className="w-0.5 h-0.5 bg-gray-400 rounded-full" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Panel - Interactive Map */}
            <div className="flex-1 relative">
              <AdvancedMap
                latitude={coordinates.latitude}
                longitude={coordinates.longitude}
                zoom={13}
                onLocationUpdate={handleLocationUpdate}
              />
            </div>
          </div>

          {/* Bottom Tick Marks */}
          <div
            className="h-2 w-full"
            style={{
              background:
                "repeating-linear-gradient(90deg, #4b5563 0px, #4b5563 1px, transparent 1px, transparent 8px)",
            }}
          />
        </div>
      </div>
    </div>
  )
}
