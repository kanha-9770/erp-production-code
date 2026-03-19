import { cn } from "@/lib/utils"

interface TreeConnectorsProps {
  isRoot: boolean
  isFirst: boolean
  isLast: boolean
}

/**
 * Renders the horizontal/vertical SVG-style connector lines
 * shared by both ChartNode (org units) and RoleChartNode (roles).
 */
export function TreeConnectors({ isRoot, isFirst, isLast }: TreeConnectorsProps) {
  return (
    <div className="flex w-full justify-center h-8 relative">
      {!isRoot && (
        <>
          <div className={cn("absolute top-0 left-0 w-1/2 h-px bg-slate-900", isFirst && "hidden")} />
          <div className={cn("absolute top-0 right-0 w-1/2 h-px bg-slate-900", isLast && "hidden")} />
          <div className="w-px h-full bg-slate-900 z-10" />
        </>
      )}
    </div>
  )
}
