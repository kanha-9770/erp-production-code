'use client';

/**
 * Settings → Employee Engagement → Teams.
 *
 * Admin-only CRUD for engagement teams. Each Kaizen / Suggestion / Problem
 * Registration / Self-Initiative / Self-Target record is scoped to the
 * author's team — so this is where teams are defined before employees can
 * be assigned to them in the Employee Master form.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import PageBackLink from '@/components/shared/page-back-link';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Users,
  Plus,
  Trash2,
  Pencil,
  RefreshCw,
  Search,
  ShieldAlert,
} from 'lucide-react';

interface Team {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  color: string | null;
  leadUserId: string | null;
  isActive: boolean;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

const PRESET_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#64748b', // slate
];

export default function EmployeeEngagementSettingsPage() {
  const { toast } = useToast();
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Team | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/engagement-teams', {
        cache: 'no-store',
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        // Surface 403 distinctly so the admin can fix permissions instead of
        // staring at a generic "Failed to load" toast.
        if (res.status === 403) {
          toast({
            title: 'Admin access required',
            description: 'Only org admins can configure engagement teams.',
            variant: 'destructive',
          });
        } else {
          throw new Error(json.error ?? 'Failed to load teams');
        }
        setTeams([]);
      } else {
        setTeams(json.teams ?? []);
      }
    } catch (e: any) {
      toast({
        title: 'Failed to load teams',
        description: e?.message,
        variant: 'destructive',
      });
      setTeams([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    if (!teams) return [];
    const q = search.trim().toLowerCase();
    if (!q) return teams;
    return teams.filter((t) =>
      `${t.name} ${t.description ?? ''}`.toLowerCase().includes(q),
    );
  }, [teams, search]);

  const openCreate = () => {
    setEditTarget(null);
    setDialogOpen(true);
  };
  const openEdit = (t: Team) => {
    setEditTarget(t);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/engagement-teams/${deleteTarget.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Delete failed');
      toast({
        title: 'Team deleted',
        description: `"${deleteTarget.name}" has been removed.`,
      });
      setDeleteTarget(null);
      refresh();
    } catch (e: any) {
      toast({
        title: 'Could not delete',
        description: e?.message,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="h-full max-w-5xl mx-auto px-4 py-4 sm:px-6 sm:py-5 lg:px-8 flex flex-col gap-4 min-h-0">
      <header className="shrink-0 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <PageBackLink href="/settings" label="Settings" />
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.06em] font-medium text-gray-500">
            <span>Settings</span>
            <span className="text-gray-300">›</span>
            <span>Employee Engagement</span>
          </div>
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-gray-900 leading-tight mt-0.5 flex items-center gap-2">
            <Users className="h-5 w-5 text-primary shrink-0" />
            Engagement Teams
          </h1>
          <p className="text-xs text-gray-500 max-w-2xl">
            Teams scope what each employee sees on the engagement pages
            (Kaizen, Problem Registration, Self-Initiative, Self-Target,
            Suggestion). Members of one team can't see another team's
            records — only HR and Admin see everything.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            size="icon"
            onClick={refresh}
            disabled={refreshing}
            aria-label="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            New Team
          </Button>
        </div>
      </header>

      <Card className="flex-1 min-h-0 flex flex-col">
        <CardHeader className="pb-2 border-b shrink-0">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm flex-1">
              {loading ? '…' : `${filtered.length} team${filtered.length === 1 ? '' : 's'}`}
            </CardTitle>
            <div className="relative w-64 max-w-full">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="h-8 pl-7 text-xs"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-500">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
              {teams && teams.length === 0
                ? 'No teams yet. Click "New Team" to create one.'
                : 'No teams match that search.'}
            </div>
          ) : (
            <ul className="divide-y">
              {filtered.map((t) => (
                <li
                  key={t.id}
                  className="px-4 py-3 hover:bg-gray-50 transition-colors flex items-start gap-3"
                >
                  <span
                    className="h-3 w-3 rounded-full mt-1.5 shrink-0 border border-black/5"
                    style={{ backgroundColor: t.color ?? '#94a3b8' }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{t.name}</span>
                      {!t.isActive && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                          inactive
                        </Badge>
                      )}
                      <Badge
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0 h-4 tabular-nums"
                      >
                        {t.memberCount} member{t.memberCount === 1 ? '' : 's'}
                      </Badge>
                    </div>
                    {t.description && (
                      <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">
                        {t.description}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => openEdit(t)}
                      aria-label="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setDeleteTarget(t)}
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <TeamDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        team={editTarget}
        onSaved={() => {
          setDialogOpen(false);
          refresh();
        }}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red-600" />
              Delete team?
            </AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" will be removed. Its{' '}
              {deleteTarget?.memberCount ?? 0} member
              {deleteTarget?.memberCount === 1 ? '' : 's'} will be unassigned
              (the employees themselves are kept). Engagement records
              previously authored by those members will become visible to
              anyone without a team filter.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Create / edit dialog
// ─────────────────────────────────────────────────────────────────────────────

function TeamDialog({
  open,
  onOpenChange,
  team,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  team: Team | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<string>(PRESET_COLORS[0]);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  // Reset form whenever the dialog reopens — otherwise stale text from a
  // previous edit lingers when the user reopens for "Create".
  useEffect(() => {
    if (!open) return;
    setName(team?.name ?? '');
    setDescription(team?.description ?? '');
    setColor(team?.color ?? PRESET_COLORS[0]);
    setIsActive(team?.isActive ?? true);
  }, [open, team]);

  const submit = async () => {
    if (!name.trim()) {
      toast({ title: 'Team name is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const isEdit = !!team;
      const url = isEdit ? `/api/engagement-teams/${team!.id}` : '/api/engagement-teams';
      const method = isEdit ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          color,
          isActive,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Save failed');
      toast({ title: isEdit ? 'Team updated' : 'Team created' });
      onSaved();
    } catch (e: any) {
      toast({
        title: 'Could not save',
        description: e?.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{team ? 'Edit team' : 'New engagement team'}</DialogTitle>
          <DialogDescription>
            Members of this team will see only this team's engagement records.
            HR and Admin always see everything.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="team-name" className="text-xs">
              Team name *
            </Label>
            <Input
              id="team-name"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 80))}
              placeholder="e.g. Production, R&D, Sales East"
              maxLength={80}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team-desc" className="text-xs">
              Description (optional)
            </Label>
            <Textarea
              id="team-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
              placeholder="What does this team focus on?"
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Color</Label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full border-2 transition-transform ${
                    color === c
                      ? 'border-gray-900 scale-110'
                      : 'border-transparent hover:border-gray-300'
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`Pick color ${c}`}
                />
              ))}
            </div>
          </div>
          {team && (
            <div className="flex items-center justify-between pt-2 border-t">
              <div>
                <Label htmlFor="team-active" className="text-xs">
                  Active
                </Label>
                <p className="text-[11px] text-gray-500">
                  Inactive teams stop appearing in the Employee Master picker.
                </p>
              </div>
              <Switch
                id="team-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : team ? 'Save changes' : 'Create team'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
