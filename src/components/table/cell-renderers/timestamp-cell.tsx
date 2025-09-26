import { CellRendererProps } from "../types"
import { formatDate, formatRelativeTime } from "../utils"

export function timestampCell<T>({ value, column }: CellRendererProps<T>) {
  const showRelative = column.cellProps?.showRelative ?? false

  if (!value) return <span>N/A</span>

  return (
    <div className="flex flex-col">
      <span className="text-sm">{formatDate(value)}</span>
      {showRelative && (
        <span className="text-xs text-muted-foreground">{formatRelativeTime(value)}</span>
      )}
    </div>
  )
}