import { Badge } from "@/components/ui/badge"
import { CellRendererProps } from "../types"
import { getRiskScoreVariant, getSeverityVariant } from "../utils"

export function badgeCell<T>({ value, column }: CellRendererProps<T>) {
  const { variant, className } = column.cellProps || {}

  let badgeVariant = variant || "default"

  // Auto-detect variant based on value type
  if (!variant && typeof value === "number") {
    // Risk score
    badgeVariant = getRiskScoreVariant(value) as any
  } else if (!variant && typeof value === "string") {
    // Severity
    badgeVariant = getSeverityVariant(value) as any
  }

  return (
    <Badge variant={badgeVariant} className={className}>
      {value}
    </Badge>
  )
}