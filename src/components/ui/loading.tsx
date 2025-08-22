import { cn } from "@/lib/utils"
import { IconShield, IconScan } from "@tabler/icons-react"
import { Skeleton } from "./skeleton"

interface LoadingSpinnerProps {
  className?: string
  size?: "sm" | "md" | "lg"
}

export function LoadingSpinner({ className, size = "md" }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-6 w-6", 
    lg: "h-8 w-8"
  }
  
  return (
    <div 
      className={cn("animate-spin rounded-full border-2 border-primary border-t-transparent", sizeClasses[size], className)}
    />
  )
}

interface LoadingStateProps {
  message?: string
  description?: string
  className?: string
  size?: "sm" | "md" | "lg"
  showIcon?: boolean
}

export function LoadingState({ 
  message = "Loading...", 
  description,
  className,
  size = "md",
  showIcon = true 
}: LoadingStateProps) {
  const Icon = showIcon ? IconShield : null
  
  return (
    <div className={cn("flex flex-col items-center justify-center space-y-4 p-8", className)}>
      <div className="flex items-center space-x-3">
        {Icon && (
          <Icon className={cn(
            "text-primary animate-pulse",
            size === "sm" ? "h-5 w-5" : size === "lg" ? "h-8 w-8" : "h-6 w-6"
          )} />
        )}
        <LoadingSpinner size={size} />
      </div>
      
      <div className="text-center space-y-2">
        <p className={cn(
          "font-medium text-foreground",
          size === "sm" ? "text-sm" : size === "lg" ? "text-lg" : "text-base"
        )}>
          {message}
        </p>
        {description && (
          <p className={cn(
            "text-muted-foreground",
            size === "sm" ? "text-xs" : "text-sm"
          )}>
            {description}
          </p>
        )}
      </div>
    </div>
  )
}

interface FullPageLoadingProps {
  message?: string
  description?: string
}

export function FullPageLoading({ 
  message = "Loading...", 
  description 
}: FullPageLoadingProps) {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <LoadingState 
        message={message} 
        description={description}
        size="lg"
        className="max-w-md mx-auto"
      />
    </div>
  )
}

interface ScanLoadingProps {
  className?: string
}

export function ScanLoading({ className }: ScanLoadingProps) {
  return (
    <div className={cn("flex items-center justify-center space-y-4 p-8", className)}>
      <div className="flex items-center space-x-3">
        <IconScan className="h-6 w-6 text-primary animate-pulse" />
        <LoadingSpinner />
      </div>
      
      <div className="text-center space-y-2">
        <p className="font-medium text-foreground">
          Analyzing Image Security
        </p>
        <p className="text-sm text-muted-foreground">
          Running vulnerability scans and security checks...
        </p>
      </div>
    </div>
  )
}

interface TableLoadingSkeletonProps {
  rows?: number
  columns?: number
  className?: string
}

export function TableLoadingSkeleton({ 
  rows = 5, 
  columns = 4, 
  className 
}: TableLoadingSkeletonProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {/* Header skeleton */}
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-20" />
        ))}
      </div>
      
      {/* Row skeletons */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton 
              key={colIndex} 
              className={cn(
                "h-6",
                colIndex === 0 ? "w-32" : "w-20"  // First column wider for names
              )} 
            />
          ))}
        </div>
      ))}
    </div>
  )
}

interface CardLoadingSkeletonProps {
  className?: string
}

export function CardLoadingSkeleton({ className }: CardLoadingSkeletonProps) {
  return (
    <div className={cn("space-y-4 p-6", className)}>
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-48" />
      </div>
      
      <div className="space-y-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-6 w-1/2" />
      </div>
      
      <div className="flex space-x-2">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-6 w-14" />
      </div>
    </div>
  )
}

interface StatsLoadingSkeletonProps {
  cards?: number
  className?: string
}

export function StatsLoadingSkeleton({ cards = 4, className }: StatsLoadingSkeletonProps) {
  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4", className)}>
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="border rounded-lg p-4 space-y-3">
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-16" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ))}
    </div>
  )
}