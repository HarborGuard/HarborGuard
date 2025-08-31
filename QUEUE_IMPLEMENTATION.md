# Scan Queue Implementation - Development Plan

## Branch: `fix/max-concurrent-scans-queue`

## Problem Statement
The `maxConcurrentScans` configuration was not working properly. When multiple scans were initiated (either individually or through bulk scan), the system would attempt to run all scans simultaneously rather than respecting the configured concurrency limit.

## Root Cause Analysis
1. **ScanExecutor**: Was using `maxConcurrentScans` only for limiting concurrent scanner tools within a single image scan, not for limiting concurrent image scans
2. **BulkScanService**: Used hardcoded concurrency (3) and processed in chunks without respecting the global configuration
3. **ScannerService**: Immediately started all scan requests without checking current running count

## Solution Architecture

### Core Components

#### 1. ScanQueue Class (`src/lib/scanner/ScanQueue.ts`)
- **Purpose**: Manages scan queueing and enforces concurrency limits
- **Features**:
  - Maintains queue of pending scans
  - Tracks running scans up to `maxConcurrentScans` limit
  - Automatically starts queued scans when slots become available
  - Priority-based queue ordering (bulk scans have lower priority)
  - Event emitter for queue state changes
  - Queue position and wait time estimation

#### 2. Updated ScannerService
- **Changes**:
  - All scan requests now go through the queue
  - Listens to queue events to execute scans
  - Returns queue information (position, wait time) to callers
  - Notifies queue when scans complete

#### 3. Updated BulkScanService
- **Changes**:
  - Submits all bulk scan requests to queue with lower priority
  - No longer manages concurrency directly
  - Queue handles all concurrency control

#### 4. New API Endpoints
- **GET /api/scans/queue**: Returns queue status and statistics
- **DELETE /api/scans/queue?requestId=X**: Cancel specific scan from queue
- **Updated POST /api/scans/start**: Returns queue position if scan is queued

## Implementation Details

### Queue States
- **queued**: Scan is waiting for an available slot
- **running**: Scan is actively being processed
- **completed**: Scan finished successfully
- **failed**: Scan encountered an error

### Priority System
- Normal scans: priority = 0
- Bulk scans: priority = -1
- Higher priority scans are processed first when slots become available

### Configuration
- Respects `MAX_CONCURRENT_SCANS` environment variable (default: 3)
- Range: 1-20 concurrent scans

## Testing

### Unit Tests
Located in `src/lib/scanner/__tests__/ScanQueue.test.ts`:
- Queue management (adding, processing)
- Concurrency limit enforcement
- Priority ordering
- Queue position and wait time estimation
- Event emission
- Scan cancellation

### Integration Testing
Use `scripts/test-queue.js` to test the queue functionality:
```bash
# Start the development server
MAX_CONCURRENT_SCANS=2 npm run dev

# In another terminal, run the test
node scripts/test-queue.js
```

### Manual Testing Scenarios

1. **Basic Queue Test**:
   - Set `MAX_CONCURRENT_SCANS=2`
   - Start 5 scans rapidly
   - Verify only 2 run, 3 are queued
   - Complete a scan, verify next starts

2. **Bulk Scan Test**:
   - Start a bulk scan with 10+ images
   - Verify they queue properly
   - Start a normal scan during bulk
   - Verify normal scan gets higher priority

3. **Queue Monitoring**:
   - Use GET /api/scans/queue to monitor status
   - Check queue positions update correctly
   - Verify statistics are accurate

## Migration Notes
- No database schema changes required
- Existing scans continue to work
- Queue is in-memory (resets on restart)

## Future Enhancements
1. **Persistent Queue**: Store queue in database for restart resilience
2. **Queue Metrics**: Add Prometheus metrics for queue monitoring
3. **Dynamic Concurrency**: Allow runtime adjustment of maxConcurrentScans
4. **Fair Queuing**: Implement per-user/per-repository queue limits
5. **Queue UI**: Add visual queue status to web interface

## Deployment Checklist
- [ ] Set appropriate `MAX_CONCURRENT_SCANS` for production
- [ ] Monitor memory usage with large queues
- [ ] Set up alerting for queue depth
- [ ] Document queue behavior for users
- [ ] Update API documentation

## Performance Considerations
- Queue operations are O(1) for enqueue/dequeue
- Priority sorting is O(n log n) but only on insertion
- Memory usage scales with queue size
- Consider queue size limits for production

## Rollback Plan
If issues arise, the queue can be disabled by:
1. Reverting to main branch
2. Or setting `MAX_CONCURRENT_SCANS` to a high value (e.g., 20)

## Metrics to Monitor
- Queue depth over time
- Average wait time
- Scan throughput
- Resource utilization per concurrent scan