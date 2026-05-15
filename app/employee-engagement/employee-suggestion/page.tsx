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
import { MessageSquare, Plus, Trash2, Edit2, CheckCircle2, Clock, LayoutGrid, List, Tag, Type, FileText } from 'lucide-react';
import { useGetEmployeeListQuery } from '@/lib/api/employees';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface EmployeeSuggestion {
  id: string;
  title: string;
  suggestion: string;
  category: string;
  status: 'submitted' | 'under-review' | 'accepted' | 'rejected' | 'implemented';
  submissionDate: string;
  feedback?: string;
  userId: string;
  employeeId: string;
}

export default function EmployeeSuggestionPage() {
  const { user, isLoading: userLoading } = useCurrentUser();
  const { isAdmin } = usePermissions();
  const [suggestions, setSuggestions] = useState<EmployeeSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [layout, setLayout] = useState<'list' | 'form'>('list');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');
  const [formData, setFormData] = useState({
    title: '',
    suggestion: '',
    category: 'general',
    status: 'submitted',
    feedback: '',
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
      loadSuggestions();
    }
  }, [user?.id, isAdmin, employees.length]);

  const loadSuggestions = async () => {
    try {
      if (!user?.id) return;
      setLoading(false);
      const allSuggestions: EmployeeSuggestion[] = [
        {
          id: '1',
          title: 'Flexible Work Hours Policy',
          suggestion: 'Implement flexible work hours to improve work-life balance',
          category: 'hr-policy',
          status: 'accepted',
          submissionDate: '2026-04-10',
          feedback: 'Great idea! We are planning to implement this next quarter.',
          userId: user.id,
          employeeId: employees[0]?.id || currentEmployee?.id || '',
        },
        {
          id: '2',
          title: 'Weekly Tech Talks',
          suggestion: 'Organize weekly tech talks to share knowledge',
          category: 'learning',
          status: 'implemented',
          submissionDate: '2026-03-15',
          feedback: 'Implemented! First tech talk is scheduled for next week.',
          userId: user.id,
          employeeId: employees[1]?.id || currentEmployee?.id || '',
        },
        {
          id: '3',
          title: 'Improve Office Kitchen',
          suggestion: 'Upgrade kitchen facilities with better appliances',
          category: 'facilities',
          status: 'under-review',
          submissionDate: '2026-04-28',
          userId: user.id,
          employeeId: currentEmployee?.id || '',
        },
        {
          id: '4',
          title: 'Remote Work Benefits',
          suggestion: 'Provide better home office setup allowance',
          category: 'benefits',
          status: 'submitted',
          submissionDate: '2026-05-05',
          userId: user.id,
          employeeId: currentEmployee?.id || '',
        },
        {
          id: '5',
          title: 'Annual Team Outing',
          suggestion: 'Organize team building outing twice a year',
          category: 'team-building',
          status: 'rejected',
          submissionDate: '2026-04-20',
          feedback: 'Budget constraints prevent this at the moment.',
          userId: user.id,
          employeeId: currentEmployee?.id || '',
        },
      ];
      if (isAdmin) {
        setSuggestions(allSuggestions);
      } else {
        const userSuggestions = allSuggestions.filter(s => s.employeeId === currentEmployee?.id);
        setSuggestions(userSuggestions);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load suggestions',
        variant: 'destructive',
      });
    }
  };

  const handleSubmit = async () => {
    if (!formData.title || !formData.suggestion) {
      toast({
        title: 'Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    if (editingId) {
      setSuggestions(
        suggestions.map((s) =>
          s.id === editingId
            ? {
                ...s,
                title: formData.title,
                suggestion: formData.suggestion,
                category: formData.category,
                status: formData.status as 'submitted' | 'under-review' | 'accepted' | 'rejected' | 'implemented',
                feedback: formData.feedback,
                submissionDate: s.submissionDate,
              }
            : s
        )
      );
      toast({
        title: 'Success',
        description: 'Suggestion updated successfully',
      });
    } else {
      const newSuggestion: EmployeeSuggestion = {
        id: Date.now().toString(),
        title: formData.title,
        suggestion: formData.suggestion,
        category: formData.category,
        status: formData.status as 'submitted' | 'under-review' | 'accepted' | 'rejected' | 'implemented',
        feedback: formData.feedback,
        submissionDate: new Date().toISOString().split('T')[0],
        userId: user?.id || '',
        employeeId: currentEmployee?.id || '',
      };
      setSuggestions([newSuggestion, ...suggestions]);
      toast({
        title: 'Success',
        description: 'Suggestion submitted successfully',
      });
    }

    setDialogOpen(false);
    setFormData({
      title: '',
      suggestion: '',
      category: 'general',
      status: 'submitted',
      feedback: '',
    });
    setEditingId(null);
  };

  const handleEdit = (suggestion: EmployeeSuggestion) => {
    setFormData({
      title: suggestion.title,
      suggestion: suggestion.suggestion,
      category: suggestion.category,
      status: suggestion.status,
      feedback: suggestion.feedback || '',
    });
    setEditingId(suggestion.id);
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setSuggestions(suggestions.filter((s) => s.id !== id));
    toast({
      title: 'Success',
      description: 'Suggestion deleted successfully',
    });
  };

  const getStatusIcon = (status: string) => {
    if (status === 'implemented' || status === 'accepted') {
      return <CheckCircle2 className="w-5 h-5 text-green-600" />;
    }
    return <Clock className="w-5 h-5 text-yellow-600" />;
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      'submitted': 'bg-blue-100 text-blue-800',
      'under-review': 'bg-yellow-100 text-yellow-800',
      'accepted': 'bg-green-100 text-green-800',
      'implemented': 'bg-green-100 text-green-800',
      'rejected': 'bg-red-100 text-red-800',
    };
    const labels: Record<string, string> = {
      'submitted': 'Submitted',
      'under-review': 'Under Review',
      'accepted': 'Accepted',
      'implemented': 'Implemented',
      'rejected': 'Rejected',
    };
    return (
      <Badge variant="outline" className={colors[status]}>
        {labels[status]}
      </Badge>
    );
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      'general': 'General',
      'hr-policy': 'HR Policy',
      'learning': 'Learning',
      'facilities': 'Facilities',
      'benefits': 'Benefits',
      'team-building': 'Team Building',
      'process': 'Process',
      'other': 'Other',
    };
    return labels[category] || category;
  };

  const uniqueEmployees = Array.from(
    new Set(suggestions.map((s) => s.employeeId).filter(Boolean))
  ).sort();

  const filteredSuggestions = suggestions.filter((suggestion) => {
    const matchesSearch = suggestion.title
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' || suggestion.status === statusFilter;
    const matchesEmployee = employeeFilter === 'all' || suggestion.employeeId === employeeFilter;
    return matchesSearch && matchesStatus && matchesEmployee;
  });

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900 flex items-center gap-2">
            <MessageSquare className="w-8 h-8 text-purple-600" />
            Employee Suggestion
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Submit and track your suggestions for organizational improvement.
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
                suggestion: '',
                category: 'general',
                status: 'submitted',
                feedback: '',
              });
              setDialogOpen(true);
            }}
            className="gap-2"
          >
            <Plus className="w-5 h-5" />
            New Suggestion
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
                placeholder="Search suggestions..."
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
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="under-review">Under Review</SelectItem>
                  <SelectItem value="accepted">Accepted</SelectItem>
                  <SelectItem value="implemented">Implemented</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
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
            <div className="text-center py-12">Loading suggestions...</div>
          ) : filteredSuggestions.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No suggestions found</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Suggestion</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSuggestions.map((suggestion) => (
                    <TableRow key={suggestion.id}>
                      <TableCell className="text-sm font-medium">
                        {getEmployeeName(suggestion.employeeId)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {suggestion.title}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600 max-w-xs truncate">
                        {suggestion.suggestion}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {getCategoryLabel(suggestion.category)}
                        </Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(suggestion.status)}</TableCell>
                      <TableCell className="text-sm">
                        {new Date(suggestion.submissionDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(suggestion)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(suggestion.id)}
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
            <div className="text-center py-12">Loading suggestions...</div>
          ) : suggestions.length === 0 ? (
            <Card className="text-center py-12 md:col-span-2">
              <CardContent>
                <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 mb-4">No suggestions yet</p>
                <Button
                  onClick={() => setDialogOpen(true)}
                  variant="outline"
                >
                  Submit your first suggestion
                </Button>
              </CardContent>
            </Card>
          ) : (
            suggestions.map((suggestion) => (
              <Card
                key={suggestion.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => handleEdit(suggestion)}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {suggestion.title}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {suggestion.suggestion}
                      </p>
                      {suggestion.feedback && (
                        <div className="bg-blue-50 border border-blue-200 rounded p-2 mt-3 text-xs">
                          <p className="font-semibold text-blue-900 mb-1">
                            Feedback:
                          </p>
                          <p className="text-blue-900">
                            {suggestion.feedback}
                          </p>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(suggestion.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1">
                      {getStatusIcon(suggestion.status)}
                      {getStatusBadge(suggestion.status)}
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {getCategoryLabel(suggestion.category)}
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
          <div className="bg-gradient-to-r from-purple-600 to-indigo-500 p-5 text-white">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3 text-xl font-bold">
                <div className="bg-white/20 p-2 rounded-lg backdrop-blur-sm">
                  <MessageSquare className="w-5 h-5 text-white" />
                </div>
                {editingId ? 'Edit Suggestion' : 'New Suggestion'}
              </DialogTitle>
              <DialogDescription className="text-purple-50 text-sm mt-0.5">
                Your ideas shape our future. Share your suggestions for growth.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="p-6 max-h-[85vh] overflow-y-auto custom-scrollbar">
            <div className="grid gap-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="title" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Type className="w-4 h-4 text-purple-600" />
                    Suggestion Title <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="title"
                    placeholder="e.g., Flexible Work Hours Policy"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    className="h-10 border-gray-200 focus:border-purple-500 focus:ring-purple-500 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <Tag className="w-4 h-4 text-purple-600" />
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
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="hr-policy">HR Policy</SelectItem>
                      <SelectItem value="learning">Learning & Development</SelectItem>
                      <SelectItem value="facilities">Office Facilities</SelectItem>
                      <SelectItem value="benefits">Employee Benefits</SelectItem>
                      <SelectItem value="team-building">Team Building</SelectItem>
                      <SelectItem value="process">Internal Processes</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="suggestion" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-purple-600" />
                  Detailed Suggestion <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="suggestion"
                  placeholder="Describe your suggestion in detail..."
                  value={formData.suggestion}
                  onChange={(e) =>
                    setFormData({ ...formData, suggestion: e.target.value })
                  }
                  className="min-h-[100px] border-gray-200 focus:border-purple-500 focus:ring-purple-500 transition-all resize-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="status" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-purple-600" />
                    Current Status
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
                      <SelectItem value="submitted">Submitted</SelectItem>
                      <SelectItem value="under-review">Under Review</SelectItem>
                      <SelectItem value="accepted">Accepted</SelectItem>
                      <SelectItem value="implemented">Implemented</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="feedback" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-blue-500" />
                    Reviewer Feedback
                  </Label>
                  <Textarea
                    id="feedback"
                    placeholder="Notes from the review team..."
                    value={formData.feedback}
                    onChange={(e) =>
                      setFormData({ ...formData, feedback: e.target.value })
                    }
                    className="min-h-[40px] bg-gray-50 border-gray-200 focus:border-blue-500 focus:ring-blue-500 transition-all resize-none"
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
              className="h-10 px-8 font-bold bg-purple-600 hover:bg-purple-700 shadow-lg shadow-purple-200 transition-all active:scale-95 flex gap-2"
            >
              {editingId ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {editingId ? 'Save Changes' : 'Submit Suggestion'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
