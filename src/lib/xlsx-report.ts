import * as XLSX from 'xlsx'

interface VulnerabilityData {
  package: string
  vulnerability: string
  severity: string
  fixedVersion: string
  source: string
}

interface DockleIssue {
  code: string
  title: string
  level: string
}

// Define color schemes
const COLORS = {
  primary: '4F46E5',      // Indigo
  secondary: '6B7280',    // Gray
  critical: 'DC2626',     // Red
  high: 'EA580C',         // Orange
  medium: 'F59E0B',       // Amber
  low: '3B82F6',          // Blue
  info: '6B7280',         // Gray
  success: '10B981',      // Green
  headerBg: 'F3F4F6',     // Light Gray
  headerText: '1F2937',   // Dark Gray
  border: 'E5E7EB'        // Border Gray
}

function addCellStyle(worksheet: any, cell: string, style: any) {
  if (!worksheet[cell]) worksheet[cell] = {}
  worksheet[cell].s = style
}

function getSeverityColor(severity: string): string {
  const severityUpper = severity.toUpperCase()
  switch (severityUpper) {
    case 'CRITICAL': return COLORS.critical
    case 'HIGH': return COLORS.high
    case 'MEDIUM': return COLORS.medium
    case 'LOW': return COLORS.low
    case 'INFO':
    case 'NEGLIGIBLE': return COLORS.info
    default: return COLORS.secondary
  }
}

export function generateXlsxReport(scan: any, decodedImageName: string): Buffer {
  const workbook = XLSX.utils.book_new()

  const metadata = scan.metadata
  const trivyVulns = metadata?.trivyResults?.Results?.[0]?.Vulnerabilities || []
  const grypeVulns = metadata?.grypeResults?.matches || []
  const dockleIssues = metadata?.dockleResults?.details || []
  const syftPackages = metadata?.syftResults?.artifacts || []
  const osvVulns = metadata?.osvResults?.results || []

  // Calculate summary statistics
  const vulnSummary = {
    critical: metadata?.vulnerabilityCritical || 0,
    high: metadata?.vulnerabilityHigh || 0,
    medium: metadata?.vulnerabilityMedium || 0,
    low: metadata?.vulnerabilityLow || 0,
    info: metadata?.vulnerabilityInfo || 0,
    total: (metadata?.vulnerabilityCritical || 0) +
           (metadata?.vulnerabilityHigh || 0) +
           (metadata?.vulnerabilityMedium || 0) +
           (metadata?.vulnerabilityLow || 0) +
           (metadata?.vulnerabilityInfo || 0)
  }

  // Create Summary Sheet with enhanced styling
  const summaryData: any[][] = []

  // Add logo and title rows
  summaryData.push([''])  // Empty row for spacing
  summaryData.push(['', '⚓ HarborGuard'])  // Logo and brand
  summaryData.push(['', 'Container Security Scan Report'])
  summaryData.push([''])  // Empty row for spacing
  summaryData.push([''])  // Empty row for spacing

  // Image Information Section
  summaryData.push(['', 'IMAGE INFORMATION'])
  summaryData.push(['', 'Image Name', `${decodedImageName}${scan.image.tag ? `:${scan.image.tag}` : ''}`])
  summaryData.push(['', 'Scan ID', scan.id])
  summaryData.push(['', 'Status', scan.status])
  summaryData.push(['', 'Started At', new Date(scan.startedAt).toLocaleString()])
  summaryData.push(['', 'Completed At', scan.finishedAt ? new Date(scan.finishedAt).toLocaleString() : 'In Progress'])
  summaryData.push(['', 'Report Generated', new Date().toLocaleString()])
  summaryData.push([''])

  // Vulnerability Summary Section
  summaryData.push(['', 'VULNERABILITY SUMMARY'])
  summaryData.push(['', '', 'Count', 'Percentage'])
  summaryData.push(['', 'Critical', vulnSummary.critical, vulnSummary.total > 0 ? `${((vulnSummary.critical / vulnSummary.total) * 100).toFixed(1)}%` : '0%'])
  summaryData.push(['', 'High', vulnSummary.high, vulnSummary.total > 0 ? `${((vulnSummary.high / vulnSummary.total) * 100).toFixed(1)}%` : '0%'])
  summaryData.push(['', 'Medium', vulnSummary.medium, vulnSummary.total > 0 ? `${((vulnSummary.medium / vulnSummary.total) * 100).toFixed(1)}%` : '0%'])
  summaryData.push(['', 'Low', vulnSummary.low, vulnSummary.total > 0 ? `${((vulnSummary.low / vulnSummary.total) * 100).toFixed(1)}%` : '0%'])
  summaryData.push(['', 'Info', vulnSummary.info, vulnSummary.total > 0 ? `${((vulnSummary.info / vulnSummary.total) * 100).toFixed(1)}%` : '0%'])
  summaryData.push(['', 'Total Vulnerabilities', vulnSummary.total, '100%'])
  summaryData.push([''])

  // Risk & Compliance Scores Section
  summaryData.push(['', 'RISK & COMPLIANCE'])
  summaryData.push(['', 'Risk Score', scan.riskScore !== null ? `${scan.riskScore.toFixed(1)}%` : 'N/A'])
  summaryData.push(['', 'Compliance Score', metadata?.complianceScore !== null && metadata?.complianceScore !== undefined ? `${metadata.complianceScore.toFixed(1)}%` : 'N/A'])
  summaryData.push([''])

  // Scanner Results Section
  summaryData.push(['', 'SCANNER RESULTS'])
  summaryData.push(['', 'Scanner', 'Status', 'Findings'])
  summaryData.push(['', 'Trivy', trivyVulns.length > 0 ? '✓ Completed' : '○ No Data', trivyVulns.length > 0 ? `${trivyVulns.length} vulnerabilities` : 'No vulnerabilities'])
  summaryData.push(['', 'Grype', grypeVulns.length > 0 ? '✓ Completed' : '○ No Data', grypeVulns.length > 0 ? `${grypeVulns.length} vulnerabilities` : 'No vulnerabilities'])
  summaryData.push(['', 'Dockle', dockleIssues.length > 0 ? '✓ Completed' : '○ No Data', dockleIssues.length > 0 ? `${dockleIssues.length} issues` : 'No issues'])
  summaryData.push(['', 'Syft', syftPackages.length > 0 ? '✓ Completed' : '○ No Data', syftPackages.length > 0 ? `${syftPackages.length} packages` : 'No packages'])
  summaryData.push(['', 'OSV', osvVulns.length > 0 ? '✓ Completed' : '○ No Data', osvVulns.length > 0 ? `${osvVulns.length} vulnerabilities` : 'No vulnerabilities'])

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData)

  // Apply styling to Summary sheet
  const titleStyle = {
    font: { bold: true, sz: 20, color: { rgb: COLORS.primary } },
    alignment: { horizontal: 'left', vertical: 'center' }
  }

  const subtitleStyle = {
    font: { sz: 14, color: { rgb: COLORS.secondary } },
    alignment: { horizontal: 'left', vertical: 'center' }
  }

  const sectionHeaderStyle = {
    font: { bold: true, sz: 12, color: { rgb: COLORS.headerText } },
    fill: { fgColor: { rgb: COLORS.headerBg } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: COLORS.border } },
      bottom: { style: 'thin', color: { rgb: COLORS.border } }
    }
  }

  const labelStyle = {
    font: { bold: true, color: { rgb: COLORS.secondary } },
    alignment: { horizontal: 'left', vertical: 'center' }
  }

  const valueStyle = {
    font: { color: { rgb: COLORS.headerText } },
    alignment: { horizontal: 'left', vertical: 'center' }
  }

  // Apply styles to specific cells
  addCellStyle(summarySheet, 'B2', titleStyle)
  addCellStyle(summarySheet, 'B3', subtitleStyle)

  // Style section headers
  addCellStyle(summarySheet, 'B6', sectionHeaderStyle)
  addCellStyle(summarySheet, 'B14', sectionHeaderStyle)
  addCellStyle(summarySheet, 'B24', sectionHeaderStyle)
  addCellStyle(summarySheet, 'B28', sectionHeaderStyle)

  // Style vulnerability counts with colors
  if (summarySheet['B16']) {
    addCellStyle(summarySheet, 'B16', { ...labelStyle, font: { ...labelStyle.font, color: { rgb: COLORS.critical } } })
    addCellStyle(summarySheet, 'C16', { font: { bold: true, color: { rgb: COLORS.critical } } })
  }
  if (summarySheet['B17']) {
    addCellStyle(summarySheet, 'B17', { ...labelStyle, font: { ...labelStyle.font, color: { rgb: COLORS.high } } })
    addCellStyle(summarySheet, 'C17', { font: { bold: true, color: { rgb: COLORS.high } } })
  }
  if (summarySheet['B18']) {
    addCellStyle(summarySheet, 'B18', { ...labelStyle, font: { ...labelStyle.font, color: { rgb: COLORS.medium } } })
    addCellStyle(summarySheet, 'C18', { font: { bold: true, color: { rgb: COLORS.medium } } })
  }
  if (summarySheet['B19']) {
    addCellStyle(summarySheet, 'B19', { ...labelStyle, font: { ...labelStyle.font, color: { rgb: COLORS.low } } })
    addCellStyle(summarySheet, 'C19', { font: { bold: true, color: { rgb: COLORS.low } } })
  }

  // Set column widths for summary sheet
  summarySheet['!cols'] = [
    { wch: 2 },   // Empty column for indentation
    { wch: 25 },  // Labels
    { wch: 40 },  // Values
    { wch: 15 }   // Additional data
  ]

  // Set row heights
  summarySheet['!rows'] = [
    { hpt: 20 },  // Row 1
    { hpt: 30 },  // Row 2 - Title
    { hpt: 25 },  // Row 3 - Subtitle
  ]

  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary')

  // Create Trivy Sheet with styling if data exists
  if (trivyVulns.length > 0) {
    const trivyData = [
      ['TRIVY VULNERABILITY REPORT'],
      [''],
      ['Package', 'Vulnerability ID', 'Severity', 'Installed Version', 'Fixed Version', 'Title']
    ]

    trivyVulns.forEach((vuln: any) => {
      trivyData.push([
        vuln.PkgName || '',
        vuln.VulnerabilityID || '',
        vuln.Severity || '',
        vuln.InstalledVersion || '',
        vuln.FixedVersion || 'Not available',
        vuln.Title || ''
      ])
    })

    const trivySheet = XLSX.utils.aoa_to_sheet(trivyData)

    // Apply header styling
    const headerStyle = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: COLORS.primary } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'thin', color: { rgb: COLORS.border } },
        bottom: { style: 'thin', color: { rgb: COLORS.border } },
        left: { style: 'thin', color: { rgb: COLORS.border } },
        right: { style: 'thin', color: { rgb: COLORS.border } }
      }
    }

    // Apply title and header row styling
    addCellStyle(trivySheet, 'A1', titleStyle)
    for (let col = 0; col < 6; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 2, c: col })
      addCellStyle(trivySheet, cellAddress, headerStyle)
    }

    // Apply severity coloring to data rows
    for (let row = 3; row < trivyData.length; row++) {
      const severityCell = XLSX.utils.encode_cell({ r: row, c: 2 })
      if (trivySheet[severityCell]) {
        const severity = trivySheet[severityCell].v
        addCellStyle(trivySheet, severityCell, {
          font: { bold: true, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: getSeverityColor(severity) } },
          alignment: { horizontal: 'center' }
        })
      }
    }

    trivySheet['!cols'] = [
      { wch: 35 }, { wch: 25 }, { wch: 12 },
      { wch: 20 }, { wch: 20 }, { wch: 50 }
    ]

    XLSX.utils.book_append_sheet(workbook, trivySheet, 'Trivy')
  }

  // Create Grype Sheet with styling if data exists
  if (grypeVulns.length > 0) {
    const grypeData = [
      ['GRYPE VULNERABILITY REPORT'],
      [''],
      ['Package', 'Vulnerability ID', 'Severity', 'Version', 'Fixed Version', 'Type']
    ]

    grypeVulns.forEach((match: any) => {
      grypeData.push([
        match.artifact?.name || '',
        match.vulnerability?.id || '',
        match.vulnerability?.severity || '',
        match.artifact?.version || '',
        match.vulnerability?.fix?.versions?.[0] || 'Not available',
        match.artifact?.type || ''
      ])
    })

    const grypeSheet = XLSX.utils.aoa_to_sheet(grypeData)

    // Apply styling similar to Trivy sheet
    addCellStyle(grypeSheet, 'A1', titleStyle)

    const headerStyle = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: COLORS.primary } },
      alignment: { horizontal: 'center', vertical: 'center' }
    }

    for (let col = 0; col < 6; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 2, c: col })
      addCellStyle(grypeSheet, cellAddress, headerStyle)
    }

    // Apply severity coloring
    for (let row = 3; row < grypeData.length; row++) {
      const severityCell = XLSX.utils.encode_cell({ r: row, c: 2 })
      if (grypeSheet[severityCell]) {
        const severity = grypeSheet[severityCell].v
        addCellStyle(grypeSheet, severityCell, {
          font: { bold: true, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: getSeverityColor(severity) } },
          alignment: { horizontal: 'center' }
        })
      }
    }

    grypeSheet['!cols'] = [
      { wch: 35 }, { wch: 25 }, { wch: 12 },
      { wch: 20 }, { wch: 20 }, { wch: 15 }
    ]

    XLSX.utils.book_append_sheet(workbook, grypeSheet, 'Grype')
  }

  // Create Dockle Sheet with styling if data exists
  if (dockleIssues.length > 0) {
    const dockleData = [
      ['DOCKLE BEST PRACTICES REPORT'],
      [''],
      ['Code', 'Title', 'Level', 'Alerts']
    ]

    dockleIssues.forEach((issue: any) => {
      dockleData.push([
        issue.code || '',
        issue.title || '',
        issue.level || '',
        issue.alerts?.join(', ') || ''
      ])
    })

    const dockleSheet = XLSX.utils.aoa_to_sheet(dockleData)

    addCellStyle(dockleSheet, 'A1', titleStyle)

    const headerStyle = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: COLORS.primary } },
      alignment: { horizontal: 'center', vertical: 'center' }
    }

    for (let col = 0; col < 4; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 2, c: col })
      addCellStyle(dockleSheet, cellAddress, headerStyle)
    }

    // Apply level coloring
    for (let row = 3; row < dockleData.length; row++) {
      const levelCell = XLSX.utils.encode_cell({ r: row, c: 2 })
      if (dockleSheet[levelCell]) {
        const level = dockleSheet[levelCell].v
        let color = COLORS.info
        if (level === 'FATAL') color = COLORS.critical
        else if (level === 'WARN') color = COLORS.medium

        addCellStyle(dockleSheet, levelCell, {
          font: { bold: true, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: color } },
          alignment: { horizontal: 'center' }
        })
      }
    }

    dockleSheet['!cols'] = [
      { wch: 15 }, { wch: 50 }, { wch: 12 }, { wch: 50 }
    ]

    XLSX.utils.book_append_sheet(workbook, dockleSheet, 'Dockle')
  }

  // Create Syft SBOM Sheet with styling if data exists
  if (syftPackages.length > 0) {
    const syftData = [
      ['SYFT SBOM REPORT'],
      [''],
      ['Package Name', 'Version', 'Type', 'Language', 'License', 'Location']
    ]

    syftPackages.forEach((pkg: any) => {
      syftData.push([
        pkg.name || '',
        pkg.version || '',
        pkg.type || '',
        pkg.language || '',
        pkg.licenses?.join(', ') || '',
        pkg.locations?.[0]?.path || ''
      ])
    })

    const syftSheet = XLSX.utils.aoa_to_sheet(syftData)

    addCellStyle(syftSheet, 'A1', titleStyle)

    const headerStyle = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: COLORS.primary } },
      alignment: { horizontal: 'center', vertical: 'center' }
    }

    for (let col = 0; col < 6; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 2, c: col })
      addCellStyle(syftSheet, cellAddress, headerStyle)
    }

    syftSheet['!cols'] = [
      { wch: 35 }, { wch: 15 }, { wch: 15 },
      { wch: 15 }, { wch: 25 }, { wch: 45 }
    ]

    XLSX.utils.book_append_sheet(workbook, syftSheet, 'Syft SBOM')
  }

  // Create OSV Sheet with styling if data exists
  if (osvVulns.length > 0) {
    const osvData = [
      ['OSV VULNERABILITY REPORT'],
      [''],
      ['Package', 'Vulnerability ID', 'Summary', 'Severity', 'Published']
    ]

    osvVulns.forEach((result: any) => {
      result.vulns?.forEach((vuln: any) => {
        osvData.push([
          result.package?.name || '',
          vuln.id || '',
          vuln.summary || '',
          vuln.database_specific?.severity || 'UNKNOWN',
          vuln.published ? new Date(vuln.published).toLocaleDateString() : ''
        ])
      })
    })

    const osvSheet = XLSX.utils.aoa_to_sheet(osvData)

    addCellStyle(osvSheet, 'A1', titleStyle)

    const headerStyle = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: COLORS.primary } },
      alignment: { horizontal: 'center', vertical: 'center' }
    }

    for (let col = 0; col < 5; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 2, c: col })
      addCellStyle(osvSheet, cellAddress, headerStyle)
    }

    // Apply severity coloring
    for (let row = 3; row < osvData.length; row++) {
      const severityCell = XLSX.utils.encode_cell({ r: row, c: 3 })
      if (osvSheet[severityCell]) {
        const severity = osvSheet[severityCell].v
        addCellStyle(osvSheet, severityCell, {
          font: { bold: true, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: getSeverityColor(severity) } },
          alignment: { horizontal: 'center' }
        })
      }
    }

    osvSheet['!cols'] = [
      { wch: 35 }, { wch: 25 }, { wch: 50 },
      { wch: 12 }, { wch: 15 }
    ]

    XLSX.utils.book_append_sheet(workbook, osvSheet, 'OSV')
  }

  // Create Combined Vulnerabilities Sheet with enhanced styling
  const allVulns: VulnerabilityData[] = [
    ...trivyVulns.map((vuln: any) => ({
      package: vuln.PkgName || '-',
      vulnerability: vuln.VulnerabilityID || '-',
      severity: vuln.Severity || 'UNKNOWN',
      fixedVersion: vuln.FixedVersion || 'Not available',
      source: 'Trivy'
    })),
    ...grypeVulns.map((match: any) => ({
      package: match.artifact?.name || '-',
      vulnerability: match.vulnerability?.id || '-',
      severity: match.vulnerability?.severity || 'UNKNOWN',
      fixedVersion: match.vulnerability?.fix?.versions?.[0] || 'Not available',
      source: 'Grype'
    }))
  ]

  if (allVulns.length > 0) {
    // Sort by severity
    const severityOrder: { [key: string]: number } = {
      'CRITICAL': 1,
      'HIGH': 2,
      'MEDIUM': 3,
      'LOW': 4,
      'NEGLIGIBLE': 5,
      'INFO': 5,
      'UNKNOWN': 6
    }

    allVulns.sort((a, b) => {
      const aOrder = severityOrder[a.severity.toUpperCase()] || 6
      const bOrder = severityOrder[b.severity.toUpperCase()] || 6
      if (aOrder !== bOrder) return aOrder - bOrder
      return a.vulnerability.localeCompare(b.vulnerability)
    })

    const combinedData = [
      ['ALL VULNERABILITIES (COMBINED)'],
      [''],
      ['Package', 'Vulnerability ID', 'Severity', 'Fixed Version', 'Source']
    ]

    allVulns.forEach(vuln => {
      combinedData.push([
        vuln.package,
        vuln.vulnerability,
        vuln.severity,
        vuln.fixedVersion,
        vuln.source
      ])
    })

    const combinedSheet = XLSX.utils.aoa_to_sheet(combinedData)

    addCellStyle(combinedSheet, 'A1', titleStyle)

    const headerStyle = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: COLORS.primary } },
      alignment: { horizontal: 'center', vertical: 'center' }
    }

    for (let col = 0; col < 5; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 2, c: col })
      addCellStyle(combinedSheet, cellAddress, headerStyle)
    }

    // Apply severity coloring
    for (let row = 3; row < combinedData.length; row++) {
      const severityCell = XLSX.utils.encode_cell({ r: row, c: 2 })
      if (combinedSheet[severityCell]) {
        const severity = combinedSheet[severityCell].v
        addCellStyle(combinedSheet, severityCell, {
          font: { bold: true, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: getSeverityColor(severity) } },
          alignment: { horizontal: 'center' }
        })
      }
    }

    combinedSheet['!cols'] = [
      { wch: 35 }, { wch: 25 }, { wch: 12 },
      { wch: 25 }, { wch: 10 }
    ]

    XLSX.utils.book_append_sheet(workbook, combinedSheet, 'All Vulnerabilities')
  }

  // Generate buffer with styles
  const xlsxBuffer = XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
    bookSST: false,
    cellStyles: true
  })

  return Buffer.from(xlsxBuffer)
}