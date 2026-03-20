"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TabsContent } from "@/components/ui/tabs"

interface GitHubTabProps {
  githubRepo: string
  setGithubRepo: (value: string) => void
}

export function GitHubTab({ githubRepo, setGithubRepo }: GitHubTabProps) {
  return (
    <TabsContent value="github" className="space-y-3">
      <Label htmlFor="github-repo">GitHub Container Registry</Label>
      <Input
        id="github-repo"
        placeholder="e.g., ghcr.io/owner/repo:tag"
        value={githubRepo}
        onChange={(e) => setGithubRepo(e.target.value)}
      />
      <p className="text-xs text-muted-foreground">
        Enter the full GitHub Container Registry URL including tag.
      </p>
    </TabsContent>
  )
}
