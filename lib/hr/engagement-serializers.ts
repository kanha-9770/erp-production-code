/**
 * Engagement record serializers — turn raw Prisma rows into the JSON shapes
 * the engagement pages expect.
 *
 * Pages reference records by employeeId (not userId) because that's what they
 * look up against the employee list. We join through user.employee.id and
 * project it into the response, then drop the relation block.
 */

export const KAIZEN_INCLUDE = {
  user: { select: { id: true, employee: { select: { id: true } } } },
} as const;

export const SUGGESTION_INCLUDE = KAIZEN_INCLUDE;
export const PROBLEM_INCLUDE = KAIZEN_INCLUDE;
export const INITIATIVE_INCLUDE = KAIZEN_INCLUDE;
export const TARGET_INCLUDE = KAIZEN_INCLUDE;

// ISO date helper: matches what the legacy mock used (YYYY-MM-DD substring of
// createdAt). Kept here so the date format on the wire stays stable.
function ymdFromDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function isoOrEmpty(d: Date | string | null | undefined): string {
  if (!d) return '';
  return d instanceof Date ? d.toISOString() : String(d);
}

function employeeIdOf(r: any): string {
  return r?.user?.employee?.id ?? '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Kaizen
// ─────────────────────────────────────────────────────────────────────────────

export interface KaizenWire {
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
  userId: string;
  referenceImage: string | null;
}

export function serializeKaizen(r: any, viewerUserId: string): KaizenWire {
  const voted: string[] = Array.isArray(r.votedByUserIds) ? r.votedByUserIds : [];
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? '',
    currentState: r.currentState ?? '',
    proposedState: r.proposedState ?? '',
    benefits: r.benefits ?? '',
    status: r.status as KaizenWire['status'],
    submissionDate: ymdFromDate(r.createdAt),
    votes: r.votes ?? 0,
    hasVoted: voted.includes(viewerUserId),
    employeeId: employeeIdOf(r),
    userId: r.userId,
    referenceImage: r.referenceImage ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Suggestion
// ─────────────────────────────────────────────────────────────────────────────

export interface SuggestionWire {
  id: string;
  title: string;
  suggestion: string;
  category: string;
  status: 'submitted' | 'under-review' | 'accepted' | 'rejected' | 'implemented';
  submissionDate: string;
  feedback: string;
  userId: string;
  employeeId: string;
  referenceImage: string | null;
}

export function serializeSuggestion(r: any): SuggestionWire {
  return {
    id: r.id,
    title: r.title,
    suggestion: r.suggestion ?? '',
    category: r.category ?? '',
    status: r.status as SuggestionWire['status'],
    submissionDate: ymdFromDate(r.createdAt),
    feedback: r.feedback ?? '',
    userId: r.userId,
    employeeId: employeeIdOf(r),
    referenceImage: r.referenceImage ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Problem
// ─────────────────────────────────────────────────────────────────────────────

export interface ProblemWire {
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
  referenceImage: string | null;
}

export function serializeProblem(r: any): ProblemWire {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? '',
    severity: r.severity as ProblemWire['severity'],
    category: r.category ?? '',
    registrationDate: ymdFromDate(r.createdAt),
    status: r.status as ProblemWire['status'],
    proposedSolution: r.proposedSolution ?? '',
    userId: r.userId,
    employeeId: employeeIdOf(r),
    referenceImage: r.referenceImage ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Initiative
// ─────────────────────────────────────────────────────────────────────────────

export interface InitiativeWire {
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
  referenceImage: string | null;
}

export function serializeInitiative(r: any): InitiativeWire {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? '',
    startDate: r.startDate ?? '',
    endDate: r.endDate ?? '',
    status: r.status as InitiativeWire['status'],
    category: r.category ?? '',
    createdAt: isoOrEmpty(r.createdAt),
    userId: r.userId,
    employeeId: employeeIdOf(r),
    referenceImage: r.referenceImage ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Target
// ─────────────────────────────────────────────────────────────────────────────

export interface TargetWire {
  id: string;
  title: string;
  description: string;
  targetDate: string;
  status: 'not-started' | 'in-progress' | 'completed';
  progress: number;
  createdAt: string;
  userId: string;
  employeeId: string;
  referenceImage: string | null;
}

export function serializeTarget(r: any): TargetWire {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? '',
    targetDate: r.targetDate ?? '',
    status: r.status as TargetWire['status'],
    progress: typeof r.progress === 'number' ? r.progress : 0,
    createdAt: isoOrEmpty(r.createdAt),
    userId: r.userId,
    employeeId: employeeIdOf(r),
    referenceImage: r.referenceImage ?? null,
  };
}
