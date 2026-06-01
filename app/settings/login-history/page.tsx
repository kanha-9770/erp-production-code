"use client"

import { useState } from "react"
import { useGetLoginHistoryQuery } from "@/lib/api/settings"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { Search, Download, Filter } from "lucide-react"
import PageBackLink from "@/components/shared/page-back-link"
// jspdf (~150 KB) + jspdf-autotable (~50 KB) are dynamically imported
// inside exportToPDF so they stay out of the initial page bundle. The
// libraries only load when the user actually clicks Export.

interface LoginEntry {
  id: number
  email: string
  ipAddress: string | null
  userAgent: string | null
  status: string
  reason: string | null
  createdAt: string
  userFullName?: string | null
  user?: {
    first_name?: string | null
    last_name?: string | null
    avatar?: string | null
  } | null
}

export default function LoginHistoryPage() {
  const { data: rawData, isLoading: loading, error } = useGetLoginHistoryQuery()
  const data: LoginEntry[] = Array.isArray(rawData) ? rawData : (rawData as any)?.data ?? []
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  if (error) {
    console.error("Failed to load login history:", error)
  }

  const filteredData = data.filter((item) => {
    const searchLower = searchQuery.toLowerCase()
    const matchesSearch =
      item.email.toLowerCase().includes(searchLower) ||
      item.userFullName?.toLowerCase().includes(searchLower) ||
      (item.ipAddress?.toLowerCase().includes(searchLower) ?? false)

    const matchesStatus = statusFilter === "all" || item.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const formatUserAgent = (ua: string | null) => {
    if (!ua) return "-"
    if (ua.includes("Chrome") || ua.includes("CriOS")) return "Chrome"
    if (ua.includes("Firefox")) return "Firefox"
    if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari"
    if (ua.includes("Edge")) return "Edge"
    if (ua.includes("Opera")) return "Opera"
    return "Other Browser"
  }

  const exportToPDF = async () => {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ])
    const doc = new jsPDF()
    doc.setFontSize(18)
    doc.text("Login History", 14, 20)
    doc.setFontSize(10)
    doc.setTextColor(100)
    doc.text(`Exported on ${new Date().toLocaleString()}`, 14, 28)
    doc.text(`Total records: ${filteredData.length}`, 14, 34)

    autoTable(doc, {
      startY: 40,
      head: [["User", "Email", "IP Address", "Browser", "Status", "Reason", "Login Time"]],
      body: filteredData.map((entry) => [
        entry.userFullName || "Unknown User",
        entry.email,
        entry.ipAddress || "Unknown",
        formatUserAgent(entry.userAgent),
        entry.status,
        entry.reason || "-",
        new Date(entry.createdAt).toLocaleString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 37, 36] },
    })

    doc.save("login-history.pdf")
  }

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "?"
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <div className="p-6 space-y-6 bg-[oklch(0.96_0.005_250)] min-h-screen">
      <PageBackLink href="/settings" label="Settings" />
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Login History</CardTitle>
              <CardDescription>
                Track all login attempts and the IP address of the device used for login
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={exportToPDF} disabled={loading || filteredData.length === 0}>
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or IP address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Attempts</SelectItem>
                <SelectItem value="Success">Successful</SelectItem>
                <SelectItem value="Failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Login Device IP Address</TableHead>
                  <TableHead>Browser</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Login Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-8 w-48" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-36" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-40" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No login attempts found matching your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredData.map((entry) => (
                    <TableRow key={entry.id}>
                      {/* User */}
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={entry.user?.avatar || undefined} />
                            <AvatarFallback>
                              {getInitials(entry.userFullName || entry.email)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">
                              {entry.userFullName || "Unknown User"}
                            </p>
                            <p className="text-sm text-muted-foreground">{entry.email}</p>
                          </div>
                        </div>
                      </TableCell>

                      {/* Login Device IP Address - Full and Clear */}
                      <TableCell className="font-mono text-sm font-semibold">
                        {entry.ipAddress || "Unknown"}
                      </TableCell>

                      <TableCell className="text-sm">
                        {formatUserAgent(entry.userAgent)}
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant={entry.status === "Success" ? "default" : "destructive"}
                        >
                          {entry.status}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-sm text-muted-foreground">
                        {entry.reason || "-"}
                      </TableCell>

                      <TableCell className="text-sm">
                        {new Date(entry.createdAt).toLocaleString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true,
                        })}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Summary */}
          {!loading && data.length > 0 && (
            <div className="text-sm text-muted-foreground">
              Showing {filteredData.length} of {data.length} login attempts
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}