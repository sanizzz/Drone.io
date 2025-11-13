"use client"

import React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel"
import { ChevronLeft, ChevronRight } from "lucide-react"

const features = [
  {
    id: 1,
    title: "Real-Time Tracking",
    description: "Monitor drone positions and status in real-time with advanced GPS tracking.",
  },
  {
    id: 2,
    title: "3D Visualization",
    description: "Experience immersive 3D maps with realistic building models and terrain.",
  },
  {
    id: 3,
    title: "Mission Planning",
    description: "Plan and execute autonomous flight missions with precision waypoint control.",
  },
  {
    id: 4,
    title: "Fleet Management",
    description: "Coordinate multiple drones simultaneously with intelligent task distribution.",
  },
  {
    id: 5,
    title: "Advanced Analytics",
    description: "Gain insights from flight data with comprehensive analytics and reporting.",
  },
]

export function LeftSlider() {
  const [api, setApi] = React.useState<CarouselApi>()
  const [current, setCurrent] = React.useState(0)
  const [count, setCount] = React.useState(0)

  React.useEffect(() => {
    if (!api) return

    setCount(api.scrollSnapList().length)
    setCurrent(api.selectedScrollSnap())

    api.on("select", () => {
      setCurrent(api.selectedScrollSnap())
    })
  }, [api])

  function handleDotClick(index: number) {
    api?.scrollTo(index)
  }

  return (
    <div className="flex flex-col h-full bg-background p-6 md:p-8 lg:p-12">
      <div className="flex-1 flex flex-col justify-center">
        <h2
          className="text-4xl md:text-5xl lg:text-6xl font-light mb-8 tracking-wide"
          style={{ fontFamily: "var(--font-sentient)" }}
        >
          <span className="text-primary">Tactical</span>
          <br />
          <span className="text-foreground italic">Operations</span>
        </h2>

        <Carousel
          setApi={setApi}
          className="w-full"
          opts={{
            align: "start",
            loop: true,
          }}
        >
          <CarouselContent>
            {features.map((feature) => (
              <CarouselItem key={feature.id}>
                <Card className="border-border bg-card hover:border-primary/50 transition-colors duration-300">
                  <CardHeader>
                    <CardTitle className="text-2xl text-primary font-light">
                      {feature.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-base text-muted-foreground leading-relaxed">
                      {feature.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              </CarouselItem>
            ))}
          </CarouselContent>

          <div className="flex items-center justify-between mt-8">
            <CarouselPrevious
              className="relative left-0 translate-x-0 translate-y-0 border-border hover:bg-primary hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-primary"
              variant="outline"
            >
              <ChevronLeft className="h-4 w-4" />
            </CarouselPrevious>

            <div className="flex gap-2" role="tablist" aria-label="Slide navigation">
              {Array.from({ length: count }).map((_, index) => (
                <button
                  key={index}
                  onClick={() => handleDotClick(index)}
                  className={`h-2 rounded-full transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    index === current
                      ? "w-8 bg-primary glow"
                      : "w-2 bg-border hover:bg-primary/50"
                  }`}
                  aria-label={`Go to slide ${index + 1}`}
                  aria-current={index === current ? "true" : "false"}
                  role="tab"
                />
              ))}
            </div>

            <CarouselNext
              className="relative right-0 translate-x-0 translate-y-0 border-border hover:bg-primary hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-primary"
              variant="outline"
            >
              <ChevronRight className="h-4 w-4" />
            </CarouselNext>
          </div>
        </Carousel>
      </div>
    </div>
  )
}

