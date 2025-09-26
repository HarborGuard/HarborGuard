import { Badge } from "@/components/ui/badge"
import { CellRendererProps } from "../types"

export function interactiveBadgeCell<T>({ value, column, row }: CellRendererProps<T>) {
  const onClick = column.cellProps?.onClick
  const labelProp = column.cellProps?.label
  const variantProp = column.cellProps?.variant

  // Handle label as either a function or a direct value
  const label = typeof labelProp === 'function'
    ? labelProp(value)
    : (labelProp || value?.toString() || "0")

  // Handle variant as either a function or a direct value
  const variant = typeof variantProp === 'function'
    ? variantProp(value)
    : (variantProp || "default")

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onClick) {
      onClick(row.original, value)
    }
  }

  return (
    <Badge
      variant={variant as any}
      className={onClick ? "cursor-pointer hover:opacity-80" : ""}
      onClick={onClick ? handleClick : undefined}
    >
      {label}
    </Badge>
  )
}