"use client"

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { Clock, Target, Settings } from 'lucide-react'
import { ScheduleBasicFields } from './ScheduleBasicFields'
import { ScheduleTargetFields } from './ScheduleTargetFields'
import { ScheduleConfigFields } from './ScheduleConfigFields'

interface ScanSchedule {
  id: string
  name: string
  description?: string
  cronExpression: string
  isActive: boolean
  scanRequest: {
    type: 'single' | 'bulk'
    image?: string
    tag?: string
    registry?: string
    patterns?: {
      imagePattern?: string
      tagPattern?: string
      registryPattern?: string
    }
    excludePatterns?: string[]
    maxConcurrent?: number
    scanTemplate?: string
  }
}

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

interface EditScheduleDialogProps {
  schedule: ScanSchedule
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function EditScheduleDialog({ schedule, open, onOpenChange, onSuccess }: EditScheduleDialogProps) {
  const [loading, setLoading] = useState(false)
  const [templates, setTemplates] = useState<ScanTemplate[]>([])
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    cronExpression: '',
    scanType: 'single' as 'single' | 'bulk',
    
    // Single scan fields
    image: '',
    tag: 'latest',
    registry: '',
    
    // Bulk scan fields
    imagePattern: '',
    tagPattern: '',
    registryPattern: '',
    excludePatterns: [] as string[],
    maxConcurrent: 3,
    
    // Template selection
    templateId: '',
    
    isActive: true,
  })

  useEffect(() => {
    if (open && schedule) {
      setFormData({
        name: schedule.name,
        description: schedule.description || '',
        cronExpression: schedule.cronExpression,
        scanType: schedule.scanRequest.type,
        
        // Single scan fields
        image: schedule.scanRequest.image || '',
        tag: schedule.scanRequest.tag || 'latest',
        registry: schedule.scanRequest.registry || '',
        
        // Bulk scan fields
        imagePattern: schedule.scanRequest.patterns?.imagePattern || '',
        tagPattern: schedule.scanRequest.patterns?.tagPattern || '',
        registryPattern: schedule.scanRequest.patterns?.registryPattern || '',
        excludePatterns: schedule.scanRequest.excludePatterns || [],
        maxConcurrent: schedule.scanRequest.maxConcurrent || 3,
        
        // Template selection
        templateId: schedule.scanRequest.scanTemplate || 'none',
        
        isActive: schedule.isActive,
      })
      fetchTemplates()
    }
  }, [open, schedule])

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/templates')
      const result = await response.json()
      if (result.success) {
        setTemplates(result.data)
      }
    } catch (error) {
      console.error('Error fetching templates:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name || !formData.cronExpression) {
      toast.error('Please provide schedule name and cron expression')
      return
    }

    if (formData.scanType === 'single' && !formData.image) {
      toast.error('Please specify an image for single scan')
      return
    }

    if (formData.scanType === 'bulk' && !formData.imagePattern && !formData.tagPattern && !formData.registryPattern) {
      toast.error('Please specify at least one pattern for bulk scan')
      return
    }

    setLoading(true)

    try {
      let scanRequest: any

      if (formData.scanType === 'single') {
        scanRequest = {
          type: 'single',
          image: formData.image,
          tag: formData.tag,
          ...(formData.registry && { registry: formData.registry }),
        }
      } else {
        scanRequest = {
          type: 'bulk',
          patterns: {
            ...(formData.imagePattern && { imagePattern: formData.imagePattern }),
            ...(formData.tagPattern && { tagPattern: formData.tagPattern }),
            ...(formData.registryPattern && { registryPattern: formData.registryPattern }),
          },
          excludePatterns: formData.excludePatterns.filter(p => p.length > 0),
          maxConcurrent: formData.maxConcurrent,
        }
      }

      if (formData.templateId && formData.templateId !== 'none') {
        scanRequest.scanTemplate = formData.templateId
      }

      const payload = {
        name: formData.name,
        description: formData.description || undefined,
        cronExpression: formData.cronExpression,
        scanRequest,
        isActive: formData.isActive,
      }

      const response = await fetch(`/api/schedules/${schedule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (result.success) {
        toast.success('Schedule updated successfully')
        onSuccess()
        onOpenChange(false)
      } else {
        toast.error(result.error || 'Failed to update schedule')
      }
    } catch (error) {
      toast.error('Failed to update schedule')
      console.error('Error updating schedule:', error)
    } finally {
      setLoading(false)
    }
  }


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Schedule: {schedule?.name}</DialogTitle>
          <DialogDescription>
            Update the scan schedule configuration
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Schedule
              </TabsTrigger>
              <TabsTrigger value="target" className="flex items-center gap-2">
                <Target className="h-4 w-4" />
                Target
              </TabsTrigger>
              <TabsTrigger value="config" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Configuration
              </TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4">
              <ScheduleBasicFields 
                formData={formData}
                setFormData={setFormData}
                isEdit={true}
              />
            </TabsContent>

            <TabsContent value="target" className="space-y-4">
              <ScheduleTargetFields 
                formData={formData}
                setFormData={setFormData}
              />
            </TabsContent>

            <TabsContent value="config" className="space-y-4">
              <ScheduleConfigFields 
                formData={formData}
                setFormData={setFormData}
                templates={templates}
              />
            </TabsContent>
          </Tabs>

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Updating...' : 'Update Schedule'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}