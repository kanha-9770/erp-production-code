"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Download } from "lucide-react"

export interface PayrollFilterValues {
  month: number
  year: number
}

interface PayrollFiltersProps {
  onFilterChange: (filters: PayrollFilterValues) => void
  onExport: () => void
}

export function PayrollFilters({ onFilterChange, onExport }: PayrollFiltersProps) {
  const currentDate = new Date()
  const [month, setMonth] = useState(currentDate.getMonth() + 1)
  const [year, setYear] = useState(currentDate.getFullYear())

  const months = [
    { value: 1, label: "January" },
    { value: 2, label: "February" },
    { value: 3, label: "March" },
    { value: 4, label: "April" },
    { value: 5, label: "May" },
    { value: 6, label: "June" },
    { value: 7, label: "July" },
    { value: 8, label: "August" },
    { value: 9, label: "September" },
    { value: 10, label: "October" },
    { value: 11, label: "November" },
    { value: 12, label: "December" },
  ]

  const years = Array.from({ length: 5 }, (_, i) => currentDate.getFullYear() - i)

  const handleMonthChange = (value: string) => {
    const newMonth = Number.parseInt(value)
    setMonth(newMonth)
    onFilterChange({ month: newMonth, year })
  }

  const handleYearChange = (value: string) => {
    const newYear = Number.parseInt(value)
    setYear(newYear)
    onFilterChange({ month, year: newYear })
  }

  return (
    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
      <div className="flex gap-3">
        <Select value={month.toString()} onValueChange={handleMonthChange}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Select month" />
          </SelectTrigger>
          <SelectContent>
            {months.map((m) => (
              <SelectItem key={m.value} value={m.value.toString()}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={year.toString()} onValueChange={handleYearChange}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Select year" />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={y.toString()}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button variant="outline" onClick={onExport}>
        <Download className="h-4 w-4 mr-2" />
        Export
      </Button>
    </div>
  )
}
