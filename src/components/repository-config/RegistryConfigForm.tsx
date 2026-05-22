"use client"

import React from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import type { RepositoryType } from "./RegistryTypeSelector"

interface RepositoryConfig {
  name: string
  type: RepositoryType
  registryUrl: string
  username: string
  password: string
  organization?: string
  authUrl?: string
  groupId?: string
  skipTlsVerify?: boolean
  registryPort?: number
  garProjectId?: string
  garLocation?: string
  garRepositoryName?: string
}

interface RegistryConfigFormProps {
  config: RepositoryConfig
  protocol: 'https' | 'http'
  onConfigChange: (updater: (prev: RepositoryConfig) => RepositoryConfig) => void
  onProtocolChange: (protocol: 'https' | 'http') => void
}

export type { RepositoryConfig }

export function RegistryConfigForm({
  config,
  protocol,
  onConfigChange,
  onProtocolChange,
}: RegistryConfigFormProps) {
  return (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label htmlFor="name" className="text-caption uppercase tracking-widest text-muted-foreground/60">Repository Name</Label>
        <Input
          id="name"
          value={config.name}
          onChange={(e) => onConfigChange(prev => ({ ...prev, name: e.target.value }))}
          placeholder="Enter a name for this repository"
          className="rounded-none border-white/10 bg-transparent text-body-sm"
        />
      </div>

      {config.type === 'acr' && (
        <div className="space-y-2">
          <Label htmlFor="registryUrl" className="text-caption uppercase tracking-widest text-muted-foreground/60">Registry Name</Label>
          <div className="flex items-center gap-2">
            <Input
              id="registryUrl"
              value={config.registryUrl.replace(/\.azurecr\.io$/, '')}
              onChange={(e) => {
                const name = e.target.value.replace(/\.azurecr\.io$/, '')
                onConfigChange(prev => ({ ...prev, registryUrl: name ? `${name}.azurecr.io` : '' }))
              }}
              placeholder="myregistry"
              className="flex-1 rounded-none border-white/10 bg-transparent text-body-sm"
            />
            <span className="text-caption uppercase tracking-widest text-muted-foreground/50 whitespace-nowrap">.azurecr.io</span>
          </div>
          <p className="text-caption uppercase tracking-widest text-muted-foreground/40">
            Enter just the registry name. The full URL will be {config.registryUrl || '{name}.azurecr.io'}.
          </p>
        </div>
      )}

      {(config.type === 'generic' || config.type === 'gitlab' || config.type === 'nexus' || config.type === 'gitea') && (
        <>
          <div className="space-y-2">
            <Label htmlFor="registryUrl" className="text-caption uppercase tracking-widest text-muted-foreground/60">Registry URL</Label>
            <div className="flex gap-2">
              <Select value={protocol} onValueChange={(value: 'https' | 'http') => onProtocolChange(value)}>
                <SelectTrigger className="w-[100px] rounded-none border-white/10 text-caption uppercase tracking-widest">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-overlay border-white/10 rounded-none">
                  <SelectItem value="https">HTTPS</SelectItem>
                  <SelectItem value="http">HTTP</SelectItem>
                </SelectContent>
              </Select>
              <Input
                id="registryUrl"
                value={config.registryUrl}
                onChange={(e) => {
                  let value = e.target.value
                  // If user pastes a URL with protocol, extract it
                  if (value.startsWith('http://')) {
                    onProtocolChange('http')
                    value = value.substring(7)
                  } else if (value.startsWith('https://')) {
                    onProtocolChange('https')
                    value = value.substring(8)
                  }
                  onConfigChange(prev => ({ ...prev, registryUrl: value }))
                }}
                placeholder="registry.company.com:5050"
                className="flex-1 rounded-none border-white/10 bg-transparent text-body-sm"
              />
            </div>
            <p className="text-caption uppercase tracking-widest text-muted-foreground/40">
              Include port if non-standard (e.g., :5050, :5000). Use HTTP for insecure registries.
            </p>
          </div>

          {protocol === 'https' && (
            <div className="flex items-start space-x-3 py-2">
              <Checkbox
                id="skipTlsVerify"
                checked={config.skipTlsVerify}
                onCheckedChange={(checked) =>
                  onConfigChange(prev => ({ ...prev, skipTlsVerify: checked === true }))
                }
              />
              <div className="space-y-1">
                <Label
                  htmlFor="skipTlsVerify"
                  className="text-body-sm uppercase tracking-caps peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Skip TLS Verification
                </Label>
                <p className="text-caption uppercase tracking-widest text-muted-foreground/40">
                  Enable this for registries with self-signed SSL certificates.{" "}
                  <span className="text-amber-400">Warning: This reduces security.</span>
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {config.type === 'gcr' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="garProjectId" className="text-caption uppercase tracking-widest text-muted-foreground/60">Project ID <span className="text-red-400">*</span></Label>
            <Input
              id="garProjectId"
              value={config.garProjectId || ''}
              onChange={(e) => onConfigChange(prev => ({ ...prev, garProjectId: e.target.value, username: e.target.value }))}
              placeholder="my-gcp-project"
              className="rounded-none border-white/10 bg-transparent text-body-sm"
            />
            <p className="text-caption uppercase tracking-widest text-muted-foreground/40">
              Your Google Cloud project ID.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="garLocation" className="text-caption uppercase tracking-widest text-muted-foreground/60">Location <span className="text-red-400">*</span></Label>
            <Select
              value={config.garLocation || 'us'}
              onValueChange={(value) => onConfigChange(prev => ({ ...prev, garLocation: value }))}
            >
              <SelectTrigger id="garLocation" className="rounded-none border-white/10 text-caption uppercase tracking-widest">
                <SelectValue placeholder="Select a location" />
              </SelectTrigger>
              <SelectContent className="bg-overlay border-white/10 rounded-none">
                <SelectItem value="us">us (United States multi-region)</SelectItem>
                <SelectItem value="us-central1">us-central1 (Iowa)</SelectItem>
                <SelectItem value="us-east1">us-east1 (South Carolina)</SelectItem>
                <SelectItem value="us-east4">us-east4 (Northern Virginia)</SelectItem>
                <SelectItem value="us-west1">us-west1 (Oregon)</SelectItem>
                <SelectItem value="us-west2">us-west2 (Los Angeles)</SelectItem>
                <SelectItem value="europe">europe (European multi-region)</SelectItem>
                <SelectItem value="europe-west1">europe-west1 (Belgium)</SelectItem>
                <SelectItem value="europe-west2">europe-west2 (London)</SelectItem>
                <SelectItem value="europe-west3">europe-west3 (Frankfurt)</SelectItem>
                <SelectItem value="asia">asia (Asia multi-region)</SelectItem>
                <SelectItem value="asia-east1">asia-east1 (Taiwan)</SelectItem>
                <SelectItem value="asia-northeast1">asia-northeast1 (Tokyo)</SelectItem>
                <SelectItem value="asia-southeast1">asia-southeast1 (Singapore)</SelectItem>
                <SelectItem value="australia-southeast1">australia-southeast1 (Sydney)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-caption uppercase tracking-widest text-muted-foreground/40">
              The Artifact Registry region where your repository is hosted.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="garRepositoryName" className="text-caption uppercase tracking-widest text-muted-foreground/60">Repository Name <span className="text-red-400">*</span></Label>
            <Input
              id="garRepositoryName"
              value={config.garRepositoryName || ''}
              onChange={(e) => onConfigChange(prev => ({
                ...prev,
                garRepositoryName: e.target.value,
                organization: `${prev.garLocation || 'us'}/${e.target.value}`
              }))}
              placeholder="my-docker-repo"
              className="rounded-none border-white/10 bg-transparent text-body-sm"
            />
            <p className="text-caption uppercase tracking-widest text-muted-foreground/40">
              The name of your Docker repository in Artifact Registry.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="garServiceAccountKey" className="text-caption uppercase tracking-widest text-muted-foreground/60">Service Account Key (JSON) <span className="text-red-400">*</span></Label>
            <Textarea
              id="garServiceAccountKey"
              value={config.password}
              onChange={(e) => onConfigChange(prev => ({ ...prev, password: e.target.value }))}
              placeholder='Paste your service account JSON key here...'
              rows={6}
              className="font-mono text-caption rounded-none border-white/10 bg-transparent"
            />
            <p className="text-caption uppercase tracking-widest text-muted-foreground/40">
              Paste the full JSON key file for a service account with Artifact Registry Reader (or broader) permissions.
            </p>
          </div>
        </>
      )}

      {config.type !== 'gcr' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="username" className="text-caption uppercase tracking-widest text-muted-foreground/60">
              {config.type === 'dockerhub' ? 'Docker Hub Username' :
               config.type === 'ghcr' ? 'GitHub Username' :
               config.type === 'gitlab' ? 'GitLab Username' :
               config.type === 'nexus' ? 'Nexus Username' :
               config.type === 'gitea' ? 'Username' :
               config.type === 'acr' ? 'Username' : 'Username'}
            </Label>
            <Input
              id="username"
              value={config.username}
              onChange={(e) => onConfigChange(prev => ({ ...prev, username: e.target.value }))}
              placeholder={
                config.type === 'acr' ? 'Admin username or service principal client ID' :
                'Enter username'
              }
              className="rounded-none border-white/10 bg-transparent text-body-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-caption uppercase tracking-widest text-muted-foreground/60">
              {config.type === 'dockerhub' ? 'Personal Access Token' :
               config.type === 'ghcr' ? 'GitHub Personal Access Token' :
               config.type === 'gitlab' ? 'GitLab Password' :
               config.type === 'nexus' ? 'Nexus Password' :
               config.type === 'gitea' ? 'Personal Access Token' :
               config.type === 'acr' ? 'Password' : 'Password/Token'}
            </Label>
            <Input
              id="password"
              type="password"
              value={config.password}
              onChange={(e) => onConfigChange(prev => ({ ...prev, password: e.target.value }))}
              placeholder={
                config.type === 'dockerhub' ? 'Enter Docker Hub PAT' :
                config.type === 'ghcr' ? 'Enter GitHub PAT with packages:read scope' :
                config.type === 'gitlab' ? 'Enter GitLab admin password' :
                config.type === 'nexus' ? 'Enter Nexus password' :
                config.type === 'gitea' ? 'Enter Gitea/Forgejo PAT with package:read scope' :
                config.type === 'acr' ? 'Admin password or service principal client secret' :
                'Enter password or token'
              }
              className="rounded-none border-white/10 bg-transparent text-body-sm"
            />
          </div>
        </>
      )}

      {config.type === 'ghcr' && (
        <div className="space-y-2">
          <Label htmlFor="organization" className="text-caption uppercase tracking-widest text-muted-foreground/60">Organization (optional)</Label>
          <Input
            id="organization"
            value={config.organization}
            onChange={(e) => onConfigChange(prev => ({ ...prev, organization: e.target.value }))}
            placeholder="Enter organization name for org packages"
            className="rounded-none border-white/10 bg-transparent text-body-sm"
          />
        </div>
      )}

      {config.type === 'gitea' && (
        <div className="space-y-2">
          <Label htmlFor="organization" className="text-caption uppercase tracking-widest text-muted-foreground/60">Package Owner <span className="text-red-400">*</span></Label>
          <Input
            id="organization"
            value={config.organization}
            onChange={(e) => onConfigChange(prev => ({ ...prev, organization: e.target.value }))}
            placeholder="Enter Gitea user or organization name"
            className="rounded-none border-white/10 bg-transparent text-body-sm"
          />
          <p className="text-caption uppercase tracking-widest text-muted-foreground/40">
            The Gitea/Forgejo user or organization that owns the container packages.
          </p>
        </div>
      )}

      {config.type === 'nexus' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="organization" className="text-caption uppercase tracking-widest text-muted-foreground/60">Repository Name (optional)</Label>
            <Input
              id="organization"
              value={config.organization}
              onChange={(e) => onConfigChange(prev => ({ ...prev, organization: e.target.value }))}
              placeholder="docker-hosted"
              className="rounded-none border-white/10 bg-transparent text-body-sm"
            />
            <p className="text-caption uppercase tracking-widest text-muted-foreground/40">
              Nexus repository name (default: docker-hosted)
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="registryPort" className="text-caption uppercase tracking-widest text-muted-foreground/60">Docker Registry Port (optional)</Label>
            <Input
              id="registryPort"
              type="number"
              value={config.registryPort || ''}
              onChange={(e) => onConfigChange(prev => ({ ...prev, registryPort: e.target.value ? parseInt(e.target.value) : undefined }))}
              placeholder="5000"
              className="rounded-none border-white/10 bg-transparent text-body-sm"
            />
            <p className="text-caption uppercase tracking-widest text-muted-foreground/40">
              Port for Docker push/pull operations (default: 5000)
            </p>
          </div>
        </>
      )}

      {config.type === 'gitlab' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="registryPort" className="text-caption uppercase tracking-widest text-muted-foreground/60">Registry Port</Label>
            <Input
              id="registryPort"
              type="number"
              value={config.registryPort || ''}
              onChange={(e) => onConfigChange(prev => ({ ...prev, registryPort: e.target.value ? parseInt(e.target.value) : undefined }))}
              placeholder="5050"
              className="rounded-none border-white/10 bg-transparent text-body-sm"
            />
            <p className="text-caption uppercase tracking-widest text-muted-foreground/40">
              GitLab registry port (default: 5050). Uses HTTP protocol on this port.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="authUrl" className="text-caption uppercase tracking-widest text-muted-foreground/60">JWT Auth URL (optional)</Label>
            <Input
              id="authUrl"
              value={config.authUrl}
              onChange={(e) => onConfigChange(prev => ({ ...prev, authUrl: e.target.value }))}
              placeholder="https://gitlab.example.com/jwt/auth"
              className="rounded-none border-white/10 bg-transparent text-body-sm"
            />
            <p className="text-caption uppercase tracking-widest text-muted-foreground/40">
              Leave blank to auto-detect from registry URL
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="groupId" className="text-caption uppercase tracking-widest text-muted-foreground/60">Group/Project ID (optional)</Label>
            <Input
              id="groupId"
              value={config.groupId}
              onChange={(e) => onConfigChange(prev => ({ ...prev, groupId: e.target.value }))}
              placeholder="e.g., mygroup/myproject"
              className="rounded-none border-white/10 bg-transparent text-body-sm"
            />
            <p className="text-caption uppercase tracking-widest text-muted-foreground/40">
              Limit access to specific GitLab group or project
            </p>
          </div>
        </>
      )}

      <div className="border border-amber-500/20 bg-amber-500/5 p-4">
        <p className="text-caption uppercase tracking-widest text-amber-400/80">
          Important: you must test the connection before adding the repository.
          This ensures your credentials are valid and we can access your repositories.
        </p>
      </div>
    </div>
  )
}
