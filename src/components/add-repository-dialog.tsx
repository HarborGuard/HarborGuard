"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { IconBrandDocker, IconBrandGithub, IconBrandGitlab, IconServer, IconCheck, IconX, IconLoader } from "@tabler/icons-react"
import { toast } from "sonner"

interface AddRepositoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRepositoryAdded: () => void
}

type RepositoryType = 'dockerhub' | 'ghcr' | 'gitlab' | 'generic'

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

export function AddRepositoryDialog({ open, onOpenChange, onRepositoryAdded }: AddRepositoryDialogProps) {
  const [step, setStep] = useState<'select' | 'configure' | 'test'>('select')
  const [selectedType, setSelectedType] = useState<RepositoryType>('dockerhub')
  const [protocol, setProtocol] = useState<'https' | 'http'>('https')
  const [config, setConfig] = useState<RepositoryConfig>({
    name: '',
    type: 'dockerhub',
    registryUrl: '',
    username: '',
    password: '',
    organization: '',
    skipTlsVerify: false,
  })
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [testResult, setTestResult] = useState<{ repositoryCount?: number; error?: string } | null>(null)

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
      type: 'generic' as const,
      title: 'Generic Registry',
      description: 'Connect to any OCI-compliant container registry',
      icon: <IconServer className="h-8 w-8" />,
      registryUrl: '',
    },
  ]

  const handleTypeSelect = (type: RepositoryType) => {
    setSelectedType(type)
    const registryInfo = repositoryTypes.find(t => t.type === type)
    setConfig(prev => ({
      ...prev,
      type,
      registryUrl: registryInfo?.registryUrl || '',
      name: registryInfo?.title || '',
      skipTlsVerify: false,
    }))
    setStep('configure')
  }

  const handleTestConnection = async () => {
    setTestStatus('testing')
    setTestResult(null)

    // Prepare the config with protocol for generic and gitlab registries
    const testConfig = { ...config }
    if ((config.type === 'generic' || config.type === 'gitlab') && config.registryUrl) {
      testConfig.registryUrl = `${protocol}://${config.registryUrl.replace(/^https?:\/\//, '')}`
    }

    try {
      const response = await fetch('/api/repositories/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testConfig),
      })

      const result = await response.json()

      if (response.ok && result.success) {
        setTestStatus('success')
        setTestResult({ repositoryCount: result.repositoryCount })
        toast.success(`Connection successful! Found ${result.repositoryCount} repositories.`)
      } else {
        setTestStatus('error')
        setTestResult({ error: result.error || 'Connection test failed' })
        toast.error(result.error || 'Connection test failed')
      }
    } catch (error) {
      console.error('Test connection failed:', error)
      setTestStatus('error')
      setTestResult({ error: 'Failed to test connection' })
      toast.error('Failed to test connection')
    }
  }

  const handleAddRepository = async () => {
    // Prepare the config with protocol for generic and gitlab registries
    const saveConfig = { ...config }
    if ((config.type === 'generic' || config.type === 'gitlab') && config.registryUrl) {
      saveConfig.registryUrl = `${protocol}://${config.registryUrl.replace(/^https?:\/\//, '')}`
    }

    // Include test results if the test was successful
    const requestBody = {
      ...saveConfig,
      testResult: testStatus === 'success' ? {
        success: true,
        repositoryCount: testResult?.repositoryCount
      } : undefined
    }

    try {
      const response = await fetch('/api/repositories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (response.ok) {
        toast.success('Repository added successfully')
        handleClose()
        onRepositoryAdded()
      } else {
        const error = await response.json()
        toast.error(error.message || 'Failed to add repository')
      }
    } catch (error) {
      console.error('Failed to add repository:', error)
      toast.error('Failed to add repository')
    }
  }

  const handleClose = () => {
    setStep('select')
    setSelectedType('dockerhub')
    setProtocol('https')
    setConfig({
      name: '',
      type: 'dockerhub',
      registryUrl: '',
      username: '',
      password: '',
      organization: '',
      skipTlsVerify: false,
    })
    setTestStatus('idle')
    setTestResult(null)
    onOpenChange(false)
  }

  const canTestConnection = config.name && config.username && config.password && 
    ((config.type !== 'generic' && config.type !== 'gitlab') || config.registryUrl)

  const canAddRepository = testStatus === 'success'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Repository</DialogTitle>
          <DialogDescription>
            {step === 'select' && 'Choose a repository type to get started'}
            {step === 'configure' && 'Configure your repository credentials'}
            {step === 'test' && 'Test connection and add repository'}
          </DialogDescription>
        </DialogHeader>

        {step === 'select' && (
          <div className="grid gap-4 py-4">
            {repositoryTypes.map((type) => (
              <Card 
                key={type.type}
                className="cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => handleTypeSelect(type.type)}
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
        )}

        {step === 'configure' && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Repository Name</Label>
              <Input
                id="name"
                value={config.name}
                onChange={(e) => setConfig(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter a name for this repository"
              />
            </div>

            {(config.type === 'generic' || config.type === 'gitlab') && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="registryUrl">Registry URL</Label>
                  <div className="flex gap-2">
                    <Select value={protocol} onValueChange={(value: 'https' | 'http') => setProtocol(value)}>
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
                          setProtocol('http')
                          value = value.substring(7)
                        } else if (value.startsWith('https://')) {
                          setProtocol('https')
                          value = value.substring(8)
                        }
                        setConfig(prev => ({ ...prev, registryUrl: value }))
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
                        setConfig(prev => ({ ...prev, skipTlsVerify: checked === true }))
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
                 config.type === 'gitlab' ? 'GitLab Username' : 'Username'}
              </Label>
              <Input
                id="username"
                value={config.username}
                onChange={(e) => setConfig(prev => ({ ...prev, username: e.target.value }))}
                placeholder="Enter username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">
                {config.type === 'dockerhub' ? 'Personal Access Token' : 
                 config.type === 'ghcr' ? 'GitHub Personal Access Token' : 
                 config.type === 'gitlab' ? 'GitLab Password' : 'Password/Token'}
              </Label>
              <Input
                id="password"
                type="password"
                value={config.password}
                onChange={(e) => setConfig(prev => ({ ...prev, password: e.target.value }))}
                placeholder={
                  config.type === 'dockerhub' ? 'Enter Docker Hub PAT' :
                  config.type === 'ghcr' ? 'Enter GitHub PAT with packages:read scope' :
                  config.type === 'gitlab' ? 'Enter GitLab admin password' :
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
                  onChange={(e) => setConfig(prev => ({ ...prev, organization: e.target.value }))}
                  placeholder="Enter organization name for org packages"
                />
              </div>
            )}

            {config.type === 'gitlab' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="registryPort">Registry Port</Label>
                  <Input
                    id="registryPort"
                    type="number"
                    value={config.registryPort || ''}
                    onChange={(e) => setConfig(prev => ({ ...prev, registryPort: e.target.value ? parseInt(e.target.value) : undefined }))}
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
                    onChange={(e) => setConfig(prev => ({ ...prev, authUrl: e.target.value }))}
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
                    onChange={(e) => setConfig(prev => ({ ...prev, groupId: e.target.value }))}
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
        )}

        {step === 'test' && (
          <div className="space-y-4 py-4">
            <div className="border rounded-lg p-4">
              <h3 className="font-medium mb-2">Repository Configuration</h3>
              <div className="space-y-2 text-sm">
                <div><strong>Name:</strong> {config.name}</div>
                <div><strong>Type:</strong> {repositoryTypes.find(t => t.type === config.type)?.title}</div>
                <div><strong>Registry:</strong> {(config.type === 'generic' || config.type === 'gitlab') && config.registryUrl ? `${protocol}://${config.registryUrl}` : config.registryUrl}</div>
                <div><strong>Username:</strong> {config.username}</div>
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <h3 className="font-medium mb-2">Connection Test</h3>
              <div className="flex items-center gap-2 mb-3">
                {testStatus === 'idle' && <Badge variant="secondary">Not tested</Badge>}
                {testStatus === 'testing' && (
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                    <IconLoader className="mr-1 h-3 w-3 animate-spin" />
                    Testing...
                  </Badge>
                )}
                {testStatus === 'success' && (
                  <Badge variant="default" className="bg-green-100 text-green-800">
                    <IconCheck className="mr-1 h-3 w-3" />
                    Success
                  </Badge>
                )}
                {testStatus === 'error' && (
                  <Badge variant="destructive">
                    <IconX className="mr-1 h-3 w-3" />
                    Failed
                  </Badge>
                )}
              </div>

              {testResult?.repositoryCount !== undefined && (
                <div className="text-sm text-green-700">
                  Found {testResult.repositoryCount} repositories
                </div>
              )}

              {testResult?.error && (
                <div className="text-sm text-red-600">
                  {testResult.error}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          
          {step === 'configure' && (
            <>
              <Button variant="outline" onClick={() => setStep('select')}>
                Back
              </Button>
              <Button onClick={() => setStep('test')}>
                Next
              </Button>
            </>
          )}

          {step === 'test' && (
            <>
              <Button variant="outline" onClick={() => setStep('configure')}>
                Back
              </Button>
              <Button
                variant="outline"
                onClick={handleTestConnection}
                disabled={!canTestConnection || testStatus === 'testing'}
              >
                {testStatus === 'testing' ? (
                  <>
                    <IconLoader className="mr-2 h-4 w-4 animate-spin" />
                    Testing...
                  </>
                ) : (
                  'Test Connection'
                )}
              </Button>
              <Button
                onClick={handleAddRepository}
                disabled={!canAddRepository}
              >
                Add Repository
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}