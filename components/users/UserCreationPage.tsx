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
} from "lucide-react";
import { useCreateUserFromEmployeeMutation } from "@/lib/api/users";
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

  const [formData, setFormData] = useState<CreateUserData & { confirmPassword: string }>({
    employeeRecordId: "",
    employee_id: "",
    employeeName: "",
    email: "",
    password: "",
    confirmPassword: "",
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

      // Use allProcessedRecords (all records) over records (filtered "usable" only).
      // json.records is [] when all records are "skipped", but allProcessedRecords has them all.
      const usable = Array.isArray(json.records) ? json.records : [];
      const all = Array.isArray(json.allProcessedRecords) ? json.allProcessedRecords : [];
      const dataArr = Array.isArray(json.data) ? json.data : [];
      const records: any[] = all.length > 0 ? all : usable.length > 0 ? usable : dataArr;

      console.log(`[UserCreationPage] records: ${usable.length}, allProcessed: ${all.length}, using ${records.length} items`);

      if (!Array.isArray(records)) {
        throw new Error("Unexpected response: records is not an array");
      }

      const mapped: EmployeeRecord[] = records.map((r: any) => ({
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

  // Initial load
  useEffect(() => {
    fetchEmployeeRecords();
  }, [fetchEmployeeRecords]);

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
    });
    setBulkMode(false);
  };

  const handleSingleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const validateSingle = (): boolean => {
    if (!formData.employee_id || !formData.employeeName || !formData.email || !formData.password) {
      toast({ title: "Validation Error", description: "Fill all required fields", variant: "destructive" });
      return false;
    }
    const pass = formData.password.trim();
    const conf = formData.confirmPassword.trim();
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
        confirmPassword: formData.confirmPassword.trim(),
      }).unwrap();

      toast({ title: "User Created", description: `Account for ${formData.employeeName} created successfully` });
      setFormData({ ...formData, password: "", confirmPassword: "" });
      fetchEmployeeRecords();
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
            {bulkMode ? (
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
                    {/* Quick-fill: apply one password to all */}
                    <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                      <label className="block text-xs font-semibold text-purple-800 mb-1.5">
                        Quick fill — apply to all selected
                      </label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <input
                            type={showBulkPassword ? "text" : "password"}
                            value={bulkPassword}
                            onChange={(e) => setBulkPassword(e.target.value)}
                            placeholder="Type password, then Apply"
                            className="w-full px-3 py-2 pr-9 border border-purple-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 bg-white"
                          />
                          <button
                            type="button"
                            onClick={() => setShowBulkPassword(!showBulkPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                            {showBulkPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        </div>
                        <button
                          onClick={applyPasswordToAllSelected}
                          disabled={!bulkPassword || bulkPassword.length < 8}
                          className="px-3 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                        >
                          Apply
                        </button>
                      </div>
                      {bulkPassword && bulkPassword.length < 8 && (
                        <p className="text-[11px] text-purple-600 mt-1">Min 8 characters</p>
                      )}
                    </div>

                    {/* Per-user password list */}
                    <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                      {employeeRecords
                        .filter((r) => r.selected)
                        .map((record) => {
                          const name = record.parsedData?.employeeName || "—";
                          const email = record.parsedData?.email || "No email";
                          const pw = record.bulkPassword || "";
                          const isValid = pw.length >= 8;

                          return (
                            <div
                              key={record.id}
                              className={`p-3 rounded-lg border ${
                                isValid
                                  ? "border-green-200 bg-green-50/40"
                                  : "border-gray-200 bg-gray-50/40"
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1.5">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
                                  <p className="text-xs text-gray-500 truncate">{email}</p>
                                </div>
                                {isValid && <Check size={16} className="text-green-600 flex-shrink-0 ml-2" />}
                              </div>
                              <input
                                type="text"
                                value={pw}
                                onChange={(e) => setBulkPasswordForRecord(record.id, e.target.value)}
                                placeholder="Set password (min 8 chars)"
                                className={`w-full px-2.5 py-1.5 text-sm border rounded-md focus:ring-2 focus:ring-purple-500 ${
                                  pw && !isValid
                                    ? "border-red-300 bg-red-50"
                                    : isValid
                                      ? "border-green-300 bg-white"
                                      : "border-gray-300 bg-white"
                                }`}
                              />
                              {pw && !isValid && (
                                <p className="text-[11px] text-red-500 mt-0.5">Min 8 characters</p>
                              )}
                            </div>
                          );
                        })}
                    </div>

                    {/* Summary + Create button */}
                    <div className="pt-2 border-t">
                      <div className="flex justify-between text-xs text-gray-500 mb-3">
                        <span>{employeeRecords.filter((r) => r.selected && r.bulkPassword && r.bulkPassword.length >= 8).length} / {selectedCount} have valid passwords</span>
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
                          Confirm
                        </label>
                        <div className="relative">
                          <input
                            type={showConfirmPassword ? "text" : "password"}
                            name="confirmPassword"
                            value={formData.confirmPassword}
                            onChange={handleSingleChange}
                            className="w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-blue-500"
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
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={creating}
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
    </div>
  );
};

export default UserCreationPage;
