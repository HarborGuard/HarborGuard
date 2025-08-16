"use client"

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'

interface ScheduleBasicFieldsProps {
  formData: {
    name: string
    description: string
    cronExpression: string
    isActive: boolean
  }
  setFormData: (updater: (prev: any) => any) => void
  isEdit?: boolean
}

export function ScheduleBasicFields({ formData, setFormData, isEdit = false }: ScheduleBasicFieldsProps) {
  return (
    <div className="grid gap-4">
      <div>
        <Label htmlFor="name">Schedule Name</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
          placeholder="e.g., Nightly Production Scan"
          required
        />
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          placeholder="Optional description of this schedule"
          rows={3}
        />
      </div>

      <div>
        <Label htmlFor="cronExpression">Schedule Frequency</Label>
        <Select 
          value={formData.cronExpression} 
          onValueChange={(value) => setFormData(prev => ({ ...prev, cronExpression: value }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select frequency or enter custom" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0 2 * * *">Daily at 2 AM</SelectItem>
            <SelectItem value="0 2 * * 0">Weekly on Sunday at 2 AM</SelectItem>
            <SelectItem value="0 2 1 * *">Monthly on 1st at 2 AM</SelectItem>
            <SelectItem value="0 */6 * * *">Every 6 hours</SelectItem>
            <SelectItem value="0 0 * * *">Daily at midnight</SelectItem>
            <SelectItem value="0 12 * * *">Daily at noon</SelectItem>
          </SelectContent>
        </Select>
        <Input
          className="mt-2"
          value={formData.cronExpression}
          onChange={(e) => setFormData(prev => ({ ...prev, cronExpression: e.target.value }))}
          placeholder="Or enter custom cron expression (e.g., 0 2 * * *)"
        />
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="isActive"
          checked={formData.isActive}
          onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: !!checked }))}
        />
        <Label htmlFor="isActive">
          {isEdit ? 'Schedule is active' : 'Enable schedule immediately'}
        </Label>
      </div>
    </div>
  )
}