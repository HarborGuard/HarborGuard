import { getImageName, getImageTag } from './image-utils';

/**
 * Groups scans by image name, merges data for the same image,
 * and returns an array suitable for table display.
 *
 * For each unique image name the most-recent scan is used as the
 * base item.  Severity counts come from that base, while risk
 * score is a vulnerability-weighted average across all tags,
 * and misconfigs / secrets are summed.
 */
export function groupScansByImage(scans: any[]) {
  const grouped = new Map<string, any[]>()

  scans.forEach(item => {
    const imageName = typeof item.image === 'string'
      ? getImageName(item.image)
      : item.imageName
    if (!grouped.has(imageName)) {
      grouped.set(imageName, [])
    }
    grouped.get(imageName)!.push(item)
  })

  // Convert to array and merge data for same image names
  return Array.from(grouped.entries()).map(([imageName, items]) => {
    // Use the most recent scan as the base item
    const baseItem = items.reduce((latest, current) =>
      new Date(current.lastScan) > new Date(latest.lastScan) ? current : latest
    )

    const aggregatedSeverities = baseItem.severities

    // Calculate aggregated risk score
    const totalVulns = items.reduce((sum, item) =>
      sum + item.severities.crit + item.severities.high + item.severities.med + item.severities.low, 0
    )
    const weightedRiskScore = totalVulns > 0
      ? Math.round(items.reduce((sum, item) => {
          const itemTotal = item.severities.crit + item.severities.high + item.severities.med + item.severities.low
          return sum + (item.riskScore * itemTotal)
        }, 0) / totalVulns)
      : baseItem.riskScore

    return {
      ...baseItem,
      imageName,
      severities: aggregatedSeverities,
      riskScore: weightedRiskScore,
      misconfigs: items.reduce((sum, item) => sum + item.misconfigs, 0),
      secrets: items.reduce((sum, item) => sum + item.secrets, 0),
      lastScan: items.reduce((latest, current) =>
        new Date(current.lastScan) > new Date(latest) ? current.lastScan : latest
      , baseItem.lastScan),
      _tagCount: [...new Set(items.map(item => {
        const tag = typeof item.image === 'string'
          ? getImageTag(item.image)
          : 'latest'
        return tag
      }))].length,
      _allTags: [...new Set(items.map(item => {
        const tag = typeof item.image === 'string'
          ? getImageTag(item.image)
          : 'latest'
        return tag
      }))].join(', '),
    }
  })
}
