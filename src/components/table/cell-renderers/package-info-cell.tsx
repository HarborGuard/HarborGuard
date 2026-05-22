import { CellRendererProps } from "../types"

export function packageInfoCell<T>({ value, row }: CellRendererProps<T>) {
  const data = row.original as any

  // Value could be the package name, or an object with package info
  if (typeof value === 'object' && value !== null) {
    const { name, version, type } = value as any
    return (
      <div className="flex flex-col">
        <span className="font-mono text-body-sm">{name}</span>
        {version && (
          <span className="text-caption uppercase tracking-widest text-muted-foreground/60">v{version}</span>
        )}
        {type && (
          <span className="text-caption uppercase tracking-widest text-muted-foreground/60">{type}</span>
        )}
      </div>
    )
  }

  // Fallback: extract from row data
  const packageName = value || data.packageName || data.package
  const version = data.version || data.packageVersion
  const packageType = data.type || data.packageType

  return (
    <div className="flex flex-col">
      <span className="font-mono text-body-sm">{packageName}</span>
      {version && (
        <span className="text-caption uppercase tracking-widest text-muted-foreground/60">v{version}</span>
      )}
      {packageType && (
        <span className="text-caption uppercase tracking-widest text-muted-foreground/60">{packageType}</span>
      )}
    </div>
  )
}
