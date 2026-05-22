import { CellRendererProps } from "../types"
import { formatDate } from "../utils"

export function scanDateCell<T>({ value, row }: CellRendererProps<T>) {
  const data = row.original as any

  if (!value) return <span className="text-caption uppercase tracking-widest text-muted-foreground/40">N/A</span>

  return (
    <div className="flex flex-col">
      <span className="text-body-sm text-foreground">{formatDate(value)}</span>
      {data.scanVersion && (
        <span className="text-caption uppercase tracking-widest text-muted-foreground/60">Version: {data.scanVersion}</span>
      )}
      {data.scanEngine && (
        <span className="text-caption uppercase tracking-widest text-muted-foreground/60">Engine: {data.scanEngine}</span>
      )}
    </div>
  )
}
