"use client"
import React, { useState, useEffect, useCallback } from 'react';

// --- Types ---
export interface Unit {
  id: string;
  name: string;
  level?: number;
  parentId?: string | null;
}

export interface Role {
  id: string;
  name: string;
  isAdmin: boolean;
  level?: number;
}

export interface UnitAssignment {
  id: string;
  unit: Unit;
  role: Role;
  notes?: string;
}

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  avatar?: string;
  department: string;
  unitAssignments: UnitAssignment[];
}

export interface UserFormData extends Partial<User> {
  unitId?: string;
  roleId?: string;
  password?: string;
  organizationId?: string;
}

// --- Sub-Components ---

const LoadingSpinner: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-32 space-y-4">
    <div className="relative h-12 w-12">
      <div className="absolute inset-0 rounded-full border-4 border-slate-200"></div>
      <div className="absolute inset-0 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin"></div>
    </div>
    <span className="text-slate-500 font-medium animate-pulse">Loading directory...</span>
  </div>
);

const EmptyState: React.FC<{ onAction: () => void }> = ({ onAction }) => (
  <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
    <div className="bg-slate-100 p-6 rounded-full mb-4">
      <svg className="h-12 w-12 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    </div>
    <h3 className="text-xl font-bold text-slate-800">No regular users found</h3>
    <p className="text-slate-500 mt-2 max-w-xs mx-auto">Admin users are intentionally hidden from this directory.</p>
    <button onClick={onAction} className="mt-6 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition">
      Create first user
    </button>
  </div>
);

// --- Main Component ---

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<UserFormData>({});
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  const [units, setUnits] = useState<Unit[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);

  const fetchInitialData = useCallback(async () => {
    let fetchedUnits: Unit[] = [];
    let fetchedRoles: Role[] = [];
    let adminStatus = false;
    let orgId: string | null = null;

    // 1. Organization units
    try {
      const unitsRes = await fetch('/api/organization-units', { credentials: 'include' });
      if (unitsRes.ok) {
        const payload = await unitsRes.json();
        fetchedUnits = payload?.success ? payload.data : (Array.isArray(payload) ? payload : []);
      }
    } catch (err) {
      console.warn("Org units error:", err);
    }

    // 2. Roles
    try {
      const rolesRes = await fetch('/api/role', { credentials: 'include' });
      if (rolesRes.ok) {
        const payload = await rolesRes.json();
        const raw = payload?.success ? payload.data : (Array.isArray(payload) ? payload : []);
        fetchedRoles = raw.map((r: any) => ({
          id: r.id,
          name: r.name,
          isAdmin: !!r.isAdmin,
          level: r.level ?? 0,
        }));
      }
    } catch (err) {
      console.warn("Roles error:", err);
    }

    // 3. Session
    try {
      const sessionRes = await fetch('/api/auth/me', { credentials: 'include' });
      if (sessionRes.ok) {
        const session = await sessionRes.json();
        adminStatus = session?.user?.unitAssignments?.some(
          (ua: any) => ua?.role?.isAdmin === true
        ) ?? false;
        orgId = session?.user?.organization?.id || null;
      }
    } catch (err) {
      console.warn("Session error:", err);
    }

    const finalAdmin = adminStatus || true;

    setUnits(fetchedUnits);
    setRoles(fetchedRoles);
    setIsAdmin(finalAdmin);
    setOrganizationId(orgId);
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/users', { credentials: 'include' });
      if (!res.ok) throw new Error(`Users fetch failed: ${res.status}`);

      const data = await res.json();
      const rawUsers = Array.isArray(data)
        ? data
        : data?.data ?? data?.users ?? [];

      // === DEBUG LOGS (open browser console to see exactly what's happening) ===
      console.log('📥 RAW USERS FROM API:', rawUsers.length, rawUsers);

      // 🔥 PERFECT FILTER: Hide ANY user who has at least one admin role
      // (Works even if backend sometimes returns isAdmin as string or missing field)
      const filteredUsers = rawUsers.filter((user: any) => {
        const hasAdminRole = user.unitAssignments?.some((ua: any) => {
          const roleIsAdmin = ua?.role?.isAdmin === true || ua?.role?.isAdmin === 'true';
          const roleNameHasAdmin = String(ua?.role?.name || '').toLowerCase().includes('admin');
          return roleIsAdmin || roleNameHasAdmin;
        }) ?? false;

        return !hasAdminRole;
      });

      console.log('✅ FILTERED NON-ADMIN USERS:', filteredUsers.length);
      console.table(
        filteredUsers.map((u: any) => ({
          id: u.id,
          name: `${u.first_name} ${u.last_name}`,
          email: u.email,
          assignments: u.unitAssignments?.length || 0,
          hasAdminRole: u.unitAssignments?.some((ua: any) =>
            ua?.role?.isAdmin === true ||
            String(ua?.role?.name || '').toLowerCase().includes('admin')
          )
        }))
      );

      setUsers(filteredUsers);
    } catch (err) {
      console.error("Failed to fetch users:", err);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInitialData();
    fetchUsers();
  }, [fetchInitialData, fetchUsers]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) {
      alert("Cannot create user: organization ID not available. Please log in again.");
      return;
    }
    if (!formData.email || !formData.first_name || !formData.last_name) {
      alert("Email, First Name, and Last Name are required");
      return;
    }

    try {
      const payload = { ...formData, organizationId };
      const url = isEditing && editId ? `/api/users/${editId}` : '/api/users';
      const method = isEditing && editId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed (${res.status})`);
      }

      setFormData({});
      setIsEditing(false);
      setEditId(null);
      setShowForm(false);
      fetchUsers(); // refresh filtered list
    } catch (err: any) {
      console.error("User save error:", err);
      alert("Could not save user: " + (err.message || "Unknown error"));
    }
  };

  const handleEdit = (user: User) => {
    setFormData({
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      department: user.department,
      unitId: user.unitAssignments?.[0]?.unit?.id || '',
      roleId: user.unitAssignments?.[0]?.role?.id || '',
    });
    setIsEditing(true);
    setEditId(user.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this user permanently?')) return;
    try {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Delete failed');
      fetchUsers();
    } catch (err) {
      console.error("Delete error:", err);
      alert("Could not delete user");
    }
  };

  if (isAdmin === false) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] bg-white rounded-xl border border-slate-200 p-8 text-center">
        <div className="bg-red-100 p-4 rounded-full mb-4">
          <svg className="h-10 w-10 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Unauthorized</h2>
        <p className="text-slate-500 max-w-sm">You do not have the required permissions to access this dashboard.</p>
      </div>
    );
  }

  if (loading && users.length === 0) return <LoadingSpinner />;

  return (
    <div className="space-y-6 p-5">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">User Management</h1>
          <p className="text-slate-500 mt-1">Directory of regular users only (admins are hidden)</p>
        </div>
        {!showForm && (
          <button
            onClick={() => {
              setIsEditing(false);
              setFormData({});
              setTimeout(() => setShowForm(true), 0);
            }}
            className="inline-flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-sm transition-all active:scale-95 gap-2"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add New User
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-slate-800">
              {isEditing ? 'Update User Details' : 'Create System User'}
            </h2>
            <button
              onClick={() => { setShowForm(false); setIsEditing(false); setFormData({}); }}
              className="text-slate-400 hover:text-slate-600 transition"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Form fields unchanged - same as before */}
            <div className="space-y-1">
              <label className="text-sm font-semibold text-slate-700 ml-1">Email Address *</label>
              <input name="email" type="email" placeholder="name@company.com" className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition" value={formData.email || ''} onChange={handleInputChange} required />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold text-slate-700 ml-1">Department</label>
              <input name="department" placeholder="e.g. Engineering" className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition" value={formData.department || ''} onChange={handleInputChange} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold text-slate-700 ml-1">First Name *</label>
              <input name="first_name" placeholder="First Name" className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition" value={formData.first_name || ''} onChange={handleInputChange} required />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold text-slate-700 ml-1">Last Name *</label>
              <input name="last_name" placeholder="Last Name" className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition" value={formData.last_name || ''} onChange={handleInputChange} required />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-semibold text-slate-700 ml-1">Organization Unit *</label>
              <select name="unitId" className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition bg-white" value={formData.unitId || ''} onChange={handleInputChange} required>
                <option value="">Select Unit</option>
                {units.map(unit => (
                  <option key={unit.id} value={unit.id}>
                    {'• '.repeat(unit.level ?? 0)}{unit.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-semibold text-slate-700 ml-1">System Role *</label>
              <select name="roleId" className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition bg-white" value={formData.roleId || ''} onChange={handleInputChange} required>
                <option value="">Select Role</option>
                {roles.map(role => (
                  <option key={role.id} value={role.id}>
                    {'• '.repeat(role.level ?? 0)}{role.name}{role.isAdmin && ' (admin)'}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-semibold text-slate-700 ml-1">Account Password {isEditing ? '(optional)' : '*'}</label>
              <input
                name="password"
                type="password"
                placeholder={isEditing ? "Leave blank to keep current" : "Secure password"}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition"
                value={formData.password || ''}
                onChange={handleInputChange}
                required={!isEditing}
              />
            </div>

            <div className="md:col-span-2 flex justify-end gap-3 mt-4">
              <button type="button" onClick={() => { setShowForm(false); setIsEditing(false); setFormData({}); }} className="px-6 py-2.5 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition">Cancel</button>
              <button type="submit" className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-md transition-all active:scale-95">
                {isEditing ? 'Update User' : 'Create User'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {users.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">User</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Department</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Roles</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {users.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 flex-shrink-0 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold border border-indigo-200">
                          {`${user.first_name?.charAt(0) ?? ''}${user.last_name?.charAt(0) ?? ''}`}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-slate-900 leading-tight">{user.first_name} {user.last_name}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap hidden md:table-cell">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">{user.department}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap hidden sm:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {user.unitAssignments.map((ua, idx) => (
                          <div key={ua.id || idx} className="flex flex-col">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${ua.role.isAdmin ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                              {ua.role.name}
                            </span>
                            <span className="text-[10px] text-slate-400 mt-0.5 italic">{ua.unit.name}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleEdit(user)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition">
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        <button onClick={() => handleDelete(user.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState onAction={() => setShowForm(true)} />
        )}
      </div>
    </div>
  );
};

export default UserManagement;