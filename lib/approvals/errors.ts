/**
 * Approval engine errors.
 *
 * `forbidden = true` is the house convention (see SectionPermissionError /
 * InventoryPermissionError) that the thin route handlers map to HTTP 403 via
 * their `e?.forbidden ? 403 : …` branch — so these need no route changes.
 * `conflict = true` similarly maps to 409.
 */

/** The target record is pending approval and cannot be edited directly. */
export class ApprovalLockedError extends Error {
  readonly forbidden = true;
  constructor(
    message = "This record is pending approval and is read-only. Recall the request to edit it.",
  ) {
    super(message);
    this.name = "ApprovalLockedError";
  }
}

/** The caller is not an eligible approver for this request at its current stage. */
export class ApprovalEligibilityError extends Error {
  readonly forbidden = true;
  constructor(
    message = "You are not an eligible approver for this request at its current stage.",
  ) {
    super(message);
    this.name = "ApprovalEligibilityError";
  }
}

/** The request was already settled / voted on (idempotency + concurrency guard). */
export class ApprovalStateError extends Error {
  readonly conflict = true;
  constructor(message = "This approval request has already been actioned.") {
    super(message);
    this.name = "ApprovalStateError";
  }
}
