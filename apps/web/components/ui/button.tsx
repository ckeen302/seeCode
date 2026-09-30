import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

// Section 18.4: heights 32 (sm) / 36 (md); primary, secondary, ghost, danger.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: "bg-accent text-on-accent hover:bg-accent/90",
        secondary: "bg-surface-2 text-text hover:bg-border",
        ghost: "text-text hover:bg-surface-2",
        danger: "bg-error text-on-accent hover:bg-error/90",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-9 px-4 text-sm",
        "icon-sm": "size-8",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
)

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** Keyboard hint shown on the right, e.g. "⌘↵". */
    shortcut?: string
  }

function Button({
  className,
  variant,
  size,
  asChild = false,
  shortcut,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      <Slot.Slottable>{children}</Slot.Slottable>
      {shortcut ? (
        <kbd aria-hidden className="font-mono text-xs opacity-70">
          {shortcut}
        </kbd>
      ) : null}
    </Comp>
  )
}

export { Button, buttonVariants }
