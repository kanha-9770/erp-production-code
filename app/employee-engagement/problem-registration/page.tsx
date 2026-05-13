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
import { AlertCircle, Plus, Trash2, Edit2, CheckCircle2, AlertTriangle, LayoutGrid, List } from 'lucide-react';
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
}

export default function ProblemRegistrationPage() {
  const [problems, setProblems] = useState<ProblemRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [layout, setLayout] = useState<'list' | 'form'>('list');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    severity: 'medium',
    category: 'operational',
    status: 'open',
    proposedSolution: '',
  });
  const { toast } = useToast();

  useEffect(() => {
    loadProblems();
  }, []);

  const loadProblems = async () => {
    try {
      setLoading(false);
      const mockProblems: ProblemRegistration[] = [
        {
          id: '1',
          title: 'Slow API Response Times',
          description: 'API endpoints are responding slowly during peak hours',
          severity: 'high',
          category: 'technical',
          registrationDate: '2026-05-01',
          status: 'in-review',
          proposedSolution: 'Implement caching and database optimization',
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
        },
      ];
      setProblems(mockProblems);
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
        ...formData,
        registrationDate: new Date().toISOString().split('T')[0],
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

  const filteredProblems = problems.filter((problem) => {
    const matchesSearch = problem.title
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' || problem.status === statusFilter;
    return matchesSearch && matchesStatus;
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit Problem' : 'Register Problem'}
            </DialogTitle>
            <DialogDescription>
              Register a workplace problem for tracking and resolution.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Problem Title *</Label>
              <Input
                id="title"
                placeholder="e.g., Slow API Response Times"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                placeholder="Describe the problem in detail"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="severity">Severity</Label>
                <Select
                  value={formData.severity}
                  onValueChange={(value) =>
                    setFormData({ ...formData, severity: value as any })
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="category">Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) =>
                    setFormData({ ...formData, category: value })
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="technical">Technical</SelectItem>
                    <SelectItem value="operational">Operational</SelectItem>
                    <SelectItem value="process">Process</SelectItem>
                    <SelectItem value="communication">Communication</SelectItem>
                    <SelectItem value="resource">Resource</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="proposedSolution">Proposed Solution</Label>
              <Textarea
                id="proposedSolution"
                placeholder="Suggest a solution (optional)"
                value={formData.proposedSolution}
                onChange={(e) =>
                  setFormData({ ...formData, proposedSolution: e.target.value })
                }
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) =>
                  setFormData({ ...formData, status: value as any })
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
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

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>
              {editingId ? 'Update' : 'Register'} Problem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
