'use client'

export function Cursor() {
  return (
    <span
      aria-hidden="true"
      className="ml-0.5 inline-block h-[1.05em] w-[0.45em] translate-y-[0.08em] rounded-[2px] bg-primary/85 animate-[cursor-blink_1s_steps(1,end)_infinite]"
    />
  )
}
