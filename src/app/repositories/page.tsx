"use client";

import { useState, useEffect, useCallback } from "react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SiteHeader } from "@/components/layout/site-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Trash2,
  FlaskConical,
  Container,
  Github,
  GitlabIcon,
  Server,
  GitBranch,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AddRepositoryDialog } from "@/components/dialogs/add-repository-dialog";
import { toast } from "sonner";

interface Repository {
  id: string;
  name: string;
  type: "DOCKERHUB" | "GHCR" | "GITLAB" | "GENERIC" | "NEXUS";
  protocol?: string;
  registryUrl: string;
  username?: string;
  lastTested?: string;
  status: "ACTIVE" | "ERROR" | "UNTESTED";
  repositoryCount?: number;
}

interface SyncStatus {
  [key: string]: {
    lastSync: string | null;
    syncing: boolean;
    error?: string;
  };
}

export default function RepositoriesPage() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncStatuses, setSyncStatuses] = useState<SyncStatus>({});
  const [syncingRepos, setSyncingRepos] = useState<Set<string>>(new Set());
  const [autoRefresh, setAutoRefresh] = useState(true);

  const breadcrumbs = [
    { label: "Dashboard", href: "/" },
    { label: "Repositories" },
  ];

  useEffect(() => {
    fetchRepositories();
    fetchSyncStatuses();
    
    // Set up auto-refresh interval (every 30 seconds)
    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchRepositories();
        fetchSyncStatuses();
      }, 30000);
      
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const fetchRepositories = async () => {
    try {
      const response = await fetch("/api/repositories");
      if (response.ok) {
        const { data } = await response.json();
        setRepositories(data);
      }
    } catch (error) {
      console.error("Failed to fetch repositories:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveRepository = async (id: string) => {
    try {
      const response = await fetch(`/api/repositories/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setRepositories((prev) => prev.filter((repo) => repo.id !== id));
        toast.success("Repository removed successfully");
      } else {
        toast.error("Failed to remove repository");
      }
    } catch (error) {
      console.error("Failed to remove repository:", error);
      toast.error("Failed to remove repository");
    }
  };

  const handleTestConnection = async (id: string) => {
    try {
      const response = await fetch(`/api/repositories/${id}/test`, {
        method: "POST",
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setRepositories((prev) =>
          prev.map((repo) =>
            repo.id === id
              ? {
                  ...repo,
                  status: "ACTIVE",
                  lastTested: new Date().toISOString(),
                  repositoryCount: result.repositoryCount,
                }
              : repo
          )
        );
        toast.success(
          `Connection successful! Found ${result.repositoryCount} repositories.`
        );
      } else {
        setRepositories((prev) =>
          prev.map((repo) =>
            repo.id === id
              ? {
                  ...repo,
                  status: "ERROR",
                  lastTested: new Date().toISOString(),
                }
              : repo
          )
        );
        toast.error(result.error || "Connection test failed");
      }
    } catch (error) {
      console.error("Failed to test connection:", error);
      toast.error("Failed to test connection");
    }
  };

  const getRepositoryIcon = (type: string) => {
    switch (type) {
      case "DOCKERHUB":
        return <Container className="h-4 w-4" />;
      case "GHCR":
        return <Github className="h-4 w-4" />;
      case "GITLAB":
        return <GitlabIcon className="h-4 w-4" />;
      default:
        return <Server className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return (
          <Badge variant="default" className="bg-green-900/30 text-green-400 border-green-500/30 rounded-none uppercase tracking-widest text-caption">
            Active
          </Badge>
        );
      case "ERROR":
        return <Badge variant="destructive" className="rounded-none uppercase tracking-widest text-caption">Error</Badge>;
      default:
        return <Badge variant="secondary" className="rounded-none uppercase tracking-widest text-caption">Untested</Badge>;
    }
  };

  const fetchSyncStatuses = async () => {
    try {
      const response = await fetch("/api/repositories/sync");
      if (response.ok) {
        const data = await response.json();
        setSyncStatuses(data.statuses || {});
      }
    } catch (error) {
      console.error("Failed to fetch sync statuses:", error);
    }
  };

  const handleSyncRepository = async (id: string) => {
    setSyncingRepos(prev => new Set(prev).add(id));
    
    try {
      const response = await fetch("/api/repositories/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repositoryId: id,
          forceRefresh: true,
          action: "sync"
        }),
      });

      if (response.ok) {
        toast.success("Repository sync started");
        // Refresh data after a short delay
        setTimeout(() => {
          fetchRepositories();
          fetchSyncStatuses();
        }, 2000);
      } else {
        toast.error("Failed to start sync");
      }
    } catch (error) {
      console.error("Failed to sync repository:", error);
      toast.error("Failed to sync repository");
    } finally {
      setSyncingRepos(prev => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    }
  };

  const handleSyncAll = async () => {
    try {
      const response = await fetch("/api/repositories/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          forceRefresh: true,
          action: "sync"
        }),
      });

      if (response.ok) {
        toast.success("All repositories sync started");
        // Refresh data after a short delay
        setTimeout(() => {
          fetchRepositories();
          fetchSyncStatuses();
        }, 2000);
      } else {
        toast.error("Failed to start sync");
      }
    } catch (error) {
      console.error("Failed to sync all repositories:", error);
      toast.error("Failed to sync all repositories");
    }
  };

  const handleRepositoryAdded = () => {
    fetchRepositories();
    fetchSyncStatuses();
    setIsAddDialogOpen(false);
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="@container/main flex flex-col gap-2 p-4 lg:p-6">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          <div className="flex items-start justify-between gap-4 mb-8">
            <div className="space-y-1">
              <p className="text-caption uppercase tracking-headline text-muted-foreground/30">Configuration</p>
              <h1 className="text-2xl tracking-tight text-foreground">
                Repositories
              </h1>
              <p className="text-body-sm text-muted-foreground uppercase tracking-widest">
                Manage your private container registries and repositories
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleSyncAll}
                variant="outline"
                disabled={repositories.length === 0}
                className="rounded-none border-white/10 hover:bg-white/5 uppercase tracking-widest text-caption"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Sync All
              </Button>
              <Button onClick={() => setIsAddDialogOpen(true)} className="rounded-none uppercase tracking-widest text-caption">
                <Plus className="mr-2 h-4 w-4" />
                Add Repository
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-caption uppercase tracking-widest text-muted-foreground/40">
                Loading repositories...
              </div>
            </div>
          ) : repositories.length === 0 ? (
            <Card className="bg-surface-1 border-white/10 rounded-none">
              <CardContent className="flex flex-col items-center justify-center py-16 space-y-4">
                <GitBranch className="h-12 w-12 text-muted-foreground/30 mx-auto" />
                <p className="text-body-sm uppercase tracking-widest text-foreground">
                  No repositories configured
                </p>
                <p className="text-caption uppercase tracking-widest text-muted-foreground/40 text-center max-w-md mx-auto">
                  Add your first private repository to start scanning container
                  images from Docker Hub, GitHub Container Registry, or other
                  registries.
                </p>
                <Button onClick={() => setIsAddDialogOpen(true)} className="rounded-none uppercase tracking-widest text-caption">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Repository
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {repositories.map((repo) => (
                <Card key={repo.id} className="bg-surface-1 border-white/10 rounded-none">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-accent">
                        {getRepositoryIcon(repo.type)}
                        <CardTitle className="text-sm uppercase tracking-wide-caps text-foreground">{repo.name}</CardTitle>
                      </div>
                      {getStatusBadge(repo.status)}
                    </div>
                    <CardDescription className="text-caption uppercase tracking-widest text-muted-foreground/40">
                      {repo.type === 'GENERIC' && repo.protocol ? `${repo.protocol}://${repo.registryUrl}` : repo.registryUrl}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {repo.username && (
                        <div className="flex items-center gap-2">
                          <span className="text-caption uppercase tracking-widest text-muted-foreground/50">Username:</span>
                          <span className="text-body-sm text-foreground">{repo.username}</span>
                        </div>
                      )}
                      {repo.repositoryCount !== undefined && (
                        <div className="flex items-center gap-2">
                          <span className="text-caption uppercase tracking-widest text-muted-foreground/50">Repositories:</span>
                          <span className="text-body-sm text-foreground">{repo.repositoryCount}</span>
                        </div>
                      )}
                      {repo.lastTested && (
                        <div className="text-caption uppercase tracking-widest text-muted-foreground/40">
                          Last tested:{" "}
                          {new Date(repo.lastTested).toLocaleDateString()}
                        </div>
                      )}
                      {syncStatuses[repo.id] && (
                        <div className="text-body-sm">
                          {syncStatuses[repo.id].syncing ? (
                            <span className="flex items-center text-accent text-caption uppercase tracking-widest">
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              Syncing...
                            </span>
                          ) : syncStatuses[repo.id].lastSync ? (
                            <span className="text-caption uppercase tracking-widest text-muted-foreground/40">
                              Last sync: {new Date(syncStatuses[repo.id].lastSync!).toLocaleTimeString()}
                            </span>
                          ) : null}
                          {syncStatuses[repo.id].error && (
                            <span className="text-red-400 text-caption uppercase tracking-widest">
                              {syncStatuses[repo.id].error}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSyncRepository(repo.id)}
                          disabled={syncingRepos.has(repo.id) || syncStatuses[repo.id]?.syncing}
                          className="flex-1 rounded-none border-white/10 hover:bg-white/5 uppercase tracking-widest text-caption"
                        >
                          {syncingRepos.has(repo.id) || syncStatuses[repo.id]?.syncing ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-1 h-3 w-3" />
                          )}
                          Sync
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleTestConnection(repo.id)}
                          className="flex-1 rounded-none border-white/10 hover:bg-white/5 uppercase tracking-widest text-caption"
                        >
                          <FlaskConical className="mr-1 h-3 w-3" />
                          Test
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRemoveRepository(repo.id)}
                          className="rounded-none border-white/10 hover:bg-red-950/20 text-red-400 hover:text-red-300 hover:border-red-500/30"
                        >
                          <Trash2 className="h-3 w-3" />
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
      <AddRepositoryDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onRepositoryAdded={handleRepositoryAdded}
      />
    </div>
  );
}
