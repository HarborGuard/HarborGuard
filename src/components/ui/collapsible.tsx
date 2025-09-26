"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface CollapsibleContextValue {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
}

const CollapsibleContext = React.createContext<CollapsibleContextValue | undefined>(undefined)

function useCollapsible() {
  const context = React.useContext(CollapsibleContext)
  if (!context) {
    throw new Error("useCollapsible must be used within a Collapsible")
  }
  return context
}

interface CollapsibleProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

function Collapsible({
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  children,
  ...props
}: CollapsibleProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen)
  const isOpen = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen
  
  const setIsOpen = React.useCallback((open: boolean) => {
    if (controlledOpen === undefined) {
      setUncontrolledOpen(open)
    }
    onOpenChange?.(open)
  }, [controlledOpen, onOpenChange])

  return (
    <CollapsibleContext.Provider value={{ isOpen, setIsOpen }}>
      <div data-slot="collapsible" data-state={isOpen ? "open" : "closed"} {...props}>
        {children}
      </div>
    </CollapsibleContext.Provider>
  )
}

interface CollapsibleTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

function CollapsibleTrigger({ 
  onClick, 
  children, 
  className,
  ...props 
}: CollapsibleTriggerProps) {
  const { isOpen, setIsOpen } = useCollapsible()
  
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    setIsOpen(!isOpen)
    onClick?.(e)
  }

  return (
    <button
      data-slot="collapsible-trigger"
      data-state={isOpen ? "open" : "closed"}
      className={cn(className)}
      onClick={handleClick}
      {...props}
    >
      {children}
    </button>
  )
}

interface CollapsibleContentProps extends React.HTMLAttributes<HTMLDivElement> {}

function CollapsibleContent({ 
  children, 
  className,
  ...props 
}: CollapsibleContentProps) {
  const { isOpen } = useCollapsible()
  const [height, setHeight] = React.useState<number | undefined>(isOpen ? undefined : 0)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!ref.current) return

    if (isOpen) {
      const scrollHeight = ref.current.scrollHeight
      setHeight(scrollHeight)
      // After animation, set height to auto for dynamic content
      const timer = setTimeout(() => setHeight(undefined), 250)
      return () => clearTimeout(timer)
    } else {
      setHeight(ref.current.scrollHeight)
      // Force reflow then set to 0
      requestAnimationFrame(() => setHeight(0))
    }
  }, [isOpen])

  return (
    <div
      ref={ref}
      data-slot="collapsible-content"
      data-state={isOpen ? "open" : "closed"}
      className={cn(
        "overflow-hidden transition-all duration-250 ease-in-out",
        className
      )}
      style={{ height }}
      {...props}
    >
      <div>{children}</div>
    </div>
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }