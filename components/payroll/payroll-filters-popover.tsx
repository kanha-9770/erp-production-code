"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Filter } from "lucide-react"

interface PayrollFiltersPopoverProps {
  filters: {
    month: number
    year: number
  }
  onFilterChange: (filters: { month: number; year: number }) => void
}

export function PayrollFiltersPopover({ filters, onFilterChange }: PayrollFiltersPopoverProps) {
  const [open, setOpen] = useState(false)
  const [localFilters, setLocalFilters] = useState(filters)

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

  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i)

  const handleApply = () => {
    onFilterChange(localFilters)
    setOpen(false)
  }

  const handleReset = () => {
    const defaultFilters = {
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
    }
    setLocalFilters(defaultFilters)
    onFilterChange(defaultFilters)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 text-[#5f6368] hover:bg-[#f1f3f4]">
          <Filter className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Filter Payroll Data</h4>
            <p className="text-xs text-muted-foreground">Select month and year to view payroll records</p>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="month" className="text-xs font-medium">
                Month
              </Label>
              <Select
                value={localFilters.month.toString()}
                onValueChange={(value) => setLocalFilters({ ...localFilters, month: Number.parseInt(value) })}
              >
                <SelectTrigger id="month" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((month) => (
                    <SelectItem key={month.value} value={month.value.toString()}>
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="year" className="text-xs font-medium">
                Year
              </Label>
              <Select
                value={localFilters.year.toString()}
                onValueChange={(value) => setLocalFilters({ ...localFilters, year: Number.parseInt(value) })}
              >
                <SelectTrigger id="year" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={handleReset} className="flex-1 bg-transparent">
              Reset
            </Button>
            <Button size="sm" onClick={handleApply} className="flex-1">
              Apply Filters
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
