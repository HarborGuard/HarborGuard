import { Badge } from "@/components/ui/badge"
import { Container, Server, Cloud } from "lucide-react"
import { CellRendererProps } from "../types"

export function registryCell<T>({ value, row }: CellRendererProps<T>) {
  const data = row.original as any
  const registry = value || data.registry || "Unknown"
  const source = data.source

  // Determine icon based on source
  let icon = <Container className="h-3 w-3 mr-1" />
  let variant: any = "default"

  if (source === "local" || source === "LOCAL_DOCKER") {
    icon = <Server className="h-3 w-3 mr-1" />
    variant = "secondary"
  } else if (typeof registry === "string" && (registry.includes("GHCR") || registry.includes("GitHub"))) {
    icon = <Cloud className="h-3 w-3 mr-1" />
    variant = "outline"
  } else if (registry !== "Docker Hub" && registry !== "Local Docker") {
    icon = <Cloud className="h-3 w-3 mr-1" />
    variant = "outline"
  }

  return (
    <Badge variant={variant} className="rounded-none uppercase tracking-widest text-caption border-white/10">
      {icon}
      {registry}
    </Badge>
  )
}