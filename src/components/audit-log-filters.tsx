"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { CalendarIcon, FilterX } from "lucide-react"
import { format } from "date-fns"
import { useState } from "react"

export interface AuditLogFilters {
  eventType?: string
  category?: string
  userIp?: string
  resource?: string
  search?: string
  startDate?: string
  endDate?: string
}

interface AuditLogFiltersProps {
  filters: AuditLogFilters
  onFiltersChange: (filters: AuditLogFilters) => void
}

const eventTypes = [
  { value: "page_view", label: "Page View" },
  { value: "scan_start", label: "Scan Start" },
  { value: "scan_complete", label: "Scan Complete" },
  { value: "scan_failed", label: "Scan Failed" },
  { value: "cve_classification", label: "CVE Classification" },
  { value: "image_delete", label: "Image Delete" },
  { value: "image_rescan", label: "Image Rescan" },
  { value: "bulk_scan_start", label: "Bulk Scan Start" },
  { value: "user_login", label: "User Login" },
  { value: "user_logout", label: "User Logout" },
  { value: "system_error", label: "System Error" },
]

const categories = [
  { value: "informative", label: "Informative" },
  { value: "action", label: "Action" },
  { value: "security", label: "Security" },
  { value: "error", label: "Error" },
]

export function AuditLogFilters({ filters, onFiltersChange }: AuditLogFiltersProps) {
  const [startDate, setStartDate] = useState<Date | undefined>(
    filters.startDate ? new Date(filters.startDate) : undefined
  )
  const [endDate, setEndDate] = useState<Date | undefined>(
    filters.endDate ? new Date(filters.endDate) : undefined
  )

  const updateFilter = (key: keyof AuditLogFilters, value: string | undefined) => {
    onFiltersChange({
      ...filters,
      [key]: value === "all" || !value ? undefined : value,
    })
  }

  const updateDateFilter = (key: 'startDate' | 'endDate', date: Date | undefined) => {
    if (key === 'startDate') {
      setStartDate(date)
    } else {
      setEndDate(date)
    }
    
    onFiltersChange({
      ...filters,
      [key]: date ? date.toISOString() : undefined,
    })
  }

  const clearFilters = () => {
    setStartDate(undefined)
    setEndDate(undefined)
    onFiltersChange({})
  }

  const hasActiveFilters = Object.values(filters).some(value => value !== undefined && value !== "")

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="space-y-2">
        <Label htmlFor="search">Search</Label>
        <Input
          id="search"
          placeholder="Search logs..."
          value={filters.search || ""}
          onChange={(e) => updateFilter("search", e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="eventType">Event Type</Label>
        <Select
          value={filters.eventType || "all"}
          onValueChange={(value) => updateFilter("eventType", value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="All event types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All event types</SelectItem>
            {eventTypes.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="category">Category</Label>
        <Select
          value={filters.category || "all"}
          onValueChange={(value) => updateFilter("category", value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.value} value={category.value}>
                {category.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="userIp">User IP</Label>
        <Input
          id="userIp"
          placeholder="Filter by IP..."
          value={filters.userIp || ""}
          onChange={(e) => updateFilter("userIp", e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="resource">Resource</Label>
        <Input
          id="resource"
          placeholder="Filter by resource..."
          value={filters.resource || ""}
          onChange={(e) => updateFilter("resource", e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>Start Date</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-start text-left font-normal"
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {startDate ? format(startDate, "PPP") : <span>Pick a date</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={startDate}
              onSelect={(date) => updateDateFilter('startDate', date)}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-2">
        <Label>End Date</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-start text-left font-normal"
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {endDate ? format(endDate, "PPP") : <span>Pick a date</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={endDate}
              onSelect={(date) => updateDateFilter('endDate', date)}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex items-end">
        {hasActiveFilters && (
          <Button 
            variant="outline" 
            onClick={clearFilters}
            className="w-full"
          >
            <FilterX className="mr-2 h-4 w-4" />
            Clear Filters
          </Button>
        )}
      </div>
    </div>
  )
}