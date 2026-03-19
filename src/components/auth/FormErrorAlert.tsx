'use client'

export function FormErrorAlert({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
      {message}
    </div>
  )
}
