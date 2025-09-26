import { Badge } from "@/components/ui/badge"
import { CellRendererProps } from "../types"

interface SeverityCounts {
  crit?: number
  high?: number
  med?: number
  low?: number
}

export function toggleGroupCell<T>({ value, column }: CellRendererProps<T>) {
  // Handle severities/findings display
  const severities = value as SeverityCounts || {}
  const { crit = 0, high = 0, med = 0, low = 0 } = severities
  const total = crit + high + med + low

  if (total === 0) {
    return <Badge variant="outline" className="text-xs">No vulnerabilities</Badge>
  }

  return (
    <div className="flex flex-wrap gap-1">
      {crit > 0 && (
        <Badge variant="destructive" className="text-xs px-1.5 py-0.5">
          C: {crit}
        </Badge>
      )}
      {high > 0 && (
        <Badge variant="destructive" className="text-xs px-1.5 py-0.5 !bg-orange-500">
          H: {high}
        </Badge>
      )}
      {med > 0 && (
        <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
          M: {med}
        </Badge>
      )}
      {low > 0 && (
        <Badge variant="outline" className="text-xs px-1.5 py-0.5">
          L: {low}
        </Badge>
      )}
    </div>
  )
}