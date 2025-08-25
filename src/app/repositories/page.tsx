"use client"

import { useState, useEffect } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { IconPlus, IconTrash, IconTestPipe, IconBrandDocker, IconBrandGithub, IconServer, IconGitBranch } from "@tabler/icons-react"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { AddRepositoryDialog } from "@/components/add-repository-dialog"
import { toast } from "sonner"

interface Repository {
  id: string
  name: string
  type: 'DOCKERHUB' | 'GHCR' | 'GENERIC'
  registryUrl: string
  username?: string
  lastTested?: string
  status: 'ACTIVE' | 'ERROR' | 'UNTESTED'
  repositoryCount?: number
}

export default function RepositoriesPage() {
  const [repositories, setRepositories] = useState<Repository[]>([])
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  const breadcrumbs = [
    { label: "Dashboard", href: "/" },
    { label: "Repositories" }
  ]

  useEffect(() => {
    fetchRepositories()
  }, [])

  const fetchRepositories = async () => {
    try {
      const response = await fetch('/api/repositories')
      if (response.ok) {
        const data = await response.json()
        setRepositories(data)
      }
    } catch (error) {
      console.error('Failed to fetch repositories:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveRepository = async (id: string) => {
    try {
      const response = await fetch(`/api/repositories/${id}`, {
        method: 'DELETE',
      })
      
      if (response.ok) {
        setRepositories(prev => prev.filter(repo => repo.id !== id))
        toast.success('Repository removed successfully')
      } else {
        toast.error('Failed to remove repository')
      }
    } catch (error) {
      console.error('Failed to remove repository:', error)
      toast.error('Failed to remove repository')
    }
  }

  const handleTestConnection = async (id: string) => {
    try {
      const response = await fetch(`/api/repositories/${id}/test`, {
        method: 'POST',
      })
      
      const result = await response.json()
      
      if (response.ok && result.success) {
        setRepositories(prev => 
          prev.map(repo => 
            repo.id === id 
              ? { ...repo, status: 'ACTIVE', lastTested: new Date().toISOString(), repositoryCount: result.repositoryCount }
              : repo
          )
        )
        toast.success(`Connection successful! Found ${result.repositoryCount} repositories.`)
      } else {
        setRepositories(prev => 
          prev.map(repo => 
            repo.id === id 
              ? { ...repo, status: 'ERROR', lastTested: new Date().toISOString() }
              : repo
          )
        )
        toast.error(result.error || 'Connection test failed')
      }
    } catch (error) {
      console.error('Failed to test connection:', error)
      toast.error('Failed to test connection')
    }
  }

  const getRepositoryIcon = (type: string) => {
    switch (type) {
      case 'DOCKERHUB':
        return <IconBrandDocker className="h-5 w-5" />
      case 'GHCR':
        return <IconBrandGithub className="h-5 w-5" />
      default:
        return <IconServer className="h-5 w-5" />
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge variant="default" className="bg-green-100 text-green-800">Active</Badge>
      case 'ERROR':
        return <Badge variant="destructive">Error</Badge>
      default:
        return <Badge variant="secondary">Untested</Badge>
    }
  }

  const handleRepositoryAdded = () => {
    fetchRepositories()
    setIsAddDialogOpen(false)
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset className="flex flex-col flex-grow">
        <SiteHeader breadcrumbs={breadcrumbs} />
        <div className="flex-1 overflow-auto">
          <div className="@container/main flex flex-col gap-2 p-4 lg:p-6">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight">Repositories</h1>
                  <p className="text-muted-foreground">
                    Manage your private container registries and repositories
                  </p>
                </div>
                <Button onClick={() => setIsAddDialogOpen(true)}>
                  <IconPlus className="mr-2 h-4 w-4" />
                  Add Repository
                </Button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-muted-foreground">Loading repositories...</div>
                </div>
              ) : repositories.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <IconGitBranch className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No repositories configured</h3>
                    <p className="text-muted-foreground text-center mb-6">
                      Add your first private repository to start scanning container images from Docker Hub, GitHub Container Registry, or other registries.
                    </p>
                    <Button onClick={() => setIsAddDialogOpen(true)}>
                      <IconPlus className="mr-2 h-4 w-4" />
                      Add Repository
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {repositories.map((repo) => (
                    <Card key={repo.id}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {getRepositoryIcon(repo.type)}
                            <CardTitle className="text-base">{repo.name}</CardTitle>
                          </div>
                          {getStatusBadge(repo.status)}
                        </div>
                        <CardDescription className="text-sm">
                          {repo.registryUrl}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {repo.username && (
                            <div className="text-sm">
                              <span className="font-medium">Username:</span> {repo.username}
                            </div>
                          )}
                          {repo.repositoryCount !== undefined && (
                            <div className="text-sm">
                              <span className="font-medium">Repositories:</span> {repo.repositoryCount}
                            </div>
                          )}
                          {repo.lastTested && (
                            <div className="text-sm text-muted-foreground">
                              Last tested: {new Date(repo.lastTested).toLocaleDateString()}
                            </div>
                          )}
                          <div className="flex gap-2 pt-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleTestConnection(repo.id)}
                              className="flex-1"
                            >
                              <IconTestPipe className="mr-1 h-3 w-3" />
                              Test
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRemoveRepository(repo.id)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <IconTrash className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </SidebarInset>

      <AddRepositoryDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onRepositoryAdded={handleRepositoryAdded}
      />
    </SidebarProvider>
  )
}