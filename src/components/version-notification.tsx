"use client"

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card'
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useVersionCheck } from '@/hooks/useVersionCheck'
import { Download, RefreshCw, X, AlertCircle, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'

export function VersionNotification() {
  const { 
    versionInfo, 
    loading, 
    error, 
    checkVersion, 
    hasUpdate, 
    currentVersion, 
    latestVersion 
  } = useVersionCheck(true)

  const [showDialog, setShowDialog] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // Don't show if no update available, loading, error, or dismissed
  if (!hasUpdate || loading || error || dismissed) {
    return null
  }

  const handleDismiss = () => {
    setDismissed(true)
    toast.info('Version notification dismissed', {
      description: 'You can check for updates anytime in the settings'
    })
  }

  const handleRefreshCheck = async () => {
    await checkVersion()
    if (!hasUpdate) {
      toast.success('No updates available', {
        description: 'You are running the latest version'
      })
    }
  }

  const handleViewDetails = () => {
    setShowDialog(true)
  }

  return (
    <>
      {/* Compact notification in sidebar */}
      <Card className="mx-2 mb-2 border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
        <CardContent className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Download className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <Badge variant="secondary" className="text-xs">
                  Update Available
                </Badge>
              </div>
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Version {latestVersion} is available
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 truncate">
                Current: {currentVersion}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="h-6 w-6 p-0 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
            >
              <X className="h-3 w-3" />
              <span className="sr-only">Dismiss</span>
            </Button>
          </div>
          <div className="flex gap-1 mt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleViewDetails}
              className="text-xs h-7 border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900"
            >
              View Details
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Detailed dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Update Available
            </DialogTitle>
            <DialogDescription>
              A new version of Harbor Guard is available for download.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div>
                <p className="text-sm font-medium">Current Version</p>
                <p className="text-sm text-muted-foreground">{currentVersion}</p>
              </div>
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>

            <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg dark:bg-blue-950 dark:border-blue-800">
              <div>
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  Latest Version
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  {latestVersion}
                </p>
              </div>
              <Badge className="bg-blue-600 hover:bg-blue-700">
                New
              </Badge>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg dark:bg-amber-950/50 dark:border-amber-800">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-amber-900 dark:text-amber-100">
                    Update Instructions
                  </p>
                  <p className="text-amber-700 dark:text-amber-300 mt-1">
                    Pull the latest Docker image and restart your container:
                  </p>
                  <code className="block mt-2 p-2 bg-amber-100 dark:bg-amber-900/50 rounded text-xs font-mono">
                    docker pull ghcr.io/harborguard/harborguard:latest && docker restart harborguard
                  </code>
                </div>
              </div>
            </div>

            {versionInfo?.lastChecked && (
              <p className="text-xs text-muted-foreground text-center">
                Last checked: {versionInfo.lastChecked.toLocaleString()}
              </p>
            )}
          </div>

          <DialogFooter className="flex-row justify-between">
            <Button
              variant="outline"
              onClick={handleRefreshCheck}
              disabled={loading}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleDismiss}>
                Dismiss
              </Button>
              <Button onClick={() => setShowDialog(false)}>
                Close
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}