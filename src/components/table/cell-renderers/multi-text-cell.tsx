import { CellRendererProps } from "../types"

export function multiTextCell<T>({ value, column }: CellRendererProps<T>) {
  // Value can be an object with primary and secondary text, or an array of strings
  if (Array.isArray(value)) {
    return (
      <div className="flex flex-col">
        {value.map((text, index) => (
          <span key={index} className={index > 0 ? "text-caption uppercase tracking-widest text-muted-foreground/60" : ""}>
            {text}
          </span>
        ))}
      </div>
    )
  }

  if (typeof value === 'object' && value !== null) {
    const { primary, secondary } = value as any
    return (
      <div className="flex flex-col">
        <span>{primary}</span>
        {secondary && (
          <span className="text-caption uppercase tracking-widest text-muted-foreground/60">{secondary}</span>
        )}
      </div>
    )
  }

  // Fallback to simple text
  return <span>{value?.toString() || ""}</span>
}