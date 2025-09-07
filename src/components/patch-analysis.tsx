'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  Shield, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  Loader2,
  Package,
  Wrench
} from 'lucide-react';

interface PatchAnalysisProps {
  scanId: string;
  imageId: string;
  onPatchExecute?: (analysis: any) => void;
}

export function PatchAnalysis({ scanId, imageId, onPatchExecute }: PatchAnalysisProps) {
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patching, setPatching] = useState(false);

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

  const executePatch = async (dryRun = false) => {
    setPatching(true);
    setError(null);

    try {
      const response = await fetch('/api/patches/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceImageId: imageId,
          scanId,
          dryRun
        })
      });

      if (!response.ok) {
        throw new Error('Failed to execute patch');
      }

      const data = await response.json();
      
      if (onPatchExecute) {
        onPatchExecute(data.patchOperation);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Patch execution failed');
    } finally {
      setPatching(false);
    }
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
              variant="outline"
              size="sm"
              onClick={() => executePatch(true)}
              disabled={patching || analysis.patchableVulnerabilities === 0}
            >
              {patching ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Wrench className="h-4 w-4 mr-2" />
              )}
              Dry Run
            </Button>
            <Button
              size="sm"
              onClick={() => executePatch(false)}
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
  );
}