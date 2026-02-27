"use client";
import React, { useState, useEffect } from "react";
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
} from "lucide-react";

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
  };
  // New fields for bulk UI
  selected?: boolean;
  status?: "idle" | "pending" | "success" | "error";
  message?: string;
}

interface CreateUserData {
  employeeRecordId: string;
  employee_id: string;
  employeeName: string;
  email: string;
  password: string;
}

const UserCreationPage: React.FC = () => {
  const [employeeRecords, setEmployeeRecords] = useState<EmployeeRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<EmployeeRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<EmployeeRecord | null>(null); // for single mode
  const [bulkPassword, setBulkPassword] = useState("");
  const [showBulkPassword, setShowBulkPassword] = useState(false);
  const [showSinglePassword, setShowSinglePassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [formData, setFormData] = useState<CreateUserData & { confirmPassword: string }>({
    employeeRecordId: "",
    employee_id: "",
    employeeName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  useEffect(() => {
    fetchEmployeeRecords();
  }, []);

  useEffect(() => {
    setFilteredRecords(
      employeeRecords.filter((r) =>
        !searchTerm ||
        r.parsedData?.employeeName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.parsedData?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.parsedData?.employeeId || r.employee_id || "").toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
  }, [searchTerm, employeeRecords]);

  const fetchEmployeeRecords = async () => {
    try {
      const res = await fetch("/api/employee-records");
      if (!res.ok) throw new Error();
      const { records } = await res.json();
      // Add status fields
      setEmployeeRecords(
        (records || []).map((r: EmployeeRecord) => ({
          ...r,
          selected: false,
          status: "idle",
          message: "",
        }))
      );
    } catch {
      setMessage({ type: "error", text: "Failed to load employee records" });
    }
  };

  const toggleSelect = (id: string) => {
    setEmployeeRecords((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, selected: !r.selected } : r
      )
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

  const handleBulkPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBulkPassword(e.target.value);
  };

  const validateSingle = (): boolean => {
    if (!formData.employee_id || !formData.employeeName || !formData.email || !formData.password) {
      setMessage({ type: "error", text: "Fill all required fields" });
      return false;
    }
    const pass = formData.password.trim();
    const conf = formData.confirmPassword.trim();
    if (pass !== conf) {
      setMessage({ type: "error", text: "Passwords do not match" });
      return false;
    }
    if (pass.length < 8) {
      setMessage({ type: "error", text: "Password ≥ 8 characters" });
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setMessage({ type: "error", text: "Invalid email" });
      return false;
    }
    return true;
  };

  const createSingleUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateSingle()) return;

    setCreating(true);
    try {
      const pass = formData.password.trim();
      const conf = formData.confirmPassword.trim();
      const res = await fetch("/api/create-user-from-employee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          password: pass,
          confirmPassword: conf,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage({ type: "success", text: "User created successfully" });
        setFormData({ ...formData, password: "", confirmPassword: "" });
        fetchEmployeeRecords();
      } else {
        setMessage({ type: "error", text: data.error || "Creation failed" });
      }
    } catch {
      setMessage({ type: "error", text: "Network/server error" });
    } finally {
      setCreating(false);
    }
  };

  const createBulkUsers = async () => {
    const selected = employeeRecords.filter((r) => r.selected);
    if (selected.length === 0) {
      setMessage({ type: "error", text: "No records selected" });
      return;
    }

    const password = bulkPassword.trim();
    if (!password || password.length < 8) {
      setMessage({ type: "error", text: "Bulk password must be ≥ 8 characters" });
      return;
    }

    if (!confirm(`Create ${selected.length} users with the same password?`)) {
      return;
    }

    setCreating(true);
    setMessage(null);

    let successCount = 0;
    let failCount = 0;

    // Update UI statuses
    setEmployeeRecords((prev) =>
      prev.map((r) =>
        r.selected ? { ...r, status: "pending", message: "Processing..." } : r
      )
    );

    for (const record of selected) {
      try {
        const payload = {
          employeeRecordId: record.id,
          employee_id: record.parsedData?.employeeId || record.employee_id || "",
          employeeName: record.parsedData?.employeeName || "",
          email: record.parsedData?.email || "",
          password: password,
          confirmPassword: password,
        };

        const res = await fetch("/api/create-user-from-employee", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json();

        if (res.ok) {
          successCount++;
          setEmployeeRecords((prev) =>
            prev.map((r) =>
              r.id === record.id
                ? { ...r, status: "success", message: "Created", selected: false }
                : r
            )
          );
        } else {
          failCount++;
          setEmployeeRecords((prev) =>
            prev.map((r) =>
              r.id === record.id
                ? { ...r, status: "error", message: data.error || "Failed", selected: false }
                : r
            )
          );
        }
      } catch {
        failCount++;
        setEmployeeRecords((prev) =>
          prev.map((r) =>
            r.id === record.id
              ? { ...r, status: "error", message: "Network error", selected: false }
              : r
          )
        );
      }
    }

    setCreating(false);
    setBulkPassword("");

    setMessage({
      type: successCount > 0 ? "success" : "error",
      text: `Bulk creation finished: ${successCount} succeeded, ${failCount} failed`,
    });

    if (successCount > 0) fetchEmployeeRecords();
  };

  const selectAll = () => {
    setEmployeeRecords((prev) => prev.map((r) => ({ ...r, selected: true })));
  };

  const deselectAll = () => {
    setEmployeeRecords((prev) => prev.map((r) => ({ ...r, selected: false })));
  };

  const selectedCount = employeeRecords.filter((r) => r.selected).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <UserPlus className="w-8 h-8 text-blue-600" />
              Create Users from Employee Records
            </h1>
            <p className="text-gray-600 mt-1">
              Single or bulk account creation from Form Table 14
            </p>
          </div>
          <button
            onClick={() => setBulkMode(!bulkMode)}
            className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition ${bulkMode
              ? "bg-purple-600 text-white hover:bg-purple-700"
              : "bg-gray-200 hover:bg-gray-300"
              }`}
          >
            <Users size={18} />
            {bulkMode ? "Exit Bulk Mode" : "Bulk Mode"}
          </button>
        </div>

        {message && (
          <div
            className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${message.type === "success"
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-800"
              }`}
          >
            {message.type === "success" ? <Check /> : <X />}
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* Left – Selection */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <User className="w-5 h-5" />
                Employee Records
              </h2>

              {bulkMode && (
                <div className="flex gap-3 text-sm">
                  <button onClick={selectAll} className="text-blue-600 hover:underline">
                    Select All
                  </button>
                  <button onClick={deselectAll} className="text-blue-600 hover:underline">
                    Clear
                  </button>
                </div>
              )}
            </div>

            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                placeholder="Search name, email, ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-3 max-h-[70vh] overflow-y-auto">
              {filteredRecords.map((record) => {
                const isSelected = bulkMode ? record.selected : selectedRecord?.id === record.id;

                return (
                  <div
                    key={record.id}
                    onClick={() => (bulkMode ? toggleSelect(record.id) : selectSingle(record))}
                    className={`p-4 border rounded-lg cursor-pointer transition-all flex items-start gap-3 ${isSelected
                      ? "border-blue-500 bg-blue-50 shadow-sm"
                      : "border-gray-200 hover:border-gray-300"
                      }`}
                  >
                    {bulkMode && (
                      <input
                        type="checkbox"
                        checked={record.selected}
                        onChange={() => toggleSelect(record.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1.5"
                      />
                    )}

                    <div className="flex-1">
                      <h3 className="font-medium">{record.parsedData?.employeeName || "—"}</h3>
                      <p className="text-sm text-gray-600">
                        ID: {record.parsedData?.employeeId || record.employee_id || "—"}
                      </p>
                      <p className="text-sm text-gray-600">
                        {record.parsedData?.email || "No email"}
                      </p>

                      {record.status && record.status !== "idle" && (
                        <div className="mt-2 text-xs flex items-center gap-1.5">
                          {record.status === "pending" && <Loader2 className="animate-spin" size={14} />}
                          {record.status === "success" && <Check size={14} className="text-green-600" />}
                          {record.status === "error" && <X size={14} className="text-red-600" />}
                          <span className={record.status === "error" ? "text-red-700" : ""}>
                            {record.message}
                          </span>
                        </div>
                      )}
                    </div>

                    {isSelected && !bulkMode && (
                      <Check className="text-blue-600 mt-1" size={20} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right – Form area */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            {bulkMode ? (
              <>
                <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Bulk Create Users ({selectedCount} selected)
                </h2>

                {selectedCount === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    Select employees on the left to create accounts in bulk
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Password (same for all selected users)
                      </label>
                      <div className="relative">
                        <input
                          type={showBulkPassword ? "text" : "password"}
                          value={bulkPassword}
                          onChange={handleBulkPasswordChange}
                          placeholder="Minimum 8 characters"
                          className="w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-purple-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowBulkPassword(!showBulkPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                        >
                          {showBulkPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        All selected users will get this password (can change later)
                      </p>
                    </div>

                    <button
                      onClick={createBulkUsers}
                      disabled={creating || !bulkPassword || bulkPassword.length < 8}
                      className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {creating ? (
                        <>
                          <Loader2 className="animate-spin" size={18} />
                          Creating {selectedCount} users...
                        </>
                      ) : (
                        <>
                          <UserPlus size={18} />
                          Create {selectedCount} Users
                        </>
                      )}
                    </button>
                  </div>
                )}
              </>
            ) : (
              // ── Single user form (almost unchanged) ──
              <>
                <div className="flex justify-between items-center mb-4">
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
                      className="text-gray-500 hover:text-red-600"
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
                    {/* Your existing form fields – kept almost identical */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Employee ID
                        </label>
                        <input
                          name="employee_id"
                          value={formData.employee_id}
                          onChange={handleSingleChange}
                          className="w-full px-3 py-2 border rounded-lg"
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
                        className="w-full px-3 py-2 border rounded-lg"
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
                        className="w-full px-3 py-2 border rounded-lg"
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
                            className="w-full px-3 py-2 pr-10 border rounded-lg"
                            required
                            minLength={8}
                          />
                          <button
                            type="button"
                            onClick={() => setShowSinglePassword(!showSinglePassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                          >
                            {showSinglePassword ? <EyeOff /> : <Eye />}
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
                            className="w-full px-3 py-2 pr-10 border rounded-lg"
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                          >
                            {showConfirmPassword ? <EyeOff /> : <Eye />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={creating}
                      className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {creating ? (
                        <>
                          <Loader2 className="animate-spin" />
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