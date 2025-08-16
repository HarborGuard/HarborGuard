"use client"

import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface ScanTemplate {
  id: string
  name: string
  environment: string
  scannerConfig: {
    scanners: string[]
  }
  policyConfig?: {
    maxCritical: number
    maxHigh: number
    complianceRequired: boolean
  }
}

interface ScheduleConfigFieldsProps {
  formData: {
    name: string
    scanType: 'single' | 'bulk'
    cronExpression: string
    isActive: boolean
    templateId: string
    image: string
    tag: string
    registry: string
    imagePattern: string
    tagPattern: string
    registryPattern: string
  }
  setFormData: (updater: (prev: any) => any) => void
  templates: ScanTemplate[]
}

export function ScheduleConfigFields({ formData, setFormData, templates }: ScheduleConfigFieldsProps) {
  const selectedTemplate = templates.find(t => t.id === formData.templateId && formData.templateId !== 'none')

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="template">Scan Template (optional)</Label>
        <Select 
          value={formData.templateId} 
          onValueChange={(value) => setFormData(prev => ({ ...prev, templateId: value }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Choose a template (optional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No template</SelectItem>
            {templates.map((template) => (
              <SelectItem key={template.id} value={template.id}>
                {template.name} ({template.environment})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedTemplate && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <h4 className="font-medium text-sm mb-2">Template Preview</h4>
            <div className="text-sm space-y-1">
              <div>Environment: <Badge>{selectedTemplate.environment}</Badge></div>
              <div>Scanners: {selectedTemplate.scannerConfig.scanners.join(', ')}</div>
              {selectedTemplate.policyConfig && (
                <div>Policy: Critical ≤ {selectedTemplate.policyConfig.maxCritical}, High ≤ {selectedTemplate.policyConfig.maxHigh}</div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-gray-50 border-gray-200">
        <CardContent className="p-4">
          <h4 className="font-medium text-sm mb-2">Schedule Summary</h4>
          <div className="text-sm space-y-1">
            <div>Name: {formData.name || 'Unnamed schedule'}</div>
            <div>Type: {formData.scanType === 'single' ? 'Single Image' : 'Bulk Pattern'}</div>
            <div>Frequency: {formData.cronExpression || 'Not set'}</div>
            {formData.scanType === 'single' && formData.image && (
              <div>Target: {formData.registry ? `${formData.registry}/` : ''}{formData.image}:{formData.tag}</div>
            )}
            {formData.scanType === 'bulk' && (formData.imagePattern || formData.tagPattern || formData.registryPattern) && (
              <div>Patterns: {[formData.imagePattern, formData.tagPattern, formData.registryPattern].filter(Boolean).join(', ')}</div>
            )}
            <div>Status: {formData.isActive ? 'Active' : 'Inactive'}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}