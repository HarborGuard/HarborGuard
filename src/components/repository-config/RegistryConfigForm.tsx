"use client"

import React from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
        <Label htmlFor="name">Repository Name</Label>
        <Input
          id="name"
          value={config.name}
          onChange={(e) => onConfigChange(prev => ({ ...prev, name: e.target.value }))}
          placeholder="Enter a name for this repository"
        />
      </div>

      {config.type === 'acr' && (
        <div className="space-y-2">
          <Label htmlFor="registryUrl">Registry Name</Label>
          <div className="flex items-center gap-2">
            <Input
              id="registryUrl"
              value={config.registryUrl.replace(/\.azurecr\.io$/, '')}
              onChange={(e) => {
                const name = e.target.value.replace(/\.azurecr\.io$/, '')
                onConfigChange(prev => ({ ...prev, registryUrl: name ? `${name}.azurecr.io` : '' }))
              }}
              placeholder="myregistry"
              className="flex-1"
            />
            <span className="text-sm text-muted-foreground whitespace-nowrap">.azurecr.io</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Enter just the registry name. The full URL will be {config.registryUrl || '{name}.azurecr.io'}.
          </p>
        </div>
      )}

      {(config.type === 'generic' || config.type === 'gitlab' || config.type === 'nexus') && (
        <>
          <div className="space-y-2">
            <Label htmlFor="registryUrl">Registry URL</Label>
            <div className="flex gap-2">
              <Select value={protocol} onValueChange={(value: 'https' | 'http') => onProtocolChange(value)}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
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
                className="flex-1"
              />
            </div>
            <p className="text-xs text-muted-foreground">
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
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Skip TLS Verification
                </Label>
                <p className="text-xs text-muted-foreground">
                  Enable this for registries with self-signed SSL certificates.
                  <span className="text-orange-600">⚠️ Warning: This reduces security.</span>
                </p>
              </div>
            </div>
          )}
        </>
      )}

      <div className="space-y-2">
        <Label htmlFor="username">
          {config.type === 'dockerhub' ? 'Docker Hub Username' :
           config.type === 'ghcr' ? 'GitHub Username' :
           config.type === 'gitlab' ? 'GitLab Username' :
           config.type === 'nexus' ? 'Nexus Username' :
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
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">
          {config.type === 'dockerhub' ? 'Personal Access Token' :
           config.type === 'ghcr' ? 'GitHub Personal Access Token' :
           config.type === 'gitlab' ? 'GitLab Password' :
           config.type === 'nexus' ? 'Nexus Password' :
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
            config.type === 'acr' ? 'Admin password or service principal client secret' :
            'Enter password or token'
          }
        />
      </div>

      {config.type === 'ghcr' && (
        <div className="space-y-2">
          <Label htmlFor="organization">Organization (optional)</Label>
          <Input
            id="organization"
            value={config.organization}
            onChange={(e) => onConfigChange(prev => ({ ...prev, organization: e.target.value }))}
            placeholder="Enter organization name for org packages"
          />
        </div>
      )}

      {config.type === 'nexus' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="organization">Repository Name (optional)</Label>
            <Input
              id="organization"
              value={config.organization}
              onChange={(e) => onConfigChange(prev => ({ ...prev, organization: e.target.value }))}
              placeholder="docker-hosted"
            />
            <p className="text-xs text-muted-foreground">
              Nexus repository name (default: docker-hosted)
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="registryPort">Docker Registry Port (optional)</Label>
            <Input
              id="registryPort"
              type="number"
              value={config.registryPort || ''}
              onChange={(e) => onConfigChange(prev => ({ ...prev, registryPort: e.target.value ? parseInt(e.target.value) : undefined }))}
              placeholder="5000"
            />
            <p className="text-xs text-muted-foreground">
              Port for Docker push/pull operations (default: 5000)
            </p>
          </div>
        </>
      )}

      {config.type === 'gitlab' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="registryPort">Registry Port</Label>
            <Input
              id="registryPort"
              type="number"
              value={config.registryPort || ''}
              onChange={(e) => onConfigChange(prev => ({ ...prev, registryPort: e.target.value ? parseInt(e.target.value) : undefined }))}
              placeholder="5050"
            />
            <p className="text-xs text-muted-foreground">
              GitLab registry port (default: 5050). Uses HTTP protocol on this port.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="authUrl">JWT Auth URL (optional)</Label>
            <Input
              id="authUrl"
              value={config.authUrl}
              onChange={(e) => onConfigChange(prev => ({ ...prev, authUrl: e.target.value }))}
              placeholder="https://gitlab.example.com/jwt/auth"
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to auto-detect from registry URL
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="groupId">Group/Project ID (optional)</Label>
            <Input
              id="groupId"
              value={config.groupId}
              onChange={(e) => onConfigChange(prev => ({ ...prev, groupId: e.target.value }))}
              placeholder="e.g., mygroup/myproject"
            />
            <p className="text-xs text-muted-foreground">
              Limit access to specific GitLab group or project
            </p>
          </div>
        </>
      )}

      <div className="bg-blue-50 p-4 rounded-lg">
        <div className="text-sm text-blue-800">
          <strong>Important:</strong> You must test the connection before adding the repository.
          This ensures your credentials are valid and we can access your repositories.
        </div>
      </div>
    </div>
  )
}
