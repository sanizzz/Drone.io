import dynamic from "next/dynamic"
import { LeftSlider } from "@/components/LeftSlider"

const MapPane = dynamic(() => import("@/components/MapPane.client").then((mod) => ({ default: mod.MapPane })), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-background flex items-center justify-center">
      <div className="text-muted-foreground">Loading map...</div>
    </div>
  ),
})

export default function Home() {
  return (
    <main className="split">
      <LeftSlider />
      <MapPane />
    </main>
  )
}
