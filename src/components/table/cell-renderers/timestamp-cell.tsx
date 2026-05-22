import { CellRendererProps } from "../types"
import { formatDate, formatRelativeTime } from "../utils"

export function timestampCell<T>({ value, column }: CellRendererProps<T>) {
  const showRelative = column.cellProps?.showRelative ?? false

  if (!value) return <span className="text-caption uppercase tracking-widest text-muted-foreground/40">N/A</span>

  return (
    <div className="flex flex-col">
      <span className="text-body-sm text-foreground">{formatDate(value)}</span>
      {showRelative && (
        <span className="text-caption uppercase tracking-widest text-muted-foreground/60">{formatRelativeTime(value)}</span>
      )}
    </div>
  )
}
