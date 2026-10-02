import * as React from "react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/*
 * Dark Neon AI Button.
 *
 * The hero treatment lives on the `default` variant: a solid neon-green pill
 * with a subtle top→bottom gradient, an inset top highlight, and a soft layered
 * neon glow (low-alpha, large-blur falloff - not a hard ring). This same
 * material is reused, scaled down, by the filled controls (checkbox / switch /
 * radio / slider).
 */

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "text-sm font-semibold leading-none tracking-[-0.01em]",
    "rounded-[0.625rem] cursor-pointer select-none",
    "transition-[background,box-shadow,transform,color,border-color] duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50",
    "active:translate-y-px",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "[background:var(--neon-gradient)] text-primary-foreground " +
          "[box-shadow:var(--shadow-neon)] " +
          "hover:[background:var(--neon-gradient-hover)] hover:[box-shadow:var(--shadow-neon-hover)] " +
          "active:[box-shadow:var(--shadow-sm)]",
        primary:
          "[background:var(--neon-gradient)] text-primary-foreground " +
          "[box-shadow:var(--shadow-neon)] " +
          "hover:[background:var(--neon-gradient-hover)] hover:[box-shadow:var(--shadow-neon-hover)] " +
          "active:[box-shadow:var(--shadow-sm)]",
        secondary:
          "bg-secondary text-secondary-foreground " +
          "[box-shadow:var(--shadow-sm)] " +
          "hover:bg-accent hover:text-foreground hover:[box-shadow:var(--shadow-md)] " +
          "active:[box-shadow:var(--shadow-xs)]",
        outline:
          "bg-transparent text-foreground border border-border " +
          "hover:bg-accent hover:border-[oklch(1_0_0_/_0.18)]",
        ghost:
          "bg-transparent text-muted-foreground " +
          "hover:bg-accent hover:text-foreground",
        destructive:
          "bg-destructive text-destructive-foreground " +
          "[box-shadow:var(--shadow-sm)] " +
          "hover:brightness-110 hover:[box-shadow:var(--shadow-md)]",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-11 px-3 text-xs rounded-[0.5rem]",
        default: "h-11 px-4",
        lg: "h-11 px-6 rounded-[0.75rem]",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends Omit<ButtonPrimitive.Props, "className">,
    VariantProps<typeof buttonVariants> {
  className?: string
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    // Callers written against the Radix API pass the element to become as a
    // child: <Button asChild><Link>…</Link></Button>. Base UI has no asChild,
    // it composes through `render`. Without this the prop reaches the DOM and
    // the anchor nests inside the button instead of replacing it, which stacks
    // the icon above the label and puts a link inside a button.
    if (asChild && React.isValidElement(props.children)) {
      const { children, ...rest } = props
      return (
        <ButtonPrimitive
          ref={ref}
          className={cn(buttonVariants({ variant, size, className }))}
          {...rest}
          // After the spread, so an explicit asChild child wins over a stray
          // render prop rather than being silently replaced by it.
          // SAFETY: this branch runs only when `asChild` is set, and the caller then
          // owns passing a single element for the slot to clone.
          render={children as React.ReactElement}
        />
      )
    }

    return (
      <ButtonPrimitive
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
