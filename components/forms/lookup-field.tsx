"use client"

import { useState, useEffect } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Search } from "lucide-react"
import { useLazyLookupFormDataQuery } from "@/lib/api/forms"

interface LookupFieldProps {
  label: string
  sourceFormId: string
  sourceTable: string
  displayField: string
  valueField: string
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  searchable?: boolean
  filters?: Record<string, any>
}

export function LookupField({
  label,
  sourceFormId,
  sourceTable,
  displayField,
  valueField,
  value,
  onChange,
  placeholder = "Select an option",
  searchable = true,
  filters = {},
}: LookupFieldProps) {
  const [options, setOptions] = useState<Array<{ value: string; label: string }>>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [triggerLookupFormData] = useLazyLookupFormDataQuery()

  useEffect(() => {
    fetchLookupData()
  }, [sourceFormId, sourceTable, filters])

  const fetchLookupData = async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {
        sourceFormId,
        sourceTable,
        displayField,
        valueField,
        filters: JSON.stringify(filters),
      }

      const data = await triggerLookupFormData(params).unwrap()

      if (data.success) {
        setOptions(
          data.data.map((item: any) => ({
            value: item[valueField],
            label: item[displayField],
          })),
        )
      }
    } catch (error) {
      console.error("Failed to fetch lookup data:", error)
    } finally {
      setLoading(false)
    }
  }

  const filteredOptions = searchQuery
    ? options.filter((option) => option.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : options

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {searchable && options.length > 10 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      )}
      <Select value={value} onValueChange={onChange} disabled={loading}>
        <SelectTrigger>
          <SelectValue placeholder={loading ? "Loading..." : placeholder} />
        </SelectTrigger>
        <SelectContent>
          {filteredOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
