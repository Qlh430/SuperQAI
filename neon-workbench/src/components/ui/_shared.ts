export const formFieldBase =
  "w-full rounded-[10px] px-3 text-sm " +
  "bg-input text-foreground " +
  "border border-border " +
  "placeholder:text-muted-foreground " +
  "transition-[color,box-shadow,border-color] duration-150 " +
  "[box-shadow:inset_0_1px_2px_oklch(0_0_0_/_0.4)] " +
  "hover:border-[oklch(1_0_0_/_0.16)] " +
  "focus-visible:outline-none focus-visible:border-[oklch(0.86_0.22_145_/_0.6)] " +
  "focus-visible:[box-shadow:inset_0_1px_2px_oklch(0_0_0_/_0.4),0_0_0_3px_oklch(0.86_0.22_145_/_0.18),0_4px_14px_-4px_oklch(0.86_0.22_145_/_0.22)] " +
  "disabled:cursor-not-allowed disabled:opacity-50"

export const formFieldSingleLine = "flex h-9 py-1.5"
export const formFieldMultiLine = "flex min-h-[80px] py-2 resize-y"
