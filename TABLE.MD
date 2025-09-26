/page.tsx, /image/page.tsx

- Title Cell:  Text, Bold (Default)
- Status Cell: Status Button (Custom)
- Risk Score: Badge (Default)
- Findings: Badge (Custom) -> Toggle Group (Custom)
- Dockle: Badge (Default)
- Registry: Badge (Default)
- Last Scan:  TimeStamp (Custom)
- Digest: 
- Platform: 
- Size:
- Highest CVSS [Remove]
- Misconfigs [Remove]
- Secrets [Remove]

/library/page.tsx

- CVE ID: Text + Icon (Custom)
- Severity: Badge (Default)
- Actions: Button (Custom)
- CVSS Score: Badge (Default)
- Package: Text (Default)
- Affected Images: Badge (Default)[On Click Events]
- False Positives: Badge (Default)[On Click Events]
- Description: Text (Default)

/image/[image]/page.tsx

- Scan Date: Multi Text (Custom)
- Version: Badge (Default)
- Registry: Badge + Icon (Custom)
- Risk Score: Badge (Default)
- Findings: Toggle Group (Custom)
- Changes [Remove]
- Compliance: Badge (Default)
- Duration: Text + Icon (Custom)
- Actions: Button (Custom)

/image/[name]/[scanId]/page.tsx

- Vulnerabilities
-- CVE ID: Text (Default)
-- Package: Multi-Text (Custom)
-- Severity: Badge (Default)
-- Source: Badge (Default)
-- CVSS: Text (Default)
-- Fixed Version: Text (Default)
-- Actions: Button(s) (Custom)
- Packages
-- Package Name: Text (Default)
-- Version: Text (Default)
-- Type: Text (Default)
-- Ecosystem: Text (Default)
-- Source: Badge (Default)
-- License: Text (Default)
- Compliance
-- Rule: Text (Default)
-- Category: Text (Default)
-- Severity: Badge (Default)
-- Message: Text (Default)
-- Source: Badge (Default)
- Efficiency
-- Type: Text (Default)
-- Layer: Text (Default)
-- Description: Text (Default)
-- Size Impact: Text (Default)
-- Efficiency Score: Text (Default)


Needs:
[] - Dynamic Row Context Menu Handlers: Enable a prop that calls back on right click so that context menus can be held in parent components
[] - Dynamic Row Actions Column: If Actions prop is defined, show the relevant actions buttons in the row
[] - Custom Components created and imported: Custom Components should be created under components/table/*
[] - Designated Columns revmoed