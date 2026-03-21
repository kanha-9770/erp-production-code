// "use client"

// import { useEffect, useState } from "react"
// import { format, parseISO } from "date-fns"
// import { Input } from "@/components/ui/input"
// import { Button } from "@/components/ui/button"
// import {
//   Table,
//   TableBody,
//   TableCell,
//   TableHead,
//   TableHeader,
//   TableRow,
// } from "@/components/ui/table"
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select"
// import {
//   Card,
//   CardContent,
//   CardDescription,
//   CardHeader,
//   CardTitle,
// } from "@/components/ui/card"
// import { Badge } from "@/components/ui/badge"
// import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
// import { Skeleton } from "@/components/ui/skeleton"
// import {
//   Popover,
//   PopoverContent,
//   PopoverTrigger,
// } from "@/components/ui/popover"
// import { Calendar } from "@/components/ui/calendar"
// import {
//   Pagination,
//   PaginationContent,
//   PaginationEllipsis,
//   PaginationItem,
//   PaginationLink,
//   PaginationNext,
//   PaginationPrevious,
// } from "@/components/ui/pagination"
// import { Search, Download, CalendarIcon } from "lucide-react"
// import { DateRange } from "react-day-picker"

// interface AuditLogEntry {
//   id: string
//   performedBy: string
//   userFullName: string
//   avatar?: string | null
//   action: string
//   module: string
//   record: string
//   details: string
//   ipAddress: string
//   userAgent: string
//   timestamp: string
// }

// export default function AuditLogPage() {
//   const [data, setData] = useState<AuditLogEntry[]>([])
//   const [filteredData, setFilteredData] = useState<AuditLogEntry[]>([])
//   const [searchQuery, setSearchQuery] = useState("")
//   const [actionFilter, setActionFilter] = useState<string>("all")
//   const [moduleFilter, setModuleFilter] = useState<string>("all")
//   const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
//   const [currentPage, setCurrentPage] = useState(1)
//   const [loading, setLoading] = useState(true)
//   const [error, setError] = useState<string | null>(null)

//   const itemsPerPage = 25

//   const actions = ["all", "Created", "Updated", "Deleted", "Viewed", "Exported", "Imported", "Login", "Logout", "Approved", "Rejected", "Shared"]
//   const modules = ["all", "Users", "Roles", "Profiles", "Contacts", "Deals", "Leads", "Accounts", "Tasks", "Settings", "Data Administration", "Workflow Rules", "Templates"]

//   useEffect(() => {
//     const fetchAuditLogs = async () => {
//       try {
//         setLoading(true)
//         setError(null)

//         const res = await fetch("/api/audit-log")

//         if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`)

//         const result = await res.json()
//         const logs: AuditLogEntry[] = Array.isArray(result) ? result : []

//         const normalized = logs.map(log => ({
//           ...log,
//           details: log.details || "No additional details",
//           record: log.record || "-",
//           ipAddress: log.ipAddress || "-",
//           userAgent: log.userAgent || "-",
//           userFullName: log.userFullName || log.performedBy,
//         }))

//         const sorted = normalized.sort((a, b) =>
//           new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
//         )

//         setData(sorted)
//         setFilteredData(sorted)
//       } catch (err: any) {
//         setError(err.message || "Failed to load audit logs")
//         setData([])
//         setFilteredData([])
//       } finally {
//         setLoading(false)
//       }
//     }

//     fetchAuditLogs()
//   }, [])

//   useEffect(() => {
//     let filtered = [...data]

//     if (searchQuery.trim()) {
//       const lower = searchQuery.toLowerCase()
//       filtered = filtered.filter(item =>
//         Object.values(item).some(val =>
//           val?.toString().toLowerCase().includes(lower)
//         )
//       )
//     }

//     if (actionFilter !== "all") filtered = filtered.filter(item => item.action === actionFilter)
//     if (moduleFilter !== "all") filtered = filtered.filter(item => item.module === moduleFilter)

//     if (dateRange?.from || dateRange?.to) {
//       filtered = filtered.filter(item => {
//         const date = parseISO(item.timestamp)
//         if (dateRange.from && date < dateRange.from) return false
//         if (dateRange.to) {
//           const toEnd = new Date(dateRange.to)
//           toEnd.setHours(23, 59, 59, 999)
//           if (date > toEnd) return false
//         }
//         return true
//       })
//     }

//     setFilteredData(filtered)
//     setCurrentPage(1)
//   }, [searchQuery, actionFilter, moduleFilter, dateRange, data])

//   const totalPages = Math.ceil(filteredData.length / itemsPerPage)
//   const paginatedData = filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

//   const getInitials = (name: string): string => {
//     return name
//       .trim()
//       .split(" ")
//       .map(n => n[0])
//       .join("")
//       .toUpperCase()
//       .slice(0, 2) || "?"
//   }

//   const getActionBadge = (action: string) => {
//     const lower = action.toLowerCase()
//     if (lower.includes("create") || lower.includes("login") || lower.includes("approve")) 
//       return { variant: "default" as const, label: action }
//     if (lower.includes("update") || lower.includes("edit") || lower.includes("logout"))
//       return { variant: "secondary" as const, label: action }
//     if (lower.includes("delete") || lower.includes("reject"))
//       return { variant: "destructive" as const, label: action }
//     if (lower.includes("view"))
//       return { variant: "outline" as const, label: action }
//     return { variant: "outline" as const, label: action }
//   }

//   const handleExport = () => {
//     if (filteredData.length === 0) return

//     const headers = ["Performed By", "Action", "Module", "Record", "Details", "IP Address", "User Agent", "Date & Time"]
//     const rows = filteredData.map(entry => [
//       entry.userFullName,
//       entry.action,
//       entry.module,
//       entry.record,
//       entry.details,
//       entry.ipAddress,
//       entry.userAgent,
//       format(parseISO(entry.timestamp), "MMM dd, yyyy hh:mm a"),
//     ])

//     const csv = [headers.join(","), ...rows.map(r => `"${r.join('","')}"`)].join("\n")
//     const blob = new Blob([csv], { type: "text/csv" })
//     const url = URL.createObjectURL(blob)
//     const a = document.createElement("a")
//     a.href = url
//     a.download = `audit-log-${format(new Date(), "yyyy-MM-dd")}.csv`
//     a.click()
//     URL.revokeObjectURL(url)
//   }

//   const getPageNumbers = () => {
//     if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
//     const pages: (number | string)[] = []
//     if (currentPage <= 4) pages.push(1, 2, 3, 4, 5, "...", totalPages)
//     else if (currentPage >= totalPages - 3) pages.push(1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages)
//     else pages.push(1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages)
//     return pages
//   }

//   return (
//     <div className="p-6 space-y-6 bg-[oklch(0.96_0.005_250)] min-h-screen">
//       <Card>
//         <CardHeader>
//           <div className="flex items-center justify-between">
//             <div>
//               <CardTitle className="text-2xl">Audit Log</CardTitle>
//               <CardDescription>Track all user and admin activities across your organization</CardDescription>
//             </div>
//             <Button variant="outline" size="sm" onClick={handleExport} disabled={filteredData.length === 0 || loading}>
//               <Download className="w-4 h-4 mr-2" />
//               Export CSV
//             </Button>
//           </div>
//         </CardHeader>

//         <CardContent className="space-y-6">
//           <div className="flex flex-col lg:flex-row gap-4">
//             <div className="relative flex-1">
//               <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
//               <Input placeholder="Search anything..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10" />
//             </div>

//             <Select value={actionFilter} onValueChange={setActionFilter}>
//               <SelectTrigger className="w-full lg:w-48"><SelectValue placeholder="All Actions" /></SelectTrigger>
//               <SelectContent>
//                 <SelectItem value="all">All Actions</SelectItem>
//                 {actions.slice(1).map(act => <SelectItem key={act} value={act}>{act}</SelectItem>)}
//               </SelectContent>
//             </Select>

//             <Select value={moduleFilter} onValueChange={setModuleFilter}>
//               <SelectTrigger className="w-full lg:w-56"><SelectValue placeholder="All Modules" /></SelectTrigger>
//               <SelectContent>
//                 <SelectItem value="all">All Modules</SelectItem>
//                 {modules.slice(1).map(mod => <SelectItem key={mod} value={mod}>{mod}</SelectItem>)}
//               </SelectContent>
//             </Select>

//             <Popover>
//               <PopoverTrigger asChild>
//                 <Button variant="outline" className="w-full lg:w-64 justify-start text-left font-normal">
//                   <CalendarIcon className="mr-2 h-4 w-4" />
//                   {dateRange?.from ? (dateRange.to ? `${format(dateRange.from, "LLL dd, y")} - ${format(dateRange.to, "LLL dd, y")}` : format(dateRange.from, "LLL dd, y")) : <span>Date Range</span>}
//                 </Button>
//               </PopoverTrigger>
//               <PopoverContent className="w-auto p-0" align="end">
//                 <Calendar mode="range" selected={dateRange} onSelect={setDateRange} numberOfMonths={2} className="rounded-md border" />
//               </PopoverContent>
//             </Popover>
//           </div>

//           {error && (
//             <div className="text-center py-8 text-red-600">
//               <p className="font-medium">{error}</p>
//               <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>Retry</Button>
//             </div>
//           )}

//           <div className="rounded-md border">
//             <Table>
//               <TableHeader>
//                 <TableRow>
//                   <TableHead>Performed By</TableHead>
//                   <TableHead>Action</TableHead>
//                   <TableHead>Module</TableHead>
//                   <TableHead>Record</TableHead>
//                   <TableHead>Details</TableHead>
//                   <TableHead>IP Address</TableHead>
//                   <TableHead>User Agent</TableHead>
//                   <TableHead>Date & Time</TableHead>
//                 </TableRow>
//               </TableHeader>
//               <TableBody>
//                 {loading ? (
//                   Array.from({ length: 10 }).map((_, i) => (
//                     <TableRow key={i}>
//                       {Array.from({ length: 8 }).map((_, j) => (
//                         <TableCell key={j}><Skeleton className="h-8 w-full" /></TableCell>
//                       ))}
//                     </TableRow>
//                   ))
//                 ) : paginatedData.length === 0 ? (
//                   <TableRow>
//                     <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
//                       {data.length === 0 ? "No audit logs available yet." : "No entries match your filters."}
//                     </TableCell>
//                   </TableRow>
//                 ) : (
//                   paginatedData.map(entry => {
//                     const badge = getActionBadge(entry.action)
//                     return (
//                       <TableRow key={entry.id}>
//                         <TableCell>
//                           <div className="flex items-center gap-3">
//                             <Avatar className="h-9 w-9">
//                               <AvatarImage src={entry.avatar || undefined} />
//                               <AvatarFallback>{getInitials(entry.userFullName)}</AvatarFallback>
//                             </Avatar>
//                             <div>
//                               <p className="font-medium">{entry.userFullName}</p>
//                               <p className="text-sm text-muted-foreground">{entry.performedBy}</p>
//                             </div>
//                           </div>
//                         </TableCell>
//                         <TableCell><Badge variant={badge.variant}>{badge.label}</Badge></TableCell>
//                         <TableCell className="font-medium">{entry.module}</TableCell>
//                         <TableCell>{entry.record}</TableCell>
//                         <TableCell className="max-w-md">
//                           <p className="text-sm text-muted-foreground truncate" title={entry.details}>
//                             {entry.details}
//                           </p>
//                         </TableCell>
//                         <TableCell className="font-mono text-sm">{entry.ipAddress}</TableCell>
//                         <TableCell className="text-sm max-w-xs truncate" title={entry.userAgent}>
//                           {entry.userAgent}
//                         </TableCell>
//                         <TableCell className="text-sm">
//                           {format(parseISO(entry.timestamp), "MMM dd, yyyy hh:mm a")}
//                         </TableCell>
//                       </TableRow>
//                     )
//                   })
//                 )}
//               </TableBody>
//             </Table>
//           </div>

//           {!loading && !error && filteredData.length > 0 && (
//             <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
//               <p className="text-sm text-muted-foreground">
//                 Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredData.length)} of {filteredData.length} entries
//               </p>
//               <Pagination>
//                 <PaginationContent>
//                   <PaginationItem>
//                     <PaginationPrevious onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
//                       className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"} />
//                   </PaginationItem>
//                   {getPageNumbers().map((page, i) => (
//                     page === "..." ? (
//                       <PaginationItem key={`ell-${i}`}><PaginationEllipsis /></PaginationItem>
//                     ) : (
//                       <PaginationItem key={page}>
//                         <PaginationLink onClick={() => setCurrentPage(page as number)} isActive={currentPage === page} className="cursor-pointer">
//                           {page}
//                         </PaginationLink>
//                       </PaginationItem>
//                     )
//                   ))}
//                   <PaginationItem>
//                     <PaginationNext onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
//                       className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"} />
//                   </PaginationItem>
//                 </PaginationContent>
//               </Pagination>
//             </div>
//           )}
//         </CardContent>
//       </Card>
//     </div>
//   )
// }


// "use client"

// import { useEffect, useState } from "react"
// import { format, parseISO } from "date-fns"
// import { Input } from "@/components/ui/input"
// import { Button } from "@/components/ui/button"
// import {
//   Table,
//   TableBody,
//   TableCell,
//   TableHead,
//   TableHeader,
//   TableRow,
// } from "@/components/ui/table"
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select"
// import {
//   Card,
//   CardContent,
//   CardDescription,
//   CardHeader,
//   CardTitle,
// } from "@/components/ui/card"
// import { Badge } from "@/components/ui/badge"
// import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
// import { Skeleton } from "@/components/ui/skeleton"
// import {
//   Popover,
//   PopoverContent,
//   PopoverTrigger,
// } from "@/components/ui/popover"
// import { Calendar } from "@/components/ui/calendar"
// import {
//   Pagination,
//   PaginationContent,
//   PaginationEllipsis,
//   PaginationItem,
//   PaginationLink,
//   PaginationNext,
//   PaginationPrevious,
// } from "@/components/ui/pagination"
// import { Search, Download, CalendarIcon } from "lucide-react"
// import { DateRange } from "react-day-picker"

// interface AuditLogEntry {
//   id: string
//   performedBy: string
//   userFullName: string
//   avatar?: string | null
//   action: string
//   module: string
//   record: string
//   details: string
//   ipAddress: string
//   userAgent: string
//   timestamp: string
// }

// export default function AuditLogPage() {
//   const [data, setData] = useState<AuditLogEntry[]>([])
//   const [filteredData, setFilteredData] = useState<AuditLogEntry[]>([])
//   const [searchQuery, setSearchQuery] = useState("")
//   const [actionFilter, setActionFilter] = useState<string>("all")
//   const [moduleFilter, setModuleFilter] = useState<string>("all")
//   const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
//   const [currentPage, setCurrentPage] = useState(1)
//   const [loading, setLoading] = useState(true)
//   const [error, setError] = useState<string | null>(null)

//   const itemsPerPage = 25

//   // Hardcoded actions (these are standard and rarely change)
//   const actions = ["all", "Created", "Updated", "Deleted", "Viewed", "Exported", "Imported", "Login", "Logout", "Approved", "Rejected", "Shared"]

//   // Dynamic modules extracted from actual data
//   const [availableModules, setAvailableModules] = useState<string[]>([])

//   useEffect(() => {
//     const fetchAuditLogs = async () => {
//       try {
//         setLoading(true)
//         setError(null)

//         const res = await fetch("/api/audit-log")
//         if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`)

//         const result = await res.json()
//         const logs: AuditLogEntry[] = Array.isArray(result) ? result : []

//         const normalized = logs.map(log => ({
//           ...log,
//           details: log.details || "No additional details",
//           record: log.record || "-",
//           ipAddress: log.ipAddress || "-",
//           userAgent: log.userAgent || "-",
//           userFullName: log.userFullName || log.performedBy,
//         }))

//         const sorted = normalized.sort((a, b) =>
//           new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
//         )

//         setData(sorted)
//         setFilteredData(sorted)

//         // Extract unique modules from actual data
//         const uniqueModules = Array.from(new Set(sorted.map(log => log.module)))
//           .filter(Boolean)
//           .sort()

//         setAvailableModules(uniqueModules)
//       } catch (err: any) {
//         setError(err.message || "Failed to load audit logs")
//         setData([])
//         setFilteredData([])
//         setAvailableModules([])
//       } finally {
//         setLoading(false)
//       }
//     }

//     fetchAuditLogs()
//   }, [])

//   useEffect(() => {
//     let filtered = [...data]

//     if (searchQuery.trim()) {
//       const lower = searchQuery.toLowerCase()
//       filtered = filtered.filter(item =>
//         Object.values(item).some(val =>
//           val?.toString().toLowerCase().includes(lower)
//         )
//       )
//     }

//     if (actionFilter !== "all") {
//       filtered = filtered.filter(item => item.action === actionFilter)
//     }

//     if (moduleFilter !== "all") {
//       filtered = filtered.filter(item => item.module === moduleFilter)
//     }

//     if (dateRange?.from || dateRange?.to) {
//       filtered = filtered.filter(item => {
//         const date = parseISO(item.timestamp)
//         if (dateRange.from && date < dateRange.from) return false
//         if (dateRange.to) {
//           const toEnd = new Date(dateRange.to)
//           toEnd.setHours(23, 59, 59, 999)
//           if (date > toEnd) return false
//         }
//         return true
//       })
//     }

//     setFilteredData(filtered)
//     setCurrentPage(1)
//   }, [searchQuery, actionFilter, moduleFilter, dateRange, data])

//   const totalPages = Math.ceil(filteredData.length / itemsPerPage)
//   const paginatedData = filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

//   const getInitials = (name: string): string => {
//     return name
//       .trim()
//       .split(" ")
//       .map(n => n[0])
//       .join("")
//       .toUpperCase()
//       .slice(0, 2) || "?"
//   }

//   const getActionBadge = (action: string) => {
//     const lower = action.toLowerCase()
//     if (lower.includes("create") || lower.includes("login") || lower.includes("approve"))
//       return { variant: "default" as const, label: action }
//     if (lower.includes("update") || lower.includes("edit") || lower.includes("logout"))
//       return { variant: "secondary" as const, label: action }
//     if (lower.includes("delete") || lower.includes("reject"))
//       return { variant: "destructive" as const, label: action }
//     if (lower.includes("view"))
//       return { variant: "outline" as const, label: action }
//     return { variant: "outline" as const, label: action }
//   }

//   const handleExport = () => {
//     if (filteredData.length === 0) return

//     const headers = ["Performed By", "Action", "Module", "Record", "Details", "IP Address", "User Agent", "Date & Time"]
//     const rows = filteredData.map(entry => [
//       entry.userFullName,
//       entry.action,
//       entry.module,
//       entry.record,
//       entry.details,
//       entry.ipAddress,
//       entry.userAgent,
//       format(parseISO(entry.timestamp), "MMM dd, yyyy hh:mm a"),
//     ])

//     const csv = [headers.join(","), ...rows.map(r => `"${r.join('","')}"`)].join("\n")
//     const blob = new Blob([csv], { type: "text/csv" })
//     const url = URL.createObjectURL(blob)
//     const a = document.createElement("a")
//     a.href = url
//     a.download = `audit-log-${format(new Date(), "yyyy-MM-dd")}.csv`
//     a.click()
//     URL.revokeObjectURL(url)
//   }

//   const getPageNumbers = () => {
//     if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
//     const pages: (number | string)[] = []
//     if (currentPage <= 4) pages.push(1, 2, 3, 4, 5, "...", totalPages)
//     else if (currentPage >= totalPages - 3) pages.push(1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages)
//     else pages.push(1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages)
//     return pages
//   }

//   return (
//     <div className="p-6 space-y-6 bg-[oklch(0.96_0.005_250)] min-h-screen">
//       <Card>
//         <CardHeader>
//           <div className="flex items-center justify-between">
//             <div>
//               <CardTitle className="text-2xl">Audit Log</CardTitle>
//               <CardDescription>Track all user and admin activities across your organization</CardDescription>
//             </div>
//             <Button variant="outline" size="sm" onClick={handleExport} disabled={filteredData.length === 0 || loading}>
//               <Download className="w-4 h-4 mr-2" />
//               Export CSV
//             </Button>
//           </div>
//         </CardHeader>

//         <CardContent className="space-y-6">
//           <div className="flex flex-col lg:flex-row gap-4">
//             <div className="relative flex-1">
//               <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
//               <Input placeholder="Search anything..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10" />
//             </div>

//             <Select value={actionFilter} onValueChange={setActionFilter}>
//               <SelectTrigger className="w-full lg:w-48">
//                 <SelectValue placeholder="All Actions" />
//               </SelectTrigger>
//               <SelectContent>
//                 <SelectItem value="all">All Actions</SelectItem>
//                 {actions.slice(1).map(act => (
//                   <SelectItem key={act} value={act}>{act}</SelectItem>
//                 ))}
//               </SelectContent>
//             </Select>

//             {/* DYNAMIC MODULE FILTER */}
//             <Select value={moduleFilter} onValueChange={setModuleFilter}>
//               <SelectTrigger className="w-full lg:w-56">
//                 <SelectValue placeholder="All Modules" />
//               </SelectTrigger>
//               <SelectContent>
//                 <SelectItem value="all">All Modules</SelectItem>
//                 {availableModules.map(mod => (
//                   <SelectItem key={mod} value={mod}>
//                     {mod}
//                   </SelectItem>
//                 ))}
//               </SelectContent>
//             </Select>

//             <Popover>
//               <PopoverTrigger asChild>
//                 <Button variant="outline" className="w-full lg:w-64 justify-start text-left font-normal">
//                   <CalendarIcon className="mr-2 h-4 w-4" />
//                   {dateRange?.from ? (
//                     dateRange.to ? (
//                       `${format(dateRange.from, "LLL dd, y")} - ${format(dateRange.to, "LLL dd, y")}`
//                     ) : (
//                       format(dateRange.from, "LLL dd, y")
//                     )
//                   ) : (
//                     <span>Date Range</span>
//                   )}
//                 </Button>
//               </PopoverTrigger>
//               <PopoverContent className="w-auto p-0" align="end">
//                 <Calendar mode="range" selected={dateRange} onSelect={setDateRange} numberOfMonths={2} className="rounded-md border" />
//               </PopoverContent>
//             </Popover>
//           </div>

//           {/* Rest of your table and pagination remains exactly the same */}
//           {error && (
//             <div className="text-center py-8 text-red-600">
//               <p className="font-medium">{error}</p>
//               <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>Retry</Button>
//             </div>
//           )}

//           <div className="rounded-md border">
//             <Table>
//               <TableHeader>
//                 <TableRow>
//                   <TableHead>Performed By</TableHead>
//                   <TableHead>Action</TableHead>
//                   <TableHead>Module</TableHead>
//                   <TableHead>Record</TableHead>
//                   <TableHead>Details</TableHead>
//                   <TableHead>IP Address</TableHead>
//                   <TableHead>User Agent</TableHead>
//                   <TableHead>Date & Time</TableHead>
//                 </TableRow>
//               </TableHeader>
//               <TableBody>
//                 {loading ? (
//                   Array.from({ length: 10 }).map((_, i) => (
//                     <TableRow key={i}>
//                       {Array.from({ length: 8 }).map((_, j) => (
//                         <TableCell key={j}><Skeleton className="h-8 w-full" /></TableCell>
//                       ))}
//                     </TableRow>
//                   ))
//                 ) : paginatedData.length === 0 ? (
//                   <TableRow>
//                     <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
//                       {data.length === 0 ? "No audit logs available yet." : "No entries match your filters."}
//                     </TableCell>
//                   </TableRow>
//                 ) : (
//                   paginatedData.map(entry => {
//                     const badge = getActionBadge(entry.action)
//                     return (
//                       <TableRow key={entry.id}>
//                         <TableCell>
//                           <div className="flex items-center gap-3">
//                             <Avatar className="h-9 w-9">
//                               <AvatarImage src={entry.avatar || undefined} />
//                               <AvatarFallback>{getInitials(entry.userFullName)}</AvatarFallback>
//                             </Avatar>
//                             <div>
//                               <p className="font-medium">{entry.userFullName}</p>
//                               <p className="text-sm text-muted-foreground">{entry.performedBy}</p>
//                             </div>
//                           </div>
//                         </TableCell>
//                         <TableCell><Badge variant={badge.variant}>{badge.label}</Badge></TableCell>
//                         <TableCell className="font-medium">{entry.module}</TableCell>
//                         <TableCell>{entry.record}</TableCell>
//                         <TableCell className="max-w-md">
//                           <p className="text-sm text-muted-foreground truncate" title={entry.details}>
//                             {entry.details}
//                           </p>
//                         </TableCell>
//                         <TableCell className="font-mono text-sm">{entry.ipAddress}</TableCell>
//                         <TableCell className="text-sm max-w-xs truncate" title={entry.userAgent}>
//                           {entry.userAgent}
//                         </TableCell>
//                         <TableCell className="text-sm">
//                           {format(parseISO(entry.timestamp), "MMM dd, yyyy hh:mm a")}
//                         </TableCell>
//                       </TableRow>
//                     )
//                   })
//                 )}
//               </TableBody>
//             </Table>
//           </div>

//           {!loading && !error && filteredData.length > 0 && (
//             <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
//               <p className="text-sm text-muted-foreground">
//                 Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
//                 {Math.min(currentPage * itemsPerPage, filteredData.length)} of {filteredData.length} entries
//               </p>
//               <Pagination>
//                 <PaginationContent>
//                   <PaginationItem>
//                     <PaginationPrevious onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
//                       className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"} />
//                   </PaginationItem>
//                   {getPageNumbers().map((page, i) => (
//                     page === "..." ? (
//                       <PaginationItem key={`ell-${i}`}><PaginationEllipsis /></PaginationItem>
//                     ) : (
//                       <PaginationItem key={page}>
//                         <PaginationLink onClick={() => setCurrentPage(page as number)} isActive={currentPage === page} className="cursor-pointer">
//                           {page}
//                         </PaginationLink>
//                       </PaginationItem>
//                     )
//                   ))}
//                   <PaginationItem>
//                     <PaginationNext onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
//                       className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"} />
//                   </PaginationItem>
//                 </PaginationContent>
//               </Pagination>
//             </div>
//           )}
//         </CardContent>
//       </Card>
//     </div>
//   )
// }

"use client"

import { useMemo, useState } from "react"
import { useGetAuditLogQuery } from "@/lib/api/settings"
import { format, parseISO } from "date-fns"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { Search, Download, CalendarIcon } from "lucide-react"
import { DateRange } from "react-day-picker"

interface AuditLogEntry {
  id: string
  performedBy: string
  userFullName: string
  avatar?: string | null
  action: string
  module: string
  record: string
  details: string
  ipAddress: string
  userAgent: string
  timestamp: string
}

export default function AuditLogPage() {
  const { data: rawResult, isLoading: loading, error: queryError } = useGetAuditLogQuery()
  const [searchQuery, setSearchQuery] = useState("")
  const [actionFilter, setActionFilter] = useState<string>("all")
  const [moduleFilter, setModuleFilter] = useState<string>("all")
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
  const [currentPage, setCurrentPage] = useState(1)

  const error = queryError ? ((queryError as any)?.data?.message || "Failed to load audit logs") : null

  const itemsPerPage = 25
  const actions = ["all", "Created", "Updated", "Deleted", "Viewed", "Exported", "Imported", "Login", "Logout", "Approved", "Rejected", "Shared"]

  const data = useMemo(() => {
    const result = rawResult as any
    const logs: AuditLogEntry[] = Array.isArray(result) ? result : (result?.data ?? [])

    const normalized = logs.map(log => ({
      ...log,
      details: log.details || "No additional details",
      record: log.record || "-",
      ipAddress: log.ipAddress || "-",
      userAgent: log.userAgent || "-",
      userFullName: log.userFullName || log.performedBy,
    }))

    return normalized.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
  }, [rawResult])

  const availableModules = useMemo(() => {
    return Array.from(new Set(data.map(log => log.module)))
      .filter(Boolean)
      .sort()
  }, [data])

  const filteredData = useMemo(() => {
    let filtered = [...data]

    if (searchQuery.trim()) {
      const lower = searchQuery.toLowerCase()
      filtered = filtered.filter(item =>
        Object.values(item).some(val =>
          val?.toString().toLowerCase().includes(lower)
        )
      )
    }

    if (actionFilter !== "all") filtered = filtered.filter(item => item.action === actionFilter)
    if (moduleFilter !== "all") filtered = filtered.filter(item => item.module === moduleFilter)

    if (dateRange?.from || dateRange?.to) {
      filtered = filtered.filter(item => {
        const date = parseISO(item.timestamp)
        if (dateRange.from && date < dateRange.from) return false
        if (dateRange.to) {
          const toEnd = new Date(dateRange.to)
          toEnd.setHours(23, 59, 59, 999)
          if (date > toEnd) return false
        }
        return true
      })
    }

    return filtered
  }, [data, searchQuery, actionFilter, moduleFilter, dateRange])

  const totalPages = Math.ceil(filteredData.length / itemsPerPage)
  const paginatedData = filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  const getInitials = (name: string): string => {
    return name.trim().split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "?"
  }

  const getActionBadge = (action: string) => {
    const lower = action.toLowerCase()
    if (lower.includes("create") || lower.includes("login") || lower.includes("approve"))
      return { variant: "default" as const, label: action }
    if (lower.includes("update") || lower.includes("edit") || lower.includes("logout"))
      return { variant: "secondary" as const, label: action }
    if (lower.includes("delete") || lower.includes("reject"))
      return { variant: "destructive" as const, label: action }
    if (lower.includes("view"))
      return { variant: "outline" as const, label: action }
    return { variant: "outline" as const, label: action }
  }

  const handleExport = () => {
    if (filteredData.length === 0) return

    const headers = ["Performed By", "Action", "Module", "Record", "Details", "IP Address", "User Agent", "Date & Time"]
    const rows = filteredData.map(entry => [
      entry.userFullName,
      entry.action,
      entry.module,
      entry.record,
      entry.details,
      entry.ipAddress,
      entry.userAgent,
      format(parseISO(entry.timestamp), "MMM dd, yyyy hh:mm a"),
    ])

    const csv = [headers.join(","), ...rows.map(r => `"${r.join('","')}"`)].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `audit-log-${format(new Date(), "yyyy-MM-dd")}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const getPageNumbers = () => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const pages: (number | string)[] = []
    if (currentPage <= 4) pages.push(1, 2, 3, 4, 5, "...", totalPages)
    else if (currentPage >= totalPages - 3) pages.push(1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages)
    else pages.push(1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages)
    return pages
  }

  return (
    <div className="p-4 space-y-4 bg-background min-h-screen"> 
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3 px-4"> 
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl">Audit Log</CardTitle>
              <CardDescription className="text-xs mt-1">
                Track all user and admin activities
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={filteredData.length === 0 || loading}>
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 px-4 pt-2 pb-4"> 
          {/* Compact Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 text-sm h-9"
              />
            </div>

            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-full sm:w-40 h-9 text-sm">
                <SelectValue placeholder="All Actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {actions.slice(1).map(act => (
                  <SelectItem key={act} value={act}>{act}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={moduleFilter} onValueChange={setModuleFilter}>
              <SelectTrigger className="w-full sm:w-48 h-9 text-sm">
                <SelectValue placeholder="All Modules" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Modules</SelectItem>
                {availableModules.map(mod => (
                  <SelectItem key={mod} value={mod}>{mod}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-9 text-sm justify-start">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      `${format(dateRange.from, "MMM dd")} - ${format(dateRange.to, "MMM dd")}`
                    ) : format(dateRange.from, "MMM dd, yyyy")
                  ) : "Date Range"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar mode="range" selected={dateRange} onSelect={setDateRange} numberOfMonths={2} />
              </PopoverContent>
            </Popover>
          </div>

          {error && (
            <div className="text-center py-4 text-red-600 text-sm">
              <p>{error}</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => window.location.reload()}>
                Retry
              </Button>
            </div>
          )}

          {/* Table */}
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="text-xs font-medium py-2 px-3">Performed By</TableHead>
                  <TableHead className="text-xs font-medium py-2 px-3">Action</TableHead>
                  <TableHead className="text-xs font-medium py-2 px-3">Module</TableHead>
                  <TableHead className="text-xs font-medium py-2 px-3">Record</TableHead>
                  <TableHead className="text-xs font-medium py-2 px-3">Details</TableHead>
                  <TableHead className="text-xs font-medium py-2 px-3">IP Address</TableHead>
                  <TableHead className="text-xs font-medium py-2 px-3">User Agent</TableHead>
                  <TableHead className="text-xs font-medium py-2 px-3">Date & Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j} className="py-2 px-3"><Skeleton className="h-5 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : paginatedData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-sm">
                      {data.length === 0 ? "No audit logs available yet." : "No entries match your filters."}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedData.map(entry => {
                    const badge = getActionBadge(entry.action)
                    return (
                      <TableRow key={entry.id} className="hover:bg-muted/30">
                        <TableCell className="py-2 px-3 text-xs">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={entry.avatar || undefined} />
                              <AvatarFallback className="text-xs">{getInitials(entry.userFullName)}</AvatarFallback>
                            </Avatar>
                            <div className="leading-tight">
                              <p className="font-medium text-xs">{entry.userFullName}</p>
                              <p className="text-[10px] text-muted-foreground">{entry.performedBy}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-2 px-3"><Badge variant={badge.variant} className="text-xs py-0.5 px-1.5">{badge.label}</Badge></TableCell>
                        <TableCell className="py-2 px-3 text-xs font-medium">{entry.module}</TableCell>
                        <TableCell className="py-2 px-3 text-xs">{entry.record}</TableCell>
                        <TableCell className="py-2 px-3 text-xs max-w-xs">
                          <p className="truncate" title={entry.details}>{entry.details}</p>
                        </TableCell>
                        <TableCell className="py-2 px-3 text-xs font-mono">{entry.ipAddress}</TableCell>
                        <TableCell className="py-2 px-3 text-xs truncate max-w-xs" title={entry.userAgent}>
                          {entry.userAgent}
                        </TableCell>
                        <TableCell className="py-2 px-3 text-xs">
                          {format(parseISO(entry.timestamp), "MMM dd, hh:mm a")}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Compact Pagination */}
          {!loading && !error && filteredData.length > 0 && (
            <div className="flex items-center justify-between text-xs">
              <p className="text-muted-foreground">
                Showing {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, filteredData.length)} of {filteredData.length}
              </p>
              <Pagination className="my-0">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                  </PaginationItem>
                  {getPageNumbers().map((page, i) => (
                    page === "..." ? (
                      <PaginationItem key={`ell-${i}`}><PaginationEllipsis /></PaginationItem>
                    ) : (
                      <PaginationItem key={page}>
                        <PaginationLink onClick={() => setCurrentPage(page as number)} isActive={currentPage === page}>
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    )
                  ))}
                  <PaginationItem>
                    <PaginationNext onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}