# Database Table Usage Analysis

## Tables in PostgreSQL Database

1. **Image** - ✅ Used (24 times)
2. **Scan** - ✅ Used (44 times)
3. **ScanMetadata** - ✅ Used (3 times)
4. **ScanResult** - ✅ Used (2 times)
5. **Scanner** - ✅ Used (3 times)
6. **BulkScanBatch** - ✅ Used (17 times)
7. **BulkScanItem** - ✅ Used (7 times)
8. **Vulnerability** - ✅ Used (14 times)
9. **ImageVulnerability** - ✅ Used (9 times)
10. **CveClassification** - ✅ Used (17 times)
11. **PolicyRule** - ⚠️ Referenced but not actively used
12. **PolicyViolation** - ⚠️ Referenced but not actively used
13. **AuditLog** - ✅ Used (9 times)
14. **Repository** - ✅ Used (13 times)

## Usage Details

### Actively Used Tables (12/14)
- **Scan**: Most used table (44 references) - Core scanning functionality
- **Image**: Second most used (24 references) - Container image management
- **CveClassification**: CVE false positive management (17 references)
- **BulkScanBatch**: Bulk scanning operations (17 references)
- **Vulnerability**: CVE/vulnerability tracking (14 references)
- **Repository**: Registry authentication (13 references)
- **ImageVulnerability**: Links vulnerabilities to images (9 references)
- **AuditLog**: Audit trail logging (9 references)
- **BulkScanItem**: Individual items in bulk scans (7 references)
- **Scanner**: Scanner tool configuration (3 references)
- **ScanMetadata**: Newly refactored scan metadata storage (3 references)
- **ScanResult**: Individual scanner results (2 references)

### Potentially Unused Tables (2/14)
- **PolicyRule**: Only referenced in type definitions, no actual CRUD operations
- **PolicyViolation**: Only referenced in type definitions, included in scan relations but no active usage

## Recommendations

1. **PolicyRule & PolicyViolation**: These tables appear to be part of a planned but not yet implemented policy enforcement feature. Consider:
   - Implementing the policy feature if it's on the roadmap
   - Removing these tables if the feature is not planned
   - Adding a comment in schema.prisma to document their intended purpose

2. **All other tables are actively used** and serve important functions in the application.