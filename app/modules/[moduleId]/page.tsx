"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Progress } from "@/components/ui/progress"
import { useToast } from "@/hooks/use-toast"
import {
  Plus,
  MoreHorizontal,
  Edit,
  Trash2,
  FileText,
  Loader2,
  ArrowLeft,
  Globe,
  BarChart3,
  Settings,
  Clock,
  TrendingUp,
  Activity,
  Database,
  Share2,
  Copy,
  ExternalLink,
  Filter,
  Search,
  SortAsc,
  SortDesc,
  Grid,
  List,
  FolderPlus,
  Archive,
  Download,
  Upload,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle,
  Zap,
  Target,
  Award,
  Bell,
  Lock,

  ChevronDown,

  Folder,
} from "lucide-react"
import Link from "next/link"
import type { FormModule, Form } from "@/types/form-builder"

interface ModuleStats {
  totalForms: number
  publishedForms: number
  draftForms: number
  totalSubmissions: number
  todaySubmissions: number
  weekSubmissions: number
  monthSubmissions: number
  averageCompletionRate: number
  lastActivity: Date | null
  topPerformingForm: Form | null
}

interface FormAnalytics {
  formId: string
  views: number
  submissions: number
  conversionRate: number
  averageTime: number
  lastSubmission: Date | null
  status: "active" | "inactive" | "archived"
}

export default function ModulePage() {
  const params = useParams()
  const moduleId = params.moduleId as string
  const { toast } = useToast()

  const [module, setModule] = useState<FormModule | null>(null)
  const [moduleStats, setModuleStats] = useState<ModuleStats | null>(null)
  const [formAnalytics, setFormAnalytics] = useState<FormAnalytics[]>([])
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingForm, setEditingForm] = useState<Form | null>(null)
  const [formData, setFormData] = useState({ name: "", description: "" })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState("overview")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [sortBy, setSortBy] = useState<"name" | "created" | "submissions" | "updated">("updated")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")
  const [searchQuery, setSearchQuery] = useState("")
  const [filterStatus, setFilterStatus] = useState<"all" | "published" | "draft">("all")

  useEffect(() => {
    if (moduleId) {
      fetchModule()
      fetchModuleStats()
    }
  }, [moduleId])

  const fetchModule = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/modules/${moduleId}`)
      const data = await response.json()

      if (data.success) {
        setModule(data.data)
      } else {
        throw new Error(data.error || "Failed to fetch module")
      }
    } catch (error: any) {
      console.error("Error fetching module:", error)
      toast({
        title: "Error",
        description: "Failed to load module. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchModuleStats = async () => {
    try {
      setStatsLoading(true)
      // Simulate API call for stats
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Mock data - replace with actual API call
      const mockStats: ModuleStats = {
        totalForms: module?.forms?.length || 0,
        publishedForms: module?.forms?.filter(f => f.isPublished).length || 0,
        draftForms: module?.forms?.filter(f => !f.isPublished).length || 0,
        totalSubmissions: Math.floor(Math.random() * 1000) + 100,
        todaySubmissions: Math.floor(Math.random() * 50) + 5,
        weekSubmissions: Math.floor(Math.random() * 200) + 20,
        monthSubmissions: Math.floor(Math.random() * 500) + 50,
        averageCompletionRate: Math.floor(Math.random() * 40) + 60,
        lastActivity: new Date(),
        topPerformingForm: module?.forms?.[0] || null
      }

      setModuleStats(mockStats)

      // Mock form analytics
      const mockAnalytics: FormAnalytics[] = module?.forms?.map(form => ({
        formId: form.id,
        views: Math.floor(Math.random() * 500) + 50,
        submissions: Math.floor(Math.random() * 100) + 10,
        conversionRate: Math.floor(Math.random() * 40) + 20,
        averageTime: Math.floor(Math.random() * 300) + 60,
        lastSubmission: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
        status: form.isPublished ? "active" : "inactive"
      })) || []

      setFormAnalytics(mockAnalytics)
    } catch (error: any) {
      console.error("Error fetching stats:", error)
    } finally {
      setStatsLoading(false)
    }
  }

  const handleCreateForm = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Form name is required.",
        variant: "destructive",
      })
      return
    }

    try {
      setIsSubmitting(true)
      const response = await fetch(`/api/modules/${moduleId}/forms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (data.success) {
        setModule((prev: FormModule | null) =>
          prev
            ? {
              ...prev,
              forms: [data.data, ...prev.forms],
            }
            : null,
        )
        setIsCreateDialogOpen(false)
        setFormData({ name: "", description: "" })
        toast({
          title: "Success",
          description: "Form created successfully!",
        })
        fetchModuleStats() // Refresh stats
      } else {
        throw new Error(data.error || "Failed to create form")
      }
    } catch (error: any) {
      console.error("Error creating form:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to create form. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEditForm = async () => {
    if (!editingForm || !formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Form name is required.",
        variant: "destructive",
      })
      return
    }

    try {
      setIsSubmitting(true)
      const response = await fetch(`/api/forms/${editingForm.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (data.success) {
        setModule((prev: FormModule | null) =>
          prev
            ? {
              ...prev,
              forms: prev.forms.map((f: Form) => (f.id === editingForm.id ? data.data : f)),
            }
            : null,
        )
        setIsEditDialogOpen(false)
        setEditingForm(null)
        setFormData({ name: "", description: "" })
        toast({
          title: "Success",
          description: "Form updated successfully!",
        })
      } else {
        throw new Error(data.error || "Failed to update form")
      }
    } catch (error: any) {
      console.error("Error updating form:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to update form. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteForm = async (formId: string) => {
    if (!confirm("Are you sure you want to delete this form? This action cannot be undone.")) {
      return
    }

    try {
      const response = await fetch(`/api/forms/${formId}`, {
        method: "DELETE",
      })

      const data = await response.json()

      if (data.success) {
        setModule((prev: FormModule | null) =>
          prev
            ? {
              ...prev,
              forms: prev.forms.filter((f: Form) => f.id !== formId),
            }
            : null,
        )
        toast({
          title: "Success",
          description: "Form deleted successfully!",
        })
        fetchModuleStats() // Refresh stats
      } else {
        throw new Error(data.error || "Failed to delete form")
      }
    } catch (error: any) {
      console.error("Error deleting form:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to delete form. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handlePublishForm = async (form: Form) => {
    try {
      const response = await fetch(`/api/forms/${form.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublished: !form.isPublished }),
      })

      const data = await response.json()

      if (data.success) {
        setModule((prev: FormModule | null) =>
          prev
            ? {
              ...prev,
              forms: prev.forms.map((f: Form) =>
                f.id === form.id ? { ...f, isPublished: !f.isPublished } : f
              ),
            }
            : null,
        )
        toast({
          title: "Success",
          description: `Form ${form.isPublished ? "unpublished" : "published"} successfully!`,
        })
        fetchModuleStats() // Refresh stats
      } else {
        throw new Error(data.error || "Failed to publish form")
      }
    } catch (error: any) {
      console.error("Error publishing form:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to publish form. Please try again.",
        variant: "destructive",
      })
    }
  }

  const openEditDialog = (form: Form) => {
    setEditingForm(form)
    setFormData({ name: form.name, description: form.description || "" })
    setIsEditDialogOpen(true)
  }

  const resetForm = () => {
    setFormData({ name: "", description: "" })
    setEditingForm(null)
  }

  const copyFormLink = (formId: string) => {
    const link = `${window.location.origin}/form/${formId}`
    navigator.clipboard.writeText(link)
    toast({
      title: "Success",
      description: "Form link copied to clipboard!",
    })
  }

  const getFilteredAndSortedForms = () => {
    if (!module?.forms) return []

    let filtered = module.forms.filter(form => {
      const matchesSearch = form.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (form.description || "").toLowerCase().includes(searchQuery.toLowerCase())
      const matchesStatus = filterStatus === "all" ||
        (filterStatus === "published" && form.isPublished) ||
        (filterStatus === "draft" && !form.isPublished)
      return matchesSearch && matchesStatus
    })

    return filtered.sort((a, b) => {
      let aValue: any, bValue: any

      switch (sortBy) {
        case "name":
          aValue = a.name.toLowerCase()
          bValue = b.name.toLowerCase()
          break
        case "created":
          aValue = new Date(a.createdAt).getTime()
          bValue = new Date(b.createdAt).getTime()
          break
        case "updated":
          aValue = new Date(a.updatedAt).getTime()
          bValue = new Date(b.updatedAt).getTime()
          break
        case "submissions":
          aValue = a.recordCount || 0
          bValue = b.recordCount || 0
          break
        default:
          return 0
      }

      if (sortOrder === "asc") {
        return aValue > bValue ? 1 : -1
      } else {
        return aValue < bValue ? 1 : -1
      }
    })
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "inactive":
        return <XCircle className="h-4 w-4 text-red-500" />
      case "archived":
        return <Archive className="h-4 w-4 text-gray-500" />
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />
    }
  }

  const formatTimeAgo = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor(diff / (1000 * 60))

    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (minutes > 0) return `${minutes}m ago`
    return "Just now"
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <div className="text-center space-y-4">
          <div className="relative">
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-blue-600" />
            <div className="absolute inset-0 h-12 w-12 rounded-full border-4 border-blue-200 border-t-transparent animate-pulse"></div>
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-gray-900">Loading Module</h3>
            <p className="text-sm text-gray-500">Please wait while we fetch your module data...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!module) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-red-50 via-white to-orange-50">
        <div className="text-center space-y-6 max-w-md">
          <div className="mx-auto w-24 h-24 bg-red-100 rounded-full flex items-center justify-center">
            <AlertCircle className="h-12 w-12 text-red-600" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-gray-900">Module Not Found</h1>
            <p className="text-gray-600">The module you're looking for doesn't exist or has been removed.</p>
          </div>
          <Link href="/">
            <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  const filteredForms = getFilteredAndSortedForms()

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container mx-auto px-4 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link href="/">
                <Button variant="ghost" size="sm" className="hover:bg-gray-100">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Dashboard
                </Button>
              </Link>
              <Separator orientation="vertical" className="h-6" />
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                    <Folder className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex items-center space-x-2">
                    <h1 className="text-xl font-bold text-gray-900">{module.name}</h1>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      {module.description && <span>{module.description}</span>}
                      {module.level > 0 && (
                        <Badge variant="outline" className="text-xs h-5 w-full px-4">
                          Level {module.level}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm">
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
              <Button variant="outline" size="sm">
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
              <Dialog
                open={isCreateDialogOpen}
                onOpenChange={(open) => {
                  setIsCreateDialogOpen(open)
                  if (!open) resetForm()
                }}
              >
                <DialogTrigger asChild>
                  <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Form
                  </Button>
                </DialogTrigger>
              </Dialog>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:grid-cols-4">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="forms" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Forms ({module.forms.length})
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-blue-700">Total Forms</CardTitle>
                  <FileText className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-900">{moduleStats?.totalForms || 0}</div>
                  <p className="text-xs text-blue-600 mt-1">
                    {moduleStats?.publishedForms || 0} published, {moduleStats?.draftForms || 0} drafts
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-green-700">Total Submissions</CardTitle>
                  <Database className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-900">{moduleStats?.totalSubmissions || 0}</div>
                  <p className="text-xs text-green-600 mt-1">
                    +{moduleStats?.todaySubmissions || 0} today
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-purple-700">Completion Rate</CardTitle>
                  <Target className="h-4 w-4 text-purple-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-purple-900">{moduleStats?.averageCompletionRate || 0}%</div>
                  <Progress value={moduleStats?.averageCompletionRate || 0} className="mt-2 h-2" />
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-orange-700">Last Activity</CardTitle>
                  <Activity className="h-4 w-4 text-orange-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-900">
                    {moduleStats?.lastActivity ? formatTimeAgo(moduleStats.lastActivity) : "Never"}
                  </div>
                  <p className="text-xs text-orange-600 mt-1">Latest submission</p>
                </CardContent>
              </Card>
            </div>

            {/* Quick Actions & Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Zap className="h-4 w-4 text-yellow-500" />
                    Quick Actions
                  </CardTitle>
                  <CardDescription>Common tasks for this module</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button
                    className="w-full justify-start"
                    variant="outline"
                    onClick={() => setIsCreateDialogOpen(true)}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Create New Form
                  </Button>
                  <Button className="w-full justify-start" variant="outline">
                    <FolderPlus className="mr-2 h-4 w-4" />
                    Add Submodule
                  </Button>
                  <Button className="w-full justify-start" variant="outline">
                    <Upload className="mr-2 h-4 w-4" />
                    Import Forms
                  </Button>
                  <Button className="w-full justify-start" variant="outline">
                    <Share2 className="mr-2 h-4 w-4" />
                    Share Module
                  </Button>
                </CardContent>
              </Card>

              {/* Recent Forms */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Clock className="h-4 w-4 text-blue-500 " />
                    Recent Forms
                  </CardTitle>
                  <CardDescription>Latest forms in this module</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-48">
                    <div className="space-y-2">
                      {module.forms.slice(0, 5).map((form) => (
                        <div key={form.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                              <FileText className="h-4 w-4 text-blue-600" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{form.name}</p>
                              <p className="text-xs text-gray-500">
                                {formatTimeAgo(new Date(form.updatedAt))}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {form.isPublished && (
                              <Badge variant="default" className="text-xs h-4 w-full px-2">
                                <Globe className="h-2 w-2 mr-1" />
                                Live
                              </Badge>
                            )}
                            <Link href={`/builder/${form.id}`}>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                <Edit className="h-3 w-3" />
                              </Button>
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Forms Tab */}
          <TabsContent value="forms" className="space-y-4">
            {/* Filters and Controls */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
                  <div className="flex flex-col sm:flex-row gap-3 flex-1">
                    <div className="relative flex-1 max-w-sm">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Search forms..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 h-8"
                      />
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Filter className="mr-2 h-4 w-4" />
                          {filterStatus === "all" ? "All Forms" :
                            filterStatus === "published" ? "Published" : "Drafts"}
                          <ChevronDown className="ml-2 h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => setFilterStatus("all")}>
                          All Forms
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setFilterStatus("published")}>
                          Published Only
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setFilterStatus("draft")}>
                          Drafts Only
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          {sortOrder === "asc" ? <SortAsc className="mr-2 h-4 w-4" /> : <SortDesc className="mr-2 h-4 w-4" />}
                          Sort by {sortBy}
                          <ChevronDown className="ml-2 h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => setSortBy("name")}>
                          Name
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setSortBy("updated")}>
                          Last Updated
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setSortBy("created")}>
                          Date Created
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setSortBy("submissions")}>
                          Submissions
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}>
                          {sortOrder === "asc" ? "Descending" : "Ascending"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant={viewMode === "grid" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setViewMode("grid")}
                    >
                      <Grid className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={viewMode === "list" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setViewMode("list")}
                    >
                      <List className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Forms Display */}
            {filteredForms.length === 0 ? (
              <Card className="text-center">
                <CardContent>
                  <div className="mx-auto w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                    <FileText className="h-12 w-12 text-gray-400" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">
                    {searchQuery || filterStatus !== "all" ? "No forms found" : "No forms yet"}
                  </h3>
                  <p className="text-gray-600 mb-6 max-w-md mx-auto">
                    {searchQuery || filterStatus !== "all"
                      ? "Try adjusting your search or filter criteria."
                      : "Get started by creating your first form in this module."
                    }
                  </p>
                  {!searchQuery && filterStatus === "all" && (
                    <Button
                      onClick={() => setIsCreateDialogOpen(true)}
                      className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Create Your First Form
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className={viewMode === "grid"
                ? "grid gap-6 md:grid-cols-2 lg:grid-cols-3"
                : "space-y-4"
              }>
                {filteredForms.map((form: Form) => {
                  const analytics = formAnalytics.find(a => a.formId === form.id)

                  return viewMode === "grid" ? (
                    <Card key={form.id} className="group hover:shadow-xl transition-all duration-300 border-0 shadow-md bg-white">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                                <FileText className="h-4 w-4 text-white" />
                              </div>
                              <CardTitle className="text-lg group-hover:text-blue-600 transition-colors">
                                {form.name}
                              </CardTitle>
                            </div>
                            {form.description && (
                              <CardDescription className="text-sm">{form.description}</CardDescription>
                            )}
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem onClick={() => openEditDialog(form)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit Details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handlePublishForm(form)}>
                                {form.isPublished ? (
                                  <>
                                    <XCircle className="mr-2 h-4 w-4" />
                                    Unpublish
                                  </>
                                ) : (
                                  <>
                                    <Globe className="mr-2 h-4 w-4" />
                                    Publish
                                  </>
                                )}
                              </DropdownMenuItem>
                              {form.isPublished && (
                                <DropdownMenuItem onClick={() => copyFormLink(form.id)}>
                                  <Copy className="mr-2 h-4 w-4" />
                                  Copy Link
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleDeleteForm(form.id)} className="text-red-600">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {/* Status and Metrics */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {form.isPublished ? (
                              <Badge variant="default" className="bg-green-500 h-5 w-full px-4">
                                <Globe className="mr-1 h-3 w-3" />
                                Published
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                <Clock className="mr-1 h-3 w-3" />
                                Draft
                              </Badge>
                            )}
                          </div>
                          {analytics && (
                            <div className="text-right">
                              <p className="text-xs text-gray-500">Conversion</p>
                              <p className="text-sm font-medium">{analytics.conversionRate}%</p>
                            </div>
                          )}
                        </div>

                        {/* Quick Stats */}
                        {analytics && (
                          <div className="grid grid-cols-3 gap-3 text-center">
                            <div className="bg-blue-50 rounded-lg p-2">
                              <p className="text-xs text-blue-600 font-medium">Views</p>
                              <p className="text-sm font-bold text-blue-900">{analytics.views}</p>
                            </div>
                            <div className="bg-green-50 rounded-lg p-2">
                              <p className="text-xs text-green-600 font-medium">Submissions</p>
                              <p className="text-sm font-bold text-green-900">{analytics.submissions}</p>
                            </div>
                            <div className="bg-purple-50 rounded-lg p-2">
                              <p className="text-xs text-purple-600 font-medium">Avg. Time</p>
                              <p className="text-sm font-bold text-purple-900">{Math.floor(analytics.averageTime / 60)}m</p>
                            </div>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex gap-2 pt-2">
                          <Link href={`/builder/${form.id}`} className="flex-1">
                            <Button className="w-full" size="sm">
                              <Edit className="mr-2 h-4 w-4" />
                              Edit Form
                            </Button>
                          </Link>
                          {form.isPublished && (
                            <Link href={`/form/${form.id}`} target="_blank">
                              <Button variant="outline" size="sm">
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </Link>
                          )}
                          <Link href={`/forms/${form.id}/analytics`}>
                            <Button variant="outline" size="sm">
                              <BarChart3 className="h-4 w-4" />
                            </Button>
                          </Link>
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card key={form.id} className="group hover:shadow-lg transition-all duration-200">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 flex-1">
                            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                              <FileText className="h-6 w-6 text-white" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-1">
                                <h3 className="font-semibold text-gray-900">{form.name}</h3>
                                {form.isPublished ? (
                                  <Badge variant="default" className="bg-green-500">
                                    <Globe className="mr-1 h-3 w-3" />
                                    Published
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary">
                                    <Clock className="mr-1 h-3 w-3" />
                                    Draft
                                  </Badge>
                                )}
                              </div>
                              {form.description && (
                                <p className="text-sm text-gray-600 mb-2">{form.description}</p>
                              )}
                              <div className="flex items-center gap-4 text-xs text-gray-500">
                                <span>Updated {formatTimeAgo(new Date(form.updatedAt))}</span>
                                {analytics && (
                                  <>
                                    <span>•</span>
                                    <span>{analytics.views} views</span>
                                    <span>•</span>
                                    <span>{analytics.submissions} submissions</span>
                                    <span>•</span>
                                    <span>{analytics.conversionRate}% conversion</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Link href={`/builder/${form.id}`}>
                              <Button size="sm">
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                              </Button>
                            </Link>
                            {form.isPublished && (
                              <Link href={`/form/${form.id}`} target="_blank">
                                <Button variant="outline" size="sm">
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              </Link>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEditDialog(form)}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Edit Details
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handlePublishForm(form)}>
                                  {form.isPublished ? (
                                    <>
                                      <XCircle className="mr-2 h-4 w-4" />
                                      Unpublish
                                    </>
                                  ) : (
                                    <>
                                      <Globe className="mr-2 h-4 w-4" />
                                      Publish
                                    </>
                                  )}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleDeleteForm(form.id)} className="text-red-600">
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Performance Overview */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    Performance Overview
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-4 bg-blue-50 rounded-lg">
                      <p className="text-2xl font-bold text-blue-900">{moduleStats?.weekSubmissions || 0}</p>
                      <p className="text-sm text-blue-600">This Week</p>
                    </div>
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <p className="text-2xl font-bold text-green-900">{moduleStats?.monthSubmissions || 0}</p>
                      <p className="text-sm text-green-600">This Month</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Completion Rate</span>
                      <span className="font-medium">{moduleStats?.averageCompletionRate || 0}%</span>
                    </div>
                    <Progress value={moduleStats?.averageCompletionRate || 0} className="h-2" />
                  </div>
                </CardContent>
              </Card>

              {/* Top Performing Forms */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Award className="h-4 w-4 text-yellow-500" />
                    Top Performing Forms
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {formAnalytics
                      .sort((a, b) => b.conversionRate - a.conversionRate)
                      .slice(0, 5)
                      .map((analytics, index) => {
                        const form = module.forms.find(f => f.id === analytics.formId)
                        if (!form) return null

                        return (
                          <div key={form.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div className="flex items-center gap-3">
                              <div className="w-6 h-6 bg-yellow-100 rounded-full flex items-center justify-center text-xs font-bold text-yellow-800">
                                {index + 1}
                              </div>
                              <div>
                                <p className="font-medium text-sm">{form.name}</p>
                                <p className="text-xs text-gray-500">{analytics.submissions} submissions</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-sm text-green-600">{analytics.conversionRate}%</p>
                              <p className="text-xs text-gray-500">conversion</p>
                            </div>
                          </div>
                        )
                      })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Settings className="h-4 w-4" />
                  Module Settings
                </CardTitle>
                <CardDescription>Configure your module preferences and permissions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <h4 className="font-medium">General Settings</h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">Public Module</p>
                          <p className="text-xs text-gray-500">Allow public access to forms</p>
                        </div>
                        <Button variant="outline" size="sm">
                          <Lock className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">Form Templates</p>
                          <p className="text-xs text-gray-500">Enable form templates</p>
                        </div>
                        <Button variant="outline" size="sm">
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-medium">Notifications</h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">Email Notifications</p>
                          <p className="text-xs text-gray-500">Get notified of new submissions</p>
                        </div>
                        <Button variant="outline" size="sm">
                          <Bell className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">Weekly Reports</p>
                          <p className="text-xs text-gray-500">Receive weekly analytics</p>
                        </div>
                        <Button variant="outline" size="sm">
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Create Form Dialog */}
      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={(open) => {
          setIsCreateDialogOpen(open)
          if (!open) resetForm()
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-blue-600" />
              Create New Form
            </DialogTitle>
            <DialogDescription>
              Create a new form within the <strong>{module.name}</strong> module.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="name" className="text-sm font-medium">Form Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter form name"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="description" className="text-sm font-medium">Description (Optional)</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter form description"
                rows={3}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleCreateForm} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Form
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Form Dialog */}
      <Dialog
        open={isEditDialogOpen}
        onOpenChange={(open) => {
          setIsEditDialogOpen(open)
          if (!open) resetForm()
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5 text-blue-600" />
              Edit Form Details
            </DialogTitle>
            <DialogDescription>Update the form information.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-name" className="text-sm font-medium">Form Name</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter form name"
                className="mt-1 h-8"
              />
            </div>
            <div>
              <Label htmlFor="edit-description" className="text-sm font-medium">Description (Optional)</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter form description"
                rows={3}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleEditForm} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Edit className="mr-2 h-4 w-4" />
                  Update Form
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}