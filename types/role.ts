export interface Role {
  id: string;
  name: string;
  description: string;
  parentId?: string;
  shareDataWithPeers: boolean;
  level: number;
  children: Role[];
  isExpanded?: boolean;
}

export interface RoleFormData {
  name: string;
  description: string;
  parentId?: string;
  shareDataWithPeers: boolean;
}

export interface User {
  name: string;
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  avatar?: string;
  department?: string;
  unitAssignments?: UserUnitAssignment[];
}

export interface UserUnitAssignment {
  id: string;
  userId: string;
  unitId: string;
  roleId: string;
  user?: User;
  unit?: OrganizationUnit;
  role?: Role;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserAssignment {
  userName: string;
  userId: string;
  roleId: string;
}

export interface OrganizationUnit {
  id: string;
  name: string;
  description: string;
  parentId?: string;
  level: number;
  children: OrganizationUnit[];
  isExpanded?: boolean;
  assignedRoles?: string[];
  assignedUsers?: UserAssignment[];
  unitRoles?: UnitRoleAssignment[];
  userAssignments?: UserUnitAssignment[];
}

export interface UnitRoleAssignment {
  id: string;
  unitId: string;
  roleId: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationUnitFormData {
  name: string;
  description: string;
  parentId?: string;
  assignedRoles?: string[];
  assignedUsers?: UserAssignment[];
}
