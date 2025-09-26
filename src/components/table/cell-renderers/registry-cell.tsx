import { Badge } from "@/components/ui/badge"
import { IconBrandDocker, IconServer, IconCloud } from "@tabler/icons-react"
import { CellRendererProps } from "../types"

export function registryCell<T>({ value, row }: CellRendererProps<T>) {
  const data = row.original as any
  const registry = value || data.registry || "Docker Hub"
  const source = data.source

  // Determine icon based on registry/source
  let icon = <IconBrandDocker className="h-3 w-3 mr-1" />
  let variant: any = "default"

  if (source === "local") {
    icon = <IconServer className="h-3 w-3 mr-1" />
    variant = "secondary"
  } else if (registry.includes("ghcr") || registry.includes("github")) {
    icon = <IconCloud className="h-3 w-3 mr-1" />
    variant = "outline"
  } else if (registry !== "Docker Hub") {
    icon = <IconCloud className="h-3 w-3 mr-1" />
    variant = "outline"
  }

  return (
    <Badge variant={variant} className="text-xs">
      {icon}
      {registry}
    </Badge>
  )
}