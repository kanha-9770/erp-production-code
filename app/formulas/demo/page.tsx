"use client"

import { useState } from "react"
import { FormulaBuilder, type FormulaConfig } from "@/components/formula-builder"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function FormulaDemo() {
    const [formId, setFormId] = useState("") // User can input formId to fetch fields
    const [savedFormula, setSavedFormula] = useState<FormulaConfig | null>(null)
    const [showBuilder, setShowBuilder] = useState(false)

    const handleSave = (config: FormulaConfig) => {
        setSavedFormula(config)
        setShowBuilder(false)
    }

    const handleCancel = () => {
        setShowBuilder(false)
    }

    const handleStartFormula = () => {
        if (formId.trim()) {
            setShowBuilder(true)
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                <div>
                    <h1 className="text-3xl font-bold">Formula Field Builder</h1>
                    <p className="text-muted-foreground">Create dynamic formulas for your CRM forms</p>
                </div>

                {!showBuilder ? (
                    <div className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Select Form</CardTitle>
                                <CardDescription>Enter a form ID to load its fields</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="formId">Form ID</Label>
                                    <Input
                                        id="formId"
                                        placeholder="Enter your form ID (e.g., clm1abc123xyz)"
                                        value={formId}
                                        onChange={(e) => setFormId(e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        All fields from this form and its sections will be available in the formula builder
                                    </p>
                                </div>
                                <button
                                    onClick={handleStartFormula}
                                    disabled={!formId.trim()}
                                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                                >
                                    Create Formula
                                </button>
                            </CardContent>
                        </Card>

                        {/* Show saved formula */}
                        {savedFormula && (
                            <Card>
                                <CardHeader>
                                    <CardTitle>Saved Formula Configuration</CardTitle>
                                    <CardDescription>Your formula has been configured successfully</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-sm font-medium text-muted-foreground">Field Label</p>
                                            <p className="text-lg font-semibold">{savedFormula.fieldLabel}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-muted-foreground">Return Type</p>
                                            <Badge>{savedFormula.returnType}</Badge>
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-muted-foreground">Decimal Places</p>
                                            <p className="text-lg font-semibold">{savedFormula.decimalPlaces}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-muted-foreground">Blank Preference</p>
                                            <p className="text-lg font-semibold">{savedFormula.blankPreference}</p>
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-muted-foreground">Formula Expression</p>
                                        <div className="bg-muted rounded p-3 font-mono text-sm mt-2 break-all">
                                            {savedFormula.expression}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                ) : (
                    <FormulaBuilder
                        formId={formId}
                        fieldLabel="calculated_field"
                        onSave={handleSave}
                        onCancel={handleCancel}
                        initialConfig={
                            savedFormula
                                ? {
                                    ...savedFormula,
                                    fieldLabel: "calculated_field",
                                }
                                : undefined
                        }
                    />
                )}
            </div>
        </div>
    )
}