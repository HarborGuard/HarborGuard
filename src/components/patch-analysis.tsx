'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { VulnerabilitySelectionModal } from '@/components/vulnerability-selection-modal';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Shield, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  Loader2,
  Package,
  Wrench,
  Clock,
  CheckCircle2
} from 'lucide-react';

interface PatchAnalysisProps {
  scanId: string;
  imageId: string;
  imageName?: string;
  imageTag?: string;
  onPatchExecute?: (analysis: any) => void;
}

interface PatchProgress {
  stage: 'initializing' | 'analyzing' | 'pulling' | 'patching' | 'pushing' | 'verifying' | 'completed' | 'failed';
  message: string;
  progress: number;
  patchedCount?: number;
  totalCount?: number;
}

export function PatchAnalysis({ scanId, imageId, imageName = 'image', imageTag = 'latest', onPatchExecute }: PatchAnalysisProps) {
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patching, setPatching] = useState(false);
  const [showVulnModal, setShowVulnModal] = useState(false);
  const [patchProgress, setPatchProgress] = useState<PatchProgress | null>(null);
  const [patchOperationId, setPatchOperationId] = useState<string | null>(null);

  useEffect(() => {
    analyzeScan();
  }, [scanId]);

  const analyzeScan = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/patches/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanId })
      });

      if (!response.ok) {
        throw new Error('Failed to analyze scan for patching');
      }

      const data = await response.json();
      setAnalysis(data.analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const executePatch = async (dryRun = false, selectedVulnerabilityIds?: string[], newImageName?: string, newImageTag?: string) => {
    setPatching(true);
    setError(null);
    
    // Initialize progress
    setPatchProgress({
      stage: 'initializing',
      message: 'Starting patch operation...',
      progress: 5,
      totalCount: selectedVulnerabilityIds?.length || analysis?.patchableVulnerabilities || 0
    });

    try {
      // Start patch operation
      setPatchProgress(prev => ({ ...prev!, stage: 'analyzing', message: 'Analyzing vulnerabilities...', progress: 10 }));
      
      const response = await fetch('/api/patches/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceImageId: imageId,
          scanId,
          dryRun,
          selectedVulnerabilityIds,
          newImageName,
          newImageTag
        })
      });

      if (!response.ok) {
        throw new Error('Failed to execute patch');
      }

      const data = await response.json();
      const operationId = data.patchOperation?.id;
      
      if (operationId && !dryRun) {
        setPatchOperationId(operationId);
        // Start polling for status
        await pollPatchStatus(operationId);
      } else {
        // For dry run, just show completed
        setPatchProgress({
          stage: 'completed',
          message: dryRun ? 'Dry run completed successfully' : 'Patch completed successfully',
          progress: 100
        });
        setTimeout(() => setPatchProgress(null), 3000);
      }
      
      if (onPatchExecute) {
        onPatchExecute(data.patchOperation);
      }
    } catch (err) {
      setPatchProgress({
        stage: 'failed',
        message: err instanceof Error ? err.message : 'Patch execution failed',
        progress: 0
      });
      setError(err instanceof Error ? err.message : 'Patch execution failed');
      setTimeout(() => setPatchProgress(null), 5000);
    } finally {
      setPatching(false);
    }
  };

  const pollPatchStatus = async (operationId: string) => {
    const pollInterval = 2000; // Poll every 2 seconds
    let attempts = 0;
    const maxAttempts = 150; // Max 5 minutes
    
    const poll = async () => {
      try {
        const response = await fetch(`/api/patches/${operationId}/status`);
        if (!response.ok) return;
        
        const data = await response.json();
        const operation = data.patchOperation;
        
        // Update progress based on status
        if (operation.status === 'ANALYZING') {
          setPatchProgress({
            stage: 'analyzing',
            message: 'Analyzing vulnerabilities and preparing patches...',
            progress: 20,
            patchedCount: 0,
            totalCount: operation.vulnerabilitiesCount
          });
        } else if (operation.status === 'PULLING') {
          setPatchProgress({
            stage: 'pulling',
            message: 'Pulling container image...',
            progress: 30
          });
        } else if (operation.status === 'PATCHING') {
          const patchedCount = operation.patchedCount || 0;
          const totalCount = operation.vulnerabilitiesCount || 1;
          const patchProgress = 40 + (patchedCount / totalCount) * 40; // 40-80% range
          
          setPatchProgress({
            stage: 'patching',
            message: `Applying patches... (${patchedCount}/${totalCount})`,
            progress: patchProgress,
            patchedCount,
            totalCount
          });
        } else if (operation.status === 'PUSHING') {
          setPatchProgress({
            stage: 'pushing',
            message: 'Saving patched image...',
            progress: 85
          });
        } else if (operation.status === 'VERIFYING') {
          setPatchProgress({
            stage: 'verifying',
            message: 'Verifying patches...',
            progress: 95
          });
        } else if (operation.status === 'COMPLETED') {
          setPatchProgress({
            stage: 'completed',
            message: `Successfully patched ${operation.patchedCount} vulnerabilities!`,
            progress: 100,
            patchedCount: operation.patchedCount,
            totalCount: operation.vulnerabilitiesCount
          });
          setTimeout(() => setPatchProgress(null), 5000);
          return; // Stop polling
        } else if (operation.status === 'FAILED') {
          setPatchProgress({
            stage: 'failed',
            message: operation.error || 'Patch operation failed',
            progress: 0
          });
          setTimeout(() => setPatchProgress(null), 5000);
          return; // Stop polling
        }
        
        // Continue polling if not completed
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, pollInterval);
        }
      } catch (err) {
        console.error('Failed to poll patch status:', err);
      }
    };
    
    // Start polling
    poll();
  };

  const handlePatchWithSelection = (selectedVulnerabilityIds: string[], newImageName: string, newImageTag: string) => {
    executePatch(false, selectedVulnerabilityIds, newImageName, newImageTag);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-2">Analyzing vulnerabilities for patching...</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Analysis Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!analysis) {
    return null;
  }

  const patchRate = analysis.totalVulnerabilities > 0
    ? (analysis.patchableVulnerabilities / analysis.totalVulnerabilities * 100).toFixed(1)
    : 0;

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Patch Analysis
            </CardTitle>
            <CardDescription>
              Automated vulnerability remediation with Buildah
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => setShowVulnModal(true)}
              disabled={patching || analysis.patchableVulnerabilities === 0}
            >
              {patching ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Execute Patch
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overview Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold">{analysis.totalVulnerabilities}</div>
            <div className="text-sm text-muted-foreground">Total CVEs</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {analysis.patchableVulnerabilities}
            </div>
            <div className="text-sm text-muted-foreground">Patchable</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">
              {analysis.notPatchableVulnerabilities}
            </div>
            <div className="text-sm text-muted-foreground">Not Patchable</div>
          </div>
        </div>

        {/* Patch Rate Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Patch Coverage</span>
            <span className="font-medium">{patchRate}%</span>
          </div>
          <Progress value={Number(patchRate)} className="h-2" />
        </div>

        {/* Severity Breakdown */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Patchable by Severity</h4>
          <div className="grid grid-cols-4 gap-2">
            {analysis.criticalPatchable > 0 && (
              <Badge variant="destructive">
                Critical: {analysis.criticalPatchable}
              </Badge>
            )}
            {analysis.highPatchable > 0 && (
              <Badge className="bg-orange-500">
                High: {analysis.highPatchable}
              </Badge>
            )}
            {analysis.mediumPatchable > 0 && (
              <Badge className="bg-yellow-500">
                Medium: {analysis.mediumPatchable}
              </Badge>
            )}
            {analysis.lowPatchable > 0 && (
              <Badge variant="secondary">
                Low: {analysis.lowPatchable}
              </Badge>
            )}
          </div>
        </div>

        {/* Package Manager Breakdown */}
        {Object.keys(analysis.patchableByManager).length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Patches by Package Manager</h4>
            <div className="flex flex-wrap gap-2">
              {Object.entries(analysis.patchableByManager).map(([manager, count]) => (
                <div key={manager} className="flex items-center gap-1">
                  <Package className="h-4 w-4" />
                  <span className="text-sm">
                    {manager}: <strong>{count as number}</strong>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Status Message */}
        {analysis.patchableVulnerabilities === 0 ? (
          <Alert>
            <XCircle className="h-4 w-4" />
            <AlertTitle>No Patchable Vulnerabilities</AlertTitle>
            <AlertDescription>
              None of the detected vulnerabilities have available fixes that can be automatically applied.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>Ready to Patch</AlertTitle>
            <AlertDescription>
              {analysis.patchableVulnerabilities} vulnerabilities can be automatically patched.
              Run a dry run first to preview the changes.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
    
    <VulnerabilitySelectionModal
      open={showVulnModal}
      onOpenChange={setShowVulnModal}
      scanId={scanId}
      imageName={imageName}
      imageTag={imageTag}
      onConfirm={handlePatchWithSelection}
    />
    
    {/* Patch Progress Dialog */}
    <Dialog open={!!patchProgress} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {patchProgress?.stage === 'failed' ? (
              <XCircle className="h-5 w-5 text-red-500" />
            ) : patchProgress?.stage === 'completed' ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <Shield className="h-5 w-5 text-blue-500" />
            )}
            Patching {imageName}:{imageTag}
          </DialogTitle>
          <DialogDescription>
            {patchProgress?.message}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Progress Bar */}
          <div className="space-y-2">
            <Progress value={patchProgress?.progress || 0} className="h-3" />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{patchProgress?.progress}%</span>
              {patchProgress?.patchedCount !== undefined && patchProgress?.totalCount && (
                <span>{patchProgress.patchedCount} / {patchProgress.totalCount} patches</span>
              )}
            </div>
          </div>
          
          {/* Stage indicators */}
          <div className="space-y-2">
            {['initializing', 'analyzing', 'pulling', 'patching', 'pushing', 'verifying', 'completed'].map((stage) => {
              const currentStage = patchProgress?.stage || '';
              const stageIndex = ['initializing', 'analyzing', 'pulling', 'patching', 'pushing', 'verifying', 'completed'].indexOf(stage);
              const currentIndex = ['initializing', 'analyzing', 'pulling', 'patching', 'pushing', 'verifying', 'completed'].indexOf(currentStage);
              const isActive = stage === currentStage;
              const isDone = currentIndex > stageIndex;
              const isFailed = currentStage === 'failed';
              
              return (
                <div key={stage} className="flex items-center gap-2">
                  {isDone ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : isActive && !isFailed ? (
                    <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                  ) : isFailed && isActive ? (
                    <XCircle className="h-4 w-4 text-red-500" />
                  ) : (
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className={`text-sm capitalize ${isActive ? 'font-medium' : 'text-muted-foreground'}`}>
                    {stage.replace('_', ' ')}
                  </span>
                </div>
              );
            })}
          </div>
          
          {/* Error or success message */}
          {patchProgress?.stage === 'failed' && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Patch Failed</AlertTitle>
              <AlertDescription>{patchProgress.message}</AlertDescription>
            </Alert>
          )}
          
          {patchProgress?.stage === 'completed' && (
            <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertTitle>Patch Successful</AlertTitle>
              <AlertDescription>
                Successfully patched {patchProgress.patchedCount} out of {patchProgress.totalCount} vulnerabilities.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}