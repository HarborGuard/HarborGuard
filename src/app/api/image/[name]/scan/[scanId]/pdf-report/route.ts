import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import puppeteer from 'puppeteer'

function generateHtmlReport(scan: any, decodedImageName: string): string {
  const metadata = scan.metadata

  const trivyVulns = metadata?.trivyResults?.Results?.[0]?.Vulnerabilities || []
  const grypeVulns = metadata?.grypeResults?.matches || []
  const dockleIssues = metadata?.dockleResults?.details || []

  // Merge and normalize all vulnerabilities
  const allVulns = [
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

  // Sort vulnerabilities by severity
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
    // Secondary sort by vulnerability ID
    return a.vulnerability.localeCompare(b.vulnerability)
  })

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

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Security Scan Report - ${decodedImageName}</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          margin: 0;
          padding: 20px;
          background: white;
        }
        .logo-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 20px;
        }
        .logo-icon {
          width: 32px;
          height: 32px;
          color: #4B5563;
        }
        .logo-text {
          font-size: 24px;
          font-weight: 600;
          color: #4B5563;
        }
        .header {
          border-bottom: 3px solid #4F46E5;
          padding-bottom: 20px;
          margin-bottom: 30px;
        }
        h1 {
          color: #1F2937;
          font-size: 28px;
          margin: 0 0 10px 0;
        }
        h2 {
          color: #4F46E5;
          font-size: 20px;
          margin-top: 30px;
          border-bottom: 1px solid #E5E7EB;
          padding-bottom: 10px;
        }
        h3 {
          color: #6B7280;
          font-size: 16px;
          margin-top: 20px;
        }
        .metadata {
          background: #F9FAFB;
          border-radius: 8px;
          padding: 15px;
          margin-bottom: 20px;
        }
        .metadata-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
        }
        .metadata-label {
          font-weight: 600;
          color: #4B5563;
        }
        .metadata-value {
          color: #1F2937;
        }
        .vulnerability-bar {
          margin: 30px 0;
        }
        .bar-container {
          display: flex;
          width: 100%;
          height: 60px;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .bar-segment {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          min-width: 0;
          transition: all 0.3s ease;
        }
        .bar-segment.critical {
          background: #DC2626;
        }
        .bar-segment.high {
          background: #EA580C;
        }
        .bar-segment.medium {
          background: #F59E0B;
        }
        .bar-segment.low {
          background: #3B82F6;
        }
        .bar-segment.info {
          background: #6B7280;
        }
        .bar-segment.none {
          background: #10B981;
          flex: 1;
        }
        .segment-content {
          text-align: center;
          padding: 5px 10px;
        }
        .segment-number {
          font-size: 20px;
          font-weight: bold;
        }
        .bar-legend {
          display: flex;
          justify-content: space-around;
          margin-top: 15px;
          flex-wrap: wrap;
          gap: 15px;
        }
        .legend-item {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .legend-color {
          width: 16px;
          height: 16px;
          border-radius: 3px;
        }
        .legend-text {
          font-size: 14px;
          color: #4B5563;
        }
        .legend-count {
          font-weight: bold;
          color: #1F2937;
        }
        .vulnerability-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
        }
        .vulnerability-table th {
          background: #F3F4F6;
          padding: 10px;
          text-align: left;
          font-weight: 600;
          color: #374151;
          border-bottom: 2px solid #E5E7EB;
        }
        .vulnerability-table td {
          padding: 10px;
          border-bottom: 1px solid #E5E7EB;
        }
        .vulnerability-table tr:hover {
          background: #F9FAFB;
        }
        .severity-badge {
          display: inline-block;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
        }
        .severity-critical {
          background: #DC2626;
          color: white;
        }
        .severity-high {
          background: #EA580C;
          color: white;
        }
        .severity-medium {
          background: #F59E0B;
          color: white;
        }
        .severity-low {
          background: #3B82F6;
          color: white;
        }
        .severity-info {
          background: #6B7280;
          color: white;
        }
        .score-display {
          display: flex;
          gap: 30px;
          margin: 20px 0;
        }
        .score-item {
          flex: 1;
        }
        .score-label {
          font-weight: 600;
          color: #4B5563;
          margin-bottom: 5px;
        }
        .score-value {
          font-size: 24px;
          font-weight: bold;
        }
        .footer {
          margin-top: 50px;
          padding-top: 20px;
          border-top: 1px solid #E5E7EB;
          text-align: center;
          color: #6B7280;
          font-size: 14px;
        }
        .no-issues {
          background: #D1FAE5;
          color: #065F46;
          padding: 15px;
          border-radius: 8px;
          text-align: center;
          margin: 20px 0;
        }
        @page {
          margin: 20px;
          size: A4;
        }
        .page-break {
          page-break-before: always;
          padding-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="logo-header">
        <svg class="logo-icon" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#4B5563" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="11" fill="none"></circle>
          <g transform="translate(12 12) scale(0.8) translate(-12 -12)" stroke-width="2.5">
            <path d="M12 22V8"></path>
            <path d="M5 12H2a10 10 0 0 0 20 0h-3"></path>
            <circle cx="12" cy="5" r="3"></circle>
          </g>
        </svg>
        <span class="logo-text">HarborGuard</span>
      </div>

      <div class="header">
        <h1>Container Security Scan Report</h1>
        <div style="color: #6B7280;">
          <strong>Image:</strong> ${decodedImageName}${scan.image.tag ? `:${scan.image.tag}` : ''}<br>
          <strong>Generated:</strong> ${new Date().toLocaleString()}
        </div>
      </div>

      <div class="metadata">
        <div class="metadata-row">
          <span class="metadata-label">Scan ID:</span>
          <span class="metadata-value">${scan.id}</span>
        </div>
        <div class="metadata-row">
          <span class="metadata-label">Status:</span>
          <span class="metadata-value">${scan.status}</span>
        </div>
        <div class="metadata-row">
          <span class="metadata-label">Started At:</span>
          <span class="metadata-value">${new Date(scan.startedAt).toLocaleString()}</span>
        </div>
        ${scan.finishedAt ? `
        <div class="metadata-row">
          <span class="metadata-label">Completed At:</span>
          <span class="metadata-value">${new Date(scan.finishedAt).toLocaleString()}</span>
        </div>
        ` : ''}
      </div>

      <h2>Executive Summary</h2>

      <div class="vulnerability-bar">
        <div class="bar-container">
          ${vulnSummary.total > 0 ? `
            ${vulnSummary.critical > 0 ? `
              <div class="bar-segment critical" style="flex: ${vulnSummary.critical}">
                <div class="segment-content">
                  <div class="segment-number">${vulnSummary.critical}</div>
                </div>
              </div>
            ` : ''}
            ${vulnSummary.high > 0 ? `
              <div class="bar-segment high" style="flex: ${vulnSummary.high}">
                <div class="segment-content">
                  <div class="segment-number">${vulnSummary.high}</div>
                </div>
              </div>
            ` : ''}
            ${vulnSummary.medium > 0 ? `
              <div class="bar-segment medium" style="flex: ${vulnSummary.medium}">
                <div class="segment-content">
                  <div class="segment-number">${vulnSummary.medium}</div>
                </div>
              </div>
            ` : ''}
            ${vulnSummary.low > 0 ? `
              <div class="bar-segment low" style="flex: ${vulnSummary.low}">
                <div class="segment-content">
                  <div class="segment-number">${vulnSummary.low}</div>
                </div>
              </div>
            ` : ''}
            ${vulnSummary.info > 0 ? `
              <div class="bar-segment info" style="flex: ${vulnSummary.info}">
                <div class="segment-content">
                  <div class="segment-number">${vulnSummary.info}</div>
                </div>
              </div>
            ` : ''}
          ` : `
            <div class="bar-segment none">
              <div class="segment-content">
                <div class="segment-number">✓</div>
              </div>
            </div>
          `}
        </div>
        <div class="bar-legend">
          <div class="legend-item">
            <div class="legend-color" style="background: #DC2626;"></div>
            <span class="legend-text">Critical: <span class="legend-count">${vulnSummary.critical}</span></span>
          </div>
          <div class="legend-item">
            <div class="legend-color" style="background: #EA580C;"></div>
            <span class="legend-text">High: <span class="legend-count">${vulnSummary.high}</span></span>
          </div>
          <div class="legend-item">
            <div class="legend-color" style="background: #F59E0B;"></div>
            <span class="legend-text">Medium: <span class="legend-count">${vulnSummary.medium}</span></span>
          </div>
          <div class="legend-item">
            <div class="legend-color" style="background: #3B82F6;"></div>
            <span class="legend-text">Low: <span class="legend-count">${vulnSummary.low}</span></span>
          </div>
          <div class="legend-item">
            <div class="legend-color" style="background: #6B7280;"></div>
            <span class="legend-text">Info: <span class="legend-count">${vulnSummary.info}</span></span>
          </div>
        </div>
      </div>

      <div class="score-display">
        ${scan.riskScore !== null ? `
        <div class="score-item">
          <div class="score-label">Risk Score</div>
          <div class="score-value" style="color: ${scan.riskScore >= 70 ? '#DC2626' : scan.riskScore >= 40 ? '#F59E0B' : '#10B981'}">
            ${scan.riskScore.toFixed(1)}%
          </div>
        </div>
        ` : ''}
        ${metadata?.complianceScore !== null && metadata?.complianceScore !== undefined ? `
        <div class="score-item">
          <div class="score-label">Compliance Score</div>
          <div class="score-value" style="color: ${metadata.complianceScore >= 80 ? '#10B981' : metadata.complianceScore >= 60 ? '#F59E0B' : '#DC2626'}">
            ${metadata.complianceScore.toFixed(1)}%
          </div>
        </div>
        ` : ''}
      </div>

      <div class="page-break">
        <h2>Vulnerability Details</h2>

        ${allVulns.length > 0 ? `
          <h3>Security Vulnerabilities (${allVulns.length} total)</h3>
        <table class="vulnerability-table">
          <thead>
            <tr>
              <th>Package</th>
              <th>Vulnerability</th>
              <th>Severity</th>
              <th>Fixed Version</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            ${allVulns.map((vuln: any) => `
              <tr>
                <td>${vuln.package}</td>
                <td>${vuln.vulnerability}</td>
                <td><span class="severity-badge severity-${vuln.severity.toLowerCase()}">${vuln.severity}</span></td>
                <td>${vuln.fixedVersion}</td>
                <td style="color: #6B7280; font-size: 12px;">${vuln.source}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : `
        <div class="no-issues">
          ✓ No security vulnerabilities detected
        </div>
      `}

        ${dockleIssues.length > 0 ? `
          <h3>Best Practice Issues</h3>
          <table class="vulnerability-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Issue</th>
                <th>Level</th>
              </tr>
            </thead>
            <tbody>
              ${dockleIssues.map((issue: any) => `
                <tr>
                  <td>${issue.code || '-'}</td>
                  <td>${issue.title || '-'}</td>
                  <td><span class="severity-badge severity-${issue.level === 'FATAL' ? 'critical' : issue.level === 'WARN' ? 'medium' : 'info'}">${issue.level || '-'}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : ''}
      </div>

      <div class="footer">
        <p>Generated by HarborGuard - harborguard.co</p>
        <p>Report generated on ${new Date().toLocaleString()}</p>
      </div>
    </body>
    </html>
  `

  return html
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string; scanId: string }> }
) {
  let browser
  try {
    const { name, scanId } = await params
    const decodedImageName = decodeURIComponent(name)

    const scan = await prisma.scan.findUnique({
      where: { id: scanId },
      include: {
        image: true,
        metadata: true
      }
    })

    if (!scan) {
      return NextResponse.json({ error: 'Scan not found' }, { status: 404 })
    }

    if (scan.image.name !== decodedImageName) {
      return NextResponse.json({ error: 'Scan does not belong to this image' }, { status: 404 })
    }

    const htmlContent = generateHtmlReport(scan, decodedImageName)

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })

    const page = await browser.newPage()
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' })

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px'
      }
    })

    await browser.close()

    const filename = `${decodedImageName.replace('/', '_')}_${scanId}_report.pdf`
    const headers = new Headers()
    headers.set('Content-Type', 'application/pdf')
    headers.set('Content-Disposition', `attachment; filename="${filename}"`)

    return new NextResponse(Buffer.from(pdfBuffer), { headers })
  } catch (error) {
    console.error('Error generating PDF report:', error)
    if (browser) {
      await browser.close()
    }
    return NextResponse.json({ error: 'Failed to generate PDF report' }, { status: 500 })
  }
}