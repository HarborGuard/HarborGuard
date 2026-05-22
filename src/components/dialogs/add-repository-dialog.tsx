"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Check, X, Loader } from "lucide-react"
import { toast } from "sonner"
import { RegistryTypeSelector, repositoryTypes } from "@/components/repository-config/RegistryTypeSelector"
import { RegistryConfigForm } from "@/components/repository-config/RegistryConfigForm"
import type { RepositoryType } from "@/components/repository-config/RegistryTypeSelector"
import type { RepositoryConfig } from "@/components/repository-config/RegistryConfigForm"

interface AddRepositoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRepositoryAdded: () => void
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

        // Prepare the config with protocol for generic, gitlab, and nexus registries
        const testConfig = { ...config, type: config.type.toUpperCase() }
        if ((config.type === 'generic' || config.type === 'gitlab' || config.type === 'nexus') && config.registryUrl) {
            testConfig.registryUrl = `${protocol}://${config.registryUrl.replace(/^https?:\/\//, '')}`
        }
        if (config.type === 'gcr') {
            const loc = config.garLocation || 'us'
            testConfig.registryUrl = `${loc}-docker.pkg.dev`
            testConfig.username = config.garProjectId || ''
            testConfig.organization = `${loc}/${config.garRepositoryName || ''}`
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
        // Prepare the config with protocol for generic, gitlab, and nexus registries
        const saveConfig = { ...config, type: config.type.toUpperCase() }
        if ((config.type === 'generic' || config.type === 'gitlab' || config.type === 'nexus') && config.registryUrl) {
            saveConfig.registryUrl = `${protocol}://${config.registryUrl.replace(/^https?:\/\//, '')}`
        }
        if (config.type === 'gcr') {
            const loc = config.garLocation || 'us'
            saveConfig.registryUrl = `${loc}-docker.pkg.dev`
            saveConfig.username = config.garProjectId || ''
            saveConfig.organization = `${loc}/${config.garRepositoryName || ''}`
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

  const canTestConnection = config.type === 'gcr'
    ? !!(config.name && config.garProjectId && config.garRepositoryName && config.password)
    : !!(config.name && config.username && config.password &&
        ((config.type !== 'generic' && config.type !== 'gitlab') || config.registryUrl))

  const canAddRepository = testStatus === 'success'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-white/10 rounded-none shadow-2xl p-0 overflow-hidden">
        <div className="p-8 border-b border-white/10 bg-surface-1">
          <DialogHeader className="space-y-3">
            <DialogTitle className="text-sm uppercase tracking-wide-caps text-foreground">Add Repository</DialogTitle>
            <DialogDescription className="text-body-sm text-muted-foreground uppercase tracking-widest">
              {step === 'select' && 'Choose a repository type to get started'}
              {step === 'configure' && 'Configure your repository credentials'}
              {step === 'test' && 'Test connection and add repository'}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-8">
        {step === 'select' && (
          <RegistryTypeSelector onTypeSelect={handleTypeSelect} />
        )}

        {step === 'configure' && (
          <RegistryConfigForm
            config={config}
            protocol={protocol}
            onConfigChange={setConfig}
            onProtocolChange={setProtocol}
          />
        )}

        {step === 'test' && (
          <div className="space-y-4 py-4">
            <div className="border border-white/10 bg-surface-1 p-4">
              <h3 className="text-sm uppercase tracking-wide-caps text-foreground mb-3">Repository Configuration</h3>
              <div className="space-y-2">
                <div className="flex gap-2"><span className="text-caption uppercase tracking-widest text-muted-foreground/50 w-24 shrink-0">Name</span><span className="text-body-sm text-foreground">{config.name}</span></div>
                <div className="flex gap-2"><span className="text-caption uppercase tracking-widest text-muted-foreground/50 w-24 shrink-0">Type</span><span className="text-body-sm text-foreground">{repositoryTypes.find(t => t.type === config.type)?.title}</span></div>
                {config.type === 'gcr' ? (
                  <>
                    <div className="flex gap-2"><span className="text-caption uppercase tracking-widest text-muted-foreground/50 w-24 shrink-0">Project</span><span className="text-body-sm text-foreground">{config.garProjectId}</span></div>
                    <div className="flex gap-2"><span className="text-caption uppercase tracking-widest text-muted-foreground/50 w-24 shrink-0">Location</span><span className="text-body-sm text-foreground">{config.garLocation || 'us'}</span></div>
                    <div className="flex gap-2"><span className="text-caption uppercase tracking-widest text-muted-foreground/50 w-24 shrink-0">Repository</span><span className="text-body-sm text-foreground">{config.garRepositoryName}</span></div>
                    <div className="flex gap-2"><span className="text-caption uppercase tracking-widest text-muted-foreground/50 w-24 shrink-0">Registry</span><span className="text-body-sm text-foreground">{(config.garLocation || 'us')}-docker.pkg.dev</span></div>
                  </>
                ) : (
                  <>
                    <div className="flex gap-2"><span className="text-caption uppercase tracking-widest text-muted-foreground/50 w-24 shrink-0">Registry</span><span className="text-body-sm text-foreground">{(config.type === 'generic' || config.type === 'gitlab' || config.type === 'nexus') && config.registryUrl ? `${protocol}://${config.registryUrl}` : config.registryUrl}</span></div>
                    <div className="flex gap-2"><span className="text-caption uppercase tracking-widest text-muted-foreground/50 w-24 shrink-0">Username</span><span className="text-body-sm text-foreground">{config.username}</span></div>
                  </>
                )}
              </div>
            </div>

            <div className="border border-white/10 bg-surface-1 p-4">
              <h3 className="text-sm uppercase tracking-wide-caps text-foreground mb-3">Connection Test</h3>
              <div className="flex items-center gap-2 mb-3">
                {testStatus === 'idle' && <Badge variant="secondary" className="rounded-none uppercase tracking-widest text-caption">Not tested</Badge>}
                {testStatus === 'testing' && (
                  <Badge variant="secondary" className="bg-accent/20 text-accent border-accent/30 rounded-none uppercase tracking-widest text-caption">
                    <Loader className="mr-1 h-3 w-3 animate-spin" />
                    Testing...
                  </Badge>
                )}
                {testStatus === 'success' && (
                  <Badge variant="default" className="bg-green-900/30 text-green-400 border-green-500/30 rounded-none uppercase tracking-widest text-caption">
                    <Check className="mr-1 h-3 w-3" />
                    Success
                  </Badge>
                )}
                {testStatus === 'error' && (
                  <Badge variant="destructive" className="rounded-none uppercase tracking-widest text-caption">
                    <X className="mr-1 h-3 w-3" />
                    Failed
                  </Badge>
                )}
              </div>

              {testResult?.repositoryCount !== undefined && (
                <div className="text-body-sm text-green-400 uppercase tracking-widest text-caption">
                  Found {testResult.repositoryCount} repositories
                </div>
              )}

              {testResult?.error && (
                <div className="text-body-sm text-red-400">
                  {testResult.error}
                </div>
              )}
            </div>
          </div>
        )}
        </div>

        <div className="p-8 pt-0 flex justify-end gap-2 border-t border-white/10 py-4 px-8">
          <Button variant="outline" onClick={handleClose} className="rounded-none border-white/10 hover:bg-white/5 uppercase tracking-widest text-caption">
            Cancel
          </Button>

          {step === 'configure' && (
            <>
              <Button variant="outline" onClick={() => setStep('select')} className="rounded-none border-white/10 hover:bg-white/5 uppercase tracking-widest text-caption">
                Back
              </Button>
              <Button onClick={() => setStep('test')} className="rounded-none uppercase tracking-widest text-caption">
                Next
              </Button>
            </>
          )}

          {step === 'test' && (
            <>
              <Button variant="outline" onClick={() => setStep('configure')} className="rounded-none border-white/10 hover:bg-white/5 uppercase tracking-widest text-caption">
                Back
              </Button>
              <Button
                variant="outline"
                onClick={handleTestConnection}
                disabled={!canTestConnection || testStatus === 'testing'}
                className="rounded-none border-white/10 hover:bg-white/5 uppercase tracking-widest text-caption"
              >
                {testStatus === 'testing' ? (
                  <>
                    <Loader className="mr-2 h-4 w-4 animate-spin" />
                    Testing...
                  </>
                ) : (
                  'Test Connection'
                )}
              </Button>
              <Button
                onClick={handleAddRepository}
                disabled={!canAddRepository}
                className="rounded-none uppercase tracking-widest text-caption"
              >
                Add Repository
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
