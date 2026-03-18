interface ScatterplotDataPoint {
  library: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  count: number
  x: number
  y: number
  color: string
}

/**
 * Adjust vulnerability counts based on false positive classifications.
 * Reduces counts starting from critical severity, then high, medium, low.
 */
function adjustVulnerabilityCounts(
  imageName: string,
  severities: any,
  consolidatedClassifications: Map<string, any[]>
) {
  const classifications = consolidatedClassifications.get(imageName) || [];
  const falsePositiveCount = classifications.filter(c => c.isFalsePositive).length;

  // Log all vulnerabilities for this image
  console.group(`🔍 Image: ${imageName}`);
  console.log(`📋 Raw vulnerabilities:`, severities);
  console.log(`🎯 Total classifications:`, classifications.length);
  console.log(`❌ False positives:`, falsePositiveCount);

  if (classifications.length > 0) {
    console.log(`📊 All classifications for ${imageName}:`, classifications.map(c => ({
      cveId: c.cveId,
      severity: c.severity,
      isFalsePositive: c.isFalsePositive,
      justification: c.justification
    })));

    const falsePositives = classifications.filter(c => c.isFalsePositive);
    if (falsePositives.length > 0) {
      console.log(`🚫 False positive CVEs:`, falsePositives.map(fp => ({
        cveId: fp.cveId,
        severity: fp.severity,
        justification: fp.justification
      })));
    }
  }

  if (falsePositiveCount === 0) {
    console.log(`✅ No false positives - using original counts`);
    console.groupEnd();
    return severities;
  }

  // Apply a conservative reduction based on false positive classifications
  const totalVulns = (severities.crit || 0) + (severities.high || 0) + (severities.med || 0) + (severities.low || 0);

  if (totalVulns === 0) {
    console.groupEnd();
    return severities;
  }

  // More aggressive reduction for critical vulnerabilities since they're most likely to be false positives
  const criticalReduction = Math.min(falsePositiveCount, severities.crit || 0);
  const remainingFalsePositives = Math.max(0, falsePositiveCount - criticalReduction);

  const highReduction = Math.min(remainingFalsePositives, severities.high || 0);
  const stillRemainingFalsePositives = Math.max(0, remainingFalsePositives - highReduction);

  const mediumReduction = Math.min(stillRemainingFalsePositives * 0.5, severities.med || 0);
  const lowReduction = Math.min(stillRemainingFalsePositives * 0.2, severities.low || 0);

  const adjusted = {
    crit: Math.max(0, (severities.crit || 0) - criticalReduction),
    high: Math.max(0, (severities.high || 0) - highReduction),
    med: Math.max(0, Math.round((severities.med || 0) - mediumReduction)),
    low: Math.max(0, Math.round((severities.low || 0) - lowReduction)),
  };

  // Log the adjustment for debugging
  console.log(`📊 Adjusted vulnerabilities:`, adjusted);
  console.log(`🔄 Reductions - Critical: ${criticalReduction}, High: ${highReduction}, Medium: ${mediumReduction.toFixed(1)}, Low: ${lowReduction.toFixed(1)}`);
  console.groupEnd();

  return adjusted;
}

/**
 * Generate a deterministic position based on image name to ensure consistency.
 */
function generatePosition(imageName: string, severityOffset: number): number {
  let hash = 0;
  for (let i = 0; i < imageName.length; i++) {
    const char = imageName.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  const normalizedHash = Math.abs(hash) / 2147483647; // Normalize to 0-1
  const jitter = normalizedHash * 0.15; // Reduced jitter for better spacing
  return jitter + severityOffset;
}

/**
 * Transform scan data into scatterplot data points.
 * Groups by image name, deduplicates to latest scan, adjusts for false positives,
 * and creates data points for each severity level.
 */
function transformScansToChartData(
  scans: any[],
  consolidatedClassifications: Map<string, any[]>
): ScatterplotDataPoint[] {
  if (!scans || scans.length === 0) return []

  // Group by image name to avoid duplicates from multiple scans of same image
  // Use the latest scan data for each image (scans are sorted by date DESC)
  const imageMap = new Map<string, any>()

  scans.forEach((scan: any) => {
    if (!scan.severities) return

    const imageName = scan.imageName || scan.image || 'unknown'

    // Only keep the first scan for each image (which is the latest due to sorting)
    if (!imageMap.has(imageName)) {
      imageMap.set(imageName, scan)
    }
  })

  // Create data points from unique images
  const dataPoints: ScatterplotDataPoint[] = []

  imageMap.forEach((scan, imageName) => {
    // Apply false positive adjustments to the vulnerability counts
    const adjustedSeverities = adjustVulnerabilityCounts(imageName, scan.severities, consolidatedClassifications)
    const { crit, high, med, low } = adjustedSeverities

    // Create data points for each severity level with counts
    if (crit > 0) {
      dataPoints.push({
        library: imageName,
        severity: 'critical',
        count: crit,
        x: generatePosition(imageName, 0.8), // Critical range: 0.8-0.95
        y: crit,
        color: '#ef4444'
      })
    }

    if (high > 0) {
      dataPoints.push({
        library: imageName,
        severity: 'high',
        count: high,
        x: generatePosition(imageName, 0.6), // High range: 0.6-0.75
        y: high,
        color: '#f97316'
      })
    }

    if (med > 0) {
      dataPoints.push({
        library: imageName,
        severity: 'medium',
        count: med,
        x: generatePosition(imageName, 0.4), // Medium range: 0.4-0.55
        y: med,
        color: '#eab308'
      })
    }

    if (low > 0) {
      dataPoints.push({
        library: imageName,
        severity: 'low',
        count: low,
        x: generatePosition(imageName, 0.2), // Low range: 0.2-0.35
        y: low,
        color: '#3b82f6'
      })
    }
  })

  return dataPoints.sort((a, b) => b.count - a.count)
}

/**
 * Generate a stable key based on filtered chart data to force re-render when data changes.
 */
function generateChartKey(filteredChartData: ScatterplotDataPoint[]): string {
  if (filteredChartData.length === 0) return 'empty'
  const signature = filteredChartData
    .map(item => `${item.library}:${item.severity}:${item.count}`)
    .sort()
    .join('|')
  return `chart-${filteredChartData.length}-${signature.slice(0, 50)}`
}

export {
  adjustVulnerabilityCounts,
  generatePosition,
  transformScansToChartData,
  generateChartKey,
}
export type { ScatterplotDataPoint }
