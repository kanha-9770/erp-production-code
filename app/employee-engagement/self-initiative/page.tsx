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
import { Lightbulb, Plus, Trash2, Edit2, CheckCircle2, Calendar, LayoutGrid, List, Type, FileText, Tag } from 'lucide-react';
import { useGetEmployeeListQuery } from '@/lib/api/employees';

interface SelfInitiative {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  status: 'planning' | 'in-progress' | 'completed' | 'on-hold';
  category: string;
  createdAt: string;
  userId: string;
  employeeId: string;
}

export default function SelfInitiativePage() {
  const { user, isLoading: userLoading } = useCurrentUser();
  const { isAdmin } = usePermissions();
  const [initiatives, setInitiatives] = useState<SelfInitiative[]>([]);
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
    startDate: '',
    endDate: '',
    status: 'planning',
    category: 'learning',
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
      loadInitiatives();
    }
  }, [user?.id, isAdmin, employees.length]);

  const loadInitiatives = async () => {
    try {
      if (!user?.id) return;
      setLoading(false);
      const allInitiatives: SelfInitiative[] = [
        {
          id: '1',
          title: 'Mentorship Program for Juniors',
          description: 'Guide junior developers in their career growth',
          startDate: '2026-04-01',
          endDate: '2026-12-31',
          status: 'in-progress',
          category: 'mentoring',
          createdAt: '2026-03-20',
          userId: user.id,
          employeeId: employees[0]?.id || currentEmployee?.id || '',
        },
        {
          id: '2',
          title: 'Process Automation Initiative',
          description: 'Automate repetitive team tasks and workflows',
          startDate: '2026-05-01',
          endDate: '2026-08-31',
          status: 'in-progress',
          category: 'process-improvement',
          createdAt: '2026-04-25',
          userId: user.id,
          employeeId: employees[1]?.id || currentEmployee?.id || '',
        },
        {
          id: '3',
          title: 'Team Communication Enhancement',
          description: 'Improve team communication and collaboration',
          startDate: '2026-06-01',
          endDate: '2026-09-30',
          status: 'planning',
          category: 'team-building',
          createdAt: '2026-05-10',
          userId: user.id,
          employeeId: currentEmployee?.id || '',
        },
      ];
      if (isAdmin) {
        setInitiatives(allInitiatives);
      } else {
        const userInitiatives = allInitiatives.filter(i => i.employeeId === currentEmployee?.id);
        setInitiatives(userInitiatives);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load initiatives',
        variant: 'destructive',
      });
    }
  };

  const handleSubmit = async () => {
    if (!formData.title || !formData.startDate) {
      toast({
        title: 'Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    if (editingId) {
      setInitiatives(
        initiatives.map((i) =>
          i.id === editingId ? { ...i, ...formData } : i
        )
      );
      toast({
        title: 'Success',
        description: 'Initiative updated successfully',
      });
    } else {
      const newInitiative: SelfInitiative = {
        id: Date.now().toString(),
        title: formData.title,
        description: formData.description,
        startDate: formData.startDate,
        endDate: formData.endDate,
        status: formData.status as 'planning' | 'in-progress' | 'completed' | 'on-hold',
        category: formData.category,
        createdAt: new Date().toISOString().split('T')[0],
        userId: user?.id || '',
        employeeId: currentEmployee?.id || '',
      };
      setInitiatives([newInitiative, ...initiatives]);
      toast({
        title: 'Success',
        description: 'Initiative created successfully',
      });
    }

    setDialogOpen(false);
    setFormData({
      title: '',
      description: '',
      startDate: '',
      endDate: '',
      status: 'planning',
      category: 'learning',
    });
    setEditingId(null);
  };

  const handleEdit = (initiative: SelfInitiative) => {
    setFormData({
      title: initiative.title,
      description: initiative.description,
      startDate: initiative.startDate,
      endDate: initiative.endDate,
      status: initiative.status,
      category: initiative.category,
    });
    setEditingId(initiative.id);
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setInitiatives(initiatives.filter((i) => i.id !== id));
    toast({
      title: 'Success',
      description: 'Initiative deleted successfully',
    });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      'planning': 'secondary',
      'in-progress': 'default',
      'completed': 'default',
      'on-hold': 'destructive',
    };
    const labels: Record<string, string> = {
      'planning': 'Planning',
      'in-progress': 'In Progress',
      'completed': 'Completed',
      'on-hold': 'On Hold',
    };
    return (
      <Badge
        variant={variants[status]}
        className={
          status === 'completed'
            ? 'bg-green-100 text-green-800'
            : status === 'in-progress'
            ? 'bg-blue-100 text-blue-800'
            : status === 'on-hold'
            ? 'bg-red-100 text-red-800'
            : ''
        }
      >
        {labels[status]}
      </Badge>
    );
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      'learning': 'Learning',
      'mentoring': 'Mentoring',
      'process-improvement': 'Process Improvement',
      'team-building': 'Team Building',
      'innovation': 'Innovation',
      'other': 'Other',
    };
    return labels[category] || category;
  };

  const uniqueEmployees = Array.from(
    new Set(initiatives.map((i) => i.employeeId).filter(Boolean))
  ).sort();

  const filteredInitiatives = initiatives.filter((initiative) => {
    const matchesSearch = initiative.title
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' || initiative.status === statusFilter;
    const matchesEmployee =
      employeeFilter === 'all' || initiative.employeeId === employeeFilter;
    return matchesSearch && matchesStatus && matchesEmployee;
  });

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900 flex items-center gap-2">
            <Lightbulb className="w-8 h-8 text-yellow-600" />
            Self Initiative
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Document and manage your self-initiated improvement projects.
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
                startDate: '',
                endDate: '',
                status: 'planning',
                category: 'learning',
              });
              setDialogOpen(true);
            }}
            className="gap-2"
          >
            <Plus className="w-5 h-5" />
            New Initiative
          </Button>
        </div>
      </div>

      {layout === 'list' ? (
        <>
          <div className="mb-6 flex gap-3 sm:gap-4 items-end flex-wrap">
            <div className="flex-1 min-w-[180px] sm:min-w-64">
              <Label htmlFor="search" className="text-sm font-medium">
                Search
              </Label>
              <Input
                id="search"
                placeholder="Search initiatives..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="w-36 sm:w-48">
              <Label htmlFor="status-filter" className="text-sm font-medium">
                Status
              </Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="planning">Planning</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="on-hold">On Hold</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isAdmin && (
              <div className="w-36 sm:w-48">
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
            <div className="text-center py-12">Loading initiatives...</div>
          ) : filteredInitiatives.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <Lightbulb className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No initiatives found</p>
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
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead className="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInitiatives.map((initiative) => (
                    <TableRow key={initiative.id}>
                      <TableCell className="text-sm font-medium">
                        {getEmployeeName(initiative.employeeId)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {initiative.title}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {initiative.description}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {getCategoryLabel(initiative.category)}
                        </Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(initiative.status)}</TableCell>
                      <TableCell className="text-sm">
                        {new Date(initiative.startDate).toLocaleDateString()} -{' '}
                        {new Date(initiative.endDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(initiative)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(initiative.id)}
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
            <div className="text-center py-12">Loading initiatives...</div>
          ) : initiatives.length === 0 ? (
            <Card className="text-center py-12 md:col-span-2">
              <CardContent>
                <Lightbulb className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 mb-4">No initiatives yet</p>
                <Button
                  onClick={() => setDialogOpen(true)}
                  variant="outline"
                >
                  Create your first initiative
                </Button>
              </CardContent>
            </Card>
          ) : (
            initiatives.map((initiative) => (
              <Card
                key={initiative.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => handleEdit(initiative)}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {initiative.title}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {initiative.description}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(initiative.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    {getStatusBadge(initiative.status)}
                    <Badge variant="outline">
                      {getCategoryLabel(initiative.category)}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-600">
                    {new Date(initiative.startDate).toLocaleDateString()} -{' '}
                    {new Date(initiative.endDate).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[800px] p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-gradient-to-r from-yellow-500 to-amber-600 p-5 text-white">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3 text-xl font-bold">
                <div className="bg-white/20 p-2 rounded-lg backdrop-blur-sm">
                  <Lightbulb className="w-5 h-5 text-white" />
                </div>
                {editingId ? 'Edit Initiative' : 'New Initiative'}
              </DialogTitle>
              <DialogDescription className="text-yellow-50 text-sm mt-0.5">
                Take the lead. Document your self-initiated projects and growth.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="p-6 max-h-[85vh] overflow-y-auto custom-scrollbar">
            <div className="grid gap-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="title" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Type className="w-4 h-4 text-amber-600" />
                    Initiative Title <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="title"
                    placeholder="e.g., Implementing a New Onboarding Guide"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    className="h-10 border-gray-200 focus:border-amber-500 focus:ring-amber-500 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Tag className="w-4 h-4 text-amber-600" />
                    Category
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
                      <SelectItem value="learning">Skill Learning</SelectItem>
                      <SelectItem value="mentoring">Mentoring Others</SelectItem>
                      <SelectItem value="process-improvement">Process Improvement</SelectItem>
                      <SelectItem value="team-building">Team Building</SelectItem>
                      <SelectItem value="innovation">Product Innovation</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-600" />
                  Description & Scope
                </Label>
                <Textarea
                  id="description"
                  placeholder="What are you planning to achieve?..."
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  className="min-h-[80px] border-gray-200 focus:border-amber-500 focus:ring-amber-500 transition-all resize-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="startDate" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-amber-600" />
                    Start Date <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={formData.startDate}
                    onChange={(e) =>
                      setFormData({ ...formData, startDate: e.target.value })
                    }
                    className="h-10 border-gray-200 focus:border-amber-500 focus:ring-amber-500 transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="endDate" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-amber-600" />
                    Target End Date
                  </Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={formData.endDate}
                    onChange={(e) =>
                      setFormData({ ...formData, endDate: e.target.value })
                    }
                    className="h-10 border-gray-200 focus:border-amber-500 focus:ring-amber-500 transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="status" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-amber-600" />
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
                      <SelectItem value="planning">Planning</SelectItem>
                      <SelectItem value="in-progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="on-hold">On Hold</SelectItem>
                    </SelectContent>
                  </Select>
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
              className="h-10 px-8 font-bold bg-amber-500 hover:bg-amber-600 shadow-lg shadow-amber-200 transition-all active:scale-95 flex gap-2 text-white"
            >
              {editingId ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {editingId ? 'Save Changes' : 'Create Initiative'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
