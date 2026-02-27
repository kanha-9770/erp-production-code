"use client"

import { Box } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface Module {
  id: string
  name: string
  label: string
  icon?: string | null
  fileCount?: number
  mappingStatus?: "mapped" | "unmapped"
}

interface ModuleGridProps {
  modules: Module[]
  onModuleClick: (moduleId: string) => void
  selectedModuleId?: string
}

export function ModuleGrid({ modules, onModuleClick, selectedModuleId }: ModuleGridProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {modules.map((module) => (
        <Card
          key={module.id}
          className={cn(
            "cursor-pointer transition-all hover:shadow-md hover:border-primary/50",
            selectedModuleId === module.id && "border-primary shadow-md",
          )}
          onClick={() => onModuleClick(module.id)}
        >
          <CardContent className="flex flex-col items-center justify-center p-6 gap-3">
            <div className="w-12 h-12 rounded-lg bg-orange-100 flex items-center justify-center">
              <Box className="w-6 h-6 text-orange-600" />
            </div>
            <div className="text-center">
              <h3 className="font-semibold text-sm text-foreground mb-1">{module.label}</h3>
              {module.fileCount !== undefined && (
                <Badge variant={module.mappingStatus === "mapped" ? "default" : "secondary"} className="text-xs">
                  {module.fileCount === 0 ? "Map files" : `${module.fileCount} file${module.fileCount > 1 ? "s" : ""}`}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
