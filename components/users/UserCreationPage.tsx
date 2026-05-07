"use client";
import React, { useState, useEffect, useCallback } from "react";
import {
  User,
  Plus,
  Eye,
  EyeOff,
  Search,
  Check,
  X,
  UserPlus,
  Users,
  Loader2,
  RefreshCw,
  AlertTriangle,
  List,
  Mail,
  Shield,
  Phone,
  Building2,
  MapPin,
  CalendarDays,
  AtSign,
  Pencil,
  Trash2,
  Save,
} from "lucide-react";
import {
  useCreateUserFromEmployeeMutation,
  useGetAdminUsersQuery,
  useUpdateUserMutation,
  useDeleteUserMutation,
  type AdminUser,
} from "@/lib/api/users";
import { useToast } from "@/hooks/use-toast";

interface EmployeeRecord {
  id: string;
  employee_id: string;
  recordData: any;
  submittedAt: string;
  parsedData: {
    companyName?: string;
    employeeId?: string;
    employeeName?: string;
    email?: string;
    department?: string;
    designation?: string;
    phone?: string;
    status?: string;
    gender?: string;
    dob?: string;
    nativePlace?: string;
    country?: string;
    permanentAddress?: string;
    currentAddress?: string;
    alternateNo1?: string;
    alternateNo2?: string;
    emailAddress2?: string;
    bankName?: string;
    bankAccountNo?: string;
    ifscCode?: string;
    shiftType?: string;
    inTime?: string;
    outTime?: string;
    dateOfJoining?: string;
    dateOfLeaving?: string;
    incrementMonth?: string;
    yearsOfAgreement?: string;
    bonusAfterYears?: string;
    totalSalary?: string;
    givenSalary?: string;
    bonusAmount?: string;
    nightAllowance?: string;
    overTime?: string;
    oneHourExtra?: string;
    companySimIssue?: boolean;
    aadharCardNo?: string;
    [key: string]: string | boolean | undefined;
  };
  // API status fields
  processStatus?: "valid" | "warning" | "skipped";
  reason?: string;
  // UI-only fields
  selected?: boolean;
  uiStatus?: "idle" | "pending" | "success" | "error";
  uiMessage?: string;
  bulkPassword?: string;
  bulkRoleId?: string;
  bulkUnitId?: string;
}

interface OrgRole {
  id: string;
  name: string;
  isAdmin?: boolean;
  level: number;
  children: OrgRole[];
}

interface OrgUnit {
  id: string;
  name: string;
  level: number;
  children: OrgUnit[];
}

interface CreateUserData {
  employeeRecordId: string;
  employee_id: string;
  employeeName: string;
  email: string;
  password: string;
}

const UserCreationPage: React.FC = () => {
  // ── State ──────────────────────────────────────────────────────────
  const { toast } = useToast();
  const [employeeRecords, setEmployeeRecords] = useState<EmployeeRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<EmployeeRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<EmployeeRecord | null>(null);
  const [bulkPassword, setBulkPassword] = useState("");
  const [showBulkPassword, setShowBulkPassword] = useState(false);
  const [showSinglePassword, setShowSinglePassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [creating, setCreating] = useState(false);

  const [loadingRecords, setLoadingRecords] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [showUserListDrawer, setShowUserListDrawer] = useState(false);
  const [userListSearch, setUserListSearch] = useState("");
  const [editingExistingUser, setEditingExistingUser] = useState<AdminUser | null>(null);
  const [editUserForm, setEditUserForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    department: "",
    employeeEngagementTeamName: "",
    location: "",
    status: "active",
    password: "",
    confirmPassword: "",
    roleId: "",
    unitId: "",
  });
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [showEditConfirmPassword, setShowEditConfirmPassword] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [updateUser, { isLoading: savingUser }] = useUpdateUserMutation();
  const [deleteUser] = useDeleteUserMutation();

  const {
    data: adminUsersResp,
    isFetching: loadingUsers,
    refetch: refetchUsers,
  } = useGetAdminUsersQuery(undefined, { skip: !showUserListDrawer });

  const startEditUser = (u: AdminUser) => {
    setEditingExistingUser(u);
    const firstAssignment = u.unitsAndRoles?.[0] || u.unitAssignments?.[0];
    setEditUserForm({
      first_name: u.first_name || "",
      last_name: u.last_name || "",
      email: u.email || "",
      phone: u.phone || u.mobile || "",
      department: u.department || "",
      employeeEngagementTeamName: u.employeeEngagementTeamName || "",
      location: u.location || "",
      status: u.status || "active",
      password: "",
      confirmPassword: "",
      roleId: firstAssignment?.role?.id || "",
      unitId: firstAssignment?.unit?.id || "",
    });
    // Close drawer & exit conflicting modes so the right panel is visible
    setShowUserListDrawer(false);
    setBulkMode(false);
    setSelectedRecord(null);
  };

  const cancelEditUser = () => {
    setEditingExistingUser(null);
    setEditUserForm({
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      department: "",
      employeeEngagementTeamName: "",
      location: "",
      status: "active",
      password: "",
      confirmPassword: "",
      roleId: "",
      unitId: "",
    });
    setShowEditPassword(false);
    setShowEditConfirmPassword(false);
  };

  const saveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExistingUser) return;

    if (!editUserForm.first_name.trim() || !editUserForm.email.trim()) {
      toast({ title: "Validation Error", description: "First name and email are required", variant: "destructive" });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editUserForm.email)) {
      toast({ title: "Validation Error", description: "Invalid email format", variant: "destructive" });
      return;
    }
    const pw = editUserForm.password.trim();
    if (pw) {
      if (pw.length < 8) {
        toast({ title: "Validation Error", description: "Password must be at least 8 characters", variant: "destructive" });
        return;
      }
      if (pw !== editUserForm.confirmPassword.trim()) {
        toast({ title: "Validation Error", description: "Passwords do not match", variant: "destructive" });
        return;
      }
    }

    if (editUserForm.roleId && !editUserForm.unitId) {
      toast({ title: "Validation Error", description: "Select a unit to assign with the role", variant: "destructive" });
      return;
    }

    const body: Record<string, any> = {
      first_name: editUserForm.first_name.trim(),
      last_name: editUserForm.last_name.trim(),
      email: editUserForm.email.trim(),
      phone: editUserForm.phone.trim(),
      department: editUserForm.department.trim(),
      location: editUserForm.location.trim(),
      status: editUserForm.status,
      employeeData: {
        employeeEngagementTeamName:
          editUserForm.employeeEngagementTeamName.trim() || null,
      },
      ...(editUserForm.roleId && editUserForm.unitId && {
        roleId: editUserForm.roleId,
        unitId: editUserForm.unitId,
      }),
    };
    if (pw) body.password = pw;

    try {
      await updateUser({ userId: editingExistingUser.id, body }).unwrap();
      toast({ title: "User Updated", description: "Changes saved successfully" });
      cancelEditUser();
    } catch (err: any) {
      const detail = err?.data?.error || err?.data?.message || err?.message || "Update failed";
      toast({ title: "Update Failed", description: detail, variant: "destructive" });
    }
  };

  const handleDeleteUser = async (u: AdminUser) => {
    const name = u.fullName || u.username || u.email;
    if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return;
    setDeletingUserId(u.id);
    try {
      await deleteUser(u.id).unwrap();
      toast({ title: "User Deleted", description: `${name} has been removed` });
      if (showUserListDrawer) refetchUsers();
    } catch (err: any) {
      const detail = err?.data?.error || err?.data?.message || err?.message || "Delete failed";
      toast({ title: "Delete Failed", description: detail, variant: "destructive" });
    } finally {
      setDeletingUserId(null);
    }
  };

  const editPasswordsMatch =
    editUserForm.password.trim() === editUserForm.confirmPassword.trim() &&
    editUserForm.confirmPassword.trim() !== "";
  const adminUsers = adminUsersResp?.data || [];
  const filteredUsers = userListSearch
    ? adminUsers.filter((u) => {
        const q = userListSearch.toLowerCase();
        return (
          u.fullName?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q) ||
          u.username?.toLowerCase().includes(q) ||
          u.department?.toLowerCase().includes(q) ||
          u.phone?.toLowerCase().includes(q) ||
          u.mobile?.toLowerCase().includes(q) ||
          u.unitsAndRoles?.some((ur) => ur.role?.name?.toLowerCase().includes(q))
        );
      })
    : adminUsers;

  // Role & Unit data for assignment
  const [roles, setRoles] = useState<OrgRole[]>([]);
  const [units, setUnits] = useState<OrgUnit[]>([]);
  const [defaultRoleId, setDefaultRoleId] = useState("");
  const [defaultUnitId, setDefaultUnitId] = useState("");

  const [formData, setFormData] = useState<CreateUserData & { confirmPassword: string; roleId: string; unitId: string }>({
    employeeRecordId: "",
    employee_id: "",
    employeeName: "",
    email: "",
    password: "",
    confirmPassword: "",
    roleId: "",
    unitId: "",
  });

  const [createUserFromEmployee] = useCreateUserFromEmployeeMutation();

  // ── Fetch employee records directly (reliable) ─────────────────────
  const fetchEmployeeRecords = useCallback(async () => {
    setLoadingRecords(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/employee-records", {
        method: "GET",
        credentials: "include",
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        throw new Error(errorBody?.error || errorBody?.message || `HTTP ${res.status}: ${res.statusText}`);
      }

      const json = await res.json();

      const usable = Array.isArray(json.records) ? json.records : [];
      const all = Array.isArray(json.allProcessedRecords) ? json.allProcessedRecords : [];
      const dataArr = Array.isArray(json.data) ? json.data : [];
      const records: any[] = all.length > 0 ? all : usable.length > 0 ? usable : dataArr;

      console.log(`[UserCreationPage] records: ${usable.length}, allProcessed: ${all.length}, using ${records.length} items`);

      if (!Array.isArray(records)) {
        throw new Error("Unexpected response: records is not an array");
      }

      // Filter out records where a user already exists with that email
      const available = records.filter((r: any) => {
        if (r.processStatus === "skipped" && r.reason?.includes("User already exists")) return false;
        return true;
      });

      const mapped: EmployeeRecord[] = available.map((r: any) => ({
        ...r,
        selected: false,
        uiStatus: "idle" as const,
        uiMessage: "",
      }));

      setEmployeeRecords(mapped);
      setFetchError(null);
      if (mapped.length === 0) {
        setFetchError("API returned 0 employee records. Verify records exist in FormRecord14 with status='submitted' for your organization.");
      }
    } catch (err: any) {
      console.error("[UserCreationPage] Fetch error:", err);
      setFetchError(err?.message || "Unknown error fetching employee records");
      setEmployeeRecords([]);
    } finally {
      setLoadingRecords(false);
    }
  }, []);

  // Fetch roles and units for the org
  const fetchRolesAndUnits = useCallback(async () => {
    try {
      const meRes = await fetch("/api/auth/me", { credentials: "include" });
      if (!meRes.ok) return;
      const me = await meRes.json();
      const orgId = me?.user?.organizationId || me?.user?.organization?.id;
      if (!orgId) return;

      const [rolesRes, unitsRes] = await Promise.all([
        fetch(`/api/organizations/${orgId}/roles`, { credentials: "include" }),
        fetch(`/api/organizations/${orgId}/units`, { credentials: "include" }),
      ]);

      if (rolesRes.ok) {
        const rolesData = await rolesRes.json();
        const flat = Array.isArray(rolesData) ? rolesData : rolesData?.data || [];
        setRoles(flat);
      }
      if (unitsRes.ok) {
        const unitsData = await unitsRes.json();
        const flat = Array.isArray(unitsData) ? unitsData : unitsData?.data || [];
        setUnits(flat);
      }
    } catch (err) {
      console.error("[UserCreationPage] Failed to fetch roles/units:", err);
    }
  }, []);

  // Flatten hierarchical roles/units for dropdowns
  const flattenTree = <T extends { name: string; level: number; children: T[] }>(items: T[]): T[] => {
    const result: T[] = [];
    const walk = (list: T[]) => {
      for (const item of list) {
        result.push(item);
        if (item.children?.length) walk(item.children);
      }
    };
    walk(items);
    return result;
  };

  const flatRoles = flattenTree(roles).filter((r) => !r.isAdmin);
  const flatUnits = flattenTree(units);

  // Initial load
  useEffect(() => {
    fetchEmployeeRecords();
    fetchRolesAndUnits();
  }, [fetchEmployeeRecords, fetchRolesAndUnits]);

  // ── Filter logic ───────────────────────────────────────────────────
  useEffect(() => {
    if (!searchTerm) {
      setFilteredRecords(employeeRecords);
      return;
    }
    const q = searchTerm.toLowerCase();
    setFilteredRecords(
      employeeRecords.filter(
        (r) =>
          r.parsedData?.employeeName?.toLowerCase().includes(q) ||
          r.parsedData?.email?.toLowerCase().includes(q) ||
          r.parsedData?.department?.toLowerCase().includes(q) ||
          r.parsedData?.designation?.toLowerCase().includes(q) ||
          (r.parsedData?.employeeId || r.employee_id || "").toLowerCase().includes(q)
      )
    );
  }, [searchTerm, employeeRecords]);

  // ── Handlers ───────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setEmployeeRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r))
    );
  };

  const selectSingle = (record: EmployeeRecord) => {
    setSelectedRecord(record);
    setFormData({
      employeeRecordId: record.id,
      employee_id: record.parsedData?.employeeId || record.employee_id || "",
      employeeName: record.parsedData?.employeeName || "",
      email: record.parsedData?.email || "",
      password: "",
      confirmPassword: "",
      roleId: "",
      unitId: "",
    });
    setBulkMode(false);
  };

  const handleSingleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const validateSingle = (): boolean => {
    if (!formData.employee_id || !formData.employeeName || !formData.email || !formData.password) {
      toast({ title: "Validation Error", description: "Fill all required fields", variant: "destructive" });
      return false;
    }
    const pass = formData.password.trim();
    const conf = formData.confirmPassword.trim();
    if (!conf) {
      toast({ title: "Validation Error", description: "Please enter confirm password", variant: "destructive" });
      return false;
    }
    if (pass !== conf) {
      toast({ title: "Validation Error", description: "Passwords do not match", variant: "destructive" });
      return false;
    }
    if (pass.length < 8) {
      toast({ title: "Validation Error", description: "Password must be at least 8 characters", variant: "destructive" });
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      toast({ title: "Validation Error", description: "Invalid email format", variant: "destructive" });
      return false;
    }
    return true;
  };

  const createSingleUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateSingle()) return;

    setCreating(true);
    try {
      await createUserFromEmployee({
        ...formData,
        password: formData.password.trim(),
        ...(formData.roleId && { roleId: formData.roleId }),
        ...(formData.unitId && { unitId: formData.unitId }),
      }).unwrap();

      toast({ title: "User Created", description: `Account for ${formData.employeeName} created successfully` });
      setFormData((prev) => ({ ...prev, password: "", confirmPassword: "" }));
      fetchEmployeeRecords();
      setSelectedRecord(null);
    } catch (err: any) {
      const detail = err?.data?.error || err?.data?.message || err?.message || "Server error";
      toast({ title: "Creation Failed", description: detail, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const createBulkUsers = async () => {
    const selected = employeeRecords.filter((r) => r.selected);
    if (selected.length === 0) {
      toast({ title: "No Selection", description: "Select at least one employee record", variant: "destructive" });
      return;
    }

    // Validate every selected record has a password
    const missing = selected.filter((r) => !r.bulkPassword || r.bulkPassword.trim().length < 8);
    if (missing.length > 0) {
      toast({
        title: "Missing Passwords",
        description: `${missing.length} selected user(s) need a password (min 8 chars)`,
        variant: "destructive",
      });
      return;
    }

    if (!confirm(`Create ${selected.length} users with individual passwords?`)) return;

    setCreating(true);

    let successCount = 0;
    let failCount = 0;

    setEmployeeRecords((prev) =>
      prev.map((r) => (r.selected ? { ...r, uiStatus: "pending", uiMessage: "Processing..." } : r))
    );

    for (const record of selected) {
      const pw = (record.bulkPassword || "").trim();
      try {
        await createUserFromEmployee({
          employeeRecordId: record.id,
          employee_id: record.parsedData?.employeeId || record.employee_id || "",
          employeeName: record.parsedData?.employeeName || "",
          email: record.parsedData?.email || "",
          password: pw,
          confirmPassword: pw,
          ...(record.bulkRoleId && { roleId: record.bulkRoleId }),
          ...(record.bulkUnitId && { unitId: record.bulkUnitId }),
        }).unwrap();

        successCount++;
        setEmployeeRecords((prev) =>
          prev.map((r) =>
            r.id === record.id ? { ...r, uiStatus: "success", uiMessage: "Created", selected: false, bulkPassword: "" } : r
          )
        );
      } catch (err: any) {
        failCount++;
        const detail = err?.data?.error || err?.data?.message || "Failed";
        setEmployeeRecords((prev) =>
          prev.map((r) =>
            r.id === record.id ? { ...r, uiStatus: "error", uiMessage: detail, selected: false } : r
          )
        );
      }
    }

    setCreating(false);
    setBulkPassword("");

    if (successCount > 0 && failCount === 0) {
      toast({ title: "Bulk Creation Complete", description: `All ${successCount} users created successfully` });
    } else if (successCount > 0 && failCount > 0) {
      toast({ title: "Partially Complete", description: `${successCount} created, ${failCount} failed — check errors below`, variant: "destructive" });
    } else {
      toast({ title: "Bulk Creation Failed", description: `All ${failCount} users failed to create`, variant: "destructive" });
    }

    if (successCount > 0) fetchEmployeeRecords();
  };

  const selectAll = () => setEmployeeRecords((prev) => prev.map((r) => ({ ...r, selected: true })));
  const deselectAll = () => setEmployeeRecords((prev) => prev.map((r) => ({ ...r, selected: false })));
  const selectedCount = employeeRecords.filter((r) => r.selected).length;

  const setBulkPasswordForRecord = (id: string, pw: string) => {
    setEmployeeRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, bulkPassword: pw } : r))
    );
  };

  const setBulkRoleForRecord = (id: string, roleId: string) => {
    setEmployeeRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, bulkRoleId: roleId } : r))
    );
  };

  const setBulkUnitForRecord = (id: string, unitId: string) => {
    setEmployeeRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, bulkUnitId: unitId } : r))
    );
  };

  const applyPasswordToAllSelected = () => {
    if (!bulkPassword || bulkPassword.length < 8) {
      toast({ title: "Invalid Password", description: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    setEmployeeRecords((prev) =>
      prev.map((r) => (r.selected ? { ...r, bulkPassword: bulkPassword } : r))
    );
    toast({ title: "Password Applied", description: `Password set for all ${selectedCount} selected users` });
  };

  const applyRoleUnitToAllSelected = () => {
    if (!defaultRoleId && !defaultUnitId) {
      toast({ title: "Nothing to Apply", description: "Select a role or unit first", variant: "destructive" });
      return;
    }
    setEmployeeRecords((prev) =>
      prev.map((r) => (r.selected
        ? { ...r, ...(defaultRoleId && { bulkRoleId: defaultRoleId }), ...(defaultUnitId && { bulkUnitId: defaultUnitId }) }
        : r
      ))
    );
    const parts = [];
    if (defaultRoleId) parts.push("Role");
    if (defaultUnitId) parts.push("Unit");
    toast({ title: `${parts.join(" & ")} Applied`, description: `Assigned to all ${selectedCount} selected users` });
  };

  // Password match helper for real-time UI feedback
  const passwordsMatch = formData.password.trim() === formData.confirmPassword.trim() && formData.confirmPassword.trim() !== "";

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-3">
              <UserPlus className="w-7 h-7 sm:w-8 sm:h-8 text-blue-600" />
              Create Users from Employee Records
            </h1>
            <p className="text-gray-600 mt-1 text-sm sm:text-base">
              Single or bulk account creation from employee data
            </p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={fetchEmployeeRecords}
              disabled={loadingRecords}
              className="px-3 py-2 rounded-lg font-medium flex items-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
              title="Refresh records"
            >
              <RefreshCw size={16} className={loadingRecords ? "animate-spin" : ""} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={() => setShowUserListDrawer(true)}
              className="px-4 py-2 rounded-lg font-medium flex items-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 transition"
              title="View existing users"
            >
              <List size={18} />
              <span className="hidden sm:inline">User List</span>
            </button>
            <button
              onClick={() => setBulkMode(!bulkMode)}
              className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition flex-1 sm:flex-none justify-center ${
                bulkMode ? "bg-purple-600 text-white hover:bg-purple-700" : "bg-gray-200 hover:bg-gray-300"
              }`}
            >
              <Users size={18} />
              {bulkMode ? "Exit Bulk Mode" : "Bulk Mode"}
            </button>
          </div>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 xl:gap-8">
          {/* Left – Employee Records List */}
          <div className="bg-white rounded-xl shadow-lg p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <User className="w-5 h-5" />
                Employee Records
                {!loadingRecords && employeeRecords.length > 0 && (
                  <span className="text-sm font-normal text-gray-500">
                    ({employeeRecords.length} total, {employeeRecords.filter(r => r.processStatus !== "skipped").length} usable)
                  </span>
                )}
              </h2>

              {bulkMode && employeeRecords.length > 0 && (
                <div className="flex gap-4 text-sm w-full sm:w-auto">
                  <button onClick={selectAll} className="text-blue-600 hover:underline">
                    Select All
                  </button>
                  <button onClick={deselectAll} className="text-blue-600 hover:underline">
                    Clear
                  </button>
                </div>
              )}
            </div>

            {/* Search */}
            {employeeRecords.length > 0 && (
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  placeholder="Search name, email, department, ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            )}

            {/* Records list */}
            <div className="space-y-3 max-h-[60vh] sm:max-h-[70vh] overflow-y-auto">
              {loadingRecords ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-500 gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                  <span className="text-sm font-medium">Loading employee records...</span>
                </div>
              ) : fetchError && employeeRecords.length === 0 ? (
                <div className="text-center py-12">
                  <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
                  <p className="text-gray-700 font-medium mb-2">Could not load records</p>
                  <p className="text-sm text-gray-500 mb-4 max-w-sm mx-auto">{fetchError}</p>
                  <button
                    onClick={fetchEmployeeRecords}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium inline-flex items-center gap-2"
                  >
                    <RefreshCw size={14} />
                    Retry
                  </button>
                </div>
              ) : filteredRecords.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">
                  {searchTerm
                    ? `No records match "${searchTerm}".`
                    : "No employee records found for your organization."}
                </div>
              ) : (
                filteredRecords.map((record) => {
                  const isSelected = bulkMode ? record.selected : selectedRecord?.id === record.id;

                  return (
                    <div
                      key={record.id}
                      onClick={() => (bulkMode ? toggleSelect(record.id) : selectSingle(record))}
                      className={`p-4 border rounded-lg cursor-pointer transition-all flex items-start gap-3 ${
                        isSelected
                          ? "border-blue-500 bg-blue-50 shadow-sm"
                          : record.processStatus === "skipped"
                            ? "border-red-200 bg-red-50/30 hover:border-red-300"
                            : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/50"
                      }`}
                    >
                      {bulkMode && (
                        <input
                          type="checkbox"
                          checked={record.selected}
                          onChange={() => toggleSelect(record.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1.5 flex-shrink-0 h-4 w-4"
                        />
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium truncate">
                            {record.parsedData?.employeeName || "—"}
                          </h3>
                          {record.processStatus === "skipped" && (
                            <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">
                              SKIPPED
                            </span>
                          )}
                          {record.processStatus === "warning" && (
                            <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
                              WARNING
                            </span>
                          )}
                          {record.processStatus === "valid" && (
                            <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-700 border border-green-200">
                              READY
                            </span>
                          )}
                        </div>
                        {record.reason && (
                          <p className="text-xs text-amber-600 mt-0.5">{record.reason}</p>
                        )}
                        <p className="text-sm text-gray-600 truncate">
                          ID: {record.parsedData?.employeeId || record.employee_id || "—"}
                        </p>
                        <p className="text-sm text-gray-600 truncate">
                          {record.parsedData?.email || "No email"}
                        </p>

                        {/* Additional parsed fields */}
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                          {record.parsedData?.department && (
                            <span>Dept: <span className="text-gray-700 font-medium">{record.parsedData.department}</span></span>
                          )}
                          {record.parsedData?.employeeEngagementTeamName && (
                            <span>Team: <span className="text-gray-700 font-medium">{record.parsedData.employeeEngagementTeamName}</span></span>
                          )}
                          {record.parsedData?.designation && (
                            <span>Role: <span className="text-gray-700 font-medium">{record.parsedData.designation}</span></span>
                          )}
                          {record.parsedData?.gender && (
                            <span>Gender: <span className="text-gray-700 font-medium">{record.parsedData.gender}</span></span>
                          )}
                          {record.parsedData?.phone && (
                            <span>Phone: <span className="text-gray-700 font-medium">{record.parsedData.phone}</span></span>
                          )}
                          {record.parsedData?.totalSalary && record.parsedData.totalSalary !== "0.00" && (
                            <span>Salary: <span className="text-gray-700 font-medium">₹{record.parsedData.totalSalary}</span></span>
                          )}
                          {record.parsedData?.givenSalary && record.parsedData.givenSalary !== "0.00" && (
                            <span>Net: <span className="text-gray-700 font-medium">₹{record.parsedData.givenSalary}</span></span>
                          )}
                          {record.parsedData?.dateOfJoining && (
                            <span>Joined: <span className="text-gray-700 font-medium">{record.parsedData.dateOfJoining}</span></span>
                          )}
                          {record.parsedData?.shiftType && (
                            <span>Shift: <span className="text-gray-700 font-medium">{record.parsedData.shiftType}</span></span>
                          )}
                          {record.parsedData?.inTime && record.parsedData.inTime !== "false" && (
                            <span>In: <span className="text-gray-700 font-medium">{record.parsedData.inTime}</span></span>
                          )}
                          {record.parsedData?.outTime && record.parsedData.outTime !== "false" && (
                            <span>Out: <span className="text-gray-700 font-medium">{record.parsedData.outTime}</span></span>
                          )}
                          {record.parsedData?.companyName && (
                            <span>Company: <span className="text-gray-700 font-medium">{record.parsedData.companyName}</span></span>
                          )}
                          {record.parsedData?.bankName && (
                            <span>Bank: <span className="text-gray-700 font-medium">{record.parsedData.bankName}</span></span>
                          )}
                          {record.parsedData?.nativePlace && (
                            <span>Native: <span className="text-gray-700 font-medium">{record.parsedData.nativePlace}</span></span>
                          )}
                          {record.parsedData?.country && (
                            <span>Country: <span className="text-gray-700 font-medium">{record.parsedData.country}</span></span>
                          )}
                          {record.parsedData?.overTime && record.parsedData.overTime !== "0.00" && (
                            <span>OT: <span className="text-gray-700 font-medium">₹{record.parsedData.overTime}</span></span>
                          )}
                          {record.parsedData?.status && (
                            <span>Status: <span className="text-gray-700 font-medium">{record.parsedData.status}</span></span>
                          )}
                        </div>

                        {/* Bulk creation status indicator */}
                        {record.uiStatus && record.uiStatus !== "idle" && (
                          <div className="mt-2 text-xs flex items-center gap-1.5">
                            {record.uiStatus === "pending" && <Loader2 className="animate-spin" size={14} />}
                            {record.uiStatus === "success" && <Check size={14} className="text-green-600" />}
                            {record.uiStatus === "error" && <X size={14} className="text-red-600" />}
                            <span className={record.uiStatus === "error" ? "text-red-700" : "text-gray-600"}>
                              {record.uiMessage}
                            </span>
                          </div>
                        )}
                      </div>

                      {isSelected && !bulkMode && (
                        <Check className="text-blue-600 mt-1 flex-shrink-0" size={20} />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right – Form area */}
          <div className="bg-white rounded-xl shadow-lg p-5 sm:p-6">
            {editingExistingUser ? (
              <>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Pencil className="w-5 h-5" />
                    Edit User
                  </h2>
                  <button
                    onClick={cancelEditUser}
                    className="text-gray-500 hover:text-red-600 self-end sm:self-auto"
                    title="Cancel edit"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs text-blue-700">
                    Editing: <span className="font-semibold">{editingExistingUser.fullName || editingExistingUser.email}</span>
                    {editingExistingUser.username && (
                      <span className="text-blue-500"> · @{editingExistingUser.username}</span>
                    )}
                  </p>
                </div>

                <form onSubmit={saveEditUser} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        First Name
                      </label>
                      <input
                        value={editUserForm.first_name}
                        onChange={(e) => setEditUserForm({ ...editUserForm, first_name: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Last Name
                      </label>
                      <input
                        value={editUserForm.last_name}
                        onChange={(e) => setEditUserForm({ ...editUserForm, last_name: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={editUserForm.email}
                      onChange={(e) => setEditUserForm({ ...editUserForm, email: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Phone
                      </label>
                      <input
                        value={editUserForm.phone}
                        onChange={(e) => setEditUserForm({ ...editUserForm, phone: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Department
                      </label>
                      <input
                        value={editUserForm.department}
                        onChange={(e) => setEditUserForm({ ...editUserForm, department: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Employee Engagement Team Name
                    </label>
                    <input
                      value={editUserForm.employeeEngagementTeamName}
                      onChange={(e) => setEditUserForm({ ...editUserForm, employeeEngagementTeamName: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Pulled from employee record — editable"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                        <Shield className="w-4 h-4" />
                        Role
                      </label>
                      <select
                        value={editUserForm.roleId}
                        onChange={(e) => setEditUserForm({ ...editUserForm, roleId: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">No role</option>
                        {flatRoles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {"—".repeat(r.level)} {r.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                        <Building2 className="w-4 h-4" />
                        Unit
                      </label>
                      <select
                        value={editUserForm.unitId}
                        onChange={(e) => setEditUserForm({ ...editUserForm, unitId: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">No unit</option>
                        {flatUnits.map((u) => (
                          <option key={u.id} value={u.id}>
                            {"—".repeat(u.level)} {u.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {editUserForm.roleId && !editUserForm.unitId && (
                    <p className="text-xs text-amber-600 -mt-3">
                      Select a unit to apply this role assignment.
                    </p>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Location
                      </label>
                      <input
                        value={editUserForm.location}
                        onChange={(e) => setEditUserForm({ ...editUserForm, location: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Status
                      </label>
                      <select
                        value={editUserForm.status}
                        onChange={(e) => setEditUserForm({ ...editUserForm, status: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="pending">Pending</option>
                        <option value="suspended">Suspended</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-2 border-t">
                    <p className="text-xs text-gray-500 mb-2">Reset Password (optional — leave blank to keep current)</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          New Password
                        </label>
                        <div className="relative">
                          <input
                            type={showEditPassword ? "text" : "password"}
                            value={editUserForm.password}
                            onChange={(e) => setEditUserForm({ ...editUserForm, password: e.target.value })}
                            className="w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-blue-500"
                            minLength={8}
                            placeholder="Min 8 characters"
                          />
                          <button
                            type="button"
                            onClick={() => setShowEditPassword(!showEditPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                          >
                            {showEditPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Confirm Password
                        </label>
                        <div className="relative">
                          <input
                            type={showEditConfirmPassword ? "text" : "password"}
                            value={editUserForm.confirmPassword}
                            onChange={(e) => setEditUserForm({ ...editUserForm, confirmPassword: e.target.value })}
                            className={`w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                              editUserForm.confirmPassword && !editPasswordsMatch ? "border-red-500" : ""
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => setShowEditConfirmPassword(!showEditConfirmPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                          >
                            {showEditConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                        {editUserForm.confirmPassword && !editPasswordsMatch && (
                          <p className="text-red-500 text-xs mt-1">Passwords do not match</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="submit"
                      disabled={savingUser}
                      className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {savingUser ? (
                        <>
                          <Loader2 className="animate-spin" size={18} />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save size={18} />
                          Save Changes
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditUser}
                      disabled={savingUser}
                      className="px-6 bg-gray-200 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-300 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </>
            ) : bulkMode ? (
              <>
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Bulk Create Users ({selectedCount} selected)
                </h2>

                {selectedCount === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>Select employees on the left to create accounts in bulk</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Quick-fill section */}
                    <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg space-y-3">
                      <label className="block text-xs font-semibold text-purple-800">
                        Quick fill — apply to all selected
                      </label>
                      {/* Password quick-fill */}
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <input
                            type={showBulkPassword ? "text" : "password"}
                            value={bulkPassword}
                            onChange={(e) => setBulkPassword(e.target.value)}
                            placeholder="Password (min 8 chars)"
                            className="w-full px-3 py-1.5 pr-9 border border-purple-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500 bg-white"
                          />
                          <button
                            type="button"
                            onClick={() => setShowBulkPassword(!showBulkPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                            {showBulkPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                        <button
                          onClick={applyPasswordToAllSelected}
                          disabled={!bulkPassword || bulkPassword.length < 8}
                          className="px-3 py-1.5 bg-purple-600 text-white text-xs font-medium rounded-md hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                        >
                          Apply
                        </button>
                      </div>
                      {/* Role & Unit quick-fill */}
                      <div className="flex gap-2">
                        <select
                          value={defaultRoleId}
                          onChange={(e) => setDefaultRoleId(e.target.value)}
                          className="flex-1 px-2 py-1.5 border border-purple-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-purple-500"
                        >
                          <option value="">Role (optional)</option>
                          {flatRoles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {"—".repeat(r.level)} {r.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={defaultUnitId}
                          onChange={(e) => setDefaultUnitId(e.target.value)}
                          className="flex-1 px-2 py-1.5 border border-purple-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-purple-500"
                        >
                          <option value="">Unit (optional)</option>
                          {flatUnits.map((u) => (
                            <option key={u.id} value={u.id}>
                              {"—".repeat(u.level)} {u.name}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={applyRoleUnitToAllSelected}
                          disabled={!defaultRoleId && !defaultUnitId}
                          className="px-3 py-1.5 bg-purple-600 text-white text-xs font-medium rounded-md hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                        >
                          Apply
                        </button>
                      </div>
                    </div>

                    {/* Per-user config list */}
                    <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                      {employeeRecords
                        .filter((r) => r.selected)
                        .map((record) => {
                          const name = record.parsedData?.employeeName || "—";
                          const email = record.parsedData?.email || "No email";
                          const pw = record.bulkPassword || "";
                          const isValid = pw.length >= 8;
                          const roleName = flatRoles.find((r) => r.id === record.bulkRoleId)?.name;
                          const unitName = flatUnits.find((u) => u.id === record.bulkUnitId)?.name;

                          return (
                            <div
                              key={record.id}
                              className={`p-3 rounded-lg border ${
                                isValid
                                  ? "border-green-200 bg-green-50/40"
                                  : "border-gray-200 bg-gray-50/40"
                              }`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
                                  <p className="text-xs text-gray-500 truncate">{email}</p>
                                </div>
                                {isValid && <Check size={16} className="text-green-600 flex-shrink-0 ml-2" />}
                              </div>
                              {/* Password */}
                              <input
                                type="text"
                                value={pw}
                                onChange={(e) => setBulkPasswordForRecord(record.id, e.target.value)}
                                placeholder="Password (min 8 chars)"
                                className={`w-full px-2.5 py-1.5 text-sm border rounded-md focus:ring-2 focus:ring-purple-500 mb-1.5 ${
                                  pw && !isValid ? "border-red-300 bg-red-50" : isValid ? "border-green-300 bg-white" : "border-gray-300 bg-white"
                                }`}
                              />
                              {/* Role & Unit */}
                              <div className="flex gap-1.5">
                                <select
                                  value={record.bulkRoleId || ""}
                                  onChange={(e) => setBulkRoleForRecord(record.id, e.target.value)}
                                  className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded-md bg-white focus:ring-2 focus:ring-indigo-500"
                                >
                                  <option value="">No role</option>
                                  {flatRoles.map((r) => (
                                    <option key={r.id} value={r.id}>{"—".repeat(r.level)} {r.name}</option>
                                  ))}
                                </select>
                                <select
                                  value={record.bulkUnitId || ""}
                                  onChange={(e) => setBulkUnitForRecord(record.id, e.target.value)}
                                  className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded-md bg-white focus:ring-2 focus:ring-indigo-500"
                                >
                                  <option value="">No unit</option>
                                  {flatUnits.map((u) => (
                                    <option key={u.id} value={u.id}>{"—".repeat(u.level)} {u.name}</option>
                                  ))}
                                </select>
                              </div>
                              {(roleName || unitName) && (
                                <p className="text-[10px] text-indigo-600 mt-1">
                                  {roleName && <span>Role: {roleName}</span>}
                                  {roleName && unitName && <span> · </span>}
                                  {unitName && <span>Unit: {unitName}</span>}
                                </p>
                              )}
                            </div>
                          );
                        })}
                    </div>

                    {/* Summary + Create button */}
                    <div className="pt-2 border-t">
                      <div className="flex justify-between text-xs text-gray-500 mb-3">
                        <span>{employeeRecords.filter((r) => r.selected && r.bulkPassword && r.bulkPassword.length >= 8).length} / {selectedCount} ready</span>
                        <span>{employeeRecords.filter((r) => r.selected && r.bulkRoleId).length} with roles</span>
                      </div>
                      <button
                        onClick={createBulkUsers}
                        disabled={
                          creating ||
                          employeeRecords.filter((r) => r.selected && r.bulkPassword && r.bulkPassword.length >= 8).length === 0
                        }
                        className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {creating ? (
                          <>
                            <Loader2 className="animate-spin" size={18} />
                            Creating users...
                          </>
                        ) : (
                          <>
                            <UserPlus size={18} />
                            Create {selectedCount} Users
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Plus className="w-5 h-5" />
                    Create Single User
                  </h2>
                  {selectedRecord && (
                    <button
                      onClick={() => {
                        setSelectedRecord(null);
                        setFormData({ ...formData, password: "", confirmPassword: "" });
                      }}
                      className="text-gray-500 hover:text-red-600 self-end sm:self-auto"
                    >
                      <X size={20} />
                    </button>
                  )}
                </div>

                {!selectedRecord ? (
                  <div className="text-center py-12 text-gray-500">
                    <User className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>Select an employee record to create account</p>
                  </div>
                ) : (
                  <form onSubmit={createSingleUser} className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Employee ID
                        </label>
                        <input
                          name="employee_id"
                          value={formData.employee_id}
                          onChange={handleSingleChange}
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Record ID
                        </label>
                        <input
                          value={formData.employeeRecordId}
                          disabled
                          className="w-full px-3 py-2 bg-gray-100 border rounded-lg text-gray-600"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Employee Name
                      </label>
                      <input
                        name="employeeName"
                        value={formData.employeeName}
                        onChange={handleSingleChange}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleSingleChange}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Password
                        </label>
                        <div className="relative">
                          <input
                            type={showSinglePassword ? "text" : "password"}
                            name="password"
                            value={formData.password}
                            onChange={handleSingleChange}
                            className="w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-blue-500"
                            required
                            minLength={8}
                          />
                          <button
                            type="button"
                            onClick={() => setShowSinglePassword(!showSinglePassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                          >
                            {showSinglePassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Confirm Password
                        </label>
                        <div className="relative">
                          <input
                            type={showConfirmPassword ? "text" : "password"}
                            name="confirmPassword"
                            value={formData.confirmPassword}
                            onChange={handleSingleChange}
                            className={`w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                              formData.confirmPassword && !passwordsMatch ? "border-red-500" : ""
                            }`}
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                          >
                            {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                        {formData.confirmPassword && !passwordsMatch && (
                          <p className="text-red-500 text-xs mt-1">Passwords do not match</p>
                        )}
                      </div>
                    </div>

                    {/* Role & Unit Assignment */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Role (optional)
                        </label>
                        <select
                          value={formData.roleId}
                          onChange={(e) => setFormData({ ...formData, roleId: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                        >
                          <option value="">No role</option>
                          {flatRoles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {"—".repeat(r.level)} {r.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Unit (optional)
                        </label>
                        <select
                          value={formData.unitId}
                          onChange={(e) => setFormData({ ...formData, unitId: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                        >
                          <option value="">No unit</option>
                          {flatUnits.map((u) => (
                            <option key={u.id} value={u.id}>
                              {"—".repeat(u.level)} {u.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={creating || !passwordsMatch || formData.password.trim().length < 8}
                      className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {creating ? (
                        <>
                          <Loader2 className="animate-spin" size={18} />
                          Creating...
                        </>
                      ) : (
                        <>
                          <UserPlus size={18} />
                          Create User
                        </>
                      )}
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right-side User List Drawer */}
      <div
        className={`fixed inset-0 z-50 transition-opacity duration-300 ${
          showUserListDrawer ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        aria-hidden={!showUserListDrawer}
      >
        <div
          className="absolute inset-0 bg-black/40"
          onClick={() => setShowUserListDrawer(false)}
        />
        <aside
          className={`absolute top-0 right-0 h-full w-full sm:w-[420px] md:w-[480px] bg-white shadow-2xl flex flex-col transform transition-transform duration-300 ease-out ${
            showUserListDrawer ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Users className="w-5 h-5" />
                User List
              </h2>
              <p className="text-xs text-blue-100 mt-0.5">
                {loadingUsers ? "Loading..." : `${adminUsers.length} user${adminUsers.length === 1 ? "" : "s"} total`}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => refetchUsers()}
                disabled={loadingUsers}
                className="p-2 rounded-md hover:bg-white/10 disabled:opacity-50"
                title="Refresh user list"
              >
                <RefreshCw size={16} className={loadingUsers ? "animate-spin" : ""} />
              </button>
              <button
                onClick={() => setShowUserListDrawer(false)}
                className="p-2 rounded-md hover:bg-white/10"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="px-5 py-3 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                placeholder="Search by name, email, department..."
                value={userListSearch}
                onChange={(e) => setUserListSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3">
            {loadingUsers ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-500 gap-3">
                <Loader2 className="h-7 w-7 animate-spin text-blue-500" />
                <span className="text-sm">Loading users...</span>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-sm">
                {userListSearch ? `No users match "${userListSearch}".` : "No users found."}
              </div>
            ) : (
              <ul className="space-y-3">
                {filteredUsers.map((u) => {
                  const displayName = u.fullName || u.username || u.email || "—";
                  const initials = displayName
                    .split(" ")
                    .map((s) => s[0])
                    .filter(Boolean)
                    .slice(0, 2)
                    .join("")
                    .toUpperCase();
                  const isAdmin = u.unitsAndRoles?.some((ur) => ur.role?.isAdmin);
                  const phoneNumber = u.phone || u.mobile;
                  const joinDateStr = u.joinDate
                    ? new Date(u.joinDate).toLocaleDateString()
                    : u.createdAt
                      ? new Date(u.createdAt).toLocaleDateString()
                      : null;

                  const isDeleting = deletingUserId === u.id;

                  return (
                    <li
                      key={u.id}
                      className="p-3 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50/30 transition"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-sm font-semibold flex items-center justify-center overflow-hidden">
                          {u.avatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={u.avatar} alt={displayName} className="w-full h-full object-cover" />
                          ) : (
                            initials
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-gray-900 truncate flex-1 min-w-0">
                              {displayName}
                            </p>
                            {isAdmin && (
                              <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200 flex items-center gap-0.5">
                                <Shield size={10} /> ADMIN
                              </span>
                            )}
                            {u.status && (
                              <span
                                className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase ${
                                  u.status.toLowerCase() === "active"
                                    ? "bg-green-100 text-green-700 border-green-200"
                                    : "bg-gray-100 text-gray-600 border-gray-200"
                                }`}
                              >
                                {u.status}
                              </span>
                            )}
                            <div className="flex items-center gap-1 ml-auto">
                              <button
                                onClick={() => startEditUser(u)}
                                className="p-1.5 rounded-md text-gray-500 hover:text-blue-600 hover:bg-blue-100 transition"
                                title="Edit user"
                                disabled={isDeleting}
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                onClick={() => handleDeleteUser(u)}
                                className="p-1.5 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-100 transition disabled:opacity-50"
                                title="Delete user"
                                disabled={isDeleting}
                              >
                                {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                              </button>
                            </div>
                          </div>

                          <div className="mt-1 space-y-0.5 text-xs">
                            {u.username && (
                              <p className="text-gray-600 truncate flex items-center gap-1.5">
                                <AtSign size={11} className="text-gray-400 flex-shrink-0" />
                                {u.username}
                              </p>
                            )}
                            <p className="text-gray-600 truncate flex items-center gap-1.5">
                              <Mail size={11} className="text-gray-400 flex-shrink-0" />
                              {u.email}
                            </p>
                            {phoneNumber && (
                              <p className="text-gray-600 truncate flex items-center gap-1.5">
                                <Phone size={11} className="text-gray-400 flex-shrink-0" />
                                {phoneNumber}
                              </p>
                            )}
                            {u.department && (
                              <p className="text-gray-600 truncate flex items-center gap-1.5">
                                <Building2 size={11} className="text-gray-400 flex-shrink-0" />
                                {u.department}
                              </p>
                            )}
                            {u.employeeEngagementTeamName && (
                              <p className="text-gray-600 truncate flex items-center gap-1.5">
                                <Users size={11} className="text-gray-400 flex-shrink-0" />
                                {u.employeeEngagementTeamName}
                              </p>
                            )}
                            {u.location && (
                              <p className="text-gray-600 truncate flex items-center gap-1.5">
                                <MapPin size={11} className="text-gray-400 flex-shrink-0" />
                                {u.location}
                              </p>
                            )}
                            {joinDateStr && (
                              <p className="text-gray-600 truncate flex items-center gap-1.5">
                                <CalendarDays size={11} className="text-gray-400 flex-shrink-0" />
                                Joined {joinDateStr}
                              </p>
                            )}
                          </div>

                          {u.unitsAndRoles && u.unitsAndRoles.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {u.unitsAndRoles.map((ur, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200"
                                  title={`${ur.unit?.name || ""} → ${ur.role?.name || ""}`}
                                >
                                  <Shield size={9} />
                                  {ur.role?.name}
                                  {ur.unit?.name && (
                                    <span className="text-indigo-400">· {ur.unit.name}</span>
                                  )}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default UserCreationPage;