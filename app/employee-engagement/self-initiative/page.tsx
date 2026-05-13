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
import { Lightbulb, Plus, Trash2, Edit2, CheckCircle2, Clock, LayoutGrid, List } from 'lucide-react';

interface SelfInitiative {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  status: 'planning' | 'in-progress' | 'completed' | 'on-hold';
  category: string;
  createdAt: string;
}

export default function SelfInitiativePage() {
  const [initiatives, setInitiatives] = useState<SelfInitiative[]>([]);
  const [loading, setLoading] = useState(true);
  const [layout, setLayout] = useState<'list' | 'form'>('list');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    startDate: '',
    endDate: '',
    status: 'planning',
    category: 'learning',
  });
  const { toast } = useToast();

  useEffect(() => {
    loadInitiatives();
  }, []);

  const loadInitiatives = async () => {
    try {
      setLoading(false);
      const mockInitiatives: SelfInitiative[] = [
        {
          id: '1',
          title: 'Mentorship Program for Juniors',
          description: 'Guide junior developers in their career growth',
          startDate: '2026-04-01',
          endDate: '2026-12-31',
          status: 'in-progress',
          category: 'mentoring',
          createdAt: '2026-03-20',
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
        },
      ];
      setInitiatives(mockInitiatives);
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
        ...formData,
        createdAt: new Date().toISOString().split('T')[0],
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

  const filteredInitiatives = initiatives.filter((initiative) => {
    const matchesSearch = initiative.title
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' || initiative.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900 flex items-center gap-2">
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
          <div className="mb-6 flex gap-4 items-end flex-wrap">
            <div className="flex-1 min-w-64">
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
                  <SelectItem value="planning">Planning</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="on-hold">On Hold</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit Initiative' : 'New Initiative'}
            </DialogTitle>
            <DialogDescription>
              Document a self-initiated improvement project.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Initiative Title *</Label>
              <Input
                id="title"
                placeholder="e.g., Mentorship Program for Juniors"
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
                placeholder="Describe your initiative"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="startDate">Start Date *</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) =>
                    setFormData({ ...formData, startDate: e.target.value })
                  }
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={formData.endDate}
                  onChange={(e) =>
                    setFormData({ ...formData, endDate: e.target.value })
                  }
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
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
                    <SelectItem value="learning">Learning</SelectItem>
                    <SelectItem value="mentoring">Mentoring</SelectItem>
                    <SelectItem value="process-improvement">
                      Process Improvement
                    </SelectItem>
                    <SelectItem value="team-building">Team Building</SelectItem>
                    <SelectItem value="innovation">Innovation</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
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
                    <SelectItem value="planning">Planning</SelectItem>
                    <SelectItem value="in-progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="on-hold">On Hold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>
              {editingId ? 'Update' : 'Create'} Initiative
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
