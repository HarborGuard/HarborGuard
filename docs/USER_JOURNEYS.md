# HarborGuard User Journeys

Complete documentation of all user experience flows, feature branches, and interaction paths.

---

## Journey Map Overview

```
                                    ┌─────────────────────┐
                                    │     HarborGuard      │
                                    │      Dashboard       │
                                    └──────────┬──────────┘
                                               │
                 ┌─────────────┬───────────────┼───────────────┬──────────────┐
                 │             │               │               │              │
           ┌─────▼─────┐ ┌────▼────┐  ┌───────▼──────┐ ┌─────▼─────┐ ┌──────▼─────┐
           │   Scan     │ │Registry │  │  Scheduled   │ │  Vuln     │ │  System    │
           │   Images   │ │ Mgmt   │  │    Scans     │ │  Mgmt     │ │  Admin     │
           └─────┬─────┘ └────┬────┘  └───────┬──────┘ └─────┬─────┘ └──────┬─────┘
                 │             │               │               │              │
    ┌────────────┼──────┐      │        ┌──────┼─────┐   ┌─────┼────┐   ┌─────┼────┐
    │            │      │      │        │      │     │   │     │    │   │     │    │
  Single    Concurrent Batch  Add    Create  Execute  Triage Patch  Audit  Agents
  Scan      Scans     Scan   Repos  Schedule  Now    CVEs  Images  Logs  Docker/K8s
```

---

## Journey 1: Single Image Scan

The most fundamental flow — scanning one container image.

```
┌──────────┐     ┌───────────┐     ┌──────────────┐     ┌──────────┐     ┌──────────┐
│  Choose  │────▶│  Select   │────▶│   Queue &    │────▶│  View    │────▶│  Export   │
│  Image   │     │  Source   │     │   Execute    │     │ Results  │     │ Reports  │
└──────────┘     └───────────┘     └──────────────┘     └──────────┘     └──────────┘
     │                │                    │                  │                │
     ▼                ▼                    ▼                  ▼                ▼
 Enter name      registry            Dispatched to       Vulns, pkgs,     PDF, XLSX,
 & tag           docker (local)      sensor agent        compliance,      JSON, ZIP
                 tar (file)          OR local sensor     efficiency
                 kubernetes                              Risk score
```

### Entry Points
- **Dashboard**: Click "Scan" button on any image
- **API**: `POST /api/scans/start`
- **CLI**: Direct sensor execution

### Steps

| Step | User Action | System Response |
|------|------------|-----------------|
| 1. Select image | Enter `image:tag` or pick from list | Validates image reference |
| 2. Choose source | `registry`, `local` (Docker), `tar` (file), `kubernetes` | Determines pull strategy |
| 3. Configure scanners | Optional: select subset of trivy/grype/syft/dockle/osv/dive | Defaults to all 6 |
| 4. Submit | Click scan / POST API | Returns `requestId` + `scanId`, enters queue |
| 5. Monitor | Poll status or watch SSE stream | Progress updates: 0% → 100% |
| 6. View results | Navigate to scan details page | Findings organized by type |
| 7. Triage | Mark false positives, classify CVEs | Risk score recalculated |
| 8. Export | Download PDF/XLSX/JSON/ZIP | Report generated on-demand |

### Branching: Source Types

```
                    ┌─────────────────┐
                    │  Image Source?   │
                    └────────┬────────┘
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │ Registry │  │  Docker  │  │   Tar    │
        │ (remote) │  │ (local)  │  │ (file)   │
        └────┬─────┘  └────┬─────┘  └────┬─────┘
             │              │              │
             ▼              ▼              ▼
      Pull from ECR,   Inspect local    Read tar file
      GHCR, Quay,      Docker daemon    from path
      Docker Hub...    via socket
             │              │              │
             ▼              ▼              ▼
      All 6 scanners   All 6 scanners  All 6 scanners
      (skopeo prefetch (direct access) (direct access)
       for dockle/dive)
```

### Branching: Execution Mode

```
                    ┌──────────────────┐
                    │ Scan Mode?       │
                    │ (auto-detected)  │
                    └────────┬─────────┘
                    ┌────────┴────────┐
                    ▼                 ▼
            ┌──────────────┐  ┌──────────────┐
            │Agent Dispatch│  │ Local Sensor │
            │(distributed) │  │  (monolith)  │
            └──────┬───────┘  └──────┬───────┘
                   │                  │
                   ▼                  ▼
            Create AgentJob     Shell out to
            Sensor polls &      /app/sensor/
            picks up job        harborguard-sensor
                   │                  │
                   ▼                  ▼
            Sensor executes     Sensor executes
            all 6 scanners     all 6 scanners
                   │                  │
                   ▼                  ▼
            Uploads envelope    Returns envelope
            via POST /api/     directly to
            scans/upload       ScannerService
                   │                  │
                   └────────┬─────────┘
                            ▼
                    ┌──────────────┐
                    │  Ingest      │
                    │  Envelope    │
                    │  into DB     │
                    └──────────────┘
```

---

## Journey 2: Concurrent & Batch Scanning

Scanning multiple images simultaneously.

```
┌────────────────┐     ┌────────────────┐     ┌────────────────┐
│  Submit N      │────▶│  Queue with    │────▶│  Sensor        │
│  scan requests │     │  priority      │     │  processes     │
│  in parallel   │     │  ordering      │     │  sequentially  │
└────────────────┘     └────────────────┘     └────────────────┘
                                                      │
                              ┌────────────────────────┤
                              ▼                        ▼
                       ┌──────────────┐        ┌──────────────┐
                       │  Results     │        │  Audit logs  │
                       │  per image   │        │  per scan    │
                       └──────────────┘        └──────────────┘
```

### Concurrent (3-5 images)

```
POST /api/scans/start  ─── image1:tag ───▶ Queue position 1
POST /api/scans/start  ─── image2:tag ───▶ Queue position 2
POST /api/scans/start  ─── image3:tag ───▶ Queue position 3
                                                │
                                    Sensor processes jobs
                                    one at a time from queue
                                                │
                              ┌─────────────────┼─────────────────┐
                              ▼                 ▼                 ▼
                         image1:SUCCESS    image2:SUCCESS    image3:SUCCESS
```

### Batch (5-50 images via API)

```
POST /api/scans/bulk
  ├── patterns: { imagePattern: "alpine" }
  ├── options: { maxImages: 10 }
  │
  ▼
┌──────────────────────────────┐
│ BulkScanService              │
│  1. Find matching images     │
│  2. Create batch record      │
│  3. Queue scans (background) │
│  4. Return batchId           │
└──────────┬───────────────────┘
           │
           ▼ (non-blocking)
┌──────────────────────────────┐
│ Background queueing          │
│  For each image:             │
│    - Create scan record      │
│    - Add to ScanQueue        │
│    - Link to BulkScanBatch   │
│  Update batch status         │
└──────────────────────────────┘
```

### Batch (manual — fire N single scans)

```
for image in [redis, nginx, traefik, golang, python]:
    POST /api/scans/start { image, tag, source: "registry" }
         │
         ▼
    Dashboard queues all scans
    Sensor picks them up sequentially
    Each completes independently
         │
         ▼
    11 images scanned, 11 scans tracked
    Monitor via GET /api/scans?limit=100
```

---

## Journey 3: Registry Management

```
┌───────────┐     ┌───────────┐     ┌───────────┐     ┌───────────┐
│   Add     │────▶│   Test    │────▶│   Sync    │────▶│  Browse   │
│ Registry  │     │Connection │     │  Images   │     │  & Scan   │
└───────────┘     └───────────┘     └───────────┘     └───────────┘
```

### Supported Registry Types

```
┌────────────────────────────────────────────────────────┐
│                   Registry Types                        │
├──────────────┬──────────────┬──────────────────────────┤
│   Public     │  Enterprise  │   Self-Hosted            │
├──────────────┼──────────────┼──────────────────────────┤
│ DOCKERHUB    │ ECR (AWS)    │ HARBOR                   │
│ GHCR         │ GCR (Google) │ NEXUS                    │
│ QUAY         │ ACR (Azure)  │ ARTIFACTORY              │
│              │ GITLAB       │ GENERIC (any OCI)        │
│              │              │ GITEA                    │
└──────────────┴──────────────┴──────────────────────────┘
```

### Authentication Flow

```
                    ┌──────────────────┐
                    │  Registry Type?  │
                    └────────┬─────────┘
            ┌────────────────┼────────────────┐
            ▼                ▼                ▼
     ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
     │   Public     │ │  With Auth   │ │  Token-based │
     │  (no creds)  │ │  user/pass   │ │  (PAT/API)   │
     └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
            │                │                │
            ▼                ▼                ▼
     Docker Hub anon    Docker Hub auth   GHCR PAT
     ECR Public         Harbor            GitLab token
     Quay Public        Nexus             ACR token
                        Artifactory       ECR IAM
```

---

## Journey 4: Scheduled Scans

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Create  │────▶│ Configure│────▶│  Runs    │────▶│  Review  │
│ Schedule │     │  Images  │     │ on Cron  │     │ History  │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
```

### Image Selection Modes

```
                    ┌───────────────────┐
                    │ Selection Mode?   │
                    └────────┬──────────┘
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
  │   SPECIFIC   │   │   PATTERN    │   │     ALL      │
  │  Pick exact  │   │  Regex match │   │  Every image │
  │  images      │   │  by name/tag │   │  in system   │
  └──────────────┘   └──────────────┘   └──────────────┘
         │                   │                   │
         ▼                   ▼                   ▼
  Select from DB      imagePattern:        Auto-includes
  image list          "nginx.*"            new images
                      tagPattern:          added after
                      "latest|stable"      schedule
                      excludeTagPattern:   creation
                      "dev|test"
```

### Execution Flow

```
Cron fires (e.g. "0 2 * * *" = 2AM daily)
     │
     ▼
┌──────────────────────┐
│ Find matching images │
│ based on mode        │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Queue scans for each │
│ matched image        │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Record execution     │
│ history with stats   │
└──────────────────────┘
```

---

## Journey 5: Vulnerability Management & CVE Triage

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  View    │────▶│ Classify │────▶│  Risk    │────▶│  Track   │
│ Findings │     │  CVEs    │     │ Updated  │     │ Library  │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
```

### Vulnerability Flow

```
Scan completes
     │
     ▼
┌──────────────────────────────────────────────────┐
│                  Findings                         │
├────────────────┬────────────┬───────────┬────────┤
│ Vulnerabilities│  Packages  │ Compliance│Efficien│
│ (trivy,grype,  │  (trivy,   │ (dockle)  │(dive)  │
│  osv)          │   syft)    │           │        │
└────────┬───────┴──────┬─────┴─────┬─────┴────┬───┘
         │              │           │          │
         ▼              ▼           ▼          ▼
    CVE IDs +      SBOM with    Dockerfile  Large layer
    severity       licenses     best        detection
    CVSS scores    purls        practices   (>50MB)
    fix versions   types        grades A-D
```

### CVE Classification

```
                    ┌──────────────────┐
                    │  Review CVE      │
                    │  in scan results │
                    └────────┬─────────┘
                    ┌────────┴─────────┐
                    ▼                  ▼
            ┌──────────────┐   ┌──────────────┐
            │ Mark as      │   │  Legitimate  │
            │ False        │   │  (default)   │
            │ Positive     │   │              │
            └──────┬───────┘   └──────────────┘
                   │
                   ▼
            ┌──────────────┐
            │ Add comment  │
            │ & reason     │
            └──────┬───────┘
                   │
                   ▼
            ┌──────────────┐
            │ Risk score   │
            │ recalculated │
            │ (excludes    │
            │  false pos)  │
            └──────────────┘
```

### Vulnerability Library

```
/library page
     │
     ├── Overview: total CVEs, critical, high, fixable rate
     │
     ├── Search by CVE ID, package name
     │
     ├── Filter by severity
     │
     └── Click CVE ──▶ /library/[cveId]
                           │
                           ├── All affected images
                           ├── Fix availability
                           ├── CVSS details
                           └── Cross-scanner correlation
```

---

## Journey 6: Patch Analysis & Execution

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ Analyze  │────▶│ Select   │────▶│ Execute  │────▶│ Download │
│ Scan     │     │ Vulns to │     │  Patch   │     │ Patched  │
│ Results  │     │  Patch   │     │ Operation│     │  Image   │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
```

### Patch Decision Tree

```
                    ┌──────────────────┐
                    │  Scan results    │
                    │  available       │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  GET /patches/   │
                    │  analyze?scanId= │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
       ┌──────────┐   ┌──────────┐   ┌──────────┐
       │ Patchable│   │ Kernel   │   │ Not      │
       │ packages │   │ updates  │   │ patchable│
       │ (apt/yum/│   │          │   │          │
       │  apk)    │   │          │   │          │
       └────┬─────┘   └────┬─────┘   └──────────┘
            │               │
            ▼               ▼
     ┌──────────────────────────┐
     │  POST /patches/execute   │
     │  - sourceImageId         │
     │  - scanId                │
     │  - targetRegistry?       │
     │  - selectedVulnIds?      │
     │  - dryRun?               │
     └────────────┬─────────────┘
                  │
         ┌────────┴────────┐
         ▼                 ▼
  ┌──────────────┐  ┌──────────────┐
  │   Dry Run    │  │   Execute    │
  │  (preview)   │  │   (apply)   │
  └──────────────┘  └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ Extract image│
                    │ Apply fixes  │
                    │ Rebuild      │
                    │ Push/export  │
                    └──────┬───────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
       ┌──────────────┐         ┌──────────────┐
       │ Download tar │         │ Push to       │
       │ GET /patches/│         │ target        │
       │ [id]/download│         │ registry      │
       └──────────────┘         └──────────────┘
```

---

## Journey 7: Reports & Exports

```
                    ┌──────────────────┐
                    │  Scan Results    │
                    │  Available       │
                    └────────┬─────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
  │     PDF      │   │    XLSX      │   │    JSON      │
  │   Report     │   │  Workbook    │   │  Raw Output  │
  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
         │                   │                   │
         ▼                   ▼                   ▼
  Executive          Multi-sheet          Per-scanner:
  summary with       workbook:            trivy.json
  vuln charts,       - Summary            grype.json
  risk score,        - Vulnerabilities    syft.json
  compliance         - Compliance         dockle.json
  details            - Packages           osv.json
  (~3s render)       (~30ms)              dive.json
                                          (~15ms each)
                             │
                             ▼
                      ┌──────────────┐
                      │  ZIP Bundle  │
                      │ All formats  │
                      │ combined     │
                      └──────────────┘
```

---

## Journey 8: Distributed Sensor Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Dashboard                                    │
│                                                                       │
│  ┌─────────┐  ┌──────────┐  ┌───────────┐  ┌──────────┐            │
│  │ API     │  │ Scanner  │  │  Agent    │  │  S3/MinIO│            │
│  │ Routes  │  │ Service  │  │  Manager  │  │  Storage │            │
│  └────┬────┘  └────┬─────┘  └─────┬─────┘  └────┬─────┘            │
│       │             │              │              │                   │
└───────┼─────────────┼──────────────┼──────────────┼───────────────────┘
        │             │              │              │
        │        ┌────▼─────┐   ┌────▼────┐        │
        │        │ Dispatch │   │ Poll    │        │
        │        │ AgentJob │   │ /agent/ │        │
        │        └──────────┘   │ jobs    │        │
        │                       └────┬────┘        │
        │                            │              │
   ┌────▼────────────────────────────▼──────────────▼────┐
   │                    Sensor Container                   │
   │                                                       │
   │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
   │  │ Register │  │ Poll for │  │ Execute scan     │   │
   │  │ (retry   │  │ jobs     │  │ (6 scanners)     │   │
   │  │  backoff)│  │ (10s     │  │                  │   │
   │  │          │  │  interval)│  │ ┌──────────────┐│   │
   │  └────┬─────┘  └────┬─────┘  │ │ Orchestrator ││   │
   │       │              │        │ │ - prefetch   ││   │
   │       ▼              ▼        │ │ - parallel   ││   │
   │  DB warmup     Pick up job    │ │ - retry      ││   │
   │  (trivy,grype  Execute scan   │ └──────────────┘│   │
   │   DBs ready)                  └────────┬─────────┘   │
   │                                        │              │
   │  ┌──────────┐  ┌──────────┐           │              │
   │  │ Build    │  │ Upload   │◀──────────┘              │
   │  │ envelope │  │ to S3    │                          │
   │  └────┬─────┘  │ + dash   │                          │
   │       │        └──────────┘                          │
   └───────┼──────────────────────────────────────────────┘
           │
           ▼
    ┌──────────────┐
    │ Dashboard    │
    │ ingests      │
    │ envelope,    │
    │ stores       │
    │ findings     │
    └──────────────┘
```

### Sensor Lifecycle

```
Container starts
     │
     ▼
Register with dashboard (retry up to 10x with backoff)
     │
     ▼
Warm up scanner databases (trivy + grype in parallel)
     │
     ▼
Start heartbeat ticker (every 30s)
     │
     ▼
Poll for jobs (every 10s) ◀─────────────────────────┐
     │                                                │
     ▼                                                │
Job available? ──── No ──────────────────────────────┘
     │
     Yes
     │
     ▼
Execute scan (orchestrator)
     │
     ├── Registry source? ──▶ Prefetch via skopeo for dockle/dive
     │
     ├── Run compatible scanners in parallel batches
     │
     ├── Build ScanEnvelope
     │
     ├── Upload raw results to S3
     │
     ├── Upload envelope to dashboard
     │
     └── Report job status ──────────────────────────┘
```

---

## Journey 9: Docker & Kubernetes Integration

### Docker Flow

```
┌──────────────────┐
│ Docker Daemon    │
│ Available?       │
└────────┬─────────┘
    ┌────┴────┐
    ▼         ▼
   Yes        No
    │          │
    ▼          ▼
┌────────┐  ┌────────────────┐
│ List   │  │ Use registry   │
│ local  │  │ source instead │
│ images │  └────────────────┘
└───┬────┘
    │
    ▼
┌────────────────────────────────┐
│ User selects image to scan     │
│ Source: "local"                 │
│ Docker inspects image metadata │
└──────────────┬─────────────────┘
               │
               ▼
        Standard scan flow
        (all 6 scanners)
```

### Kubernetes Flow

```
┌──────────────────┐
│ K8s Cluster      │
│ Reachable?       │
└────────┬─────────┘
    ┌────┴────┐
    ▼         ▼
   Yes        No
    │          │
    ▼          ▼
┌────────┐  ┌────────────────┐
│ List   │  │ Status: cluster│
│ ns +   │  │ not available  │
│ pods   │  └────────────────┘
└───┬────┘
    │
    ▼
┌──────────────────────────────┐
│ Discover images in pods      │
│ Filter by namespace          │
│ Show running containers      │
└──────────────┬───────────────┘
               │
               ▼
        Select images to scan
        Source: "registry"
        (images pulled from registry)
```

---

## Journey 10: Audit Trail

Every user action generates an audit log entry.

```
┌─────────────────────────────────────────────────────────────┐
│                    Audit Event Types                         │
├──────────────────┬──────────────────┬───────────────────────┤
│    SCAN_START    │  SCAN_COMPLETE   │     SCAN_FAILED       │
│    (scan begun)  │  (results in)    │     (error logged)    │
├──────────────────┼──────────────────┼───────────────────────┤
│   IMAGE_REMOVED  │  SYSTEM_EVENT   │     USER_LOGIN        │
│   (deletion)     │  (CVE triage,   │     (session)         │
│                  │   bulk ops)     │                       │
└──────────────────┴──────────────────┴───────────────────────┘

Each entry contains:
  - timestamp
  - eventType
  - category (INFORMATIVE | OPERATIONAL | SECURITY | ERROR)
  - userIp
  - userAgent
  - resource (image name, scan ID)
  - action (CREATE | UPDATE | DELETE | SCAN | UPLOAD)
  - details (JSON)
  - metadata (JSON)

Filterable by: eventType, category, userIp, resource, date range, search
```

---

## Journey 11: Rescan & Continuous Monitoring

```
Initial scan ──▶ Results reviewed ──▶ Time passes ──▶ Rescan
                                                         │
                                    ┌────────────────────┤
                                    ▼                    ▼
                             ┌──────────────┐    ┌──────────────┐
                             │  Manual      │    │  Scheduled   │
                             │  rescan      │    │  (cron-based)│
                             │  via UI/API  │    │  automatic   │
                             └──────┬───────┘    └──────┬───────┘
                                    │                    │
                                    ▼                    ▼
                             Full ref reconstructed from DB:
                             - primaryRepositoryId → registryUrl
                             - registryType → host map
                             - name + tag → full image ref
                                    │
                                    ▼
                             New scan with same image
                             Compare with previous results
```

---

## Journey 12: Complete User Session Example

A typical user session exercising multiple features:

```
1. Login to dashboard (/)
   │
2. Add Docker Hub registry (/repositories)
   │   POST /api/repositories { type: "DOCKERHUB" }
   │
3. Add GHCR registry
   │   POST /api/repositories { type: "GHCR" }
   │
4. Scan alpine:3.20 from ECR Public
   │   POST /api/scans/start { image: "public.ecr.aws/.../alpine", tag: "3.20" }
   │   Wait for SUCCESS
   │
5. View scan results (/images/alpine/[scanId])
   │   9 vulnerabilities, 28 packages, 3 compliance findings
   │   Risk score: 43
   │
6. Mark CVE-2024-58251 as false positive
   │   POST /api/scans/[id]/cve-classifications
   │   Risk score recalculated
   │
7. Download PDF report
   │   GET /api/images/name/.../scan/[id]/pdf-report
   │
8. Queue batch of 5 more images
   │   POST /api/scans/start × 5 (golang, python, node, postgres, memcached)
   │   All complete: 5/5
   │
9. Create nightly schedule
   │   POST /api/scheduled-scans { schedule: "0 2 * * *", imagePattern: "alpine" }
   │
10. Review audit logs (/audit-logs)
    │   31 entries: SCAN_START=12, SCAN_COMPLETE=14, SYSTEM_EVENT=5
    │
11. Rescan alpine:3.20 (unchanged findings)
    │   POST /api/scans/rescan { scanId: "..." }
    │
12. Delete test image
    │   DELETE /api/images/name/busybox
    │   Verify: 404
    │
13. Check API performance
        20x /api/health: avg 5ms
        10 concurrent: 46ms total
```

---

## API Response Time Profile

| Endpoint Category | Avg Latency | Notes |
|-------------------|-------------|-------|
| Health/Ready | 5-7ms | In-memory |
| List endpoints | 7-12ms | DB query with pagination |
| Queue stats | 4ms | In-memory |
| Aggregated views | 26ms | Complex DB aggregation |
| Raw scanner reports | 10-15ms | S3 fetch |
| XLSX generation | 28ms | In-memory render |
| PDF generation | ~3,100ms | Puppeteer browser render |
| Version check | ~324ms | External HTTP call |

---

## Scan Performance

| Scenario | Images | Avg Duration | Notes |
|----------|--------|-------------|-------|
| Single (alpine-sized) | 1 | ~15s | Small image, few packages |
| Single (large, e.g. node) | 1 | ~36s | Many packages, large layers |
| Concurrent (3 images) | 3 | ~50s total | Sequential sensor execution |
| Batch (5 images) | 5 | ~76s total | ~15s/image average |
| With prefetch (registry) | 1 | +5-10s | skopeo download for dockle/dive |
