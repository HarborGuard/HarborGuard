"use client"

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'

interface ScanTemplate {
  id: string
  name: string
  description?: string
  environment: 'production' | 'staging' | 'development' | 'any'
  scannerConfig: {
    scanners: string[]
    failOnHigh?: boolean
    timeout?: number
    cacheEnabled?: boolean
    parallelScans?: boolean
  }
  policyConfig?: {
    maxCritical: number
    maxHigh: number
    maxMedium?: number
    complianceRequired: boolean
    generateReport?: boolean
  }
  isDefault: boolean
}

interface EditTemplateDialogProps {
  template: ScanTemplate
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

const AVAILABLE_SCANNERS = [
  { id: 'trivy', name: 'Trivy', description: 'Vulnerability scanner' },
  { id: 'grype', name: 'Grype', description: 'Vulnerability scanner' },
  { id: 'syft', name: 'Syft', description: 'SBOM generator' },
  { id: 'osv', name: 'OSV Scanner', description: 'OSV database scanner' },
  { id: 'dockle', name: 'Dockle', description: 'Compliance checker' },
  { id: 'dive', name: 'Dive', description: 'Layer analyzer' },
]

export function EditTemplateDialog({ template, open, onOpenChange, onSuccess }: EditTemplateDialogProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    environment: 'development' as 'production' | 'staging' | 'development' | 'any',
    scanners: [] as string[],
    failOnHigh: false,
    timeout: 300000,
    cacheEnabled: true,
    parallelScans: true,
    maxCritical: 10,
    maxHigh: 50,
    maxMedium: 100,
    complianceRequired: false,
    generateReport: false,
    isDefault: false,
  })

  useEffect(() => {
    if (template) {
      setFormData({
        name: template.name,
        description: template.description || '',
        environment: template.environment,
        scanners: template.scannerConfig.scanners,
        failOnHigh: template.scannerConfig.failOnHigh || false,
        timeout: template.scannerConfig.timeout || 300000,
        cacheEnabled: template.scannerConfig.cacheEnabled ?? true,
        parallelScans: template.scannerConfig.parallelScans ?? true,
        maxCritical: template.policyConfig?.maxCritical || 10,
        maxHigh: template.policyConfig?.maxHigh || 50,
        maxMedium: template.policyConfig?.maxMedium || 100,
        complianceRequired: template.policyConfig?.complianceRequired || false,
        generateReport: template.policyConfig?.generateReport || false,
        isDefault: template.isDefault,
      })
    }
  }, [template])

  const handleScannerToggle = (scannerId: string) => {
    const currentScanners = formData.scanners
    const isSelected = currentScanners.includes(scannerId)
    const newScanners = isSelected 
      ? currentScanners.filter(id => id !== scannerId)
      : [...currentScanners, scannerId]
    
    setFormData({ ...formData, scanners: newScanners })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (formData.scanners.length === 0) {
      toast.error('Please select at least one scanner')
      return
    }

    setLoading(true)

    try {
      const payload = {
        name: formData.name,
        description: formData.description || undefined,
        environment: formData.environment,
        scannerConfig: {
          scanners: formData.scanners,
          failOnHigh: formData.failOnHigh,
          timeout: formData.timeout,
          cacheEnabled: formData.cacheEnabled,
          parallelScans: formData.parallelScans,
        },
        policyConfig: {
          maxCritical: formData.maxCritical,
          maxHigh: formData.maxHigh,
          maxMedium: formData.maxMedium,
          complianceRequired: formData.complianceRequired,
          generateReport: formData.generateReport,
        },
        isDefault: formData.isDefault,
      }

      const response = await fetch(`/api/templates/${template.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (result.success) {
        toast.success('Template updated successfully')
        onOpenChange(false)
        onSuccess()
      } else {
        toast.error(result.error || 'Failed to update template')
      }
    } catch (error) {
      toast.error('Failed to update template')
      console.error('Error updating template:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Template: {template.name}</DialogTitle>
          <DialogDescription>
            Update the scan template configuration
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="scanners">Scanners</TabsTrigger>
              <TabsTrigger value="policies">Policies</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4">
              <div className="grid gap-4">
                <div>
                  <Label htmlFor="name">Template Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Production Comprehensive"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Optional description of this template"
                    rows={3}
                  />
                </div>

                <div>
                  <Label htmlFor="environment">Environment</Label>
                  <Select value={formData.environment} onValueChange={(value: any) => setFormData(prev => ({ ...prev, environment: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="development">Development</SelectItem>
                      <SelectItem value="staging">Staging</SelectItem>
                      <SelectItem value="production">Production</SelectItem>
                      <SelectItem value="any">Universal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="isDefault"
                    checked={formData.isDefault}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isDefault: !!checked }))}
                  />
                  <Label htmlFor="isDefault">Set as default template for this environment</Label>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="scanners" className="space-y-4">
              <div>
                <h3 className="text-lg font-medium mb-4">Scanner Selection</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {AVAILABLE_SCANNERS.map((scanner) => (
                    <Card key={scanner.id} className={`cursor-pointer transition-colors ${
                      formData.scanners.includes(scanner.id) ? 'ring-2 ring-blue-500 bg-blue-50' : ''
                    }`} onClick={() => handleScannerToggle(scanner.id)}>
                      <CardContent className="p-4">
                        <div className="flex items-center space-x-3">
                          <div className={`w-5 h-5 border-2 rounded flex items-center justify-center ${
                            formData.scanners.includes(scanner.id) 
                              ? 'bg-blue-500 border-blue-500' 
                              : 'border-gray-300'
                          }`}>
                            {formData.scanners.includes(scanner.id) && (
                              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            )}
                          </div>
                          <div>
                            <h4 className="font-medium">{scanner.name}</h4>
                            <p className="text-sm text-gray-600">{scanner.description}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="timeout">Timeout (ms)</Label>
                  <Input
                    id="timeout"
                    type="number"
                    value={formData.timeout}
                    onChange={(e) => setFormData(prev => ({ ...prev, timeout: parseInt(e.target.value) }))}
                    min={30000}
                    max={3600000}
                  />
                  <p className="text-sm text-gray-500 mt-1">Minimum: 30 seconds, Maximum: 1 hour</p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="failOnHigh"
                      checked={formData.failOnHigh}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, failOnHigh: !!checked }))}
                    />
                    <Label htmlFor="failOnHigh">Fail on high severity findings</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="cacheEnabled"
                      checked={formData.cacheEnabled}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, cacheEnabled: !!checked }))}
                    />
                    <Label htmlFor="cacheEnabled">Enable caching</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="parallelScans"
                      checked={formData.parallelScans}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, parallelScans: !!checked }))}
                    />
                    <Label htmlFor="parallelScans">Run scanners in parallel</Label>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="policies" className="space-y-4">
              <div>
                <h3 className="text-lg font-medium mb-4">Vulnerability Thresholds</h3>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <Label htmlFor="maxCritical">Max Critical</Label>
                    <Input
                      id="maxCritical"
                      type="number"
                      value={formData.maxCritical}
                      onChange={(e) => setFormData(prev => ({ ...prev, maxCritical: parseInt(e.target.value) }))}
                      min={0}
                    />
                  </div>

                  <div>
                    <Label htmlFor="maxHigh">Max High</Label>
                    <Input
                      id="maxHigh"
                      type="number"
                      value={formData.maxHigh}
                      onChange={(e) => setFormData(prev => ({ ...prev, maxHigh: parseInt(e.target.value) }))}
                      min={0}
                    />
                  </div>

                  <div>
                    <Label htmlFor="maxMedium">Max Medium</Label>
                    <Input
                      id="maxMedium"
                      type="number"
                      value={formData.maxMedium}
                      onChange={(e) => setFormData(prev => ({ ...prev, maxMedium: parseInt(e.target.value) }))}
                      min={0}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="complianceRequired"
                    checked={formData.complianceRequired}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, complianceRequired: !!checked }))}
                  />
                  <Label htmlFor="complianceRequired">Require compliance checks to pass</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="generateReport"
                    checked={formData.generateReport}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, generateReport: !!checked }))}
                  />
                  <Label htmlFor="generateReport">Generate compliance report</Label>
                </div>
              </div>

              <Card className="bg-blue-50 border-blue-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Policy Preview</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-sm space-y-1">
                    <div>Critical vulnerabilities: ≤ {formData.maxCritical}</div>
                    <div>High vulnerabilities: ≤ {formData.maxHigh}</div>
                    <div>Medium vulnerabilities: ≤ {formData.maxMedium}</div>
                    {formData.complianceRequired && (
                      <div className="text-green-600">✓ Compliance required</div>
                    )}
                    {formData.generateReport && (
                      <div className="text-blue-600">📊 Report generation enabled</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Updating...' : 'Update Template'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}