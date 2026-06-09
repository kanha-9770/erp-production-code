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
  Briefcase,
  Clock,
  IndianRupee,
  Globe,
  Lock,
  Key,
  ShieldAlert,
  Activity,
  Building,
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
    <div className="min-h-screen bg-slate-50/50 p-4 sm:p-6 md:p-8 text-slate-800">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 pb-6 border-b border-slate-200/80">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-100 shadow-sm shadow-blue-100/50">
                <UserPlus className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
                  User Provisioning Center
                </h1>
                <p className="text-slate-500 mt-1 text-sm sm:text-base">
                  Convert employee records into secure platform accounts, or manage existing credentials.
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2.5 w-full md:w-auto">
            <button
              onClick={fetchEmployeeRecords}
              disabled={loadingRecords}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 hover:border-slate-300 active:scale-[0.98] disabled:opacity-50 transition-all shadow-sm"
              title="Refresh records"
            >
              <RefreshCw size={16} className={loadingRecords ? "animate-spin" : ""} />
              <span>Refresh</span>
            </button>
            <button
              onClick={() => setShowUserListDrawer(true)}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 hover:border-slate-300 active:scale-[0.98] transition-all shadow-sm relative group"
              title="View existing users"
            >
              <List size={16} />
              <span>Active Directory</span>
              {adminUsers.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-600 rounded-full border border-slate-250 group-hover:bg-blue-50 group-hover:text-blue-600 group-hover:border-blue-100 transition-colors">
                  {adminUsers.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setBulkMode(!bulkMode)}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-sm flex-1 md:flex-none active:scale-[0.98] ${
                bulkMode
                  ? "bg-purple-600 text-white hover:bg-purple-700 hover:shadow-purple-100 shadow-md"
                  : "bg-slate-900 text-white hover:bg-slate-800"
              }`}
            >
              <Users size={16} />
              {bulkMode ? "Exit Bulk Mode" : "Bulk Mode"}
            </button>
          </div>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* Left – Employee Records List */}
          <div className="lg:col-span-6 xl:col-span-7 bg-white rounded-2xl border border-slate-200/80 shadow-md shadow-slate-100/50 p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-5 gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <User className="w-5 h-5 text-slate-500" />
                  Employee Records
                  {!loadingRecords && employeeRecords.length > 0 && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                      {employeeRecords.length} records
                    </span>
                  )}
                </h2>
                <p className="text-slate-400 text-xs mt-0.5">
                  Select a record to configure and provision account permissions.
                </p>
              </div>

              {bulkMode && employeeRecords.length > 0 && (
                <div className="flex gap-3 text-xs w-full sm:w-auto self-end sm:self-auto border-t sm:border-0 pt-2 sm:pt-0">
                  <button onClick={selectAll} className="font-semibold text-purple-600 hover:text-purple-700 transition">
                    Select All
                  </button>
                  <span className="text-slate-200">|</span>
                  <button onClick={deselectAll} className="font-semibold text-slate-500 hover:text-slate-700 transition">
                    Deselect All
                  </button>
                </div>
              )}
            </div>

            {/* Search */}
            {employeeRecords.length > 0 && (
              <div className="relative mb-5">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                <input
                  placeholder="Search name, email, department, ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50/50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white transition-all placeholder-slate-400"
                />
              </div>
            )}

            {/* Records list */}
            <div className="space-y-3.5 max-h-[62vh] lg:max-h-[72vh] overflow-y-auto pr-1 select-none">
              {loadingRecords ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                  <span className="text-sm font-semibold text-slate-500">Loading employee records...</span>
                </div>
              ) : fetchError && employeeRecords.length === 0 ? (
                <div className="text-center py-16 px-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-500 mx-auto mb-4">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <p className="text-slate-800 font-bold mb-1">Could not load records</p>
                  <p className="text-xs text-slate-400 mb-5 max-w-sm mx-auto leading-relaxed">{fetchError}</p>
                  <button
                    onClick={fetchEmployeeRecords}
                    className="px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-xs font-semibold inline-flex items-center gap-2 active:scale-[0.98] transition shadow-sm"
                  >
                    <RefreshCw size={14} />
                    Retry Load
                  </button>
                </div>
              ) : filteredRecords.length === 0 ? (
                <div className="text-center py-20 text-slate-400">
                  <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-4 text-slate-400 shadow-inner">
                    <Search size={20} />
                  </div>
                  <h3 className="font-semibold text-slate-800 text-sm">No records found</h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
                    {searchTerm
                      ? `We couldn't find matches for "${searchTerm}". Try checking for spelling mistakes or use alternate keywords.`
                      : "No employee records found for your organization."}
                  </p>
                </div>
              ) : (
                filteredRecords.map((record) => {
                  const isSelected = bulkMode ? record.selected : selectedRecord?.id === record.id;

                  return (
                    <div
                      key={record.id}
                      onClick={() => (bulkMode ? toggleSelect(record.id) : selectSingle(record))}
                      className={`group/card relative p-4 border rounded-xl cursor-pointer transition-all duration-200 flex items-start gap-4 ${
                        isSelected
                          ? "border-blue-500 bg-gradient-to-r from-blue-50/70 to-indigo-50/30 shadow-md shadow-blue-100/50 ring-1 ring-blue-500/20"
                          : record.processStatus === "skipped"
                            ? "border-rose-100 bg-rose-50/10 hover:border-rose-200 hover:bg-rose-50/20"
                            : record.processStatus === "warning"
                              ? "border-amber-100 bg-amber-50/10 hover:border-amber-200 hover:bg-amber-50/20"
                              : "border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-md hover:shadow-slate-100/80"
                      }`}
                    >
                      {/* Left status vertical indicator line */}
                      <div
                        className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${
                          record.processStatus === "skipped"
                            ? "bg-rose-500"
                            : record.processStatus === "warning"
                              ? "bg-amber-500"
                              : isSelected
                                ? "bg-blue-600"
                                : "bg-emerald-500"
                        }`}
                      />

                      {bulkMode && (
                        <div className="mt-1 flex-shrink-0">
                          <input
                            type="checkbox"
                            checked={record.selected}
                            onChange={() => toggleSelect(record.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-4.5 w-4.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 transition cursor-pointer"
                          />
                        </div>
                      )}

                      <div className="flex-1 min-w-0 pl-1">
                        {/* Top Row: Name and Badges */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            {/* Name initial circle */}
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shadow-sm flex-shrink-0 ${
                              isSelected
                                ? "bg-blue-600 text-white"
                                : record.processStatus === "skipped"
                                  ? "bg-rose-100 text-rose-700"
                                  : record.processStatus === "warning"
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-slate-100 text-slate-700"
                            }`}>
                              {(record.parsedData?.employeeName || "?").charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <h3 className="font-semibold text-slate-800 text-sm sm:text-base tracking-tight leading-snug group-hover/card:text-slate-900 transition-colors">
                                {record.parsedData?.employeeName || "Unnamed Employee"}
                              </h3>
                              <p className="text-xs text-slate-400 font-medium">
                                ID: {record.parsedData?.employeeId || record.employee_id || "—"}
                              </p>
                            </div>
                          </div>

                          <div className="flex gap-1 flex-shrink-0">
                            {record.processStatus === "skipped" && (
                              <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-700 border border-rose-200 uppercase">
                                Skipped
                              </span>
                            )}
                            {record.processStatus === "warning" && (
                              <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 border border-amber-200 uppercase">
                                Warning
                              </span>
                            )}
                            {record.processStatus === "valid" && (
                              <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 border border-emerald-200 uppercase">
                                Ready
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Reason if skipped or warning */}
                        {record.reason && (
                          <div className={`mt-2.5 p-2.5 rounded-lg border text-xs flex items-start gap-1.5 ${
                            record.processStatus === "skipped"
                              ? "bg-rose-50/50 border-rose-100 text-rose-700"
                              : "bg-amber-50/50 border-amber-100 text-amber-700"
                          }`}>
                            <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                            <span className="leading-normal font-medium">{record.reason}</span>
                          </div>
                        )}

                        {/* Email info */}
                        <div className="mt-2.5 text-xs text-slate-500 flex items-center gap-1.5 font-medium">
                          <Mail size={13} className="text-slate-400" />
                          <span>{record.parsedData?.email || "No email address listed"}</span>
                        </div>

                        {/* Structured Grid of Metadata Tag Badges */}
                        {(() => {
                          const detailBadges = [
                            record.parsedData?.department && { icon: <Building2 size={11} />, label: "Dept", value: record.parsedData.department, color: "bg-slate-50 border-slate-200/60 text-slate-600" },
                            record.parsedData?.designation && { icon: <Briefcase size={11} />, label: "Role", value: record.parsedData.designation, color: "bg-slate-50 border-slate-200/60 text-slate-600" },
                            record.parsedData?.phone && { icon: <Phone size={11} />, label: "Phone", value: record.parsedData.phone, color: "bg-slate-50 border-slate-200/60 text-slate-600" },
                            record.parsedData?.totalSalary && record.parsedData.totalSalary !== "0.00" && { icon: <IndianRupee size={11} />, label: "Gross", value: `₹${record.parsedData.totalSalary}`, color: "bg-emerald-50/60 border-emerald-100 text-emerald-700" },
                            record.parsedData?.givenSalary && record.parsedData.givenSalary !== "0.00" && { icon: <IndianRupee size={11} />, label: "Net", value: `₹${record.parsedData.givenSalary}`, color: "bg-emerald-50/60 border-emerald-100 text-emerald-700" },
                            record.parsedData?.dateOfJoining && { icon: <CalendarDays size={11} />, label: "Joined", value: record.parsedData.dateOfJoining, color: "bg-slate-50 border-slate-200/60 text-slate-600" },
                            record.parsedData?.shiftType && { icon: <Clock size={11} />, label: "Shift", value: record.parsedData.shiftType, color: "bg-slate-50 border-slate-200/60 text-slate-600" },
                            record.parsedData?.nativePlace && { icon: <MapPin size={11} />, label: "Native", value: record.parsedData.nativePlace, color: "bg-slate-50 border-slate-200/60 text-slate-600" },
                            record.parsedData?.companyName && { icon: <Building size={11} />, label: "Company", value: record.parsedData.companyName, color: "bg-slate-50 border-slate-200/60 text-slate-600" },
                            record.parsedData?.country && { icon: <Globe size={11} />, label: "Country", value: record.parsedData.country, color: "bg-slate-50 border-slate-200/60 text-slate-600" },
                            record.parsedData?.overTime && record.parsedData.overTime !== "0.00" && { icon: <Clock size={11} />, label: "OT", value: `₹${record.parsedData.overTime}`, color: "bg-amber-50/60 border-amber-100 text-amber-700" },
                          ].filter(Boolean);

                          if (detailBadges.length === 0) return null;

                          return (
                            <div className="mt-3.5 flex flex-wrap gap-1.5">
                              {detailBadges.map((badge: any, idx) => (
                                <div
                                  key={idx}
                                  className={`inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-md border transition-all ${badge.color}`}
                                >
                                  <span className="opacity-75">{badge.icon}</span>
                                  <span className="opacity-60 text-[9px] uppercase font-bold tracking-wider">{badge.label}:</span>
                                  <span className="font-semibold text-slate-700">{badge.value}</span>
                                </div>
                              ))}
                            </div>
                          );
                        })()}

                        {/* Bulk creation status indicator */}
                        {record.uiStatus && record.uiStatus !== "idle" && (
                          <div className={`mt-3 p-2 rounded-lg border text-xs flex items-center gap-2 ${
                            record.uiStatus === "success"
                              ? "bg-emerald-50 border-emerald-100 text-emerald-800"
                              : record.uiStatus === "error"
                                ? "bg-rose-50 border-rose-100 text-rose-800"
                                : "bg-blue-50 border-blue-100 text-blue-800"
                          }`}>
                            {record.uiStatus === "pending" && <Loader2 className="animate-spin flex-shrink-0 text-blue-600" size={14} />}
                            {record.uiStatus === "success" && <Check size={14} className="text-emerald-600 flex-shrink-0" />}
                            {record.uiStatus === "error" && <X size={14} className="text-rose-600 flex-shrink-0" />}
                            <span className="font-semibold">{record.uiMessage}</span>
                          </div>
                        )}
                      </div>

                      {!bulkMode && isSelected && (
                        <div className="flex-shrink-0 mt-1">
                          <div className="p-1 bg-blue-100 text-blue-600 rounded-full shadow-sm">
                            <Check size={14} strokeWidth={3} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right – Form area */}
          <div className="lg:col-span-6 xl:col-span-5 bg-white rounded-2xl border border-slate-200/80 shadow-md shadow-slate-100/50 p-5 sm:p-6">
            {editingExistingUser ? (
              <>
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                      <Pencil size={18} />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">Modify Account Profile</h2>
                      <p className="text-xs text-slate-400 mt-0.5">Edit permissions and credentials for user</p>
                    </div>
                  </div>
                  <button
                    onClick={cancelEditUser}
                    className="p-1.5 rounded-lg text-slate-450 hover:text-slate-600 hover:bg-slate-50 transition"
                    title="Cancel edit"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="mb-5 p-3.5 bg-blue-50/50 border border-blue-100 rounded-xl flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-sm">
                    {(editingExistingUser.fullName || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">
                      {editingExistingUser.fullName || editingExistingUser.email}
                    </p>
                    {editingExistingUser.username && (
                      <p className="text-[10px] font-medium text-blue-600">@{editingExistingUser.username}</p>
                    )}
                  </div>
                </div>

                <form onSubmit={saveEditUser} className="space-y-4">
                  {/* Section: Profile info */}
                  <div className="p-4 bg-slate-50/50 border border-slate-200/60 rounded-xl space-y-4">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <User size={12} /> Profile Information
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          First Name
                        </label>
                        <input
                          value={editUserForm.first_name}
                          onChange={(e) => setEditUserForm({ ...editUserForm, first_name: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Last Name
                        </label>
                        <input
                          value={editUserForm.last_name}
                          onChange={(e) => setEditUserForm({ ...editUserForm, last_name: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={editUserForm.email}
                        onChange={(e) => setEditUserForm({ ...editUserForm, email: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Contact Phone
                        </label>
                        <input
                          value={editUserForm.phone}
                          onChange={(e) => setEditUserForm({ ...editUserForm, phone: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Department
                        </label>
                        <input
                          value={editUserForm.department}
                          onChange={(e) => setEditUserForm({ ...editUserForm, department: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Employee Engagement Team Name
                      </label>
                      <input
                        value={editUserForm.employeeEngagementTeamName}
                        onChange={(e) => setEditUserForm({ ...editUserForm, employeeEngagementTeamName: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                        placeholder="Engagement Team Assignment"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Location
                        </label>
                        <input
                          value={editUserForm.location}
                          onChange={(e) => setEditUserForm({ ...editUserForm, location: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          User Status
                        </label>
                        <select
                          value={editUserForm.status}
                          onChange={(e) => setEditUserForm({ ...editUserForm, status: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                          <option value="pending">Pending</option>
                          <option value="suspended">Suspended</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Section: Organizational unit & roles */}
                  <div className="p-4 bg-slate-50/50 border border-slate-200/60 rounded-xl space-y-4">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Shield size={12} /> Organizational Hierarchy
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
                          Role
                        </label>
                        <select
                          value={editUserForm.roleId}
                          onChange={(e) => setEditUserForm({ ...editUserForm, roleId: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
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
                        <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
                          Unit
                        </label>
                        <select
                          value={editUserForm.unitId}
                          onChange={(e) => setEditUserForm({ ...editUserForm, unitId: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
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
                      <p className="text-[11px] text-amber-600 flex items-center gap-1">
                        <AlertTriangle size={12} />
                        Select a unit to apply this role assignment.
                      </p>
                    )}
                  </div>

                  {/* Section: Password Reset */}
                  <div className="p-4 bg-slate-50/50 border border-slate-200/60 rounded-xl space-y-4">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Lock size={12} /> Reset Password
                    </p>
                    <p className="text-[11px] text-slate-400 -mt-2">Leave blank to keep the current user password</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          New Password
                        </label>
                        <div className="relative">
                          <input
                            type={showEditPassword ? "text" : "password"}
                            value={editUserForm.password}
                            onChange={(e) => setEditUserForm({ ...editUserForm, password: e.target.value })}
                            className="w-full px-3 py-2 pr-9 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                            minLength={8}
                            placeholder="Min 8 characters"
                          />
                          <button
                            type="button"
                            onClick={() => setShowEditPassword(!showEditPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-450 hover:text-slate-600"
                          >
                            {showEditPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Confirm Password
                        </label>
                        <div className="relative">
                          <input
                            type={showEditConfirmPassword ? "text" : "password"}
                            value={editUserForm.confirmPassword}
                            onChange={(e) => setEditUserForm({ ...editUserForm, confirmPassword: e.target.value })}
                            className={`w-full px-3 py-2 pr-9 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all ${
                              editUserForm.confirmPassword && !editPasswordsMatch ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/10" : "border-slate-200"
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => setShowEditConfirmPassword(!showEditConfirmPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-450 hover:text-slate-600"
                          >
                            {showEditConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {editUserForm.password && (
                      <div className="p-3 bg-slate-100/60 border border-slate-200/80 rounded-lg space-y-1.5 text-xs text-slate-600">
                        <p className="font-bold text-[9px] text-slate-400 uppercase tracking-wider mb-1">Password Strength Checklist</p>
                        <div className="flex items-center gap-2">
                          {editUserForm.password.length >= 8 ? (
                            <Check size={13} className="text-emerald-600" strokeWidth={3} />
                          ) : (
                            <X size={13} className="text-rose-600" strokeWidth={3} />
                          )}
                          <span className={editUserForm.password.length >= 8 ? "text-emerald-700 font-medium" : "text-slate-500"}>At least 8 characters</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {editPasswordsMatch ? (
                            <Check size={13} className="text-emerald-600" strokeWidth={3} />
                          ) : (
                            <X size={13} className="text-rose-600" strokeWidth={3} />
                          )}
                          <span className={editPasswordsMatch ? "text-emerald-700 font-medium" : "text-slate-500"}>Passwords match exactly</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3 pt-3">
                    <button
                      type="submit"
                      disabled={savingUser}
                      className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm transition-all"
                    >
                      {savingUser ? (
                        <>
                          <Loader2 className="animate-spin" size={16} />
                          <span>Saving Changes...</span>
                        </>
                      ) : (
                        <>
                          <Save size={16} />
                          <span>Save Changes</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditUser}
                      disabled={savingUser}
                      className="px-5 bg-slate-100 hover:bg-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-semibold active:scale-[0.98] transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </>
            ) : bulkMode ? (
              <>
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                      <Users size={18} />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">Bulk Provisioning Hub</h2>
                      <p className="text-xs text-slate-400 mt-0.5">{selectedCount} records selected</p>
                    </div>
                  </div>
                </div>

                {selectedCount === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center select-none">
                    <div className="w-16 h-16 bg-purple-50 border border-purple-100 rounded-2xl flex items-center justify-center text-purple-400 mb-4 shadow-sm shadow-purple-50">
                      <Users className="w-8 h-8" />
                    </div>
                    <h3 className="font-bold text-slate-800 text-base">No records selected</h3>
                    <p className="text-slate-400 text-xs mt-1.5 max-w-xs mx-auto leading-relaxed">
                      Toggle checkboxes on the left and select one or more employee profiles to begin batch account creation.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* Quick-fill section */}
                    <div className="p-4 bg-gradient-to-r from-purple-700 to-indigo-700 text-white rounded-xl shadow-md shadow-indigo-100/30 space-y-3.5">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-purple-100">
                          Batch Settings
                        </label>
                        <p className="text-[11px] text-purple-200/90 mt-0.5">Apply credentials or security groups to all selected records at once</p>
                      </div>

                      {/* Password quick-fill */}
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <input
                            type={showBulkPassword ? "text" : "password"}
                            value={bulkPassword}
                            onChange={(e) => setBulkPassword(e.target.value)}
                            placeholder="Password (min 8 chars)"
                            className="w-full px-3 py-2 pr-9 border border-purple-500/30 rounded-lg text-sm bg-white/10 text-white placeholder-purple-200 focus:outline-none focus:ring-2 focus:ring-white/20 focus:bg-white/20 transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => setShowBulkPassword(!showBulkPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-purple-200 hover:text-white"
                          >
                            {showBulkPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        </div>
                        <button
                          onClick={applyPasswordToAllSelected}
                          disabled={!bulkPassword || bulkPassword.length < 8}
                          className="px-3.5 py-2 bg-white text-purple-700 text-xs font-bold rounded-lg hover:bg-purple-50 active:scale-[0.97] transition-all disabled:opacity-40 disabled:scale-100 disabled:cursor-not-allowed flex-shrink-0"
                        >
                          Apply
                        </button>
                      </div>

                      {/* Role & Unit quick-fill */}
                      <div className="flex gap-2">
                        <select
                          value={defaultRoleId}
                          onChange={(e) => setDefaultRoleId(e.target.value)}
                          className="flex-1 px-2.5 py-2 border border-purple-500/30 rounded-lg text-xs bg-white/10 text-white focus:outline-none focus:ring-2 focus:ring-white/20 focus:bg-white/20 transition-all"
                          style={{ colorScheme: "dark" }}
                        >
                          <option value="" className="text-slate-800">Assign Role</option>
                          {flatRoles.map((r) => (
                            <option key={r.id} value={r.id} className="text-slate-800">
                              {"—".repeat(r.level)} {r.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={defaultUnitId}
                          onChange={(e) => setDefaultUnitId(e.target.value)}
                          className="flex-1 px-2.5 py-2 border border-purple-500/30 rounded-lg text-xs bg-white/10 text-white focus:outline-none focus:ring-2 focus:ring-white/20 focus:bg-white/20 transition-all"
                          style={{ colorScheme: "dark" }}
                        >
                          <option value="" className="text-slate-800">Assign Unit</option>
                          {flatUnits.map((u) => (
                            <option key={u.id} value={u.id} className="text-slate-800">
                              {"—".repeat(u.level)} {u.name}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={applyRoleUnitToAllSelected}
                          disabled={!defaultRoleId && !defaultUnitId}
                          className="px-3.5 py-2 bg-white text-purple-700 text-xs font-bold rounded-lg hover:bg-purple-50 active:scale-[0.97] transition-all disabled:opacity-40 disabled:scale-100 disabled:cursor-not-allowed flex-shrink-0"
                        >
                          Apply
                        </button>
                      </div>
                    </div>

                    {/* Per-user config list */}
                    <div className="space-y-3 max-h-[42vh] overflow-y-auto pr-1">
                      {employeeRecords
                        .filter((r) => r.selected)
                        .map((record) => {
                          const name = record.parsedData?.employeeName || "Unnamed";
                          const email = record.parsedData?.email || "No email address";
                          const pw = record.bulkPassword || "";
                          const isValid = pw.length >= 8;
                          const roleName = flatRoles.find((r) => r.id === record.bulkRoleId)?.name;
                          const unitName = flatUnits.find((u) => u.id === record.bulkUnitId)?.name;

                          return (
                            <div
                              key={record.id}
                              className={`p-3.5 rounded-xl border transition-all ${
                                isValid
                                  ? "border-emerald-100 bg-emerald-50/10"
                                  : "border-slate-200 bg-slate-50/40"
                              }`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-800 truncate">{name}</p>
                                  <p className="text-[10px] text-slate-400 truncate">{email}</p>
                                </div>
                                {isValid && (
                                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-md">
                                    <Check size={11} strokeWidth={3} /> Ready
                                  </span>
                                )}
                              </div>
                              {/* Password */}
                              <div className="relative mb-2">
                                <input
                                  type="text"
                                  value={pw}
                                  onChange={(e) => setBulkPasswordForRecord(record.id, e.target.value)}
                                  placeholder="Configure Password (min 8 chars)"
                                  className={`w-full px-2.5 py-1.5 text-xs border rounded-lg focus:ring-2 focus:ring-purple-500/10 focus:border-purple-500 transition-all ${
                                    pw && !isValid ? "border-rose-200 bg-rose-50/30 text-rose-800 focus:border-rose-400 focus:ring-rose-500/5" : isValid ? "border-emerald-250 bg-white" : "border-slate-200 bg-white"
                                  }`}
                                />
                              </div>
                              {/* Role & Unit */}
                              <div className="flex gap-2">
                                <select
                                  value={record.bulkRoleId || ""}
                                  onChange={(e) => setBulkRoleForRecord(record.id, e.target.value)}
                                  className="flex-1 px-2 py-1.5 text-[11px] border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
                                >
                                  <option value="">Role assignment</option>
                                  {flatRoles.map((r) => (
                                    <option key={r.id} value={r.id}>{"—".repeat(r.level)} {r.name}</option>
                                  ))}
                                </select>
                                <select
                                  value={record.bulkUnitId || ""}
                                  onChange={(e) => setBulkUnitForRecord(record.id, e.target.value)}
                                  className="flex-1 px-2 py-1.5 text-[11px] border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
                                >
                                  <option value="">Unit assignment</option>
                                  {flatUnits.map((u) => (
                                    <option key={u.id} value={u.id}>{"—".repeat(u.level)} {u.name}</option>
                                  ))}
                                </select>
                              </div>
                              {(roleName || unitName) && (
                                <p className="text-[10px] font-semibold text-purple-600 mt-2 flex items-center gap-1.5">
                                  <Shield size={10} />
                                  <span>{roleName || "No Role"}</span>
                                  <span className="text-slate-300">·</span>
                                  <Building2 size={10} />
                                  <span>{unitName || "No Unit"}</span>
                                </p>
                              )}
                            </div>
                          );
                        })}
                    </div>

                    {/* Summary + Create button */}
                    <div className="pt-3.5 border-t border-slate-100">
                      <div className="flex justify-between text-xs font-semibold text-slate-400 mb-4">
                        <span>{employeeRecords.filter((r) => r.selected && r.bulkPassword && r.bulkPassword.length >= 8).length} / {selectedCount} configured</span>
                        <span>{employeeRecords.filter((r) => r.selected && r.bulkRoleId).length} grouped</span>
                      </div>
                      <button
                        onClick={createBulkUsers}
                        disabled={
                          creating ||
                          employeeRecords.filter((r) => r.selected && r.bulkPassword && r.bulkPassword.length >= 8).length === 0
                        }
                        className="w-full bg-purple-650 text-white py-3 rounded-xl font-bold hover:bg-purple-750 active:scale-[0.98] disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md shadow-purple-100 transition-all"
                      >
                        {creating ? (
                          <>
                            <Loader2 className="animate-spin" size={18} />
                            <span>Creating users...</span>
                          </>
                        ) : (
                          <>
                            <UserPlus size={18} />
                            <span>Create {selectedCount} Users</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                      <Plus size={18} />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">Create Single User</h2>
                      <p className="text-xs text-slate-400 mt-0.5">Provision a single account from selected record</p>
                    </div>
                  </div>
                  {selectedRecord && (
                    <button
                      onClick={() => {
                        setSelectedRecord(null);
                        setFormData({ ...formData, password: "", confirmPassword: "" });
                      }}
                      className="p-1.5 rounded-lg text-slate-450 hover:text-slate-600 hover:bg-slate-50 transition"
                      title="Clear selection"
                    >
                      <X size={18} />
                    </button>
                  )}
                </div>

                {!selectedRecord ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center select-none">
                    <div className="w-16 h-16 bg-blue-50 border border-blue-100 rounded-2xl flex items-center justify-center text-blue-500 mb-4 shadow-sm shadow-blue-50">
                      <User className="w-8 h-8" />
                    </div>
                    <h3 className="font-bold text-slate-800 text-base">No record selected</h3>
                    <p className="text-slate-400 text-xs mt-1.5 max-w-xs mx-auto leading-relaxed">
                      Select an employee profile from the left column to configure and provision their user account.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={createSingleUser} className="space-y-4">
                    {/* Section 1: Employee Identifiers */}
                    <div className="p-4 bg-slate-50/50 border border-slate-200/60 rounded-xl space-y-4">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <User size={12} /> Employee Identity
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">
                            Employee ID
                          </label>
                          <input
                            name="employee_id"
                            value={formData.employee_id}
                            onChange={handleSingleChange}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">
                            Record ID
                          </label>
                          <input
                            value={formData.employeeRecordId}
                            disabled
                            className="w-full px-3 py-2 bg-slate-100/80 border border-slate-200 rounded-lg text-sm text-slate-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Employee Name
                        </label>
                        <input
                          name="employeeName"
                          value={formData.employeeName}
                          onChange={handleSingleChange}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Email Address
                        </label>
                        <input
                          type="email"
                          name="email"
                          value={formData.email}
                          onChange={handleSingleChange}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                          required
                        />
                      </div>
                    </div>

                    {/* Section 2: Role Assignment */}
                    <div className="p-4 bg-slate-50/50 border border-slate-200/60 rounded-xl space-y-4">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Shield size={12} /> Access & Organization
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">
                            Role Assignment
                          </label>
                          <select
                            value={formData.roleId}
                            onChange={(e) => setFormData({ ...formData, roleId: e.target.value })}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                          >
                            <option value="">No role assigned</option>
                            {flatRoles.map((r) => (
                              <option key={r.id} value={r.id}>
                                {"—".repeat(r.level)} {r.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">
                            Organizational Unit
                          </label>
                          <select
                            value={formData.unitId}
                            onChange={(e) => setFormData({ ...formData, unitId: e.target.value })}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                          >
                            <option value="">No unit assigned</option>
                            {flatUnits.map((u) => (
                              <option key={u.id} value={u.id}>
                                {"—".repeat(u.level)} {u.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Section 3: Credentials */}
                    <div className="p-4 bg-slate-50/50 border border-slate-200/60 rounded-xl space-y-4">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Lock size={12} /> Account Credentials
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">
                            Password
                          </label>
                          <div className="relative">
                            <input
                              type={showSinglePassword ? "text" : "password"}
                              name="password"
                              value={formData.password}
                              onChange={handleSingleChange}
                              className="w-full px-3 py-2 pr-9 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                              required
                              minLength={8}
                            />
                            <button
                              type="button"
                              onClick={() => setShowSinglePassword(!showSinglePassword)}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-450 hover:text-slate-600"
                            >
                              {showSinglePassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">
                            Confirm Password
                          </label>
                          <div className="relative">
                            <input
                              type={showConfirmPassword ? "text" : "password"}
                              name="confirmPassword"
                              value={formData.confirmPassword}
                              onChange={handleSingleChange}
                              className={`w-full px-3 py-2 pr-9 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all ${
                                formData.confirmPassword && !passwordsMatch ? "border-rose-350 focus:border-rose-500 focus:ring-rose-500/10" : "border-slate-200"
                              }`}
                              required
                            />
                            <button
                              type="button"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-450 hover:text-slate-600"
                            >
                              {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                        </div>
                      </div>

                      {formData.password && (
                        <div className="p-3 bg-slate-100/60 border border-slate-200/80 rounded-lg space-y-1.5 text-xs text-slate-600">
                          <p className="font-bold text-[9px] text-slate-400 uppercase tracking-wider mb-1">Password Strength Checklist</p>
                          <div className="flex items-center gap-2">
                            {formData.password.length >= 8 ? (
                              <Check size={13} className="text-emerald-600" strokeWidth={3} />
                            ) : (
                              <X size={13} className="text-rose-600" strokeWidth={3} />
                            )}
                            <span className={formData.password.length >= 8 ? "text-emerald-700 font-medium" : "text-slate-500"}>At least 8 characters</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {passwordsMatch ? (
                              <Check size={13} className="text-emerald-600" strokeWidth={3} />
                            ) : (
                              <X size={13} className="text-rose-600" strokeWidth={3} />
                            )}
                            <span className={passwordsMatch ? "text-emerald-700 font-medium" : "text-slate-500"}>Passwords match exactly</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={creating || !passwordsMatch || formData.password.trim().length < 8}
                      className="w-full bg-blue-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm transition-all"
                    >
                      {creating ? (
                        <>
                          <Loader2 className="animate-spin" size={16} />
                          <span>Creating Account...</span>
                        </>
                      ) : (
                        <>
                          <UserPlus size={16} />
                          <span>Create User Account</span>
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
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-300"
          onClick={() => setShowUserListDrawer(false)}
        />
        <aside
          className={`absolute top-0 right-0 h-full w-full sm:w-[420px] md:w-[480px] bg-white shadow-2xl flex flex-col transform transition-transform duration-300 ease-out border-l border-slate-100 ${
            showUserListDrawer ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-950 text-white">
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <Users className="w-5 h-5 text-slate-350" />
                Active Directory
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {loadingUsers ? "Loading..." : `${adminUsers.length} platform users registered`}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => refetchUsers()}
                disabled={loadingUsers}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-50"
                title="Refresh user list"
              >
                <RefreshCw size={15} className={loadingUsers ? "animate-spin" : ""} />
              </button>
              <button
                onClick={() => setShowUserListDrawer(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                placeholder="Search active users by name, email..."
                value={userListSearch}
                onChange={(e) => setUserListSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all placeholder-slate-400"
              />
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 bg-slate-50/20">
            {loadingUsers ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
                <Loader2 className="h-7 w-7 animate-spin text-blue-500" />
                <span className="text-xs font-semibold text-slate-500">Querying directory...</span>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-20 text-slate-450">
                <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto mb-3 text-slate-400">
                  <Search size={16} />
                </div>
                <p className="text-xs font-bold text-slate-800">No users found</p>
                <p className="text-[11px] text-slate-450 mt-1 max-w-xs mx-auto leading-relaxed">
                  {userListSearch ? `No matches for "${userListSearch}". Check spelling or refine criteria.` : "No system user profiles currently exist."}
                </p>
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
                      className="p-3 bg-white border border-slate-200 rounded-xl hover:border-blue-300 hover:shadow-md hover:shadow-slate-100/60 transition-all duration-200 group/item"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-xs font-bold flex items-center justify-center overflow-hidden shadow-sm">
                          {u.avatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={u.avatar} alt={displayName} className="w-full h-full object-cover" />
                          ) : (
                            initials
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-1 flex-wrap">
                            <p className="text-xs font-bold text-slate-800 truncate flex-1 min-w-0 leading-normal">
                              {displayName}
                            </p>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {isAdmin && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-0.5 uppercase tracking-wide">
                                  <Shield size={9} /> ADMIN
                                </span>
                              )}
                              {u.status && (
                                <span
                                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide ${
                                    u.status.toLowerCase() === "active"
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-250"
                                      : "bg-slate-100 text-slate-500 border-slate-200"
                                  }`}
                                >
                                  {u.status}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="mt-2 space-y-1 text-slate-500 text-[11px] font-medium border-t border-slate-50 pt-2">
                            {u.username && (
                              <p className="truncate flex items-center gap-1.5">
                                <AtSign size={12} className="text-slate-400 flex-shrink-0" />
                                <span className="font-semibold text-slate-650">@{u.username}</span>
                              </p>
                            )}
                            <p className="truncate flex items-center gap-1.5">
                              <Mail size={12} className="text-slate-400 flex-shrink-0" />
                              <span>{u.email}</span>
                            </p>
                            {phoneNumber && (
                              <p className="truncate flex items-center gap-1.5">
                                <Phone size={12} className="text-slate-400 flex-shrink-0" />
                                <span>{phoneNumber}</span>
                              </p>
                            )}
                            {u.department && (
                              <p className="truncate flex items-center gap-1.5">
                                <Building2 size={12} className="text-slate-400 flex-shrink-0" />
                                <span>{u.department}</span>
                              </p>
                            )}
                            {u.employeeEngagementTeamName && (
                              <p className="truncate flex items-center gap-1.5">
                                <Users size={12} className="text-slate-400 flex-shrink-0" />
                                <span>{u.employeeEngagementTeamName}</span>
                              </p>
                            )}
                            {u.location && (
                              <p className="truncate flex items-center gap-1.5">
                                <MapPin size={12} className="text-slate-400 flex-shrink-0" />
                                <span>{u.location}</span>
                              </p>
                            )}
                            {joinDateStr && (
                              <p className="truncate flex items-center gap-1.5 text-slate-400">
                                <CalendarDays size={12} className="text-slate-400 flex-shrink-0" />
                                <span>Joined {joinDateStr}</span>
                              </p>
                            )}
                          </div>

                          {u.unitsAndRoles && u.unitsAndRoles.length > 0 && (
                            <div className="mt-2.5 flex flex-wrap gap-1 border-t border-slate-50 pt-2">
                              {u.unitsAndRoles.map((ur, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-50/50 text-indigo-700 border border-indigo-100"
                                  title={`${ur.unit?.name || ""} → ${ur.role?.name || ""}`}
                                >
                                  <Shield size={9} />
                                  {ur.role?.name}
                                  {ur.unit?.name && (
                                    <span className="text-indigo-400 font-semibold">· {ur.unit.name}</span>
                                  )}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="mt-3.5 flex justify-end gap-1.5 border-t border-slate-50 pt-2 opacity-0 group-hover/item:opacity-100 transition-opacity">
                            <button
                              onClick={() => startEditUser(u)}
                              className="px-2 py-1 rounded-md text-[10px] font-bold text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-100 flex items-center gap-1 transition"
                              disabled={isDeleting}
                            >
                              <Pencil size={11} /> Edit Profile
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u)}
                              className="px-2 py-1 rounded-md text-[10px] font-bold text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 flex items-center gap-1 transition disabled:opacity-50"
                              disabled={isDeleting}
                            >
                              {isDeleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                              <span>Delete</span>
                            </button>
                          </div>
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