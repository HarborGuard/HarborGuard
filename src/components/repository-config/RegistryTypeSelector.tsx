"use client"

import React from "react"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Container, Github, GitlabIcon, Server, Package, Cloud, Globe, GitBranch } from "lucide-react"

type RepositoryType = 'dockerhub' | 'ghcr' | 'gitlab' | 'generic' | 'nexus' | 'acr' | 'gcr' | 'gitea'

interface RegistryTypeSelectorProps {
  onTypeSelect: (type: RepositoryType) => void;
}

const repositoryTypes = [
  {
    type: 'dockerhub' as const,
    title: 'Docker Hub',
    description: 'Connect to Docker Hub private repositories',
    icon: <Container className="h-8 w-8" />,
    registryUrl: 'docker.io',
  },
  {
    type: 'ghcr' as const,
    title: 'GitHub Container Registry',
    description: 'Connect to GitHub Container Registry (ghcr.io)',
    icon: <Github className="h-8 w-8" />,
    registryUrl: 'ghcr.io',
  },
  {
    type: 'gitlab' as const,
    title: 'GitLab Container Registry',
    description: 'Connect to GitLab Container Registry with JWT authentication',
    icon: <GitlabIcon className="h-8 w-8" />,
    registryUrl: '',
  },
  {
    type: 'gitea' as const,
    title: 'Gitea / Forgejo',
    description: 'Connect to Gitea or Forgejo container registry',
    icon: <GitBranch className="h-8 w-8" />,
    registryUrl: '',
  },
  {
    type: 'generic' as const,
    title: 'Generic Registry',
    description: 'Connect to any OCI-compliant container registry',
    icon: <Server className="h-8 w-8" />,
    registryUrl: '',
  },
  {
    type: 'nexus' as const,
    title: 'Sonatype Nexus3',
    description: 'Connect to Nexus3 Docker repositories',
    icon: <Package className="h-8 w-8" />,
    registryUrl: '',
  },
  {
    type: 'acr' as const,
    title: 'Azure Container Registry',
    description: 'Connect to Azure Container Registry (azurecr.io)',
    icon: <Cloud className="h-8 w-8" />,
    registryUrl: '',
  },
  {
    type: 'gcr' as const,
    title: 'Google Artifact Registry',
    description: 'Connect to Google Artifact Registry (pkg.dev)',
    icon: <Globe className="h-8 w-8" />,
    registryUrl: '',
  },
]

export { repositoryTypes }
export type { RepositoryType }

export function RegistryTypeSelector({ onTypeSelect }: RegistryTypeSelectorProps) {
  return (
    <div className="grid gap-4 py-4">
      {repositoryTypes.map((type) => (
        <Card
          key={type.type}
          className="cursor-pointer border border-white/10 hover:border-accent/50 hover:bg-white/5 rounded-none transition-colors bg-surface-1"
          onClick={() => onTypeSelect(type.type)}
        >
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="text-muted-foreground/40">{type.icon}</div>
              <div>
                <CardTitle className="text-body-sm uppercase tracking-caps text-foreground">{type.title}</CardTitle>
                <CardDescription className="text-caption uppercase tracking-widest text-muted-foreground/50">{type.description}</CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>
      ))}
    </div>
  )
}
