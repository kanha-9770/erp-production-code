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
import { MessageSquare, Plus, Trash2, Edit2, CheckCircle2, Clock, LayoutGrid, List } from 'lucide-react';
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
}

export default function EmployeeSuggestionPage() {
  const [suggestions, setSuggestions] = useState<EmployeeSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [layout, setLayout] = useState<'list' | 'form'>('list');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [formData, setFormData] = useState({
    title: '',
    suggestion: '',
    category: 'general',
    status: 'submitted',
    feedback: '',
  });
  const { toast } = useToast();

  useEffect(() => {
    loadSuggestions();
  }, []);

  const loadSuggestions = async () => {
    try {
      setLoading(false);
      const mockSuggestions: EmployeeSuggestion[] = [
        {
          id: '1',
          title: 'Flexible Work Hours Policy',
          suggestion: 'Implement flexible work hours to improve work-life balance',
          category: 'hr-policy',
          status: 'accepted',
          submissionDate: '2026-04-10',
          feedback: 'Great idea! We are planning to implement this next quarter.',
        },
        {
          id: '2',
          title: 'Weekly Tech Talks',
          suggestion: 'Organize weekly tech talks to share knowledge',
          category: 'learning',
          status: 'implemented',
          submissionDate: '2026-03-15',
          feedback: 'Implemented! First tech talk is scheduled for next week.',
        },
        {
          id: '3',
          title: 'Improve Office Kitchen',
          suggestion: 'Upgrade kitchen facilities with better appliances',
          category: 'facilities',
          status: 'under-review',
          submissionDate: '2026-04-28',
        },
        {
          id: '4',
          title: 'Remote Work Benefits',
          suggestion: 'Provide better home office setup allowance',
          category: 'benefits',
          status: 'submitted',
          submissionDate: '2026-05-05',
        },
        {
          id: '5',
          title: 'Annual Team Outing',
          suggestion: 'Organize team building outing twice a year',
          category: 'team-building',
          status: 'rejected',
          submissionDate: '2026-04-20',
          feedback: 'Budget constraints prevent this at the moment.',
        },
      ];
      setSuggestions(mockSuggestions);
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
            ? { ...s, ...formData, submissionDate: s.submissionDate }
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
        ...formData,
        submissionDate: new Date().toISOString().split('T')[0],
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

  const filteredSuggestions = suggestions.filter((suggestion) => {
    const matchesSearch = suggestion.title
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' || suggestion.status === statusFilter;
    return matchesSearch && matchesStatus;
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit Suggestion' : 'New Suggestion'}
            </DialogTitle>
            <DialogDescription>
              Share your ideas for organizational improvement.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Suggestion Title *</Label>
              <Input
                id="title"
                placeholder="e.g., Flexible Work Hours Policy"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="suggestion">Your Suggestion *</Label>
              <Textarea
                id="suggestion"
                placeholder="Describe your suggestion in detail"
                value={formData.suggestion}
                onChange={(e) =>
                  setFormData({ ...formData, suggestion: e.target.value })
                }
                className="mt-1"
                rows={5}
              />
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
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="hr-policy">HR Policy</SelectItem>
                  <SelectItem value="learning">Learning</SelectItem>
                  <SelectItem value="facilities">Facilities</SelectItem>
                  <SelectItem value="benefits">Benefits</SelectItem>
                  <SelectItem value="team-building">Team Building</SelectItem>
                  <SelectItem value="process">Process</SelectItem>
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
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="under-review">Under Review</SelectItem>
                  <SelectItem value="accepted">Accepted</SelectItem>
                  <SelectItem value="implemented">Implemented</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="feedback">Feedback</Label>
              <Textarea
                id="feedback"
                placeholder="Add any feedback (optional)"
                value={formData.feedback}
                onChange={(e) =>
                  setFormData({ ...formData, feedback: e.target.value })
                }
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>
              {editingId ? 'Update' : 'Submit'} Suggestion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
