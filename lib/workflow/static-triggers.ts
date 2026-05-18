/**
 * Static-page workflow triggers.
 *
 * Every static page that has CRUD endpoints (Employee Master, Staffing Plan,
 * Job Opening, Leave, Engagement Team, the 5 engagement record tables, etc.)
 * must call `fireWorkflow(...)` after its write succeeds so workflow rules
 * authored against the module actually run. The dynamic form-builder route
 * already does this via `triggerWorkflowsForRecord` directly; this wrapper
 * standardises the fire-and-forget pattern for the static-page routes:
 *
 *   - `void` so the route handler isn't blocked on the workflow runtime.
 *   - `.catch` swallows + logs failures, so a misconfigured rule can never
 *     bubble up and 500 the user's record save.
 *
 * The `recordData` shape is open-ended — pass a flat object whose keys match
 * the field `coreKey`s in lib/static-page-fields.ts for that module. Template
 * placeholders like `{{startDate}}` in workflow email/notification bodies
 * resolve against these keys, so consistency matters more than completeness.
 */

import {
  triggerWorkflowsForRecord,
  type WorkflowAction,
} from "@/lib/workflow/trigger";

export interface FireWorkflowInput {
  /** Static-page module name (e.g. "Leave", "Employee Master", "Kaizen"). */
  moduleName: string;
  action: WorkflowAction;
  organizationId: string;
  /** Acting user. Pass null for system-initiated events. */
  userId?: string | null;
  /** Primary key of the record that just changed. */
  recordId?: string;
  /** Flat key/value record fields available to template placeholders. */
  recordData?: Record<string, any>;
}

export function fireWorkflow(input: FireWorkflowInput): void {
  // No-op when the caller hasn't been associated with an organization. Every
  // workflow lookup is org-scoped, so without organizationId the trigger
  // would scan nothing and waste a queue slot.
  if (!input.organizationId) return;
  void triggerWorkflowsForRecord(input).catch((err) => {
    // Workflow failures are non-fatal — surface them in the server log only.
    // Production should ship this to whatever observability sink is wired up.
    console.error(
      `[workflow:${input.moduleName}:${input.action}] trigger failed:`,
      err,
    );
  });
}
