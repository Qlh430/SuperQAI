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
      "peer relative inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg",
      "before:absolute before:h-[1.375rem] before:w-[2.5rem] before:rounded-full before:border before:border-border before:bg-input before:shadow-inset",
      "transition-[background,box-shadow,border-color] duration-200",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      "data-disabled:cursor-not-allowed data-disabled:opacity-50",
      "data-checked:before:[background:var(--neon-gradient)] data-checked:before:border-transparent",
      "data-checked:before:[box-shadow:var(--shadow-neon)]",
      className
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        "pointer-events-none absolute left-[0.25rem] block h-[1rem] w-[1rem] rounded-full bg-background",
        "[box-shadow:0_0.0625rem_0.125rem_oklch(0_0_0_/_0.5)]",
        "transition-transform duration-200",
        "data-checked:translate-x-[1.25rem]",
        "data-unchecked:translate-x-0",
      )}
    />
  </SwitchPrimitive.Root>
))
Switch.displayName = "Switch"

export { Switch }
