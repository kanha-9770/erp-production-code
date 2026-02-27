"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { UserPlus, UserMinus, Mail, Calendar } from "lucide-react"

interface User {
  id: string
  email: string
  firstName?: string
  lastName?: string
  avatar?: string
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "PENDING"
  joinDate?: string
  department?: string
}

interface Role {
  id: string
  name: string
  description?: string
  level: number
  isActive: boolean
  userCount: number
}

interface UserRoleAssignment {
  userId: string
  roleId: string
  unitId?: string
  notes?: string
  createdAt: string
}

interface UserRoleAssignmentsProps {
  searchTerm: string
  selectedRole: string | null
  onRoleSelect: (roleId: string | null) => void
}

export function UserRoleAssignments({ searchTerm, selectedRole, onRoleSelect }: UserRoleAssignmentsProps) {
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [assignments, setAssignments] = useState<UserRoleAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [showAssignDialog, setShowAssignDialog] = useState(false)

  // Mock data - replace with actual API calls
  useEffect(() => {
    const mockUsers: User[] = [
      {
        id: "u1",
        email: "admin@company.com",
        firstName: "John",
        lastName: "Admin",
        status: "ACTIVE",
        joinDate: "2023-01-15",
        department: "IT",
      },
      {
        id: "u2",
        email: "manager@company.com",
        firstName: "Sarah",
        lastName: "Manager",
        status: "ACTIVE",
        joinDate: "2023-02-20",
        department: "Operations",
      },
      {
        id: "u3",
        email: "user1@company.com",
        firstName: "Mike",
        lastName: "Johnson",
        status: "ACTIVE",
        joinDate: "2023-03-10",
        department: "Sales",
      },
      {
        id: "u4",
        email: "user2@company.com",
        firstName: "Emily",
        lastName: "Davis",
        status: "ACTIVE",
        joinDate: "2023-04-05",
        department: "Marketing",
      },
      {
        id: "u5",
        email: "analyst@company.com",
        firstName: "David",
        lastName: "Wilson",
        status: "ACTIVE",
        joinDate: "2023-05-12",
        department: "Analytics",
      },
    ]

    const mockRoles: Role[] = [
      { id: "r1", name: "Super Admin", description: "Full system access", level: 0, isActive: true, userCount: 2 },
      {
        id: "r2",
        name: "Organization Admin",
        description: "Organization-level admin",
        level: 1,
        isActive: true,
        userCount: 5,
      },
      {
        id: "r3",
        name: "Form Manager",
        description: "Form creation and management",
        level: 2,
        isActive: true,
        userCount: 12,
      },
      {
        id: "r4",
        name: "User Manager",
        description: "User management permissions",
        level: 2,
        isActive: true,
        userCount: 8,
      },
      { id: "r5", name: "Viewer", description: "Read-only access", level: 3, isActive: true, userCount: 45 },
      {
        id: "r6",
        name: "Report Analyst",
        description: "Reporting and analytics",
        level: 2,
        isActive: true,
        userCount: 6,
      },
    ]

    const mockAssignments: UserRoleAssignment[] = [
      { userId: "u1", roleId: "r1", createdAt: "2023-01-15", notes: "System administrator" },
      { userId: "u2", roleId: "r2", createdAt: "2023-02-20", notes: "Operations manager" },
      { userId: "u2", roleId: "r4", createdAt: "2023-02-20", notes: "Also manages users" },
      { userId: "u3", roleId: "r5", createdAt: "2023-03-10" },
      { userId: "u4", roleId: "r5", createdAt: "2023-04-05" },
      { userId: "u5", roleId: "r6", createdAt: "2023-05-12", notes: "Data analyst" },
    ]

    setUsers(mockUsers)
    setRoles(mockRoles)
    setAssignments(mockAssignments)
    setLoading(false)
  }, [])

  const getUsersForRole = (roleId: string) => {
    const userIds = assignments.filter((a) => a.roleId === roleId).map((a) => a.userId)
    return users.filter((u) => userIds.includes(u.id))
  }

  const getRolesForUser = (userId: string) => {
    const roleIds = assignments.filter((a) => a.userId === userId).map((a) => a.roleId)
    return roles.filter((r) => roleIds.includes(r.id))
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "bg-green-100 text-green-800"
      case "INACTIVE":
        return "bg-gray-100 text-gray-800"
      case "SUSPENDED":
        return "bg-red-100 text-red-800"
      case "PENDING":
        return "bg-yellow-100 text-yellow-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const filteredRoles = roles.filter(
    (role) =>
      role.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      role.description?.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const filteredUsers = users.filter(
    (user) =>
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      `${user.firstName} ${user.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.department?.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Roles and their users */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Roles & Assigned Users</h3>
            <Button size="sm">
              <UserPlus className="h-4 w-4 mr-2" />
              Assign User
            </Button>
          </div>

          <ScrollArea className="h-[500px]">
            <div className="space-y-4">
              {filteredRoles.map((role) => (
                <div
                  key={role.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${selectedRole === role.id ? "border-primary bg-primary/5" : "hover:bg-gray-50"
                    }`}
                  onClick={() => onRoleSelect(selectedRole === role.id ? null : role.id)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-medium">{role.name}</h4>
                      <p className="text-sm text-muted-foreground">{role.description}</p>
                    </div>
                    <Badge variant={role.isActive ? "default" : "secondary"}>
                      {getUsersForRole(role.id).length} users
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    {getUsersForRole(role.id).map((user) => (
                      <div key={user.id} className="flex items-center space-x-3 p-2 bg-white rounded border">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={user.avatar || "/placeholder.svg"} />
                          <AvatarFallback>
                            {user.firstName?.[0]}
                            {user.lastName?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-medium truncate">
                              {user.firstName} {user.lastName}
                            </span>
                            <Badge variant="outline" className={getStatusColor(user.status)}>
                              {user.status}
                            </Badge>
                          </div>
                          <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            <span className="truncate">{user.email}</span>
                            {user.department && (
                              <>
                                <span>•</span>
                                <span>{user.department}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <Button variant="ghost" size="sm">
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    {getUsersForRole(role.id).length === 0 && (
                      <div className="text-sm text-muted-foreground text-center py-4">
                        No users assigned to this role
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Users and their roles */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Users & Their Roles</h3>
            <Select>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                <SelectItem value="IT">IT</SelectItem>
                <SelectItem value="Operations">Operations</SelectItem>
                <SelectItem value="Sales">Sales</SelectItem>
                <SelectItem value="Marketing">Marketing</SelectItem>
                <SelectItem value="Analytics">Analytics</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <ScrollArea className="h-[500px]">
            <div className="space-y-4">
              {filteredUsers.map((user) => (
                <div key={user.id} className="p-4 border rounded-lg">
                  <div className="flex items-center space-x-3 mb-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={user.avatar || "/placeholder.svg"} />
                      <AvatarFallback>
                        {user.firstName?.[0]}
                        {user.lastName?.[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">
                          {user.firstName} {user.lastName}
                        </span>
                        <Badge variant="outline" className={getStatusColor(user.status)}>
                          {user.status}
                        </Badge>
                      </div>
                      <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                        <Mail className="h-3 w-3" />
                        <span>{user.email}</span>
                        {user.department && (
                          <>
                            <span>•</span>
                            <span>{user.department}</span>
                          </>
                        )}
                        {user.joinDate && (
                          <>
                            <span>•</span>
                            <Calendar className="h-3 w-3" />
                            <span>Joined {new Date(user.joinDate).toLocaleDateString()}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium">Assigned Roles:</div>
                    <div className="flex flex-wrap gap-2">
                      {getRolesForUser(user.id).map((role) => (
                        <Badge key={role.id} variant="secondary">
                          {role.name}
                        </Badge>
                      ))}
                      {getRolesForUser(user.id).length === 0 && (
                        <span className="text-sm text-muted-foreground">No roles assigned</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-end space-x-2 mt-3">
                    <Button variant="outline" size="sm">
                      Edit Roles
                    </Button>
                    <Button variant="outline" size="sm">
                      View Permissions
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}
