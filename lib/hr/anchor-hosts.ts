/**
 * Anchor host resolver — single source of truth for "which FormModule IDs
 * host static-page anchors for this org".
 *
 * A user who has been granted role access to a static page (e.g. /leave) must
 * see the page in their sidebar — and the page only renders as a child of its
 * anchor module. So the module-hierarchy query needs to include those host
 * modules even when the user has no direct VIEW permission on them. This
 * helper centralises the lookup so getModuleHierarchy and any future caller
 * (workflow rule discovery, audit trails) ask the same question.
 *
 * Three sources contribute, all merged into the returned set:
 *   1. Page-level anchors  — StaticPageAnchor with path = '/leave', etc.
 *   2. Group-level anchors — StaticPageAnchor with path = 'group:Attendance'.
 *   3. Auto-derived anchors — PayrollConfiguration.attendanceFieldMappings
 *      (each bound form's parent module is the implicit anchor for its group).
 *
 * The function never throws — sidebar fetches must stay green even if the
 * StaticPageAnchor table hasn't been migrated yet or attendance config is
 * absent. Errors are swallowed and that source contributes nothing.
 */

import { prisma } from '@/lib/prisma';

interface SetupV2Lite {
  _meta?: unknown;
  employee?: { formId?: string | null };
  checkIn?: { formId?: string | null };
  checkOut?: { formId?: string | null };
  leave?: { formId?: string | null };
  holiday?: { formId?: string | null };
}

/**
 * Returns the unique set of active FormModule IDs that anchor at least one
 * static page for this org. Order is unspecified — callers that need stable
 * ordering should sort.
 */
export async function getAnchorHostModuleIds(
  organizationId: string,
): Promise<string[]> {
  const ids = new Set<string>();

  // 1. Manual + group anchors share the same table; we don't filter the path
  //    here because both kinds reference a real FormModule.
  try {
    const rows = (await (prisma as any).staticPageAnchor.findMany({
      where: { organizationId },
      select: { moduleId: true },
    })) as Array<{ moduleId: string }>;
    for (const r of rows) if (r?.moduleId) ids.add(r.moduleId);
  } catch {
    // Table missing pre-migration — silently contribute nothing.
  }

  // 2. Auto-derived anchors. Each bound form lives in some module; that
  //    module is the implicit host for the form's section group.
  try {
    const config = await prisma.payrollConfiguration.findFirst({
      where: { organizationId, isActive: true },
      orderBy: { createdAt: 'desc' },
      select: { attendanceFieldMappings: true },
    });
    const setup = (config?.attendanceFieldMappings as SetupV2Lite | null) ?? {};
    const formIds = [
      setup.employee?.formId,
      setup.checkIn?.formId,
      setup.checkOut?.formId,
      setup.leave?.formId,
      setup.holiday?.formId,
    ].filter((x): x is string => typeof x === 'string' && x.length > 0);
    if (formIds.length > 0) {
      const forms = await prisma.form.findMany({
        where: { id: { in: formIds }, module: { organizationId } },
        select: { moduleId: true },
      });
      for (const f of forms) if (f?.moduleId) ids.add(f.moduleId);
    }
  } catch {
    // Defensive — never let attendance-config lookup break the sidebar.
  }

  // Filter to active modules only. A soft-deleted host module shouldn't
  // surface in the sidebar even if an anchor still references it.
  if (ids.size === 0) return [];
  try {
    const active = await prisma.formModule.findMany({
      where: {
        id: { in: Array.from(ids) },
        organizationId,
        isActive: true,
      },
      select: { id: true },
    });
    return active.map((m) => m.id);
  } catch {
    // If the active filter fails for any reason, fall back to the full set —
    // the client-side filter will drop unknown IDs anyway.
    return Array.from(ids);
  }
}
