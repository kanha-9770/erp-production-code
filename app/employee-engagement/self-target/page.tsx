'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePermissions } from '@/hooks/usePermissions';
import { Target, Plus, Trash2, Edit2, CheckCircle2, Clock, LayoutGrid, List, Type, FileText, Calendar, Zap } from 'lucide-react';
import { useGetEmployeeListQuery } from '@/lib/api/employees';

interface SelfTarget {
  id: string;
  title: string;
  description: string;
  targetDate: string;
  status: 'not-started' | 'in-progress' | 'completed';
  progress: number;
  createdAt: string;
  userId: string;
  employeeId: string;
}

export default function SelfTargetPage() {
  const { user, isLoading: userLoading } = useCurrentUser();
  const { isAdmin } = usePermissions();
  const [targets, setTargets] = useState<SelfTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [layout, setLayout] = useState<'list' | 'form'>('list');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    targetDate: '',
    status: 'not-started',
    progress: 0,
  });
  const { toast } = useToast();

  // Employee Master lookup
  const { data: empData } = useGetEmployeeListQuery();
  const employees = empData?.employees ?? [];
  const employeeLookup = new Map(employees.map(e => [e.id, e]));
  const currentEmployee = employees.find(e => e.userId === user?.id);
  const getEmployeeName = (id: string) => employeeLookup.get(id)?.employeeName ?? id;

  useEffect(() => {
    if (user?.id) {
      loadTargets();
    }
  }, [user?.id, isAdmin, employees.length]);

  const loadTargets = async () => {
    try {
      if (!user?.id) return;
      setLoading(false);
      const allTargets: SelfTarget[] = [
        {
          id: '1',
          title: 'Complete Advanced TypeScript Course',
          description: 'Master advanced TypeScript concepts and patterns',
          targetDate: '2026-06-30',
          status: 'in-progress',
          progress: 65,
          createdAt: '2026-04-10',
          userId: user.id,
          employeeId: employees[0]?.id || currentEmployee?.id || '',
        },
        {
          id: '2',
          title: 'Improve Code Review Quality',
          description: 'Provide detailed and constructive code reviews',
          targetDate: '2026-08-31',
          status: 'in-progress',
          progress: 45,
          createdAt: '2026-04-15',
          userId: user.id,
          employeeId: employees[1]?.id || currentEmployee?.id || '',
        },
        {
          id: '3',
          title: 'Lead Project Documentation',
          description: 'Create comprehensive documentation for the new module',
          targetDate: '2026-07-15',
          status: 'not-started',
          progress: 0,
          createdAt: '2026-05-01',
          userId: user.id,
          employeeId: currentEmployee?.id || '',
        },
      ];
      if (isAdmin) {
        setTargets(allTargets);
      } else {
        const userTargets = allTargets.filter(t => t.employeeId === currentEmployee?.id);
        setTargets(userTargets);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load targets',
        variant: 'destructive',
      });
    }
  };

  const handleSubmit = async () => {
    if (!formData.title || !formData.targetDate) {
      toast({
        title: 'Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    if (editingId) {
      setTargets(
        targets.map((t) =>
          t.id === editingId ? { ...t, ...formData } : t
        )
      );
      toast({
        title: 'Success',
        description: 'Target updated successfully',
      });
    } else {
      const newTarget: SelfTarget = {
        id: Date.now().toString(),
        title: formData.title,
        description: formData.description,
        targetDate: formData.targetDate,
        status: formData.status as 'not-started' | 'in-progress' | 'completed',
        progress: formData.progress,
        createdAt: new Date().toISOString().split('T')[0],
        userId: user?.id || '',
        employeeId: currentEmployee?.id || '',
      };
      setTargets([newTarget, ...targets]);
      toast({
        title: 'Success',
        description: 'Target created successfully',
      });
    }

    setDialogOpen(false);
    setFormData({
      title: '',
      description: '',
      targetDate: '',
      status: 'not-started',
      progress: 0,
    });
    setEditingId(null);
  };

  const handleEdit = (target: SelfTarget) => {
    setFormData({
      title: target.title,
      description: target.description,
      targetDate: target.targetDate,
      status: target.status,
      progress: target.progress,
    });
    setEditingId(target.id);
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setTargets(targets.filter((t) => t.id !== id));
    toast({
      title: 'Success',
      description: 'Target deleted successfully',
    });
  };

  const getStatusIcon = (status: string) => {
    return status === 'completed' ? (
      <CheckCircle2 className="w-5 h-5 text-green-600" />
    ) : (
      <Clock className="w-5 h-5 text-yellow-600" />
    );
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      'not-started': 'secondary',
      'in-progress': 'default',
      'completed': 'default',
    };
    const labels: Record<string, string> = {
      'not-started': 'Not Started',
      'in-progress': 'In Progress',
      'completed': 'Completed',
    };
    return (
      <Badge
        variant={variants[status]}
        className={
          status === 'completed'
            ? 'bg-green-100 text-green-800'
            : status === 'in-progress'
            ? 'bg-blue-100 text-blue-800'
            : ''
        }
      >
        {labels[status]}
      </Badge>
    );
  };

  const filteredTargets = targets.filter((target) => {
    const matchesSearch = target.title
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' || target.status === statusFilter;
    const matchesEmployee = employeeFilter === 'all' || target.employeeId === employeeFilter;
    return matchesSearch && matchesStatus && matchesEmployee;
  });

  const uniqueEmployees = Array.from(
    new Set(targets.map(t => t.employeeId).filter(Boolean))
  ).sort();

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900 flex items-center gap-2">
            <Target className="w-8 h-8 text-blue-600" />
            Self Target
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Set and track your personal performance targets and goals.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            <Button
              size="sm"
              variant={layout === 'list' ? 'default' : 'ghost'}
              onClick={() => setLayout('list')}
              className="gap-2"
            >
              <List className="w-4 h-4" />
              List
            </Button>
            <Button
              size="sm"
              variant={layout === 'form' ? 'default' : 'ghost'}
              onClick={() => setLayout('form')}
              className="gap-2"
            >
              <LayoutGrid className="w-4 h-4" />
              Form
            </Button>
          </div>
          <Button
            onClick={() => {
              setEditingId(null);
              setFormData({
                title: '',
                description: '',
                targetDate: '',
                status: 'not-started',
                progress: 0,
              });
              setDialogOpen(true);
            }}
            className="gap-2"
          >
            <Plus className="w-5 h-5" />
            New Target
          </Button>
        </div>
      </div>

      {layout === 'list' ? (
        <>
          <div className="mb-6 flex gap-4 items-end flex-wrap">
            <div className="flex-1 min-w-64">
              <Label htmlFor="search" className="text-sm font-medium">
                Search
              </Label>
              <Input
                id="search"
                placeholder="Search targets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="w-48">
              <Label htmlFor="status-filter" className="text-sm font-medium">
                Status
              </Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="not-started">Not Started</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isAdmin && (
              <div className="w-48">
                <Label htmlFor="employee-filter" className="text-sm font-medium">
                  Employee
                </Label>
                <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="All Employees" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Employees</SelectItem>
                    {uniqueEmployees.map((empId) => (
                      <SelectItem key={empId} value={empId}>
                        {getEmployeeName(empId)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {loading ? (
            <div className="text-center py-12">Loading targets...</div>
          ) : filteredTargets.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <Target className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No targets found</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Target Date</TableHead>
                    <TableHead className="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTargets.map((target) => (
                    <TableRow key={target.id}>
                      <TableCell className="text-sm font-medium">
                        {getEmployeeName(target.employeeId)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {target.title}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {target.description}
                      </TableCell>
                      <TableCell>{getStatusBadge(target.status)}</TableCell>
                      <TableCell>
                        <div className="w-full max-w-xs">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-blue-600 h-2 rounded-full"
                                style={{ width: `${target.progress}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium min-w-10">
                              {target.progress}%
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(target.targetDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(target)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(target.id)}
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {loading ? (
            <div className="text-center py-12">Loading targets...</div>
          ) : targets.length === 0 ? (
            <Card className="text-center py-12 md:col-span-2">
              <CardContent>
                <Target className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 mb-4">No targets set yet</p>
                <Button
                  onClick={() => setDialogOpen(true)}
                  variant="outline"
                >
                  Create your first target
                </Button>
              </CardContent>
            </Card>
          ) : (
            targets.map((target) => (
              <Card
                key={target.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => handleEdit(target)}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {target.title}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {target.description}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(target.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>

                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(target.status)}
                      {getStatusBadge(target.status)}
                    </div>
                    <span className="text-xs text-gray-600">
                      {new Date(target.targetDate).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${target.progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-600 mt-2">
                    {target.progress}% Complete
                  </p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[800px] p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-gradient-to-r from-blue-600 to-cyan-500 p-5 text-white">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3 text-xl font-bold">
                <div className="bg-white/20 p-2 rounded-lg backdrop-blur-sm">
                  <Target className="w-5 h-5 text-white" />
                </div>
                {editingId ? 'Edit Target' : 'New Target'}
              </DialogTitle>
              <DialogDescription className="text-blue-50 text-sm mt-0.5">
                Aim high. Set personal performance targets and track your journey.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="p-6 max-h-[85vh] overflow-y-auto custom-scrollbar">
            <div className="grid gap-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="title" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Type className="w-4 h-4 text-blue-600" />
                    Target Title <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="title"
                    placeholder="e.g., Achieve 95% Code Coverage"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    className="h-10 border-gray-200 focus:border-blue-500 focus:ring-blue-500 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="targetDate" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-600" />
                    Completion Date <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="targetDate"
                    type="date"
                    value={formData.targetDate}
                    onChange={(e) =>
                      setFormData({ ...formData, targetDate: e.target.value })
                    }
                    className="h-10 border-gray-200 focus:border-blue-500 focus:ring-blue-500 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-600" />
                  Detailed Description
                </Label>
                <Textarea
                  id="description"
                  placeholder="Break down your target into actionable steps..."
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  className="min-h-[80px] border-gray-200 focus:border-blue-500 focus:ring-blue-500 transition-all resize-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <div className="space-y-2">
                  <Label htmlFor="status" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-blue-600" />
                    Status
                  </Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) =>
                      setFormData({ ...formData, status: value as any })
                    }
                  >
                    <SelectTrigger id="status" className="h-10 border-gray-200">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="not-started">Not Started</SelectItem>
                      <SelectItem value="in-progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100">
                  <div className="flex justify-between items-center mb-4">
                    <Label htmlFor="progress" className="text-xs font-bold text-blue-900 flex items-center gap-2">
                      <Zap className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                      PROGRESS: {formData.progress}%
                    </Label>
                  </div>
                  <Input
                    id="progress"
                    type="range"
                    min="0"
                    max="100"
                    value={formData.progress}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        progress: parseInt(e.target.value) || 0,
                      })
                    }
                    className="h-1.5 bg-blue-100 rounded-lg appearance-none cursor-pointer accent-blue-600 w-full"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 p-4 flex justify-end gap-3 border-t border-gray-100">
            <Button 
              variant="outline" 
              onClick={() => setDialogOpen(false)}
              className="h-10 px-6 font-medium"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit} 
              className="h-10 px-8 font-bold bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95 flex gap-2"
            >
              {editingId ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {editingId ? 'Save Changes' : 'Create Target'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
