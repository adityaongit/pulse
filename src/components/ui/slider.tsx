"use client"

import * as React from "react"
import { cn } from "cn"
import { Slider as SliderPrimitive } from "radix-ui"

/** One-thumb slider: a 4 px track, a white thumb with a 44 px hit area. `aria-label` and `aria-valuetext` go on the thumb (the role="slider"). */
function Slider({ className, "aria-label": label, "aria-valuetext": valueText, ...props }: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn("relative flex h-11 w-full touch-none items-center select-none data-disabled:opacity-50", className)}
      {...props}
    >
      <SliderPrimitive.Track data-slot="slider-track" className="relative h-1 grow overflow-hidden rounded-full bg-foreground/15">
        <SliderPrimitive.Range data-slot="slider-range" className="absolute h-full bg-foreground" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        data-slot="slider-thumb"
        aria-label={label}
        aria-valuetext={valueText}
        className="relative block size-5 rounded-full bg-foreground shadow-thumb outline-none after:absolute after:-inset-3 focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </SliderPrimitive.Root>
  )
}

export { Slider }
