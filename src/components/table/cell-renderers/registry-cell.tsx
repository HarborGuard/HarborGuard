import { Badge } from "@/components/ui/badge"
import { IconBrandDocker, IconServer, IconCloud } from "@tabler/icons-react"
import { CellRendererProps } from "../types"

export function registryCell<T>({ value, row }: CellRendererProps<T>) {
  const data = row.original as any
  const registry = value || data.registry || "Unknown"
  const source = data.source

  // Determine icon based on source
  let icon = <IconBrandDocker className="h-3 w-3 mr-1" />
  let variant: any = "default"

  if (source === "local" || source === "LOCAL_DOCKER") {
    icon = <IconServer className="h-3 w-3 mr-1" />
    variant = "secondary"
  } else if (typeof registry === "string" && (registry.includes("GHCR") || registry.includes("GitHub"))) {
    icon = <IconCloud className="h-3 w-3 mr-1" />
    variant = "outline"
  } else if (registry !== "Docker Hub" && registry !== "Local Docker") {
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