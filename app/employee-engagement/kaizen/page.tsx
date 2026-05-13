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
import { TrendingUp, Plus, Trash2, Edit2, ThumbsUp, CheckCircle2, LayoutGrid, List } from 'lucide-react';
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
}

export default function KaizenPage() {
  const [kaizens, setKaizens] = useState<Kaizen[]>([]);
  const [loading, setLoading] = useState(true);
  const [layout, setLayout] = useState<'list' | 'form'>('list');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    currentState: '',
    proposedState: '',
    benefits: '',
    status: 'idea',
  });
  const { toast } = useToast();

  useEffect(() => {
    loadKaizens();
  }, []);

  const loadKaizens = async () => {
    try {
      setLoading(false);
      const mockKaizens: Kaizen[] = [
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
        },
      ];
      setKaizens(mockKaizens);
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
        ...formData,
        submissionDate: new Date().toISOString().split('T')[0],
        votes: 0,
        hasVoted: false,
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

  const filteredKaizens = kaizens.filter((kaizen) => {
    const matchesSearch = kaizen.title
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' || kaizen.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900 flex items-center gap-2">
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
          <div className="mb-6 flex gap-4 items-end flex-wrap">
            <div className="flex-1 min-w-64">
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
                  <SelectItem value="idea">Idea</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="in-implementation">In Implementation</SelectItem>
                  <SelectItem value="implemented">Implemented</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit Kaizen' : 'New Kaizen'}
            </DialogTitle>
            <DialogDescription>
              Submit a continuous improvement idea or suggestion.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Kaizen Title *</Label>
              <Input
                id="title"
                placeholder="e.g., Implement Automated Testing Pipeline"
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
                placeholder="Describe your kaizen idea"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="currentState">Current State</Label>
              <Textarea
                id="currentState"
                placeholder="Describe the current situation or process"
                value={formData.currentState}
                onChange={(e) =>
                  setFormData({ ...formData, currentState: e.target.value })
                }
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="proposedState">Proposed State</Label>
              <Textarea
                id="proposedState"
                placeholder="Describe how it should be after improvement"
                value={formData.proposedState}
                onChange={(e) =>
                  setFormData({ ...formData, proposedState: e.target.value })
                }
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="benefits">Expected Benefits</Label>
              <Textarea
                id="benefits"
                placeholder="What benefits will this kaizen bring?"
                value={formData.benefits}
                onChange={(e) =>
                  setFormData({ ...formData, benefits: e.target.value })
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
                  <SelectItem value="idea">Idea</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="in-implementation">
                    In Implementation
                  </SelectItem>
                  <SelectItem value="implemented">Implemented</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>
              {editingId ? 'Update' : 'Submit'} Kaizen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
