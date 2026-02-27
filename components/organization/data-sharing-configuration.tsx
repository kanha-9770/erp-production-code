"use client"

import { useState, useMemo } from "react"
import { useRoles } from "@/context/role-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import {
  Database,
  Plus,
  Search,
  Share2,
  Eye,
  Edit,
  Trash2,
  Building2,
  ArrowRight,
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Network,
} from "lucide-react"
import type { OrganizationUnit } from "@/types/role"
import type { DataSharingRule } from "@/types/permissions"

// Mock data sharing rules
const mockDataSharingRules: DataSharingRule[] = [
  {
    id: "rule-1",
    name: "Finance to Executive Reporting",
    description: "Share financial reports and analytics with executive team",
    sourceUnitId: "oil-chemicals",
    targetUnitId: "group-leadership",
    dataTypes: ["financial-reports", "budget-data", "revenue-analytics"],
    accessLevel: "read",
    conditions: ["executive-level-only", "quarterly-reports"],
    isActive: true,
    createdAt: new Date("2024-01-15"),
    updatedAt: new Date("2024-01-20"),
  },
  {
    id: "rule-2",
    name: "Cross-Sector Operational Data",
    description: "Enable operational data sharing between sectors",
    sourceUnitId: "jio-platforms",
    targetUnitId: "retail",
    dataTypes: ["customer-data", "operational-metrics"],
    accessLevel: "read",
    conditions: ["same-customer-base", "privacy-compliant"],
    isActive: true,
    createdAt: new Date("2024-01-10"),
    updatedAt: new Date("2024-01-25"),
  },
  {
    id: "rule-3",
    name: "Technology Innovation Sharing",
    description: "Share R&D and innovation data across technology units",
    sourceUnitId: "research-innovation",
    targetUnitId: "new-energy",
    dataTypes: ["research-data", "innovation-metrics", "patent-info"],
    accessLevel: "full",
    conditions: ["innovation-team-only", "confidentiality-agreement"],
    isActive: true,
    createdAt: new Date("2024-01-05"),
    updatedAt: new Date("2024-01-30"),
  },
  {
    id: "rule-4",
    name: "Supply Chain Visibility",
    description: "Share supply chain data for better coordination",
    sourceUnitId: "logistics-supply",
    targetUnitId: "oil-chemicals",
    dataTypes: ["inventory-data", "supplier-info", "logistics-metrics"],
    accessLevel: "write",
    conditions: ["supply-chain-team", "real-time-updates"],
    isActive: false,
    createdAt: new Date("2024-01-12"),
    updatedAt: new Date("2024-01-28"),
  },
  {
    id: "rule-5",
    name: "Media Content Distribution",
    description: "Share content and media assets across entertainment units",
    sourceUnitId: "media-entertainment",
    targetUnitId: "jio-platforms",
    dataTypes: ["content-library", "user-engagement", "distribution-metrics"],
    accessLevel: "read",
    conditions: ["content-team-only", "licensing-compliant"],
    isActive: true,
    createdAt: new Date("2024-01-08"),
    updatedAt: new Date("2024-01-22"),
  },
]

const dataTypes = [
  "financial-reports",
  "budget-data",
  "revenue-analytics",
  "customer-data",
  "operational-metrics",
  "research-data",
  "innovation-metrics",
  "patent-info",
  "inventory-data",
  "supplier-info",
  "logistics-metrics",
  "content-library",
  "user-engagement",
  "distribution-metrics",
  "hr-data",
  "performance-metrics",
]

const commonConditions = [
  "executive-level-only",
  "quarterly-reports",
  "same-customer-base",
  "privacy-compliant",
  "innovation-team-only",
  "confidentiality-agreement",
  "supply-chain-team",
  "real-time-updates",
  "content-team-only",
  "licensing-compliant",
]

export function DataSharingConfiguration() {
  const { state } = useRoles()
  const [selectedTab, setSelectedTab] = useState("rules")
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedAccessLevel, setSelectedAccessLevel] = useState<string>("all")
  const [selectedStatus, setSelectedStatus] = useState<string>("all")
  const [isRuleDialogOpen, setIsRuleDialogOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<DataSharingRule | null>(null)
  const [dataSharingRules, setDataSharingRules] = useState<DataSharingRule[]>(mockDataSharingRules)

  const [ruleForm, setRuleForm] = useState({
    name: "",
    description: "",
    sourceUnitId: "",
    targetUnitId: "",
    dataTypes: [] as string[],
    accessLevel: "read" as "read" | "write" | "full",
    conditions: [] as string[],
    isActive: true,
  })

  // Get all organizational units
  const getAllUnits = (units: OrganizationUnit[]): OrganizationUnit[] => {
    const result: OrganizationUnit[] = []
    units.forEach((unit) => {
      result.push(unit)
      result.push(...getAllUnits(unit.children))
    })
    return result
  }

  const allUnits = getAllUnits(state.organizationUnits)

  // Filter rules
  const filteredRules = useMemo(() => {
    return dataSharingRules.filter((rule) => {
      const matchesSearch =
        rule.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        rule.description.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesAccessLevel = selectedAccessLevel === "all" || rule.accessLevel === selectedAccessLevel
      const matchesStatus =
        selectedStatus === "all" ||
        (selectedStatus === "active" && rule.isActive) ||
        (selectedStatus === "inactive" && !rule.isActive)

      return matchesSearch && matchesAccessLevel && matchesStatus
    })
  }, [searchTerm, selectedAccessLevel, selectedStatus, dataSharingRules])

  // Get unit name by ID
  const getUnitName = (unitId: string) => {
    const unit = allUnits.find((u) => u.id === unitId)
    return unit?.name || "Unknown Unit"
  }

  // Handle form submission
  const handleSubmitRule = () => {
    if (!ruleForm.name || !ruleForm.sourceUnitId || !ruleForm.targetUnitId) return

    const newRule: DataSharingRule = {
      id: editingRule?.id || `rule-${Date.now()}`,
      ...ruleForm,
      createdAt: editingRule?.createdAt || new Date(),
      updatedAt: new Date(),
    }

    if (editingRule) {
      setDataSharingRules((prev) => prev.map((rule) => (rule.id === editingRule.id ? newRule : rule)))
    } else {
      setDataSharingRules((prev) => [...prev, newRule])
    }

    resetForm()
  }

  const resetForm = () => {
    setRuleForm({
      name: "",
      description: "",
      sourceUnitId: "",
      targetUnitId: "",
      dataTypes: [],
      accessLevel: "read",
      conditions: [],
      isActive: true,
    })
    setEditingRule(null)
    setIsRuleDialogOpen(false)
  }

  const handleEditRule = (rule: DataSharingRule) => {
    setRuleForm({
      name: rule.name,
      description: rule.description,
      sourceUnitId: rule.sourceUnitId,
      targetUnitId: rule.targetUnitId,
      dataTypes: rule.dataTypes,
      accessLevel: rule.accessLevel,
      conditions: rule.conditions,
      isActive: rule.isActive,
    })
    setEditingRule(rule)
    setIsRuleDialogOpen(true)
  }

  const handleDeleteRule = (ruleId: string) => {
    setDataSharingRules((prev) => prev.filter((rule) => rule.id !== ruleId))
  }

  const toggleRuleStatus = (ruleId: string) => {
    setDataSharingRules((prev) =>
      prev.map((rule) => (rule.id === ruleId ? { ...rule, isActive: !rule.isActive, updatedAt: new Date() } : rule)),
    )
  }

  const getAccessLevelColor = (level: string) => {
    switch (level) {
      case "read":
        return "bg-blue-100 text-blue-800"
      case "write":
        return "bg-green-100 text-green-800"
      case "full":
        return "bg-purple-100 text-purple-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getAccessLevelIcon = (level: string) => {
    switch (level) {
      case "read":
        return <Eye className="h-3 w-3" />
      case "write":
        return <Edit className="h-3 w-3" />
      case "full":
        return <Shield className="h-3 w-3" />
      default:
        return <Database className="h-3 w-3" />
    }
  }

  // Get sharing statistics
  const getStats = () => {
    const activeRules = dataSharingRules.filter((r) => r.isActive).length
    const totalDataTypes = new Set(dataSharingRules.flatMap((r) => r.dataTypes)).size
    const unitsInvolved = new Set([
      ...dataSharingRules.map((r) => r.sourceUnitId),
      ...dataSharingRules.map((r) => r.targetUnitId),
    ]).size

    return { activeRules, totalDataTypes, unitsInvolved }
  }

  const stats = getStats()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Database className="h-6 w-6 text-blue-600" />
            Data Sharing Configuration
          </h2>
          <p className="text-gray-600 mt-1">Configure data sharing policies between organizational units</p>
        </div>
        <Button onClick={() => setIsRuleDialogOpen(true)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4 mr-2" />
          Create Sharing Rule
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Share2 className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Active Rules</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.activeRules}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Database className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Data Types</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.totalDataTypes}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Building2 className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Units Involved</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.unitsInvolved}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <Network className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Rules</p>
                <p className="text-2xl font-semibold text-gray-900">{dataSharingRules.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="rules">Sharing Rules</TabsTrigger>
          <TabsTrigger value="matrix">Data Flow Matrix</TabsTrigger>
          <TabsTrigger value="policies">Policies & Compliance</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      placeholder="Search sharing rules..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <Select value={selectedAccessLevel} onValueChange={setSelectedAccessLevel}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Access Level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Levels</SelectItem>
                    <SelectItem value="read">Read Only</SelectItem>
                    <SelectItem value="write">Read & Write</SelectItem>
                    <SelectItem value="full">Full Access</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="w-[130px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Rules List */}
          <div className="space-y-4">
            {filteredRules.map((rule) => (
              <Card key={rule.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-gray-900">{rule.name}</h3>
                        <Badge className={getAccessLevelColor(rule.accessLevel)}>
                          {getAccessLevelIcon(rule.accessLevel)}
                          <span className="ml-1">{rule.accessLevel}</span>
                        </Badge>
                        <Badge variant={rule.isActive ? "default" : "secondary"}>
                          {rule.isActive ? (
                            <>
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Active
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3 w-3 mr-1" />
                              Inactive
                            </>
                          )}
                        </Badge>
                      </div>
                      <p className="text-gray-600 mb-3">{rule.description}</p>

                      <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          <span>{getUnitName(rule.sourceUnitId)}</span>
                          <ArrowRight className="h-3 w-3" />
                          <span>{getUnitName(rule.targetUnitId)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Database className="h-3 w-3" />
                          <span>{rule.dataTypes.length} data types</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {rule.dataTypes.slice(0, 3).map((dataType) => (
                          <Badge key={dataType} variant="outline" className="text-xs">
                            {dataType}
                          </Badge>
                        ))}
                        {rule.dataTypes.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{rule.dataTypes.length - 3} more
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Switch checked={rule.isActive} onCheckedChange={() => toggleRuleStatus(rule.id)} />
                      <Button variant="outline" size="sm" onClick={() => handleEditRule(rule)}>
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteRule(rule.id)}
                        className="text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {rule.conditions.length > 0 && (
                    <div className="pt-3 border-t">
                      <Label className="text-xs font-medium text-gray-700 mb-1 block">Conditions</Label>
                      <div className="flex flex-wrap gap-1">
                        {rule.conditions.map((condition) => (
                          <Badge key={condition} variant="secondary" className="text-xs">
                            <AlertTriangle className="h-2 w-2 mr-1" />
                            {condition}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="matrix" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Data Flow Matrix</CardTitle>
              <CardDescription>
                Visual representation of data sharing relationships between organizational units
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 font-medium">Source Unit</th>
                      {allUnits.slice(0, 6).map((unit) => (
                        <th key={unit.id} className="text-center p-2 font-medium min-w-[120px]">
                          {unit.name.length > 15 ? unit.name.substring(0, 15) + "..." : unit.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allUnits.slice(0, 6).map((sourceUnit) => (
                      <tr key={sourceUnit.id} className="border-b hover:bg-gray-50">
                        <td className="p-2 font-medium">
                          {sourceUnit.name.length > 20 ? sourceUnit.name.substring(0, 20) + "..." : sourceUnit.name}
                        </td>
                        {allUnits.slice(0, 6).map((targetUnit) => {
                          const rule = dataSharingRules.find(
                            (r) => r.sourceUnitId === sourceUnit.id && r.targetUnitId === targetUnit.id && r.isActive,
                          )

                          return (
                            <td key={targetUnit.id} className="p-2 text-center">
                              {sourceUnit.id === targetUnit.id ? (
                                <div className="w-6 h-6 bg-gray-200 rounded mx-auto"></div>
                              ) : rule ? (
                                <div className="flex items-center justify-center">
                                  <div
                                    className={`w-6 h-6 rounded flex items-center justify-center ${
                                      rule.accessLevel === "read"
                                        ? "bg-blue-100"
                                        : rule.accessLevel === "write"
                                          ? "bg-green-100"
                                          : "bg-purple-100"
                                    }`}
                                  >
                                    {getAccessLevelIcon(rule.accessLevel)}
                                  </div>
                                </div>
                              ) : (
                                <div className="w-6 h-6 border border-gray-200 rounded mx-auto"></div>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex items-center gap-4 text-xs text-gray-600">
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 bg-blue-100 rounded flex items-center justify-center">
                    <Eye className="h-2 w-2" />
                  </div>
                  <span>Read Access</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 bg-green-100 rounded flex items-center justify-center">
                    <Edit className="h-2 w-2" />
                  </div>
                  <span>Write Access</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 bg-purple-100 rounded flex items-center justify-center">
                    <Shield className="h-2 w-2" />
                  </div>
                  <span>Full Access</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="policies" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-blue-600" />
                  Data Governance Policies
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium">GDPR Compliance</span>
                    </div>
                    <Badge className="bg-green-100 text-green-800">Active</Badge>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium">Data Encryption</span>
                    </div>
                    <Badge className="bg-green-100 text-green-800">Active</Badge>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                      <span className="text-sm font-medium">Access Logging</span>
                    </div>
                    <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium">Data Retention</span>
                    </div>
                    <Badge className="bg-green-100 text-green-800">Active</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Network className="h-5 w-5 text-purple-600" />
                  Sharing Statistics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Cross-sector sharing</span>
                    <span className="font-semibold">
                      {dataSharingRules.filter((r) => r.isActive).length} active rules
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Data types shared</span>
                    <span className="font-semibold">{stats.totalDataTypes} types</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Average conditions per rule</span>
                    <span className="font-semibold">
                      {Math.round(
                        (dataSharingRules.reduce((acc, rule) => acc + rule.conditions.length, 0) /
                          dataSharingRules.length) *
                          10,
                      ) / 10}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Compliance score</span>
                    <Badge className="bg-green-100 text-green-800">98%</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Create/Edit Rule Dialog */}
      <Dialog open={isRuleDialogOpen} onOpenChange={setIsRuleDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5 text-blue-600" />
              {editingRule ? "Edit Sharing Rule" : "Create New Sharing Rule"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Rule Name *</Label>
                <Input
                  value={ruleForm.name}
                  onChange={(e) => setRuleForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter rule name"
                />
              </div>

              <div className="space-y-2">
                <Label>Access Level *</Label>
                <Select
                  value={ruleForm.accessLevel}
                  onValueChange={(value: "read" | "write" | "full") =>
                    setRuleForm((prev) => ({ ...prev, accessLevel: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="read">Read Only</SelectItem>
                    <SelectItem value="write">Read & Write</SelectItem>
                    <SelectItem value="full">Full Access</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={ruleForm.description}
                onChange={(e) => setRuleForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Describe the purpose and scope of this sharing rule"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Source Unit *</Label>
                <Select
                  value={ruleForm.sourceUnitId}
                  onValueChange={(value) => setRuleForm((prev) => ({ ...prev, sourceUnitId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select source unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {allUnits.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {"  ".repeat(unit.level)} {unit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Target Unit *</Label>
                <Select
                  value={ruleForm.targetUnitId}
                  onValueChange={(value) => setRuleForm((prev) => ({ ...prev, targetUnitId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select target unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {allUnits
                      .filter((unit) => unit.id !== ruleForm.sourceUnitId)
                      .map((unit) => (
                        <SelectItem key={unit.id} value={unit.id}>
                          {"  ".repeat(unit.level)} {unit.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Data Types</Label>
              <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto border rounded p-3">
                {dataTypes.map((dataType) => (
                  <div key={dataType} className="flex items-center space-x-2">
                    <Checkbox
                      checked={ruleForm.dataTypes.includes(dataType)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setRuleForm((prev) => ({
                            ...prev,
                            dataTypes: [...prev.dataTypes, dataType],
                          }))
                        } else {
                          setRuleForm((prev) => ({
                            ...prev,
                            dataTypes: prev.dataTypes.filter((dt) => dt !== dataType),
                          }))
                        }
                      }}
                    />
                    <Label className="text-sm">{dataType}</Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Conditions</Label>
              <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto border rounded p-3">
                {commonConditions.map((condition) => (
                  <div key={condition} className="flex items-center space-x-2">
                    <Checkbox
                      checked={ruleForm.conditions.includes(condition)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setRuleForm((prev) => ({
                            ...prev,
                            conditions: [...prev.conditions, condition],
                          }))
                        } else {
                          setRuleForm((prev) => ({
                            ...prev,
                            conditions: prev.conditions.filter((c) => c !== condition),
                          }))
                        }
                      }}
                    />
                    <Label className="text-sm">{condition}</Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                checked={ruleForm.isActive}
                onCheckedChange={(checked) => setRuleForm((prev) => ({ ...prev, isActive: checked }))}
              />
              <Label>Activate rule immediately</Label>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={resetForm}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmitRule}
                disabled={!ruleForm.name || !ruleForm.sourceUnitId || !ruleForm.targetUnitId}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {editingRule ? "Update Rule" : "Create Rule"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
