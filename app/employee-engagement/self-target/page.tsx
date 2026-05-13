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
import { Target, Plus, Trash2, Edit2, CheckCircle2, Clock, LayoutGrid, List } from 'lucide-react';

interface SelfTarget {
  id: string;
  title: string;
  description: string;
  targetDate: string;
  status: 'not-started' | 'in-progress' | 'completed';
  progress: number;
  createdAt: string;
}

export default function SelfTargetPage() {
  const [targets, setTargets] = useState<SelfTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [layout, setLayout] = useState<'list' | 'form'>('list');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    targetDate: '',
    status: 'not-started',
    progress: 0,
  });
  const { toast } = useToast();

  useEffect(() => {
    loadTargets();
  }, []);

  const loadTargets = async () => {
    try {
      setLoading(false);
      const mockTargets: SelfTarget[] = [
        {
          id: '1',
          title: 'Complete Advanced TypeScript Course',
          description: 'Master advanced TypeScript concepts and patterns',
          targetDate: '2026-06-30',
          status: 'in-progress',
          progress: 65,
          createdAt: '2026-04-10',
        },
        {
          id: '2',
          title: 'Improve Code Review Quality',
          description: 'Provide detailed and constructive code reviews',
          targetDate: '2026-08-31',
          status: 'in-progress',
          progress: 45,
          createdAt: '2026-04-15',
        },
        {
          id: '3',
          title: 'Lead Project Documentation',
          description: 'Create comprehensive documentation for the new module',
          targetDate: '2026-07-15',
          status: 'not-started',
          progress: 0,
          createdAt: '2026-05-01',
        },
      ];
      setTargets(mockTargets);
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
        ...formData,
        createdAt: new Date().toISOString().split('T')[0],
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
    return matchesSearch && matchesStatus;
  });

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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit Target' : 'New Target'}
            </DialogTitle>
            <DialogDescription>
              Set a personal performance target and track your progress.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Target Title *</Label>
              <Input
                id="title"
                placeholder="e.g., Complete Advanced TypeScript Course"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe your target in detail"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="targetDate">Target Date *</Label>
              <Input
                id="targetDate"
                type="date"
                value={formData.targetDate}
                onChange={(e) =>
                  setFormData({ ...formData, targetDate: e.target.value })
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
                  <SelectItem value="not-started">Not Started</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="progress">Progress (%)</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="progress"
                  type="number"
                  min="0"
                  max="100"
                  value={formData.progress}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      progress: parseInt(e.target.value) || 0,
                    })
                  }
                />
                <span className="text-sm text-gray-600 self-center">%</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>
              {editingId ? 'Update' : 'Create'} Target
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
