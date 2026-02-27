"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertCircle, Settings } from "lucide-react"

interface PayrollConfigBannerProps {
  onConfigure: () => void
}

export function PayrollConfigBanner({ onConfigure }: PayrollConfigBannerProps) {
  return (
    <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950">
      <CardContent className="flex items-start gap-4 p-6">
        <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <div className="flex-1">
          <h3 className="font-semibold text-amber-900 dark:text-amber-100 mb-1">Payroll Configuration Required</h3>
          <p className="text-sm text-amber-800 dark:text-amber-200 mb-4">
            Before you can process payroll, you need to configure which forms contain employee data and map their fields
            to payroll requirements.
          </p>
          <Button onClick={onConfigure} size="sm">
            <Settings className="h-4 w-4 mr-2" />
            Configure Payroll
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
