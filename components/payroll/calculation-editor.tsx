"use client"

import { AlertDescription } from "@/components/ui/alert"

import { Alert } from "@/components/ui/alert"

import { Badge } from "@/components/ui/badge"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Code, Save, Play, RotateCcw, CheckCircle2, XCircle } from "lucide-react"
import { toast } from "sonner"

interface CalculationFormula {
  id: string
  name: string
  formula: string
}

const formulas: CalculationFormula[] = [
  {
    id: "base",
    name: "Base Salary",
    formula: "const result = baseSalary / workingDays * presentDays;\nreturn result;",
  },
  {
    id: "overtime",
    name: "Overtime",
    formula: "const hourlyRate = baseSalary / (workingDays * 8);\nreturn totalOvertimeHours * hourlyRate * 1.5;",
  },
  {
    id: "deductions",
    name: "Deductions",
    formula: "const perDay = baseSalary / workingDays;\nreturn leaveDays * perDay;",
  },
]

interface CalculationEditorProps {
  onSave?: (formulas: any[]) => void
}

export function CalculationEditor({ onSave }: CalculationEditorProps) {
  const [selected, setSelected] = useState(formulas[0].id)
  const [code, setCode] = useState(formulas[0].formula)
  const [testResult, setTestResult] = useState<{ success: boolean; result?: any; error?: string } | null>(null)
  const [hasChanges, setHasChanges] = useState(false)

  const currentFormula = formulas.find((f) => f.id === selected)

  useEffect(() => {
    const formula = formulas.find((f) => f.id === selected)
    if (formula) {
      setCode(formula.formula)
      setTestResult(null)
    }
  }, [selected])

  const handleFormulaChange = (value: string) => {
    setCode(value)
    setHasChanges(true)
    setTestResult(null)
  }

  const handleTest = () => {
    try {
      const testData = { baseSalary: 5000, workingDays: 26, presentDays: 24, totalOvertimeHours: 10, leaveDays: 2 }
      const func = new Function(...Object.keys(testData), code)
      const result = func(...Object.values(testData))
      setTestResult({ success: true, result })
      toast.success(`Test Result: ${result.toFixed(2)}`)
    } catch (error: any) {
      setTestResult({ success: false, error: error.message })
      toast.error(`Error: ${error.message}`)
    }
  }

  const handleSave = () => {
    onSave?.(formulas)
    setHasChanges(false)
    toast.success("Formula saved!")
  }

  const handleReset = () => {
    const original = formulas.find((f) => f.id === selected)
    if (original) {
      setCode(original.formula)
      setHasChanges(false)
      setTestResult(null)
      toast.info("Formula reset to default")
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              Custom Payroll Calculation Editor
            </CardTitle>
          </div>
          <Badge variant={hasChanges ? "default" : "secondary"}>{hasChanges ? "Unsaved Changes" : "Saved"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Formula Type</Label>
          <Select
            value={selected}
            onValueChange={(val) => {
              setSelected(val)
              const formula = formulas.find((f) => f.id === val)
              if (formula) setCode(formula.formula)
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {formulas.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Formula Code</Label>
          <Textarea
            value={code}
            onChange={(e) => handleFormulaChange(e.target.value)}
            className="font-mono text-sm min-h-[200px]"
          />
        </div>

        {testResult && (
          <Alert variant={testResult.success ? "default" : "destructive"}>
            {testResult.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            <AlertDescription>
              {testResult.success ? (
                <div className="space-y-1">
                  <p className="font-semibold">Test Successful!</p>
                  <p className="text-sm">
                    Result: <span className="font-mono">{testResult.result.toFixed(2)}</span>
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="font-semibold">Test Failed</p>
                  <p className="text-sm font-mono">{testResult.error}</p>
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2">
          <Button onClick={handleTest} variant="outline" className="flex-1 bg-transparent">
            <Play className="h-4 w-4 mr-2" />
            Test Formula
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges} className="flex-1">
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
          <Button onClick={handleReset} variant="ghost">
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
