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
import { TrendingUp, Plus, Trash2, Edit2, ThumbsUp, CheckCircle2, LayoutGrid, List, Type, FileText, Layout, Lightbulb, Zap, ArrowRight, Save, X, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGetEmployeeListQuery } from '@/lib/api/employees';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Kaizen {
  id: string;
  title: string;
  description: string;
  currentState: string;
  proposedState: string;
  benefits: string;
  status: 'idea' | 'approved' | 'in-implementation' | 'implemented';
  submissionDate: string;
  votes: number;
  hasVoted: boolean;
  employeeId: string;
}

export default function KaizenPage() {
  const { user, isLoading: userLoading } = useCurrentUser();
  const { isAdmin } = usePermissions();
  const [kaizens, setKaizens] = useState<Kaizen[]>([]);
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
    currentState: '',
    proposedState: '',
    benefits: '',
    status: 'idea',
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
      loadKaizens();
    }
  }, [user?.id, isAdmin, employees.length]);

  const loadKaizens = async () => {
    try {
      if (!user?.id) return;
      setLoading(false);
      const allKaizens: Kaizen[] = [
        {
          id: '1',
          title: 'Implement Automated Testing Pipeline',
          description: 'Set up CI/CD pipeline with automated tests',
          currentState: 'Manual testing process',
          proposedState: 'Automated testing with CI/CD pipeline',
          benefits: '30% reduction in testing time, fewer production bugs',
          status: 'in-implementation',
          submissionDate: '2026-04-15',
          votes: 12,
          hasVoted: false,
          employeeId: employees[0]?.id || currentEmployee?.id || '',
        },
        {
          id: '2',
          title: 'Optimize Database Query Performance',
          description: 'Analyze and optimize slow database queries',
          currentState: 'Slow query response times',
          proposedState: 'Optimized queries with proper indexing',
          benefits: '50% improvement in API response time',
          status: 'approved',
          submissionDate: '2026-04-20',
          votes: 8,
          hasVoted: true,
          employeeId: employees[1]?.id || currentEmployee?.id || '',
        },
        {
          id: '3',
          title: 'Monthly Retrospective Sessions',
          description: 'Conduct monthly team retrospectives',
          currentState: 'Ad-hoc problem discussions',
          proposedState: 'Structured monthly retrospectives',
          benefits: 'Better team communication and continuous improvement',
          status: 'idea',
          submissionDate: '2026-05-05',
          votes: 5,
          hasVoted: false,
          employeeId: currentEmployee?.id || '',
        },
        {
          id: '4',
          title: 'Documentation Template Standardization',
          description: 'Create standard documentation templates',
          currentState: 'Inconsistent documentation format',
          proposedState: 'Standardized templates for all documents',
          benefits: 'Improved documentation quality and consistency',
          status: 'implemented',
          submissionDate: '2026-03-01',
          votes: 10,
          hasVoted: true,
          employeeId: currentEmployee?.id || '',
        },
      ];
      if (isAdmin) {
        setKaizens(allKaizens);
      } else {
        const userKaizens = allKaizens.filter(k => k.employeeId === currentEmployee?.id);
        setKaizens(userKaizens);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load kaizens',
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
      setKaizens(
        kaizens.map((k) =>
          k.id === editingId
            ? { ...k, ...formData, submissionDate: k.submissionDate, votes: k.votes, hasVoted: k.hasVoted }
            : k
        )
      );
      toast({
        title: 'Success',
        description: 'Kaizen updated successfully',
      });
    } else {
      const newKaizen: Kaizen = {
        id: Date.now().toString(),
        title: formData.title,
        description: formData.description,
        currentState: formData.currentState,
        proposedState: formData.proposedState,
        benefits: formData.benefits,
        status: formData.status as 'idea' | 'approved' | 'in-implementation' | 'implemented',
        submissionDate: new Date().toISOString().split('T')[0],
        votes: 0,
        hasVoted: false,
        employeeId: currentEmployee?.id || '',
      };
      setKaizens([newKaizen, ...kaizens]);
      toast({
        title: 'Success',
        description: 'Kaizen submitted successfully',
      });
    }

    setDialogOpen(false);
    setFormData({
      title: '',
      description: '',
      currentState: '',
      proposedState: '',
      benefits: '',
      status: 'idea',
    });
    setEditingId(null);
  };

  const handleEdit = (kaizen: Kaizen) => {
    setFormData({
      title: kaizen.title,
      description: kaizen.description,
      currentState: kaizen.currentState,
      proposedState: kaizen.proposedState,
      benefits: kaizen.benefits,
      status: kaizen.status,
    });
    setEditingId(kaizen.id);
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setKaizens(kaizens.filter((k) => k.id !== id));
    toast({
      title: 'Success',
      description: 'Kaizen deleted successfully',
    });
  };

  const handleVote = (id: string) => {
    setKaizens(
      kaizens.map((k) =>
        k.id === id
          ? {
              ...k,
              votes: k.hasVoted ? k.votes - 1 : k.votes + 1,
              hasVoted: !k.hasVoted,
            }
          : k
      )
    );
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      'idea': 'secondary',
      'approved': 'default',
      'in-implementation': 'default',
      'implemented': 'default',
    };
    const colors: Record<string, string> = {
      'idea': '',
      'approved': 'bg-blue-100 text-blue-800',
      'in-implementation': 'bg-yellow-100 text-yellow-800',
      'implemented': 'bg-green-100 text-green-800',
    };
    const labels: Record<string, string> = {
      'idea': 'Idea',
      'approved': 'Approved',
      'in-implementation': 'In Implementation',
      'implemented': 'Implemented',
    };
    return (
      <Badge variant={variants[status]} className={colors[status]}>
        {labels[status]}
      </Badge>
    );
  };

  const uniqueEmployees = Array.from(
    new Set(kaizens.map((k) => k.employeeId).filter(Boolean))
  ).sort();

  const filteredKaizens = kaizens.filter((kaizen) => {
    const matchesSearch = kaizen.title
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' || kaizen.status === statusFilter;
    const matchesEmployee =
      employeeFilter === 'all' || kaizen.employeeId === employeeFilter;
    return matchesSearch && matchesStatus && matchesEmployee;
  });

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900 flex items-center gap-2">
            <TrendingUp className="w-8 h-8 text-green-600" />
            Kaizen
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Continuous improvement suggestions and implementation. Share your ideas to improve our processes.
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
                currentState: '',
                proposedState: '',
                benefits: '',
                status: 'idea',
              });
              setDialogOpen(true);
            }}
            className="gap-2"
          >
            <Plus className="w-5 h-5" />
            New Kaizen
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
                placeholder="Search kaizens..."
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
                  <SelectItem value="idea">Idea</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="in-implementation">In Implementation</SelectItem>
                  <SelectItem value="implemented">Implemented</SelectItem>
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
            <div className="text-center py-12">Loading kaizens...</div>
          ) : filteredKaizens.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <TrendingUp className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No kaizens found</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Votes</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredKaizens.map((kaizen) => (
                    <TableRow key={kaizen.id}>
                      <TableCell className="text-sm">
                        <span className="font-medium">{getEmployeeName(kaizen.employeeId)}</span>
                      </TableCell>
                      <TableCell className="font-medium">
                        {kaizen.title}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {kaizen.description}
                      </TableCell>
                      <TableCell>{getStatusBadge(kaizen.status)}</TableCell>
                      <TableCell>
                        <Button
                          variant={kaizen.hasVoted ? 'default' : 'outline'}
                          size="sm"
                          className="gap-2"
                          onClick={() => handleVote(kaizen.id)}
                        >
                          <ThumbsUp className="w-3 h-3" />
                          {kaizen.votes}
                        </Button>
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(kaizen.submissionDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(kaizen)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(kaizen.id)}
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
            <div className="text-center py-12">Loading kaizens...</div>
          ) : kaizens.length === 0 ? (
            <Card className="text-center py-12 md:col-span-2">
              <CardContent>
                <TrendingUp className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 mb-4">No kaizens yet</p>
                <Button
                  onClick={() => setDialogOpen(true)}
                  variant="outline"
                >
                  Submit your first kaizen idea
                </Button>
              </CardContent>
            </Card>
          ) : (
            kaizens.map((kaizen) => (
              <Card
                key={kaizen.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => handleEdit(kaizen)}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {kaizen.title}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {kaizen.description}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(kaizen.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>

                  <div className="bg-gray-50 p-3 rounded-lg mb-4 space-y-1 text-xs">
                    <div>
                      <span className="font-semibold text-gray-700">Current:</span>
                      <p className="text-gray-600">{kaizen.currentState}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-700">Proposed:</span>
                      <p className="text-gray-600">{kaizen.proposedState}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    {getStatusBadge(kaizen.status)}
                    <Button
                      variant={kaizen.hasVoted ? 'default' : 'outline'}
                      size="sm"
                      className="gap-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleVote(kaizen.id);
                      }}
                    >
                      <ThumbsUp className="w-3 h-3" />
                      {kaizen.votes}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[850px] p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-gradient-to-r from-green-600 to-emerald-500 p-5 text-white">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3 text-xl font-bold">
                <div className="bg-white/20 p-2 rounded-lg backdrop-blur-sm">
                  <TrendingUp className="w-5 h-5 text-white" />
                </div>
                {editingId ? 'Edit Kaizen' : 'New Kaizen'}
              </DialogTitle>
              <DialogDescription className="text-green-50 text-sm mt-0.5">
                Share your innovative ideas to drive continuous improvement.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="p-6 max-h-[85vh] overflow-y-auto custom-scrollbar">
            <div className="grid gap-6">
              {/* Row 1: Title & Status */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="title" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Type className="w-4 h-4 text-green-600" />
                    Kaizen Title <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="title"
                    placeholder="e.g., Implement Automated Testing Pipeline"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    className="h-10 border-gray-200 focus:border-green-500 focus:ring-green-500 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
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
                      <SelectItem value="idea">Initial Idea</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="in-implementation">In Implementation</SelectItem>
                      <SelectItem value="implemented">Implemented</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Row 2: Description */}
              <div className="space-y-2">
                <Label htmlFor="description" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-green-600" />
                  Core Description <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="description"
                  placeholder="Explain the 'what' and 'why' of your idea..."
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  className="min-h-[80px] border-gray-200 focus:border-green-500 focus:ring-green-500 transition-all resize-none"
                />
              </div>

              {/* Row 3: Current vs Proposed */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-gray-50/50 rounded-xl border border-gray-100">
                <div className="space-y-2">
                  <Label htmlFor="currentState" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Layout className="w-4 h-4 text-amber-500" />
                    Current Process
                  </Label>
                  <Textarea
                    id="currentState"
                    placeholder="How is it done currently?"
                    value={formData.currentState}
                    onChange={(e) =>
                      setFormData({ ...formData, currentState: e.target.value })
                    }
                    className="min-h-[80px] bg-white border-gray-200 focus:border-amber-500 focus:ring-amber-500 transition-all resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="proposedState" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-blue-500" />
                    Proposed Improvement
                  </Label>
                  <Textarea
                    id="proposedState"
                    placeholder="What is your suggested change?"
                    value={formData.proposedState}
                    onChange={(e) =>
                      setFormData({ ...formData, proposedState: e.target.value })
                    }
                    className="min-h-[80px] bg-white border-gray-200 focus:border-blue-500 focus:ring-blue-500 transition-all resize-none"
                  />
                </div>
              </div>

              {/* Row 4: Benefits */}
              <div className="space-y-2">
                <Label htmlFor="benefits" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-500" />
                  Expected Impact & Benefits
                </Label>
                <Textarea
                  id="benefits"
                  placeholder="Efficiency, cost savings, quality, etc."
                  value={formData.benefits}
                  onChange={(e) =>
                    setFormData({ ...formData, benefits: e.target.value })
                  }
                  className="min-h-[80px] border-gray-200 focus:border-yellow-500 focus:ring-yellow-500 transition-all resize-none"
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
              className="h-10 px-8 font-bold bg-green-600 hover:bg-green-700 shadow-lg shadow-green-200 transition-all active:scale-95 flex gap-2"
            >
              {editingId ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {editingId ? 'Save Changes' : 'Submit Kaizen'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
