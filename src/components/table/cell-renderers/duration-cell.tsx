import { IconClock } from "@tabler/icons-react"
import { CellRendererProps } from "../types"

export function durationCell<T>({ value }: CellRendererProps<T>) {
  if (!value) return <span>N/A</span>

  // Parse duration - can be in seconds, milliseconds, or already formatted
  let formattedDuration = value

  if (typeof value === 'number') {
    // Assume milliseconds if > 1000, otherwise seconds
    const totalSeconds = value > 1000 ? Math.floor(value / 1000) : value
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60

    if (minutes > 0) {
      formattedDuration = `${minutes}m ${seconds}s`
    } else {
      formattedDuration = `${seconds}s`
    }
  }

  return (
    <div className="flex items-center gap-1">
      <IconClock className="h-3 w-3 text-muted-foreground" />
      <span className="text-sm">{formattedDuration}</span>
    </div>
  )
}