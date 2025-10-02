import { CellRenderer } from "../types"
import { textCell } from "./text-cell"
import { badgeCell } from "./badge-cell"
import { statusCell } from "./status-cell"
import { timestampCell } from "./timestamp-cell"
import { toggleGroupCell } from "./toggle-group-cell"
import { cveLinkCell } from "./cve-link-cell"
import { actionsCell } from "./actions-cell"
import { multiTextCell } from "./multi-text-cell"
import { registryCell } from "./registry-cell"
import { durationCell } from "./duration-cell"
import { interactiveBadgeCell } from "./interactive-badge-cell"
import { scanDateCell } from "./scan-date-cell"
import { packageInfoCell } from "./package-info-cell"
import { customCell } from "./custom-cell"

export function getCellRenderers<T = any>(): Record<string, CellRenderer<T>> {
  return {
    text: textCell,
    badge: badgeCell,
    status: statusCell,
    timestamp: timestampCell,
    'toggle-group': toggleGroupCell,
    'cve-link': cveLinkCell,
    actions: actionsCell,
    'multi-text': multiTextCell,
    registry: registryCell,
    duration: durationCell,
    'interactive-badge': interactiveBadgeCell,
    'scan-date': scanDateCell,
    'package-info': packageInfoCell,
    custom: customCell,
  }
}

export {
  textCell,
  badgeCell,
  statusCell,
  timestampCell,
  toggleGroupCell,
  cveLinkCell,
  actionsCell,
  multiTextCell,
  registryCell,
  durationCell,
  interactiveBadgeCell,
  scanDateCell,
  packageInfoCell,
  customCell,
}