"use client"

import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface Step {
  number: number
  label: string
  status: "completed" | "current" | "upcoming"
}

interface ProgressStepperProps {
  steps: Step[]
}

export function ProgressStepper({ steps }: ProgressStepperProps) {
  return (
    <div className="w-full bg-background border-b border-border">
      <div className="container mx-auto px-6 py-6">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.number} className="flex items-center flex-1">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors",
                    step.status === "completed" && "border-green-500 bg-green-500 text-white",
                    step.status === "current" && "border-orange-500 bg-orange-500 text-white",
                    step.status === "upcoming" && "border-gray-300 bg-background text-gray-400",
                  )}
                >
                  {step.status === "completed" ? <Check className="h-5 w-5" /> : step.number}
                </div>
                <span
                  className={cn(
                    "text-sm font-medium whitespace-nowrap",
                    step.status === "current" && "text-foreground",
                    step.status === "completed" && "text-green-600",
                    step.status === "upcoming" && "text-muted-foreground",
                  )}
                >
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div className="flex-1 mx-4 h-0.5 bg-gray-200">
                  <div
                    className={cn("h-full transition-all", step.status === "completed" ? "bg-green-500 w-full" : "w-0")}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
