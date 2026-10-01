"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

/* Checked track reuses the primary Button's neon material, scaled down. */
const Switch = React.forwardRef<
  HTMLButtonElement,
  Omit<SwitchPrimitive.Root.Props, "className"> & { className?: string }
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "peer inline-flex h-[22px] w-[40px] shrink-0 cursor-pointer items-center rounded-full border border-border",
      "bg-input [box-shadow:inset_0_1px_2px_oklch(0_0_0_/_0.4)]",
      "transition-[background,box-shadow,border-color] duration-200",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      "data-disabled:cursor-not-allowed data-disabled:opacity-50",
      "data-checked:[background:var(--neon-gradient)] data-checked:border-transparent",
      "data-checked:[box-shadow:var(--shadow-neon)]",
      className
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        "pointer-events-none block h-[16px] w-[16px] rounded-full bg-background",
        "[box-shadow:0_1px_2px_oklch(0_0_0_/_0.5)]",
        "transition-transform duration-200",
        "data-checked:translate-x-[20px]",
        "data-unchecked:translate-x-0.5"
      )}
    />
  </SwitchPrimitive.Root>
))
Switch.displayName = "Switch"

export { Switch }
