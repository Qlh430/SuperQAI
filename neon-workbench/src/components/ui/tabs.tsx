
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"

import { cn } from "@/lib/utils"

/*
 * Dark Neon AI Tabs.
 *
 * The list is a recessed well sunk into the surface. The ACTIVE trigger is the
 * DS signature: it adopts the neon-green material (the same gradient + glow as
 * the primary Button), scaled to a tab. Inactive triggers are quiet muted text
 * that warms to the foreground on hover.
 */

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return <TabsPrimitive.Root className={cn("", className)} {...props} />
}
Tabs.displayName = "Tabs"

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      className={cn(
        "inline-flex h-11 items-center justify-center rounded-[0.75rem] bg-input p-1 text-muted-foreground [box-shadow:var(--shadow-inset)]",
        className
      )}
      {...props}
    />
  )
}
TabsList.displayName = "TabsList"

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      className={cn(
        "relative inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-[0.5625rem] px-3 py-1.5 text-sm font-medium",
        "text-muted-foreground transition-[color,background,box-shadow] duration-150",
        "hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:pointer-events-none disabled:opacity-50",
        "data-active:[background:var(--neon-gradient)] data-active:text-primary-foreground data-active:[box-shadow:var(--shadow-neon)]",
        className
      )}
      {...props}
    />
  )
}
TabsTrigger.displayName = "TabsTrigger"

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      className={cn(
        "mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className
      )}
      {...props}
    />
  )
}
TabsContent.displayName = "TabsContent"

export { Tabs, TabsList, TabsTrigger, TabsContent }
