# Harbor Guard Testing Guide

This document provides comprehensive testing procedures for Harbor Guard functionality.

## Prerequisites

- Node.js 18+ installed
- Docker installed and running
- Port 3000 available (or specify custom PORT)

## 1. Build Testing

### 1.1 Production Build
```bash
npm run build
```

**Expected Results:**
- ✅ Build completes without errors
- ✅ No TypeScript compilation errors
- ✅ Static pages generated successfully
- ✅ Configuration loads properly during build

**Success Indicators:**
```
✓ Compiled successfully
✓ Linting and checking validity of types
✓ Generating static pages
Route listings displayed
```

### 1.2 Development Server
```bash
npm run dev
```

**Expected Results:**
- ✅ Server starts without errors
- ✅ Configuration loaded successfully
- ✅ Turbopack compilation completes
- ✅ Server accessible at http://localhost:3000

**Success Indicators:**
```
✓ Ready in ~1000-1500ms
[CONFIG] Configuration loaded successfully
[CONFIG] Max concurrent scans: 3
[CONFIG] Enabled scanners: trivy, grype, syft, dockle, osv, dive
```

## 2. Environment Variables Testing

### 2.1 Test Different Configurations
```bash
# Test 1: Custom port and logging
PORT=8080 LOG_LEVEL=debug npm run dev

# Test 2: Limited scanners and concurrency
MAX_CONCURRENT_SCANS=1 ENABLED_SCANNERS=trivy,grype LOG_LEVEL=warn npm run dev

# Test 3: Health checks and version checks disabled
HEALTH_CHECK_ENABLED=false VERSION_CHECK_ENABLED=false npm run dev
```

### 2.2 Verify Configuration Loading
Check console output for:
- ✅ Correct port number in startup message
- ✅ Log level reflected in debug/info messages
- ✅ Enabled scanners list matches environment setting
- ✅ Health check status (enabled/disabled)

### 2.3 Test Health Endpoints
```bash
# When HEALTH_CHECK_ENABLED=true
curl http://localhost:8080/api/health
# Expected: JSON health status (200)

curl -I http://localhost:8080/api/ready  
# Expected: HTTP 200 OK

# When HEALTH_CHECK_ENABLED=false
curl http://localhost:8080/api/health
# Expected: {"error":"Health checks are disabled"} (404)
```

## 3. API Endpoints Testing

### 3.1 Core API Endpoints (GET only)

#### Health & System
```bash
# Health check
curl "http://localhost:3000/api/health" | jq .

# Readiness probe
curl "http://localhost:3000/api/ready" | jq .

# Version check
curl "http://localhost:3000/api/version" | jq .

# Scan jobs status
curl "http://localhost:3000/api/scans/jobs" | jq .
```

#### Data Retrieval
```bash
# List all scans (paginated)
curl "http://localhost:3000/api/scans?limit=10&offset=0" | jq .

# Aggregated scans view
curl "http://localhost:3000/api/scans/aggregated?limit=10" | jq .

# List images
curl "http://localhost:3000/api/images?limit=10" | jq .

# List vulnerabilities
curl "http://localhost:3000/api/vulnerabilities?limit=10" | jq .

# Docker integration
curl "http://localhost:3000/api/docker/images" | jq .
curl "http://localhost:3000/api/docker/info" | jq .

# Repositories
curl "http://localhost:3000/api/repositories" | jq .

# Audit logs
curl "http://localhost:3000/api/audit-logs?limit=10" | jq .
```

### 3.2 Expected API Response Formats

#### `/api/health` Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-XX...",
  "version": "0.1.0",
  "uptime": 123.45,
  "checks": {
    "database": {"status": "healthy", "responseTime": 15},
    "scanners": {"status": "healthy", "enabled": [...], "total": 6},
    "configuration": {...}
  }
}
```

#### `/api/scans/aggregated` Response:
```json
{
  "scans": [
    {
      "id": "...",
      "requestId": "...",
      "imageId": "...", 
      "status": "SUCCESS",
      "riskScore": 45,
      "image": {
        "name": "nginx",
        "tag": "latest",
        "registry": null
      },
      "vulnerabilityCount": {
        "total": 23,
        "critical": 0,
        "high": 3,
        "medium": 12,
        "low": 8
      }
    }
  ],
  "pagination": {
    "total": 1,
    "limit": 25,
    "offset": 0,
    "hasMore": false
  }
}
```

#### `/api/scans/jobs` Response:
```json
{
  "jobs": [
    {
      "requestId": "...",
      "scanId": "...",
      "imageId": "...",
      "imageName": "nginx:latest",
      "status": "RUNNING",
      "progress": 75,
      "error": null
    }
  ]
}
```

## 4. Image Scan Testing

### 4.1 Start nginx:latest Scan
```bash
# Method 1: Via API
curl -X POST "http://localhost:3000/api/scans/start" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "nginx",
    "tag": "latest",
    "registry": null,
    "source": "registry"
  }'

# Expected Response:
# {"requestId": "20250827-123456-abcd1234", "scanId": "clm..."}
```

### 4.2 Monitor Scan Progress
```bash
# Check scan jobs
curl "http://localhost:3000/api/scans/jobs" | jq .

# Check specific scan status (replace with actual requestId)
curl "http://localhost:3000/api/scans/status/20250827-123456-abcd1234" | jq .
```

**Expected Scan Phases:**
1. **RUNNING** (0-20%): "Setting up scan environment"
2. **RUNNING** (20-50%): "Exporting Docker image" / "Image download"  
3. **RUNNING** (55-94%): Individual scanner progress
   - "Trivy scan completed"
   - "Grype scan completed"
   - etc.
4. **SUCCESS** (100%): "Scan completed successfully"

## 5. SSE Stream Testing

### 5.1 Monitor Real-time Updates
```bash
# Open SSE stream (replace with actual requestId)
curl -N "http://localhost:3000/api/scans/events/20250827-123456-abcd1234"
```

**Expected SSE Events:**
```
data: {"requestId":"...","status":"RUNNING","progress":10,"step":"Setting up scan environment","timestamp":"..."}

data: {"requestId":"...","status":"RUNNING","progress":25,"step":"Image export completed","timestamp":"..."}

data: {"requestId":"...","status":"RUNNING","progress":65,"step":"Trivy scan completed","timestamp":"..."}

data: {"requestId":"...","status":"SUCCESS","progress":100,"step":"Scan completed successfully","timestamp":"..."}
```

### 5.2 Browser Testing
Open in browser:
```
http://localhost:3000/api/scans/events/[REQUEST_ID]
```
Should see real-time streaming of scan progress.

## 6. Database Validation

### 6.1 Verify Scan Record Creation
```bash
# Check scan was created
curl "http://localhost:3000/api/scans?imageId=nginx&tag=latest" | jq '.scans[0]'
```

**Expected Database State:**
- ✅ Scan record with status "SUCCESS"
- ✅ Image record for nginx:latest
- ✅ ScanResult records for each enabled scanner
- ✅ Scanner records for trivy, grype, syft, dockle, osv, dive
- ✅ Vulnerability records extracted from scan results
- ✅ ImageVulnerability junction records

### 6.2 Validate Scan Results
```bash
# Check scan details (replace with actual scanId)
curl "http://localhost:3000/api/scans/clm123..." | jq .

# Verify vulnerability extraction
curl "http://localhost:3000/api/vulnerabilities?imageId=..." | jq '.vulnerabilities | length'
```

**Expected Results:**
- ✅ Risk score calculated (0-100 range)
- ✅ Vulnerability counts populated
- ✅ Scan metadata includes scanner versions
- ✅ Individual scanner reports stored

### 6.3 Check Report Files
```bash
# List scan results by image name
curl "http://localhost:3000/api/images/name/nginx" | jq .

# Download scan reports (replace with actual values)
curl "http://localhost:3000/api/image/nginx/scan/[SCAN_ID]/trivy" -o trivy-report.json
curl "http://localhost:3000/api/image/nginx/scan/[SCAN_ID]/download" -o complete-reports.zip
```

## 7. Docker Container Testing

### 7.1 Build Test Container
```bash
docker build . -t harborguard:test
```

**Expected Results:**
- ✅ Build completes without errors
- ✅ All dependencies installed
- ✅ Scanners (trivy, grype, etc.) installed
- ✅ Application built and ready

### 7.2 Run Container Tests
```bash
# Start container
docker run -d -p 3000:3000 --name harborguard-test harborguard:test

# Wait for startup
sleep 10

# Test basic functionality
curl "http://localhost:3000/api/health" | jq .status
curl "http://localhost:3000/api/ready" | jq .status

# Test scan functionality
curl -X POST "http://localhost:3000/api/scans/start" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "nginx", 
    "tag": "latest",
    "source": "registry"
  }'
```

### 7.3 Container Environment Testing
```bash
# Test with custom environment
docker run -d -p 8080:8080 \
  -e PORT=8080 \
  -e MAX_CONCURRENT_SCANS=2 \
  -e LOG_LEVEL=debug \
  -e ENABLED_SCANNERS=trivy,grype \
  --name harborguard-env-test \
  harborguard:test

# Verify configuration
curl "http://localhost:8080/api/health" | jq '.checks.configuration'
```

### 7.4 Cleanup
```bash
docker stop harborguard-test harborguard-env-test
docker rm harborguard-test harborguard-env-test
```

## 8. Test Automation Script

### 8.1 Quick Test Script
Create `test-harborguard.sh`:
```bash
#!/bin/bash
set -e

echo "🧪 Harbor Guard Testing Suite"
echo "=============================="

echo "1. Building application..."
npm run build

echo "2. Starting development server..."
npm run dev &
DEV_PID=$!
sleep 5

echo "3. Testing health endpoints..."
curl -f "http://localhost:3000/api/health" > /dev/null && echo "✅ Health check passed"
curl -f "http://localhost:3000/api/ready" > /dev/null && echo "✅ Readiness check passed"

echo "4. Testing API endpoints..."
curl -f "http://localhost:3000/api/scans/aggregated?limit=5" > /dev/null && echo "✅ Scans API working"
curl -f "http://localhost:3000/api/images?limit=5" > /dev/null && echo "✅ Images API working"

echo "5. Starting nginx:latest scan..."
SCAN_RESULT=$(curl -s -X POST "http://localhost:3000/api/scans/start" \
  -H "Content-Type: application/json" \
  -d '{"image":"nginx","tag":"latest","source":"registry"}')
REQUEST_ID=$(echo $SCAN_RESULT | jq -r .requestId)
echo "✅ Scan started: $REQUEST_ID"

echo "6. Monitoring scan progress..."
for i in {1..30}; do
  STATUS=$(curl -s "http://localhost:3000/api/scans/status/$REQUEST_ID" | jq -r .status)
  if [ "$STATUS" = "SUCCESS" ]; then
    echo "✅ Scan completed successfully"
    break
  elif [ "$STATUS" = "FAILED" ]; then
    echo "❌ Scan failed"
    break
  fi
  echo "   Progress: $STATUS"
  sleep 10
done

echo "7. Building Docker image..."
docker build . -t harborguard:test

echo "8. Testing Docker container..."
docker run -d -p 3001:3000 --name harborguard-test-container harborguard:test
sleep 10
curl -f "http://localhost:3001/api/health" > /dev/null && echo "✅ Container health check passed"

# Cleanup
kill $DEV_PID 2>/dev/null || true
docker stop harborguard-test-container && docker rm harborguard-test-container

echo "✅ All tests completed successfully!"
```

### 8.2 Make Script Executable
```bash
chmod +x test-harborguard.sh
./test-harborguard.sh
```

## 9. Troubleshooting

### Common Issues & Solutions

**Build Failures:**
- Check Node.js version (requires 18+)
- Clear cache: `rm -rf .next node_modules && npm install`

**Port Conflicts:**
- Use custom port: `PORT=8080 npm run dev`
- Kill existing processes: `pkill -f "next dev"`

**Docker Issues:**
- Ensure Docker daemon is running
- Check available disk space
- Clear Docker cache: `docker system prune`

**Scan Failures:**
- Check Docker socket access
- Verify network connectivity for registry pulls
- Review scanner logs in container output

**Database Issues:**
- Run: `npm run db:init`
- Check DATABASE_URL environment variable
- Verify SQLite file permissions

This testing guide ensures comprehensive validation of Harbor Guard's functionality across all deployment scenarios.