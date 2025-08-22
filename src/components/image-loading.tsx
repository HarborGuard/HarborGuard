import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "./ui/card"
import { Skeleton } from "./ui/skeleton"
import { IconTag, IconShield } from "@tabler/icons-react"

export function ImagePageSkeleton() {
  return (
    <div className="@container/main flex flex-col gap-4 p-4 lg:p-6">
      {/* Image Metadata Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Basic Information Skeleton */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconTag className="h-5 w-5" />
              Image Information
            </CardTitle>
            <CardDescription>
              Container image details and metadata
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i}>
                  <Skeleton className="h-3 w-20 mb-2" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Summary Statistics Skeleton */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconShield className="h-5 w-5" />
              Security Summary
            </CardTitle>
            <CardDescription>
              Across all tags and scans
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-5 w-16" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Historical Scans Skeleton */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="animate-pulse">
              <IconShield className="h-5 w-5" />
            </div>
            Loading Scan History
          </CardTitle>
          <CardDescription>
            Fetching security scans and analysis data...
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Table header skeleton */}
          <div className="space-y-4">
            <div className="grid grid-cols-8 gap-4 pb-2 border-b">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-14" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-14" />
            </div>
            
            {/* Table rows skeleton */}
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="grid grid-cols-8 gap-4 py-2">
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-5 w-12" />
                <Skeleton className="h-5 w-8" />
                <Skeleton className="h-5 w-8" />
                <Skeleton className="h-5 w-8" />
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-12" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function ScanDetailsSkeleton() {
  return (
    <div className="@container/main flex flex-col gap-4 p-4 lg:p-6">
      {/* Header skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>

      {/* Stats cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-8 w-16" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-3 w-3/4" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Vulnerability reports skeleton */}
      <div className="grid grid-cols-1 gap-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="animate-pulse">
                  <IconShield className="h-5 w-5" />
                </div>
                <Skeleton className="h-6 w-48" />
              </div>
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Search bar skeleton */}
                <div className="flex items-center gap-4">
                  <Skeleton className="h-10 flex-1" />
                  <Skeleton className="h-8 w-32" />
                  <Skeleton className="h-4 w-20" />
                </div>
                
                {/* Table skeleton */}
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <div key={j} className="grid grid-cols-6 gap-4 py-2 border-b">
                      <Skeleton className="h-4 w-8" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-12" />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}