# Unified Table Component Research & Strategy

## Executive Summary
This document outlines the strategy for consolidating all table components in HarborGuard into a single, flexible, type-safe unified table component that supports custom cell renderers, dynamic actions, and context menus.

## Current State Analysis

### Existing Table Components
1. **`/src/components/data-table.tsx`** - Main data table with complex features:
   - Column visibility toggle
   - Sorting, filtering, pagination
   - Row selection
   - Context menus with dynamic actions
   - Server-side pagination support

2. **`/src/components/historical-scans-table.tsx`** - Simpler table for scan history:
   - Basic table structure
   - Context menus
   - Delete confirmations
   - Export functionality

3. **`/src/components/audit-log-table.tsx`** - Audit logging table
   - Basic table functionality
   - Time-based sorting

### Custom Cell Components Identified (12 Total)
Based on TABLE.MD analysis:

1. **Status Cell** - Progress bars for active scans, badges for status (`ImageStatusCell`)
2. **Toggle Group** - Multi-badge display with toggle functionality (Findings)
3. **TimeStamp Cell** - Formatted date/time with relative time
4. **Text + Icon Cell** - CVE ID with external link icon
5. **Action Buttons** - Dynamic buttons for row actions
6. **Multi-Text Cell** - Package info with version on separate lines
7. **Badge + Icon Cell** - Registry badge with source icon
8. **Text + Icon Duration** - Duration with clock icon
9. **Badge with Click Events** - Interactive badges (Affected Images, False Positives)
10. **Multi-Line Scan Date** - Date with additional metadata
11. **Package Multi-Text** - Package name with version details
12. **Dynamic Buttons** - Multiple action buttons per row

### Default Components Used
- Text (Default)
- Badge (Default)
- Checkbox (Selection)
- Standard table cells

## Unified Table Architecture

### Core Component Structure
```typescript
interface UnifiedTableProps<T> {
  // Data
  data: T[]
  columns: ColumnDefinition<T>[]

  // Features
  features?: {
    sorting?: boolean
    filtering?: boolean
    pagination?: boolean | 'server'
    selection?: boolean
    columnVisibility?: boolean
    export?: boolean
  }

  // Customization
  cellRenderers?: CellRendererMap
  rowActions?: RowActionDefinition<T>[]
  contextMenuHandler?: (row: T) => ContextMenuItem[]

  // Server-side support
  serverPagination?: {
    currentPage: number
    totalPages: number
    onPageChange: (page: number) => void
  }

  // Events
  onRowClick?: (row: T) => void
  onSelectionChange?: (selectedRows: T[]) => void
}
```

### Cell Type System
```typescript
type CellType =
  | 'text'
  | 'badge'
  | 'status'
  | 'timestamp'
  | 'toggle-group'
  | 'cve-link'
  | 'actions'
  | 'multi-text'
  | 'registry'
  | 'duration'
  | 'interactive-badge'
  | 'scan-date'
  | 'package-info'
  | 'custom'

interface ColumnDefinition<T> {
  key: keyof T | string
  header: string
  type: CellType
  cellProps?: any // Type-specific props
  sortable?: boolean
  visible?: boolean
  width?: string
}
```

## Implementation Strategy

### Phase 1: Foundation (Week 1)
**Files to Create:**
- `/src/components/table/unified-table.tsx` - Main component
- `/src/components/table/types.ts` - Type definitions
- `/src/components/table/cell-renderers/index.ts` - Cell renderer registry
- `/src/components/table/utils.ts` - Helper functions

**Tasks:**
1. Create base UnifiedTable component with core tanstack/react-table integration
2. Implement type system for columns and cells
3. Create cell renderer registry pattern
4. Set up basic sorting, filtering, pagination

### Phase 2: Custom Cell Components (Week 2)
**Files to Create:**
- `/src/components/table/cell-renderers/status-cell.tsx`
- `/src/components/table/cell-renderers/toggle-group-cell.tsx`
- `/src/components/table/cell-renderers/timestamp-cell.tsx`
- `/src/components/table/cell-renderers/cve-link-cell.tsx`
- `/src/components/table/cell-renderers/action-buttons-cell.tsx`
- `/src/components/table/cell-renderers/multi-text-cell.tsx`
- `/src/components/table/cell-renderers/registry-cell.tsx`
- `/src/components/table/cell-renderers/duration-cell.tsx`
- `/src/components/table/cell-renderers/interactive-badge-cell.tsx`

**Tasks:**
1. Extract and refactor existing custom cells
2. Standardize cell props interface
3. Implement cell renderer factory pattern
4. Add storybook stories for each cell type

### Phase 3: Advanced Features (Week 3)
**Files to Modify:**
- `/src/components/table/unified-table.tsx` - Add advanced features
- `/src/components/table/context-menu.tsx` - Dynamic context menus
- `/src/components/table/row-actions.tsx` - Row action handling

**Tasks:**
1. Add dynamic context menu support
2. Create row actions column generator
3. Add column visibility controls
4. Implement export functionality

### Phase 4: Migration (Week 4)
**Files to Modify:**
- `/src/app/page.tsx`
- `/src/app/image/page.tsx`
- `/src/app/library/page.tsx`
- `/src/app/image/[image]/page.tsx`
- `/src/app/image/[name]/[scanId]/page.tsx`

**Tasks:**
1. Replace DataTable with UnifiedTable
2. Replace HistoricalScansTable with UnifiedTable
3. Replace AuditLogTable with UnifiedTable
4. Update all page-level table implementations
5. Remove deprecated table components

## Technical Considerations

### Performance Optimizations
1. **Virtualization**: Implement react-window for large datasets
2. **Memoization**: Use React.memo for cell renderers
3. **Lazy Loading**: Load cell renderers on-demand
4. **Debouncing**: Debounce filter and search inputs

### Type Safety
1. Use generics for data types
2. Strict typing for cell props
3. Type-safe column definitions
4. Runtime validation with Zod schemas

### Accessibility
1. ARIA labels for all interactive elements
2. Keyboard navigation support
3. Screen reader compatibility
4. Focus management

### Testing Strategy
1. Unit tests for each cell renderer
2. Integration tests for table features
3. E2E tests for critical workflows
4. Performance benchmarks

## Migration Plan

### Week 1: Foundation
- Set up project structure
- Create base component
- Implement core features
- Write initial tests

### Week 2: Cell Components
- Build all 12 custom cell types
- Create storybook documentation
- Test cell renderers

### Week 3: Advanced Features
- Implement context menus
- Add export functionality
- Performance optimization

### Week 4: Migration & Testing
- Migrate existing tables
- Update all pages
- Full regression testing
- Performance validation

## Risk Mitigation

### Identified Risks
1. **Breaking Changes**: Existing functionality might break
   - **Mitigation**: Feature flag for gradual rollout

2. **Performance Regression**: New component might be slower
   - **Mitigation**: Benchmark before/after, implement virtualization

3. **Type Complexity**: Generic types might become unwieldy
   - **Mitigation**: Incremental type improvements, good documentation

4. **Migration Scope**: Too many places to update
   - **Mitigation**: Phased migration, maintain backward compatibility

## Success Metrics
1. **Code Reduction**: 40-50% reduction in table-related code
2. **Performance**: No regression in render time
3. **Type Coverage**: 100% type safety
4. **Test Coverage**: >90% for core functionality
5. **Developer Experience**: Reduced time to add new tables

## Feasibility Assessment

### High Confidence (✅)
- Core table functionality consolidation
- Custom cell renderer system
- Type-safe column definitions
- Basic features (sorting, filtering, pagination)

### Medium Confidence (⚠️)
- Complex context menu scenarios
- Server-side pagination edge cases
- Performance with very large datasets

### Low Confidence (⚡)
- 100% feature parity on first attempt
- Zero migration issues
- All edge cases covered

## Recommendation

**Proceed with phased approach:**

1. **Start with Phase 1** - Build foundation with basic features
2. **Validate with one table** - Migrate simplest table first (audit-log-table)
3. **Iterate on feedback** - Refine based on real usage
4. **Complete migration** - Roll out to all tables

This approach minimizes risk while delivering value incrementally. The unified table will significantly improve maintainability and developer experience while ensuring type safety and performance.

## Next Steps
1. Review and approve this strategy document
2. Create detailed technical specifications
3. Set up project tracking and milestones
4. Begin Phase 1 implementation
5. Schedule weekly progress reviews

## Appendix

### Sample Configuration for Main Images Table
```typescript
const imageTableConfig: UnifiedTableConfig<ImageData> = {
  columns: [
    { key: 'select', type: 'checkbox', header: '' },
    { key: 'image', type: 'text', header: 'Image', sortable: true },
    { key: 'status', type: 'status', header: 'Status', sortable: true },
    { key: 'riskScore', type: 'badge', header: 'Risk Score', sortable: true },
    { key: 'severities', type: 'toggle-group', header: 'Findings' },
    { key: 'compliance.dockle', type: 'badge', header: 'Dockle' },
    { key: 'registry', type: 'registry', header: 'Registry' },
    { key: 'lastScan', type: 'timestamp', header: 'Last Scan', sortable: true },
  ],
  features: {
    sorting: true,
    filtering: true,
    pagination: true,
    selection: true,
    columnVisibility: true,
  },
  rowActions: [
    { label: 'View Details', action: 'navigate' },
    { label: 'Rescan', action: 'rescan' },
    { label: 'Delete', action: 'delete', variant: 'destructive' },
  ],
}
```

### File Structure After Implementation
```
src/components/table/
├── unified-table.tsx          # Main component
├── types.ts                   # Type definitions
├── utils.ts                   # Helper functions
├── context-menu.tsx           # Context menu component
├── row-actions.tsx            # Row actions handler
├── cell-renderers/
│   ├── index.ts              # Registry and exports
│   ├── status-cell.tsx       # Status with progress
│   ├── toggle-group-cell.tsx # Multi-badge toggle
│   ├── timestamp-cell.tsx    # Formatted dates
│   ├── cve-link-cell.tsx     # CVE with links
│   ├── action-buttons-cell.tsx # Action buttons
│   ├── multi-text-cell.tsx  # Multi-line text
│   ├── registry-cell.tsx    # Registry badges
│   ├── duration-cell.tsx    # Duration display
│   ├── interactive-badge-cell.tsx # Clickable badges
│   └── custom-cell.tsx      # Base for extensions
└── __tests__/
    ├── unified-table.test.tsx
    └── cell-renderers.test.tsx
```