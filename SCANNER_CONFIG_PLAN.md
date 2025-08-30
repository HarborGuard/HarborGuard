# Per-Scan Scanner Configuration Feature

## Overview
Enable users to select which security scanners to run on a per-scan basis, rather than using only the global configuration. This feature is particularly important for bulk scans where users may want to optimize for speed by disabling certain scanners.

**Primary Focus**: Bulk scans - where performance optimization is critical
**Secondary**: Single scans will continue using all enabled scanners (can be enhanced later if needed)

**Additional UX Enhancement**: Show all scanners in UI but disable unavailable ones with explanatory tooltips

## Current State
- UI already collects scanner preferences in bulk scan modal
- Scanner options are passed to the backend API
- Backend receives but doesn't use the scanner configuration
- All scans use the global `config.enabledScanners` setting

## Key Features to Implement

1. **Scanner Availability Display**
   - Show all 6 scanners in the UI (trivy, grype, syft, dockle, osv, dive)
   - Disable checkboxes for scanners not in `ENABLED_SCANNERS`
   - Add tooltips explaining why scanners are disabled

2. **Per-Scan Configuration (Bulk Only)**
   - Honor scanner selection in bulk scans
   - Only run selected AND available scanners
   - Single scans remain unchanged (use all enabled scanners)

3. **Performance Optimization**
   - Users can disable scanners to speed up bulk scans
   - Clear indication of time/performance tradeoffs

## Development Plan

### Phase 1: Update Type Definitions
1. **Extend ScanRequest interface** (`src/types/index.ts`)
   - Add optional `scanners` field to specify which scanners to run
   - Structure: `{ trivy?: boolean, grype?: boolean, syft?: boolean, dockle?: boolean, osv?: boolean, dive?: boolean }`

2. **Update related types**
   - Ensure CreateScanRequest inherits scanner options
   - Add scanner configuration to any other relevant scan types

### Phase 2: Update Backend Services

1. **Modify BulkScanService** (`src/lib/bulk/BulkScanService.ts`)
   - Pass scanner configuration from bulk scan request to individual scan requests
   - Update `executeConcurrentScans` to include scanner options in scan requests

2. **Update ScannerService** (`src/lib/scanner/ScannerService.ts`)
   - Accept scanner configuration in `startScan` method
   - Pass configuration through to `executeScan`
   - Store scanner configuration with scan metadata

3. **Modify ScanExecutor** (`src/lib/scanner/ScanExecutor.ts`)
   - Update `executeLocalDockerScan` and `executeRegistryScan` to accept scanner options
   - Modify `runScannersOnTar` to use per-scan configuration
   - Implement logic to merge per-scan options with global defaults
   - Filter `AVAILABLE_SCANNERS` based on scan-specific configuration

### Phase 3: Expose Available Scanners to Frontend

1. **Create scanner availability endpoint** (`src/app/api/scanners/available/route.ts`)
   - Return list of all scanners with availability status
   - Read from `ENABLED_SCANNERS` environment variable
   - Include scanner name, description, and enabled status
   
   Example response:
   ```json
   {
     "scanners": [
       { "name": "trivy", "description": "Vulnerability scanner", "available": true },
       { "name": "grype", "description": "Vulnerability scanner", "available": true },
       { "name": "syft", "description": "SBOM generator", "available": true },
       { "name": "dockle", "description": "Container linter", "available": true },
       { "name": "osv", "description": "OSV vulnerability DB", "available": false },
       { "name": "dive", "description": "Layer analysis", "available": false }
     ]
   }
   ```

2. **Update scanner configuration** (`src/lib/config.ts`)
   - Ensure `ENABLED_SCANNERS` is properly parsed
   - Provide method to get scanner availability

### Phase 4: Update API Endpoints

1. **Bulk scan endpoint** (`src/app/api/scans/bulk/route.ts`)
   - Already accepts scanner configuration
   - Validate that requested scanners are actually available
   - Reject requests for disabled scanners

2. **Single scan endpoint** (`src/app/api/scans/start/route.ts`) - **NO CHANGES**
   - Remains unchanged
   - Continues using all enabled scanners

### Phase 5: Update Frontend Components

1. **Bulk Scan Modal** (`src/components/bulk-scan-modal.tsx`)
   - Fetch available scanners on modal open
   - Show all scanners (trivy, grype, syft, dockle, osv, dive)
   - Disable checkboxes for unavailable scanners
   - Add tooltip to disabled scanners: "Disabled in server configuration"
   - Only allow selection of available scanners
   - Pre-check all available scanners by default

2. **Scanner State Management**
   - Fetch scanner availability from API
   - Store as `{name: string, description: string, available: boolean}`
   - Update form state to respect availability

3. **Single Scan Modals** - **NO CHANGES**
   - Keep as-is, no scanner selection needed

### Phase 6: Configuration Logic

1. **Scanner Selection Logic**
   - If per-scan configuration provided: use it (filtered by availability)
   - If not provided: fall back to global configuration
   - Validate selected scanners are actually available

2. **Validation**
   - Ensure at least one scanner is selected
   - Validate scanner names against available scanners
   - Reject selection of disabled scanners

### Phase 7: Database & Persistence

1. **Store scanner configuration**
   - Add scanner configuration to scan metadata
   - Enable historical tracking of which scanners were used

2. **Display in UI**
   - Show which scanners were used in scan details
   - Add badges/indicators for scanner coverage

### Phase 8: Testing & Documentation

1. **Test scenarios**
   - Bulk scan with all available scanners
   - Bulk scan with limited scanners for speed
   - Attempt to select disabled scanner (should be prevented)
   - UI correctly shows disabled scanners with tooltips
   - Fallback to global configuration
   - Mixed scanner configurations in bulk scans

2. **Update documentation**
   - API documentation for scanner options
   - User guide for scanner selection
   - Performance implications of scanner choices

## Implementation Order

1. **Backend First Approach**
   - Start with type definitions
   - Create scanner availability endpoint
   - Update services to support but not require scanner config
   - Ensure backward compatibility

2. **Frontend Enhancement**
   - Fetch scanner availability in bulk scan modal
   - Update UI to show disabled scanners with tooltips
   - Ensure only available scanners can be selected

3. **Focus on Bulk Scans**
   - Implement fully for bulk scans (already has UI)
   - Single scans continue using all enabled scanners
   - Can extend to single scans later if needed

4. **Testing at Each Step**
   - Unit tests for scanner filtering logic
   - Integration tests for end-to-end flow
   - Performance tests with different scanner combinations

## Key Considerations

1. **Backward Compatibility**
   - Ensure existing scans without scanner config still work
   - Don't break existing API contracts

2. **Performance**
   - Selecting fewer scanners should improve scan speed
   - Monitor impact on scan queue and concurrency

3. **Security**
   - Consider enforcing minimum scanner requirements
   - Log scanner selections for audit purposes

4. **User Experience**
   - Clear indication of which scanners will run
   - Estimated time savings from scanner selection
   - Warnings if critical scanners are disabled

## Success Criteria

- [ ] Users can select scanners in bulk scan modal and selections are honored
- [ ] Bulk scans only run selected scanners
- [ ] Single scans continue to work with all enabled scanners
- [ ] UI shows all scanners but disables unavailable ones with tooltips
- [ ] Users cannot select disabled scanners
- [ ] Performance improvement when fewer scanners selected in bulk scans
- [ ] Clear UI feedback on scanner availability and selection
- [ ] Backward compatibility maintained
- [ ] Tests pass for all scenarios

## Files to Modify

### Core Files
- `src/types/index.ts` - Add scanner configuration to ScanRequest
- `src/lib/scanner/ScannerService.ts` - Accept and pass scanner config
- `src/lib/scanner/ScanExecutor.ts` - Use scanner config for filtering
- `src/lib/bulk/BulkScanService.ts` - Pass scanner config to scans
- `src/lib/config.ts` - Add method to get scanner availability

### API Routes
- `src/app/api/scanners/available/route.ts` - NEW: Expose scanner availability
- `src/app/api/scans/bulk/route.ts` - Validate scanner availability

### Frontend Components  
- `src/components/bulk-scan-modal.tsx` - Fetch availability, disable unavailable scanners

### Supporting Files
- `src/lib/scanner/types.ts` - Update interfaces if needed
- Database migrations if storing scanner config

## Estimated Effort
- Type definitions: 30 minutes
- Scanner availability endpoint: 1 hour
- Backend services: 2-3 hours
- API validation: 30 minutes
- Frontend UI updates (disabled states, tooltips): 1-2 hours
- Testing: 2 hours
- Documentation: 1 hour

**Total: ~8-10 hours** (includes scanner availability feature)

## Risks & Mitigations

1. **Risk**: Breaking existing functionality
   - **Mitigation**: Extensive testing, feature flags if needed

2. **Risk**: Performance regression
   - **Mitigation**: Benchmark before/after, monitor in production

3. **Risk**: User confusion about scanner selection
   - **Mitigation**: Clear UI, helpful defaults, documentation

## Next Steps
1. Review and approve plan
2. Create unit tests for expected behavior
3. Implement type definitions
4. Proceed with backend implementation
5. Update frontend components
6. Integration testing
7. Documentation
8. Code review and merge