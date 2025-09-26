import { CellRendererProps } from "../types"
import { formatDate } from "../utils"

export function scanDateCell<T>({ value, row }: CellRendererProps<T>) {
  const data = row.original as any

  if (!value) return <span>N/A</span>

  return (
    <div className="flex flex-col">
      <span className="text-sm font-medium">{formatDate(value)}</span>
      {data.scanVersion && (
        <span className="text-xs text-muted-foreground">Version: {data.scanVersion}</span>
      )}
      {data.scanEngine && (
        <span className="text-xs text-muted-foreground">Engine: {data.scanEngine}</span>
      )}
    </div>
  )
}