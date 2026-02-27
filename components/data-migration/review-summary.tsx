"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle2, AlertCircle, XCircle } from "lucide-react"
import { Progress } from "@/components/ui/progress"

interface FileMappingStatus {
  mappedFiles: number
  unmappedFiles: number
  unsupportedFiles: number
}

interface ModuleSummary {
  moduleName: string
  fileCount: number
  mappedFields: number
  unmappedFields: number
  percentage: number
}

interface ReviewSummaryProps {
  fileMappingStatus: FileMappingStatus
  moduleSummaries: ModuleSummary[]
}

export function ReviewSummary({ fileMappingStatus, moduleSummaries }: ReviewSummaryProps) {
  const totalFiles =
    fileMappingStatus.mappedFiles + fileMappingStatus.unmappedFiles + fileMappingStatus.unsupportedFiles

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>File Mapping Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{fileMappingStatus.mappedFiles}</p>
                <p className="text-sm text-muted-foreground">Mapped Files</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{fileMappingStatus.unmappedFiles}</p>
                <p className="text-sm text-muted-foreground">Unmapped Files</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <XCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{fileMappingStatus.unsupportedFiles}</p>
                <p className="text-sm text-muted-foreground">Unsupported Files</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Module Field Mapping Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {moduleSummaries.map((module, index) => (
            <div key={index} className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold">{module.moduleName}</h4>
                  <p className="text-sm text-muted-foreground">
                    {module.mappedFields} mapped • {module.unmappedFields} unmapped
                  </p>
                </div>
                <div className="text-2xl font-bold">{module.percentage}%</div>
              </div>
              <Progress value={module.percentage} className="h-2" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
