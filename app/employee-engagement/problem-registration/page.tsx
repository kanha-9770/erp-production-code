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
import { useToast } from '@/hooks/use-toast';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePermissions } from '@/hooks/usePermissions';
import { AlertCircle, Plus, Trash2, Edit2, CheckCircle2, AlertTriangle, LayoutGrid, List, Type, FileText, Tag } from 'lucide-react';
import { useGetEmployeeListQuery } from '@/lib/api/employees';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface ProblemRegistration {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  registrationDate: string;
  status: 'open' | 'in-review' | 'resolved' | 'closed';
  proposedSolution: string;
  userId: string;
  employeeId: string;
}

export default function ProblemRegistrationPage() {
  const { user, isLoading: userLoading } = useCurrentUser();
  const { isAdmin } = usePermissions();
  const [problems, setProblems] = useState<ProblemRegistration[]>([]);
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
    severity: 'medium',
    category: 'operational',
    status: 'open',
    proposedSolution: '',
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
      loadProblems();
    }
  }, [user?.id, isAdmin, employees.length]);

  const loadProblems = async () => {
    try {
      if (!user?.id) return;
      setLoading(false);
      const allProblems: ProblemRegistration[] = [
        {
          id: '1',
          title: 'Slow API Response Times',
          description: 'API endpoints are responding slowly during peak hours',
          severity: 'high',
          category: 'technical',
          registrationDate: '2026-05-01',
          status: 'in-review',
          proposedSolution: 'Implement caching and database optimization',
          userId: user.id,
          employeeId: employees[0]?.id || currentEmployee?.id || '',
        },
        {
          id: '2',
          title: 'Outdated Documentation',
          description: 'Project documentation is not updated with recent changes',
          severity: 'medium',
          category: 'process',
          registrationDate: '2026-04-28',
          status: 'open',
          proposedSolution: 'Schedule documentation review and update sessions',
          userId: user.id,
          employeeId: employees[1]?.id || currentEmployee?.id || '',
        },
        {
          id: '3',
          title: 'Meeting Room Booking Conflicts',
          description: 'Double bookings happening in meeting rooms',
          severity: 'low',
          category: 'operational',
          registrationDate: '2026-05-05',
          status: 'resolved',
          proposedSolution: 'Integrate with calendar system for automatic blocking',
          userId: user.id,
          employeeId: currentEmployee?.id || '',
        },
      ];
      if (isAdmin) {
        setProblems(allProblems);
      } else {
        const userProblems = allProblems.filter(p => p.employeeId === currentEmployee?.id);
        setProblems(userProblems);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load problems',
        variant: 'destructive',
      });
    }
  };

  const handleSubmit = async () => {
    if (!formData.title || !formData.description) {
      toast({
        title: 'Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    if (editingId) {
      setProblems(
        problems.map((p) =>
          p.id === editingId
            ? { ...p, ...formData, registrationDate: p.registrationDate }
            : p
        )
      );
      toast({
        title: 'Success',
        description: 'Problem updated successfully',
      });
    } else {
      const newProblem: ProblemRegistration = {
        id: Date.now().toString(),
        title: formData.title,
        description: formData.description,
        severity: formData.severity as 'low' | 'medium' | 'high' | 'critical',
        category: formData.category,
        status: formData.status as 'open' | 'in-review' | 'resolved' | 'closed',
        proposedSolution: formData.proposedSolution,
        registrationDate: new Date().toISOString().split('T')[0],
        userId: user?.id || '',
        employeeId: currentEmployee?.id || '',
      };
      setProblems([newProblem, ...problems]);
      toast({
        title: 'Success',
        description: 'Problem registered successfully',
      });
    }

    setDialogOpen(false);
    setFormData({
      title: '',
      description: '',
      severity: 'medium',
      category: 'operational',
      status: 'open',
      proposedSolution: '',
    });
    setEditingId(null);
  };

  const handleEdit = (problem: ProblemRegistration) => {
    setFormData({
      title: problem.title,
      description: problem.description,
      severity: problem.severity,
      category: problem.category,
      status: problem.status,
      proposedSolution: problem.proposedSolution,
    });
    setEditingId(problem.id);
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setProblems(problems.filter((p) => p.id !== id));
    toast({
      title: 'Success',
      description: 'Problem deleted successfully',
    });
  };

  const getSeverityIcon = (severity: string) => {
    if (severity === 'critical') {
      return <AlertTriangle className="w-5 h-5 text-red-600" />;
    }
    return <AlertCircle className="w-5 h-5 text-yellow-600" />;
  };

  const getSeverityBadge = (severity: string) => {
    const variants: Record<string, any> = {
      'low': 'secondary',
      'medium': 'default',
      'high': 'default',
      'critical': 'destructive',
    };
    const colors: Record<string, string> = {
      'low': 'bg-green-100 text-green-800',
      'medium': 'bg-yellow-100 text-yellow-800',
      'high': 'bg-orange-100 text-orange-800',
      'critical': 'bg-red-100 text-red-800',
    };
    const labels: Record<string, string> = {
      'low': 'Low',
      'medium': 'Medium',
      'high': 'High',
      'critical': 'Critical',
    };
    return (
      <Badge variant={variants[severity]} className={colors[severity]}>
        {labels[severity]}
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      'open': 'bg-blue-100 text-blue-800',
      'in-review': 'bg-yellow-100 text-yellow-800',
      'resolved': 'bg-green-100 text-green-800',
      'closed': 'bg-gray-100 text-gray-800',
    };
    const labels: Record<string, string> = {
      'open': 'Open',
      'in-review': 'In Review',
      'resolved': 'Resolved',
      'closed': 'Closed',
    };
    return (
      <Badge variant="outline" className={colors[status]}>
        {labels[status]}
      </Badge>
    );
  };

  const uniqueEmployees = Array.from(
    new Set(problems.map((p) => p.employeeId).filter(Boolean))
  ).sort();

  const filteredProblems = problems.filter((problem) => {
    const matchesSearch = problem.title
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' || problem.status === statusFilter;
    const matchesEmployee =
      employeeFilter === 'all' || problem.employeeId === employeeFilter;
    return matchesSearch && matchesStatus && matchesEmployee;
  });

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900 flex items-center gap-2">
            <AlertCircle className="w-8 h-8 text-red-600" />
            Problem Registration
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Register and track workplace problems for resolution.
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
                severity: 'medium',
                category: 'operational',
                status: 'open',
                proposedSolution: '',
              });
              setDialogOpen(true);
            }}
            className="gap-2"
          >
            <Plus className="w-5 h-5" />
            Register Problem
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
                placeholder="Search problems..."
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
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in-review">In Review</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
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
            <div className="text-center py-12">Loading problems...</div>
          ) : filteredProblems.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No problems found</p>
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
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProblems.map((problem) => (
                    <TableRow key={problem.id}>
                      <TableCell className="text-sm font-medium">
                        {getEmployeeName(problem.employeeId)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {problem.title}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {problem.description}
                      </TableCell>
                      <TableCell>{getSeverityBadge(problem.severity)}</TableCell>
                      <TableCell>{getStatusBadge(problem.status)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{problem.category}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(problem.registrationDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(problem)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(problem.id)}
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
            <div className="text-center py-12">Loading problems...</div>
          ) : problems.length === 0 ? (
            <Card className="text-center py-12 md:col-span-2">
              <CardContent>
                <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 mb-4">No problems registered yet</p>
                <Button
                  onClick={() => setDialogOpen(true)}
                  variant="outline"
                >
                  Register a problem
                </Button>
              </CardContent>
            </Card>
          ) : (
            problems.map((problem) => (
              <Card
                key={problem.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => handleEdit(problem)}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {problem.title}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {problem.description}
                      </p>
                      {problem.proposedSolution && (
                        <p className="text-xs text-gray-700 mt-2 bg-blue-50 p-2 rounded">
                          <span className="font-medium">Solution:</span>{' '}
                          {problem.proposedSolution}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(problem.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1">
                      {getSeverityIcon(problem.severity)}
                      {getSeverityBadge(problem.severity)}
                    </div>
                    {getStatusBadge(problem.status)}
                    <Badge variant="outline" className="text-xs">
                      {problem.category}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[800px] p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-gradient-to-r from-red-600 to-rose-500 p-5 text-white">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3 text-xl font-bold">
                <div className="bg-white/20 p-2 rounded-lg backdrop-blur-sm">
                  <AlertCircle className="w-5 h-5 text-white" />
                </div>
                {editingId ? 'Edit Problem' : 'Register Problem'}
              </DialogTitle>
              <DialogDescription className="text-red-50 text-sm mt-0.5">
                Help us improve by identifying and documenting workplace challenges.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="p-6 max-h-[85vh] overflow-y-auto custom-scrollbar">
            <div className="grid gap-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="title" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Type className="w-4 h-4 text-red-600" />
                    Problem Title <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="title"
                    placeholder="e.g., Equipment Malfunction in Lab B"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    className="h-10 border-gray-200 focus:border-red-500 focus:ring-red-500 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="severity" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    Severity Level
                  </Label>
                  <Select
                    value={formData.severity}
                    onValueChange={(value) =>
                      setFormData({ ...formData, severity: value as any })
                    }
                  >
                    <SelectTrigger id="severity" className="h-10 border-gray-200">
                      <SelectValue placeholder="Select severity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low Impact</SelectItem>
                      <SelectItem value="medium">Medium Impact</SelectItem>
                      <SelectItem value="high">High Impact</SelectItem>
                      <SelectItem value="critical">Critical / Emergency</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-red-600" />
                  Problem Description <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="description"
                  placeholder="What happened? When? Where?..."
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  className="min-h-[100px] border-gray-200 focus:border-red-500 focus:ring-red-500 transition-all resize-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="category" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Tag className="w-4 h-4 text-red-600" />
                    Problem Category
                  </Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) =>
                      setFormData({ ...formData, category: value })
                    }
                  >
                    <SelectTrigger id="category" className="h-10 border-gray-200">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="technical">Technical Issue</SelectItem>
                      <SelectItem value="operational">Operational</SelectItem>
                      <SelectItem value="process">Process Related</SelectItem>
                      <SelectItem value="communication">Communication</SelectItem>
                      <SelectItem value="resource">Resource Shortage</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="status" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-gray-400" />
                    Resolution Status
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
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in-review">In Review</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="proposedSolution" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  Your Suggested Solution
                </Label>
                <Textarea
                  id="proposedSolution"
                  placeholder="How can we fix this? (Optional)..."
                  value={formData.proposedSolution}
                  onChange={(e) =>
                    setFormData({ ...formData, proposedSolution: e.target.value })
                  }
                  className="min-h-[80px] border-gray-200 focus:border-green-500 focus:ring-green-500 transition-all resize-none"
                />
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
              className="h-10 px-8 font-bold bg-red-600 hover:bg-red-700 shadow-lg shadow-red-200 transition-all active:scale-95 flex gap-2"
            >
              {editingId ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {editingId ? 'Save Changes' : 'Register Problem'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
