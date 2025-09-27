import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import puppeteer from 'puppeteer'

function generateHtmlReport(scan: any, decodedImageName: string): string {
  const metadata = scan.metadata

  const trivyVulns = metadata?.trivyResults?.Results?.[0]?.Vulnerabilities || []
  const grypeVulns = metadata?.grypeResults?.matches || []
  const dockleIssues = metadata?.dockleResults?.details || []

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
        .summary-cards {
          display: flex;
          gap: 15px;
          margin: 20px 0;
          flex-wrap: wrap;
        }
        .summary-card {
          flex: 1;
          min-width: 120px;
          background: white;
          border: 2px solid #E5E7EB;
          border-radius: 8px;
          padding: 15px;
          text-align: center;
        }
        .summary-card.critical {
          border-color: #DC2626;
          background: #FEF2F2;
        }
        .summary-card.high {
          border-color: #EA580C;
          background: #FFF7ED;
        }
        .summary-card.medium {
          border-color: #F59E0B;
          background: #FFFBEB;
        }
        .summary-card.low {
          border-color: #3B82F6;
          background: #EFF6FF;
        }
        .summary-card.info {
          border-color: #6B7280;
          background: #F9FAFB;
        }
        .summary-number {
          font-size: 32px;
          font-weight: bold;
          margin: 5px 0;
        }
        .summary-label {
          font-size: 14px;
          text-transform: uppercase;
          font-weight: 600;
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
      </style>
    </head>
    <body>
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

      <div class="summary-cards">
        <div class="summary-card critical">
          <div class="summary-label">Critical</div>
          <div class="summary-number">${vulnSummary.critical}</div>
        </div>
        <div class="summary-card high">
          <div class="summary-label">High</div>
          <div class="summary-number">${vulnSummary.high}</div>
        </div>
        <div class="summary-card medium">
          <div class="summary-label">Medium</div>
          <div class="summary-number">${vulnSummary.medium}</div>
        </div>
        <div class="summary-card low">
          <div class="summary-label">Low</div>
          <div class="summary-number">${vulnSummary.low}</div>
        </div>
        <div class="summary-card info">
          <div class="summary-label">Info</div>
          <div class="summary-number">${vulnSummary.info}</div>
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

      <h2>Vulnerability Details</h2>

      ${trivyVulns.length > 0 || grypeVulns.length > 0 ? `
        <h3>Security Vulnerabilities</h3>
        <table class="vulnerability-table">
          <thead>
            <tr>
              <th>Package</th>
              <th>Vulnerability</th>
              <th>Severity</th>
              <th>Fixed Version</th>
            </tr>
          </thead>
          <tbody>
            ${trivyVulns.slice(0, 20).map((vuln: any) => `
              <tr>
                <td>${vuln.PkgName || '-'}</td>
                <td>${vuln.VulnerabilityID || '-'}</td>
                <td><span class="severity-badge severity-${vuln.Severity?.toLowerCase()}">${vuln.Severity || '-'}</span></td>
                <td>${vuln.FixedVersion || 'Not available'}</td>
              </tr>
            `).join('')}
            ${grypeVulns.slice(0, 20).map((match: any) => `
              <tr>
                <td>${match.artifact?.name || '-'}</td>
                <td>${match.vulnerability?.id || '-'}</td>
                <td><span class="severity-badge severity-${match.vulnerability?.severity?.toLowerCase()}">${match.vulnerability?.severity || '-'}</span></td>
                <td>${match.vulnerability?.fix?.versions?.[0] || 'Not available'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${trivyVulns.length + grypeVulns.length > 20 ? `
          <p style="text-align: center; color: #6B7280; margin-top: 15px;">
            Showing first 20 of ${trivyVulns.length + grypeVulns.length} vulnerabilities
          </p>
        ` : ''}
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
            ${dockleIssues.slice(0, 10).map((issue: any) => `
              <tr>
                <td>${issue.code || '-'}</td>
                <td>${issue.title || '-'}</td>
                <td><span class="severity-badge severity-${issue.level === 'FATAL' ? 'critical' : issue.level === 'WARN' ? 'medium' : 'info'}">${issue.level || '-'}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${dockleIssues.length > 10 ? `
          <p style="text-align: center; color: #6B7280; margin-top: 15px;">
            Showing first 10 of ${dockleIssues.length} issues
          </p>
        ` : ''}
      ` : ''}

      <div class="footer">
        <p>Generated by HarborGuard Security Scanner</p>
        <p>Report generated on ${new Date().toLocaleString()}</p>
      </div>
    </body>
    </html>
  `

  return html
}

export async function GET(
  request: NextRequest,
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