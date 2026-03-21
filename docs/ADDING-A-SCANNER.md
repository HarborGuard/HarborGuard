# Adding a New Scanner

This guide walks through adding support for a new security scanner in HarborGuard.

## Quick Start

Adding a scanner requires two pieces:

1. **Scanner class** -- implements `IScannerBase` to run the scanner CLI and produce JSON output.
2. **Result saver** -- a function in `result-savers.ts` to persist scanner-specific results into dedicated Prisma tables.

Optionally, you also add normalized finding extraction so the scanner's output feeds into the unified vulnerability/compliance/efficiency views.

## Scanner Class

Create a new file at `src/lib/scanner/scanners/<Name>Scanner.ts`.

Your class must implement the `IScannerBase` interface:

```typescript
export interface IScannerBase {
  readonly name: string;
  scan(tarPath: string, outputPath: string, env: NodeJS.ProcessEnv): Promise<ScannerResult>;
  getVersion(): Promise<string>;
}

export interface ScannerResult {
  success: boolean;
  data?: any;
  error?: string;
}
```

### Example implementation

```typescript
import { promisify } from 'util';
import { exec } from 'child_process';
import fs from 'fs/promises';
import { IScannerBase, ScannerResult } from '../types';

const execAsync = promisify(exec);

export class MyScanner implements IScannerBase {
  readonly name = 'myscanner';

  async scan(
    tarPath: string,
    outputPath: string,
    env: NodeJS.ProcessEnv
  ): Promise<ScannerResult> {
    try {
      // Run the scanner CLI against the docker-archive tar file.
      // Output must be written to outputPath as JSON.
      await execAsync(
        `myscanner scan --input "${tarPath}" --format json --output "${outputPath}"`,
        { env, timeout: 300000 }  // 5 minute timeout
      );

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('MyScanner scan failed:', errorMessage);

      // Write an error marker so the results loader knows it failed
      await fs.writeFile(outputPath, JSON.stringify({ error: errorMessage }));
      return { success: false, error: errorMessage };
    }
  }

  async getVersion(): Promise<string> {
    try {
      const { stdout } = await execAsync('myscanner --version');
      return stdout.trim().split('\n')[0];
    } catch {
      return 'unknown';
    }
  }
}
```

Key points:

- **`name`** must be a unique lowercase identifier. It is used as the JSON report filename (e.g. `myscanner.json`) and as the key in `ScanReports` and `ScannerConfig`.
- **`scan()`** receives the path to a docker-archive tar file, an output path where the JSON report should be written, and environment variables (cache directories etc.).
- **`getVersion()`** returns the scanner version string for display in the UI.
- The scanner CLI must accept a docker-archive tar as input. Most tools support `docker-archive:<path>` or `--input <path>` formats.
- Set a reasonable timeout (default 5 minutes). The `ScanExecutor` also wraps this with a configurable timeout.

### Existing scanners for reference

| Scanner | File | CLI command pattern |
|---------|------|-------------------|
| Trivy | `TrivyScanner.ts` | `trivy image --input <tar> -f json -o <out>` |
| Grype | `GrypeScanner.ts` | `grype docker-archive:<tar> -o json > <out>` |
| Syft | `SyftScanner.ts` | `syft docker-archive:<tar> -o json > <out>` |
| Dockle | `DockleScanner.ts` | `dockle --input <tar> -f json -o <out>` |
| Dive | `DiveScanner.ts` | `dive docker-archive:<tar> --json <out>` |
| OSV | `OSVScanner.ts` | `osv-scanner --docker <tar> --format json > <out>` |

## Registration

### 1. Add to AVAILABLE_SCANNERS

In `src/lib/scanner/scanners/index.ts`, import and register your scanner:

```typescript
import { MyScanner } from './MyScanner';

export const AVAILABLE_SCANNERS: IScannerBase[] = [
  new TrivyScanner(),
  new GrypeScanner(),
  new SyftScanner(),
  new OSVScanner(),
  new DockleScanner(),
  new DiveScanner(),
  new MyScanner(),  // <-- add here
];
```

Also add it to the re-exports at the bottom of the file:

```typescript
export {
  TrivyScanner,
  GrypeScanner,
  // ...
  MyScanner,
};
```

### 2. Add to ScanReports type

In `src/lib/scanner/types.ts`, add your scanner key:

```typescript
export interface ScanReports {
  trivy?: any;
  grype?: any;
  syft?: any;
  dockle?: any;
  osv?: any;
  dive?: any;
  myscanner?: any;  // <-- add here
  metadata?: any;
}
```

### 3. Add to ScanExecutor report loading

In `src/lib/scanner/ScanExecutor.ts`, add your report filename to the `reportFiles` array in `loadScanResults()`:

```typescript
const reportFiles = [
  'trivy.json', 'grype.json', 'syft.json',
  'dockle.json', 'osv.json', 'dive.json',
  'myscanner.json',  // <-- add here
  'metadata.json'
];
```

### 4. Add to enabled scanners config

In `src/lib/config.ts` (or your environment configuration), add the scanner name to the `enabledScanners` list so it runs by default. Users can also enable it selectively via the `ScannerConfig` type.

### 5. Add to Dockerfile

Ensure your scanner binary is installed in the Docker image. Add installation commands to the `Dockerfile`:

```dockerfile
# Install myscanner
RUN curl -sSL https://example.com/myscanner/install.sh | sh
```

## Result Saver (Database Adapter)

To persist scanner-specific structured data (beyond the raw JSON blob), add a save function in `src/lib/scanner/result-savers.ts`.

### 1. Create Prisma models

Add tables to `prisma/schema.prisma` for your scanner's structured output:

```prisma
model MyScannerResults {
  id              String   @id @default(cuid())
  scanMetadataId  String   @unique
  scanMetadata    ScanMetadata @relation(fields: [scanMetadataId], references: [id])

  // Top-level fields from the scanner output
  totalFindings   Int?
  scannerVersion  String?

  // Related findings
  findings        MyScannerFinding[]

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model MyScannerFinding {
  id                 String  @id @default(cuid())
  myScannerResultsId String
  myScannerResults   MyScannerResults @relation(fields: [myScannerResultsId], references: [id])

  findingId    String
  severity     String
  message      String?
  filePath     String?
  // ... scanner-specific fields

  @@index([myScannerResultsId])
}
```

Run the migration:

```bash
npx prisma migrate dev --name add-myscanner-results
```

### 2. Add the save function

In `src/lib/scanner/result-savers.ts`:

```typescript
async function saveMyScannerResults(metadataId: string, data: any): Promise<void> {
  const result = await prisma.myScannerResults.upsert({
    where: { scanMetadataId: metadataId },
    create: {
      scanMetadataId: metadataId,
      totalFindings: data.findings?.length || 0,
      scannerVersion: data.version || null,
    },
    update: {
      totalFindings: data.findings?.length || 0,
      scannerVersion: data.version || null,
    },
  });

  // Delete existing findings and insert new ones atomically
  await prisma.$transaction(async (tx) => {
    await tx.myScannerFinding.deleteMany({
      where: { myScannerResultsId: result.id }
    });

    if (data.findings && data.findings.length > 0) {
      const findings = data.findings.map((f: any) => ({
        myScannerResultsId: result.id,
        findingId: f.id || 'UNKNOWN',
        severity: f.severity || 'INFO',
        message: f.message || null,
        filePath: f.file || null,
      }));

      await tx.myScannerFinding.createMany({ data: findings });
    }
  });
}
```

### 3. Wire up in saveScannerResultTables

In the `saveScannerResultTables` function in `result-savers.ts`:

```typescript
export async function saveScannerResultTables(
  metadataId: string,
  reports: ScanReports
): Promise<void> {
  // ... existing scanners ...

  if (reports.myscanner) {
    await saveMyScannerResults(metadataId, reports.myscanner);
  }
}
```

### 4. Store raw JSON in ScanMetadata

In `result-savers.ts`, add your scanner to the `createOrUpdateScanMetadata` function:

```typescript
const scanMetadataData = {
  // ... existing fields ...
  myScannerResults: reports.myscanner || null,  // <-- add here
};
```

This also requires adding a `myScannerResults` column (type `Json?`) to the `ScanMetadata` model in `schema.prisma`.

## Output Normalization

To feed your scanner's findings into the unified views (vulnerability, package, compliance, efficiency), add extraction logic in `src/lib/scanner/finding-normalizer.ts`.

### Vulnerability findings

If your scanner detects CVEs/vulnerabilities, add extraction in `populateVulnerabilityFindings()`:

```typescript
// Process MyScanner results
if (reports.myscanner?.findings) {
  for (const finding of reports.myscanner.findings) {
    findings.push({
      scanId,
      source: 'myscanner',
      cveId: finding.cveId || finding.id,
      packageName: finding.packageName || 'unknown',
      installedVersion: finding.installedVersion || null,
      fixedVersion: finding.fixedVersion || null,
      severity: mapSeverity(finding.severity),
      cvssScore: finding.cvssScore || null,
      dataSource: 'myscanner',
      vulnerabilityUrl: finding.url || null,
      title: finding.title || null,
      description: finding.description || null,
      filePath: finding.filePath || null,
      packageType: finding.packageType || null,
      rawFinding: finding
    });
  }
}
```

### Severity mapping

Use the existing severity mappers in `src/lib/scanner/severity-mappers.ts`:

```typescript
import { mapSeverity } from './severity-mappers';

// Maps CRITICAL, HIGH, MEDIUM, LOW, INFO, NEGLIGIBLE, UNKNOWN -> normalized values
const normalized = mapSeverity('HIGH'); // returns 'HIGH'
const normalized2 = mapSeverity('NEGLIGIBLE'); // returns 'INFO'
```

If your scanner uses non-standard severity values, add a custom mapper:

```typescript
export function mapMyScannerSeverity(level: string): string {
  switch (level?.toUpperCase()) {
    case 'EMERGENCY':
    case 'CRITICAL': return 'CRITICAL';
    case 'ERROR':
    case 'HIGH': return 'HIGH';
    case 'WARNING':
    case 'MEDIUM': return 'MEDIUM';
    case 'NOTICE':
    case 'LOW': return 'LOW';
    default: return 'INFO';
  }
}
```

### Aggregated counts

If your scanner reports vulnerabilities, add aggregation logic in `calculateAggregatedData()` in `finding-normalizer.ts`:

```typescript
// Aggregate vulnerabilities from MyScanner
if (reports.myscanner?.findings) {
  for (const finding of reports.myscanner.findings) {
    const severity = finding.severity?.toLowerCase();
    if (severity && vulnCount.hasOwnProperty(severity)) {
      vulnCount[severity as keyof VulnerabilityCount]++;
    }
    if (finding.cvssScore) {
      totalCvssScore += finding.cvssScore;
      cvssCount++;
    }
  }
}
```

## Testing Checklist

Before submitting a new scanner, verify:

- [ ] Scanner binary is installed and accessible in the container
- [ ] `getVersion()` returns a version string (not "unknown")
- [ ] `scan()` produces valid JSON output for a known image tar
- [ ] `scan()` writes an error JSON file and returns `{ success: false }` when the scanner fails
- [ ] Scanner name is unique and does not conflict with existing scanner names
- [ ] Scanner is registered in `AVAILABLE_SCANNERS`
- [ ] Scanner key is added to `ScanReports` interface
- [ ] Report filename is added to `loadScanResults()` in `ScanExecutor.ts`
- [ ] Result saver function persists structured data correctly
- [ ] `saveScannerResultTables` calls the new saver when report data is present
- [ ] Raw JSON is stored in `ScanMetadata` for download/export
- [ ] Normalized findings appear in unified vulnerability/package/compliance tables
- [ ] Severity values are correctly mapped to `CRITICAL`/`HIGH`/`MEDIUM`/`LOW`/`INFO`
- [ ] Aggregated vulnerability counts include the new scanner's findings
- [ ] Scanner respects the configured timeout (`config.scanTimeoutMinutes`)
- [ ] Scanner works with the docker-archive tar format (`docker-archive:<path>`)
