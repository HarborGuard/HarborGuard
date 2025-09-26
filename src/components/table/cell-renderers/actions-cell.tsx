import { Button } from "@/components/ui/button"
import { CellRendererProps } from "../types"

interface ActionButton {
  label: string
  icon?: React.ReactNode
  onClick: (row: any) => void
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost'
  isVisible?: (row: any) => boolean
}

export function actionsCell<T>({ value, row, column }: CellRendererProps<T>) {
  const actions: ActionButton[] = column.cellProps?.actions || []

  const visibleActions = actions.filter(
    action => !action.isVisible || action.isVisible(row.original)
  )

  return (
    <div className="flex gap-1">
      {visibleActions.map((action, index) => (
        <Button
          key={index}
          variant={action.variant || "ghost"}
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            action.onClick(row.original)
          }}
        >
          {action.icon}
          <span>{action.label}</span>
        </Button>
      ))}
    </div>
  )
}