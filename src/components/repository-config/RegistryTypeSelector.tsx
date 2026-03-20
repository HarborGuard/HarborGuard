"use client"

import React from "react"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { IconBrandDocker, IconBrandGithub, IconBrandGitlab, IconServer, IconPackage, IconCloud, IconBrandGoogle, IconBrandGit } from "@tabler/icons-react"

type RepositoryType = 'dockerhub' | 'ghcr' | 'gitlab' | 'generic' | 'nexus' | 'acr' | 'gcr' | 'gitea'

interface RegistryTypeSelectorProps {
  onTypeSelect: (type: RepositoryType) => void;
}

const repositoryTypes = [
  {
    type: 'dockerhub' as const,
    title: 'Docker Hub',
    description: 'Connect to Docker Hub private repositories',
    icon: <IconBrandDocker className="h-8 w-8" />,
    registryUrl: 'docker.io',
  },
  {
    type: 'ghcr' as const,
    title: 'GitHub Container Registry',
    description: 'Connect to GitHub Container Registry (ghcr.io)',
    icon: <IconBrandGithub className="h-8 w-8" />,
    registryUrl: 'ghcr.io',
  },
  {
    type: 'gitlab' as const,
    title: 'GitLab Container Registry',
    description: 'Connect to GitLab Container Registry with JWT authentication',
    icon: <IconBrandGitlab className="h-8 w-8" />,
    registryUrl: '',
  },
  {
    type: 'gitea' as const,
    title: 'Gitea / Forgejo',
    description: 'Connect to Gitea or Forgejo container registry',
    icon: <IconBrandGit className="h-8 w-8" />,
    registryUrl: '',
  },
  {
    type: 'generic' as const,
    title: 'Generic Registry',
    description: 'Connect to any OCI-compliant container registry',
    icon: <IconServer className="h-8 w-8" />,
    registryUrl: '',
  },
  {
    type: 'nexus' as const,
    title: 'Sonatype Nexus3',
    description: 'Connect to Nexus3 Docker repositories',
    icon: <IconPackage className="h-8 w-8" />,
    registryUrl: '',
  },
  {
    type: 'acr' as const,
    title: 'Azure Container Registry',
    description: 'Connect to Azure Container Registry (azurecr.io)',
    icon: <IconCloud className="h-8 w-8" />,
    registryUrl: '',
  },
  {
    type: 'gcr' as const,
    title: 'Google Artifact Registry',
    description: 'Connect to Google Artifact Registry (pkg.dev)',
    icon: <IconBrandGoogle className="h-8 w-8" />,
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
          className="cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => onTypeSelect(type.type)}
        >
          <CardHeader>
            <div className="flex items-center gap-3">
              {type.icon}
              <div>
                <CardTitle className="text-base">{type.title}</CardTitle>
                <CardDescription>{type.description}</CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>
      ))}
    </div>
  )
}
