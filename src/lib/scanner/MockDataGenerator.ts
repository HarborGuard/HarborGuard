import fs from 'fs/promises';
import path from 'path';
import { IMockDataGenerator, ScanReports } from './types';
import type { ScanRequest } from '@/types';

export class MockDataGenerator implements IMockDataGenerator {
  async generateMockScanData(request: ScanRequest): Promise<ScanReports> {
    const templatePath = path.join(process.cwd(), 'reports');
    
    try {
      const existingReports = await fs.readdir(templatePath);
      if (existingReports.length > 0) {
        const reportDir = path.join(templatePath, existingReports[0]);
        return await this.loadExistingScanData(reportDir, request);
      }
    } catch {
      // Reports directory doesn't exist, use hardcoded mock
    }

    return this.generateBasicMockData(request);
  }

  private async loadExistingScanData(reportDir: string, request: ScanRequest): Promise<ScanReports> {
    const mockReports: ScanReports = {};

    try {
      const trivyPath = path.join(reportDir, 'trivy-results.json');
      const trivyData = JSON.parse(await fs.readFile(trivyPath, 'utf8'));
      trivyData.ArtifactName = `${request.image}:${request.tag}`;
      mockReports.trivy = trivyData;
    } catch {
      mockReports.trivy = this.generateMockTrivyData(request);
    }

    try {
      const docklePath = path.join(reportDir, 'dockle-results.json');
      mockReports.dockle = JSON.parse(await fs.readFile(docklePath, 'utf8'));
    } catch {
      mockReports.dockle = this.generateMockDockleData();
    }

    try {
      const grypeePath = path.join(reportDir, 'grype-results.json');
      mockReports.grype = JSON.parse(await fs.readFile(grypeePath, 'utf8'));
    } catch {
      mockReports.grype = null;
    }

    try {
      const syftPath = path.join(reportDir, 'syft-results.json');
      mockReports.syft = JSON.parse(await fs.readFile(syftPath, 'utf8'));
    } catch {
      mockReports.syft = null;
    }

    try {
      const osvPath = path.join(reportDir, 'osv-results.json');
      mockReports.osv = JSON.parse(await fs.readFile(osvPath, 'utf8'));
    } catch {
      mockReports.osv = null;
    }

    try {
      const divePath = path.join(reportDir, 'dive-results.json');
      mockReports.dive = JSON.parse(await fs.readFile(divePath, 'utf8'));
    } catch {
      mockReports.dive = null;
    }

    return mockReports;
  }

  private generateBasicMockData(request: ScanRequest): ScanReports {
    return {
      trivy: this.generateMockTrivyData(request),
      dockle: this.generateMockDockleData(),
      grype: null,
      syft: null,
      osv: null,
      dive: null,
      metadata: this.generateMockMetadata(request),
    };
  }

  private generateMockTrivyData(request: ScanRequest) {
    return {
      SchemaVersion: 2,
      CreatedAt: new Date().toISOString(),
      ArtifactName: `${request.image}:${request.tag}`,
      ArtifactType: "container_image",
      Metadata: {
        OS: {
          Family: "debian",
          Name: "12.11"
        },
        ImageID: `sha256:${Math.random().toString(16).slice(2, 66)}`,
      },
      Results: [
        {
          Target: `${request.image}:${request.tag} (debian 12.11)`,
          Class: "os-pkgs",
          Type: "debian",
          Vulnerabilities: this.generateMockVulnerabilities(request)
        }
      ]
    };
  }

  private generateMockVulnerabilities(request: ScanRequest) {
    const numVulns = Math.floor(Math.random() * 10) + 1;
    const vulnerabilities = [];
    
    for (let i = 0; i < numVulns; i++) {
      const severities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
      const severity = severities[Math.floor(Math.random() * severities.length)];
      
      vulnerabilities.push({
        VulnerabilityID: `CVE-2024-MOCK-${i.toString().padStart(4, '0')}`,
        PkgName: `mock-package-${i}`,
        InstalledVersion: `1.${i}.0`,
        Severity: severity,
        Title: `Mock vulnerability ${i} for development`,
        Description: `Mock vulnerability found in ${request.image}:${request.tag} package ${i}`,
        CVSS: {
          nvd: {
            V3Score: Math.random() * 10,
            V3Vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"
          }
        }
      });
    }
    
    return vulnerabilities;
  }

  private generateMockDockleData() {
    return {
      summary: {
        fatal: Math.floor(Math.random() * 3),
        warn: Math.floor(Math.random() * 5),
        info: Math.floor(Math.random() * 10),
        pass: Math.floor(Math.random() * 20) + 10,
      },
      details: []
    };
  }

  private generateMockMetadata(request: ScanRequest) {
    return {
      Id: `sha256:${Math.random().toString(16).slice(2, 66)}`,
      RepoTags: [`${request.image}:${request.tag}`],
      Os: "linux",
      Architecture: "amd64",
      Size: Math.floor(Math.random() * 1000000000) + 100000000, // 100MB - 1GB
      Created: new Date().toISOString(),
    };
  }

  async uploadMockScanResults(requestId: string, scanId: string, reports: ScanReports): Promise<void> {
    console.log(`Uploading mock scan results for ${requestId}`);
    // This would typically be handled by the DatabaseAdapter
    // but we're keeping it here for compatibility with the original design
    console.log(`Mock scan results uploaded for ${requestId}`);
  }
}