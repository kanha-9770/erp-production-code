"use client"
import React, { useState, useMemo } from 'react';
import { 
  Users, 
  Clock, 
  UserPlus, 
  ArrowUpRight, 
  ArrowDownRight, 
  BadgeCheck,
  TrendingUp,
  Search,
  Filter,
  Plus,
  MoreHorizontal,
  CreditCard,
  Shield,
  Bell,
  Lock,
  Database,
  Palette,
  LayoutDashboard,
  Wallet,
  CalendarOff,
  Settings as SettingsIcon,
  Globe,
  ChevronRight
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area,
  PieChart,
  Pie,
  Cell
} from 'recharts';

// --- Static Data ---
const DATA_ATTENDANCE = [
  { name: 'Mon', present: 85, late: 5 },
  { name: 'Tue', present: 92, late: 3 },
  { name: 'Wed', present: 88, late: 7 },
  { name: 'Thu', present: 95, late: 2 },
  { name: 'Fri', present: 90, late: 4 },
  { name: 'Sat', present: 40, late: 1 },
  { name: 'Sun', present: 10, late: 0 },
];

const DATA_DEPT = [
  { name: 'Engineering', value: 45 },
  { name: 'Marketing', value: 25 },
  { name: 'Sales', value: 30 },
  { name: 'HR', value: 10 },
  { name: 'Finance', value: 15 },
];

const EMPLOYEES = [
  { id: '1', name: 'Jordan Belfort', role: 'Sales Executive', dept: 'Sales', status: 'Active', email: 'jordan@nexus.com', phone: '+1 234 567 890', joinDate: 'Jan 12, 2022' },
  { id: '2', name: 'Sheryl Sandberg', role: 'COO', dept: 'Operations', status: 'Active', email: 'sheryl@nexus.com', phone: '+1 234 567 891', joinDate: 'Feb 15, 2020' },
  { id: '3', name: 'Satya Nadella', role: 'CTO', dept: 'Engineering', status: 'Active', email: 'satya@nexus.com', phone: '+1 234 567 892', joinDate: 'Mar 10, 2021' },
  { id: '4', name: 'Marissa Mayer', role: 'Product Manager', dept: 'Product', status: 'On Leave', email: 'marissa@nexus.com', phone: '+1 234 567 893', joinDate: 'Jul 22, 2023' },
  { id: '5', name: 'Jack Dorsey', role: 'Security Engineer', dept: 'Engineering', status: 'Active', email: 'jack@nexus.com', phone: '+1 234 567 894', joinDate: 'Oct 05, 2019' },
  { id: '6', name: 'Susan Wojcicki', role: 'Marketing Lead', dept: 'Marketing', status: 'Inactive', email: 'susan@nexus.com', phone: '+1 234 567 895', joinDate: 'Dec 01, 2022' },
];

const LEAVE_REQUESTS = [
  { id: '1', user: 'Mark Zuckerberg', type: 'Annual Leave', duration: '5 Days', dates: 'Oct 28 - Nov 01', reason: 'Family vacation', status: 'Pending', avatar: 'https://picsum.photos/seed/mark/40/40' },
  { id: '2', user: 'Tim Cook', type: 'Sick Leave', duration: '2 Days', dates: 'Oct 24 - Oct 25', reason: 'Medical appointment', status: 'Approved', avatar: 'https://picsum.photos/seed/tim/40/40' },
  { id: '3', user: 'Reed Hastings', type: 'Maternity/Paternity', duration: '30 Days', dates: 'Nov 01 - Dec 01', reason: 'New arrival', status: 'Pending', avatar: 'https://picsum.photos/seed/reed/40/40' },
  { id: '4', user: 'Sundar Pichai', type: 'Emergency Leave', duration: '1 Day', dates: 'Oct 24', reason: 'Home emergency', status: 'Rejected', avatar: 'https://picsum.photos/seed/sundar/40/40' },
];

const CHART_COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

// Fixed: Exporting TabType for other components to import
export type TabType = 'overview' | 'employees' | 'attendance' | 'payroll' | 'leaves' | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredEmployees = useMemo(() => {
    return EMPLOYEES.filter(e => 
      e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.dept.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm]);

  const renderOverview = () => (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Employees', value: '1,248', change: '+12%', icon: Users, color: 'indigo', up: true },
          { label: 'Active Attendance', value: '94.2%', change: '+2.1%', icon: BadgeCheck, color: 'emerald', up: true },
          { label: 'New Hires', value: '14', change: '-3', icon: UserPlus, color: 'amber', up: false },
          { label: 'Avg. Working Hours', value: '42.5h', change: '+0.4h', icon: Clock, color: 'blue', up: true },
        ].map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
            <div className="flex justify-between items-start">
              <div className={`p-3 rounded-xl bg-${stat.color}-50 text-${stat.color}-600`}>
                <stat.icon className="w-6 h-6" />
              </div>
              <div className={`flex items-center gap-1 text-sm font-medium ${stat.up ? 'text-emerald-600' : 'text-rose-600'}`}>
                {stat.change}
                {stat.up ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              </div>
            </div>
            <div className="mt-4">
              <p className="text-slate-500 text-sm font-medium">{stat.label}</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{stat.value}</h3>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-600" />
              Workforce Productivity
            </h3>
            <button className="text-xs font-bold text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors">Details</button>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={DATA_ATTENDANCE}>
                <defs>
                  <linearGradient id="colorPresent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} />
                <Area type="monotone" dataKey="present" stroke="#4f46e5" fillOpacity={1} fill="url(#colorPresent)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-900 mb-8">Department Distribution</h3>
          <div className="h-[250px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={DATA_DEPT} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                  {DATA_DEPT.map((entry, index) => <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
              <span className="text-2xl font-bold text-slate-900">1.2k</span>
              <span className="text-xs text-slate-400 uppercase tracking-widest font-bold">Total</span>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {DATA_DEPT.map((dept, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{backgroundColor: CHART_COLORS[i % CHART_COLORS.length]}}></div>
                  <span className="text-slate-600 font-medium">{dept.name}</span>
                </div>
                <span className="text-slate-900 font-bold">{dept.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderEmployees = () => (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Filter employees..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg flex items-center gap-2 hover:bg-slate-100 font-bold text-xs uppercase tracking-wider">
              <Filter className="w-3 h-3" /> Filter
            </button>
            <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold text-xs uppercase tracking-wider shadow-md">
              <Plus className="w-3 h-3 inline mr-1" /> Add New
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 text-[10px] font-black uppercase tracking-widest border-b border-slate-100">
                <th className="px-6 py-4">Employee</th>
                <th className="px-6 py-4">Position</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Tenure</th>
                <th className="px-6 py-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEmployees.map((emp) => (
                <tr key={emp.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <img src={`https://picsum.photos/seed/emp${emp.id}/40/40`} className="w-9 h-9 rounded-full border border-slate-200 shadow-sm" alt="" />
                      <div>
                        <p className="text-sm font-bold text-slate-900">{emp.name}</p>
                        <p className="text-[10px] text-slate-400 font-bold tracking-tight">{emp.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-semibold text-slate-900">{emp.dept}</p>
                    <p className="text-[10px] text-slate-400 font-bold">{emp.role}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border
                      ${emp.status === 'Active' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                      {emp.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 font-medium">{emp.joinDate}</td>
                  <td className="px-6 py-4">
                    <button className="p-2 hover:bg-slate-200 rounded-full text-slate-400 group-hover:text-slate-600 transition-colors">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderAttendance = () => (
    <div className="space-y-6 animate-in zoom-in-95 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-indigo-600 p-6 rounded-2xl text-white shadow-xl shadow-indigo-600/20 relative overflow-hidden">
          <BadgeCheck className="absolute top-[-20px] right-[-20px] w-32 h-32 opacity-10 rotate-12" />
          <p className="font-bold opacity-80 uppercase tracking-widest text-[10px] mb-4">Live Check-ins</p>
          <div className="flex items-end gap-3">
            <h2 className="text-4xl font-black">942</h2>
            <span className="text-sm font-bold bg-white/20 px-2 py-0.5 rounded mb-1">94.5% Attendance</span>
          </div>
          <p className="mt-4 text-xs font-medium opacity-70">52 employees currently on leave</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] mb-4">Late Arrivals</p>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 font-black">24</div>
            <p className="text-xs text-slate-400 font-medium">Flagged for manager review today</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] mb-4">Average Log-in Time</p>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 font-black">08:52</div>
            <p className="text-xs text-slate-400 font-medium">Standard working hours start at 09:00</p>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 font-bold text-sm uppercase tracking-widest text-slate-400">Terminal Log</div>
        <div className="divide-y divide-slate-100">
          {[
            { name: 'Diana Prince', time: '08:42 AM', status: 'On-time', loc: 'Main HQ' },
            { name: 'Bruce Wayne', time: '08:55 AM', status: 'On-time', loc: 'Gotham Hub' },
            { name: 'Barry Allen', time: '09:05 AM', status: 'Late', loc: 'Central Office' },
          ].map((log, i) => (
            <div key={i} className="px-6 py-4 flex items-center justify-between text-sm">
              <span className="font-bold text-slate-900">{log.name}</span>
              <span className="text-slate-500 font-medium">{log.time}</span>
              <span className="text-slate-400 italic text-xs">{log.loc}</span>
              <span className={`font-black uppercase text-[10px] ${log.status === 'Late' ? 'text-rose-600' : 'text-emerald-600'}`}>{log.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderPayroll = () => (
    <div className="space-y-6 animate-in fade-in duration-700">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-black text-slate-900 text-3xl">$4,852,900</h3>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Total Net Pay (Oct 2023)</p>
          </div>
          <div className="mt-8 pt-6 border-t border-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-600 text-xs font-black">
              <TrendingUp className="w-3 h-3" /> +2.4% VS LAST MONTH
            </div>
            <button className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-indigo-600/20">Process Cycle</button>
          </div>
        </div>
        <div className="bg-slate-900 p-8 rounded-2xl text-white shadow-2xl flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start">
              <Wallet className="text-indigo-400 w-8 h-8" />
              <CreditCard className="text-slate-700 w-12 h-12" />
            </div>
            <h4 className="mt-4 text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">Next Disbursement</h4>
            <h3 className="text-2xl font-black mt-1">31 OCTOBER 2023</h3>
          </div>
          <p className="mt-6 text-[10px] text-slate-500 font-medium">All financial data is encrypted and ISO 27001 compliant.</p>
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="p-4 border-b border-slate-100 font-bold text-xs uppercase tracking-[0.2em] text-slate-400">Departmental Expenses</div>
        <div className="p-6 h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={DATA_DEPT}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} />
              <YAxis hide />
              <Tooltip cursor={{fill: 'transparent'}} contentStyle={{borderRadius: '8px', border: 'none'}} />
              <Bar dataKey="value" fill="#4f46e5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );

  const renderLeaves = () => (
    <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {['PENDING', 'APPROVED', 'ACTIVE TODAY', 'REJECTED'].map((label, i) => (
          <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 text-center">
            <p className="text-[10px] font-black text-slate-400 tracking-widest">{label}</p>
            <h3 className="text-2xl font-black text-slate-900 mt-1">{[24, 156, 18, 5][i]}</h3>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-50">
        {LEAVE_REQUESTS.map((req) => (
          <div key={req.id} className="p-6 flex flex-col md:flex-row items-center gap-6 group hover:bg-slate-50/50 transition-colors">
            <div className="flex items-center gap-4 min-w-[200px]">
              <img src={req.avatar} className="w-10 h-10 rounded-full shadow-sm ring-2 ring-white" alt="" />
              <div>
                <h4 className="text-sm font-black text-slate-900 leading-tight">{req.user}</h4>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">{req.type}</span>
              </div>
            </div>
            <div className="flex-1 grid grid-cols-2 md:grid-cols-2 gap-4">
              <div>
                <p className="text-[8px] font-black uppercase text-slate-400">Duration</p>
                <p className="text-xs font-bold text-slate-700">{req.duration} ({req.dates})</p>
              </div>
              <div>
                <p className="text-[8px] font-black uppercase text-slate-400">Status</p>
                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border
                  ${req.status === 'Approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                    req.status === 'Pending' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                  {req.status}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-colors">Action</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-4 duration-500">
      {[
        { title: 'Security', icon: Shield, desc: 'Manage organization-wide permissions & 2FA.' },
        { title: 'Branding', icon: Palette, desc: 'Custom logos, themes and portal styling.' },
        { title: 'Data Engine', icon: Database, desc: 'API keys, webhooks and historical logs.' },
        { title: 'Compliance', icon: Lock, desc: 'GDPR status, audit trails and policy docs.' },
      ].map((s, i) => (
        <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-200 transition-all cursor-pointer group">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-slate-50 rounded-xl text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-all">
              <s.icon className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-black text-slate-900 uppercase text-xs tracking-widest">{s.title}</h4>
              <p className="text-xs text-slate-500 mt-1">{s.desc}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  // Fixed: Replaced JSX.Element with React.ReactElement to fix "Cannot find namespace 'JSX'" error
  const CONTENT_MAP: Record<TabType, () => React.ReactElement> = {
    overview: renderOverview,
    employees: renderEmployees,
    attendance: renderAttendance,
    payroll: renderPayroll,
    leaves: renderLeaves,
    settings: renderSettings,
  };

  const navItems = [
    { id: 'overview', icon: LayoutDashboard, label: 'Overview' },
    { id: 'employees', icon: Users, label: 'Workforce' },
    { id: 'attendance', icon: Clock, label: 'Tracking' },
    { id: 'payroll', icon: Wallet, label: 'Finance' },
    { id: 'leaves', icon: CalendarOff, label: 'Leaves' },
    { id: 'settings', icon: SettingsIcon, label: 'Config' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-['Inter']">
      {/* Top Floating Dashboard Header */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-2">
            <span className="w-6 h-6 bg-indigo-600 rounded flex items-center justify-center text-[10px] text-white italic">N</span>
            Nexus ERP / <span className="text-indigo-600">{activeTab}</span>
          </h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Administrator Portal - Alpha v1.4.2</p>
        </div>

        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as TabType)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all
                ${activeTab === item.id 
                  ? 'bg-white text-indigo-600 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-900 hover:bg-white/50'}`}
            >
              <item.icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline uppercase tracking-widest text-[9px]">{item.label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Bell className="w-5 h-5 text-slate-400" />
            <span className="absolute top-0 right-0 w-1.5 h-1.5 bg-rose-500 rounded-full ring-2 ring-white"></span>
          </div>
          <div className="h-6 w-px bg-slate-200 mx-2"></div>
          <div className="flex items-center gap-3 cursor-pointer">
            <div className="text-right">
              <p className="text-[10px] font-black uppercase text-slate-900 leading-none">Alex Rivera</p>
              <p className="text-[9px] text-indigo-500 font-bold tracking-tighter">System Admin</p>
            </div>
            <img src="https://picsum.photos/seed/admin/40/40" className="w-8 h-8 rounded-full border border-slate-200" alt="Avatar" />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto p-6 md:p-10 pb-24 overflow-y-auto h-[calc(100vh-80px)]">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">
              {activeTab} Management
            </h2>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">
              <span>Main Console</span>
              <ChevronRight className="w-3 h-3" />
              <span className="text-indigo-500">{activeTab}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-400"><Globe className="w-4 h-4" /></button>
            <button className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl">Export Module</button>
          </div>
        </div>

        {CONTENT_MAP[activeTab]()}

        {/* Floating Quick Stats Footer */}
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-8 py-3 rounded-2xl shadow-2xl flex items-center gap-12 z-50 ring-4 ring-white border border-slate-700 backdrop-blur-xl">
           <div className="flex flex-col items-center">
             <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">Total Salary</span>
             <span className="text-xs font-bold">$4.8M</span>
           </div>
           <div className="h-6 w-px bg-slate-700"></div>
           <div className="flex flex-col items-center">
             <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">Live Users</span>
             <span className="text-xs font-bold flex items-center gap-1.5">
               <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
               142
             </span>
           </div>
           <div className="h-6 w-px bg-slate-700"></div>
           <div className="flex flex-col items-center">
             <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">Incidents</span>
             <span className="text-xs font-bold text-amber-400">03</span>
           </div>
        </div>
      </main>

      {/* Decorative background element */}
      <div className="fixed top-0 right-0 -z-10 w-[500px] h-[500px] bg-indigo-50/50 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="fixed bottom-0 left-0 -z-10 w-[300px] h-[300px] bg-emerald-50/30 rounded-full blur-[80px] pointer-events-none"></div>
    </div>
  );
}
