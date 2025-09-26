import { CellRendererProps } from "../types"

export function textCell<T>({ value }: CellRendererProps<T>) {
  return <span>{value?.toString() || ""}</span>
}