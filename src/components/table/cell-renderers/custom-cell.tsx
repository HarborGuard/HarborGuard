import { CellRendererProps } from "../types"

export function customCell<T>({ value, row, column }: CellRendererProps<T>) {
  const render = column.cellProps?.render

  if (typeof render === 'function') {
    return render(row.original)
  }

  // Fallback to displaying the value as text
  return <span>{value?.toString() || ''}</span>
}