# Face Recognition for Attendance — Implementation Plan

> Goal: prevent proxy attendance by verifying that the selfie taken at check-in / check-out belongs to the logged-in user.
>
> Scope: development & testing phase. Designed to ship safely with a clear upgrade path to a stricter (cloud / liveness) verifier later, without schema or UI churn.
>
> Guiding principle: **maximum reuse of existing functions in this codebase.** Every change is additive and gated by a config flag; with the flag OFF the system behaves exactly as today.

---

## 1. Current Attendance System (verified by code audit)

### 1.1 Punch flow (already wired end-to-end)

1. User clicks **Check In** / **Check Out** in [components/attendance/attendance-widget.tsx](../components/attendance/attendance-widget.tsx) (`handleClick`, line 648).
2. If `faceCapture.mode` ≠ `OFF`, the widget opens [components/attendance/face-capture-dialog.tsx](../components/attendance/face-capture-dialog.tsx) — `getUserMedia` → canvas → JPEG blob.
3. Blob uploads via `uploadFacePhoto()` (widget line 330) → [app/api/attendance/photo/route.ts](../app/api/attendance/photo/route.ts) → `uploadToHostinger` → returns public URL.
4. URL is submitted to [app/api/attendance/punch/route.ts](../app/api/attendance/punch/route.ts) → `recordPunch()` writes `Attendance.checkInPhoto` / `checkOutPhoto`.

### 1.2 Data model (already present)

[prisma/schema.prisma:1765](../prisma/schema.prisma#L1765) — `Attendance`:

- `checkInPhoto` / `checkOutPhoto` — public URLs to captured selfies
- `checkInSource` / `checkOutSource` — free-text source (`WEB`, `MOBILE`, `BIOMETRIC`, `ADMIN`)
- `checkInLat` / `checkInLng` / `checkInIp` / `checkInDevice` — full punch metadata

[prisma/schema.prisma:1825](../prisma/schema.prisma#L1825) — `AttendanceConfiguration`:

- `faceCaptureMode` — `OFF | OPTIONAL | REQUIRED`
- `facePhotoMaxKb` — size cap (default 800)

[prisma/schema.prisma:187](../prisma/schema.prisma#L187) — `User`:

- `avatar` — existing profile photo URL field

### 1.3 The actual gap

Photos are **captured and stored, but never verified**. Anyone logged in as user X can hold up user Y's photo (or any face) and the system accepts it. **That's the only gap we need to close.**

---

## 2. Existing assets we will reuse (no rewriting)

| Asset | Location | Reuse for |
|-------|----------|-----------|
| `uploadToHostinger(buffer, filename)` | [lib/hostinger-upload.ts:11](../lib/hostinger-upload.ts#L11) | Upload reference photo to public storage — same path attendance photos already use |
| `FaceCaptureDialog` (camera + canvas + JPEG blob) | [components/attendance/face-capture-dialog.tsx](../components/attendance/face-capture-dialog.tsx) | Reused **as-is** for enrollment selfie and live verification. We only extend its `onCapture` signature to also pass a descriptor |
| `/api/attendance/photo` route | [app/api/attendance/photo/route.ts](../app/api/attendance/photo/route.ts) | Existing upload pipeline (size + MIME validation, Hostinger upload, filename hygiene). We inject verification **inside** this route — no new endpoint |
| `getAttendanceConfig(orgId)` / `upsertAttendanceConfig` | [lib/hr/attendance-config.ts:138](../lib/hr/attendance-config.ts#L138) | Already has resilient field-dropping logic for stale Prisma clients. We add `faceVerifyMode` + `faceMatchThreshold`; the existing admin form persists them automatically |
| `recordPunch()` pre-flight reject pattern | [lib/hr/attendance-service.ts:679](../lib/hr/attendance-service.ts#L679) | Mirror exactly for `FACE_MISMATCH` reject — same audit-log + `AttendanceError` pattern |
| `AttendanceError` class | [lib/hr/attendance-service.ts](../lib/hr/attendance-service.ts) | Reused for `FACE_NOT_ENROLLED`, `FACE_MISMATCH` error codes |
| `safeAudit()` | [lib/hr/attendance-service.ts](../lib/hr/attendance-service.ts) | Reused for logging face-verify outcomes |
| `attendance-config-form.tsx` (admin UI) | [components/attendance/attendance-config-form.tsx:90](../components/attendance/attendance-config-form.tsx#L90) | Add two fields next to existing face controls; existing save handler already serializes the full config |
| `User.avatar` | [prisma/schema.prisma:187](../prisma/schema.prisma#L187) | Reused as reference photo storage — no new column for the photo URL |
| `Attendance.checkInPhoto` / `checkOutPhoto` | [prisma/schema.prisma:1765](../prisma/schema.prisma#L1765) | Already stores selfie URL — no schema change for the photo itself |
| `Attendance.checkInSource` / `checkOutSource` | [prisma/schema.prisma:1765](../prisma/schema.prisma#L1765) | Free-text string column — we write `'WEB+FACE_VERIFIED'` instead of `'WEB'` |
| `getAuthenticatedUser(request)` | [lib/api-helpers.ts](../lib/api-helpers.ts) | Reused in every new API route |
| `useToast()` | [hooks/use-toast.ts](../hooks/use-toast.ts) | Reused for match / mismatch feedback |
| Employee form (no photo field yet) | [components/employee/employee-form.tsx](../components/employee/employee-form.tsx) | Add file input + reuse `uploadToHostinger` for the HR-uploaded baseline |

**Net new code is small — everything heavy (upload, capture, config, audit) already exists.**

---

## 3. What we are adding (the only net-new pieces)

### 3.1 One new dependency

- `face-api.js` — TensorFlow.js based, MIT licensed
- Loaded in browser; ~6MB model weights served from `/public/models` (downloaded once per browser)
- **No server-side ML package.** The descriptor is computed in the browser; the server only does numeric distance comparison (~10 lines of math)

### 3.2 One new table

```prisma
model FaceEnrollment {
  id             String   @id @default(cuid())
  userId         String   @unique
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  organizationId String?
  descriptor     Bytes    // serialized Float32Array (128 floats × 4 bytes = 512 bytes)
  referencePhoto String?  // URL — usually points at User.avatar
  enrolledAt     DateTime @default(now())
  updatedAt      DateTime @updatedAt
  enrolledBy     String?  // userId of HR/admin who enrolled, or self
  @@index([organizationId])
  @@map("face_enrollments")
}
```

### 3.3 Two new fields on existing `AttendanceConfiguration`

```prisma
faceVerifyMode     String  @default("OFF")   // OFF | WARN | ENFORCE
faceMatchThreshold Float   @default(0.55)    // Euclidean distance threshold
```

### 3.4 Two optional columns on existing `Attendance`

```prisma
checkInFaceMatch   Float?
checkOutFaceMatch  Float?
```

**Total schema delta: 1 new table, 4 new columns.**

### 3.5 New files (kept intentionally minimal)

| File | Lines (est.) | Purpose |
|------|-------------:|---------|
| `lib/face/models.ts` | ~40 | Lazy-load face-api.js models once; returned promise reused by enrollment and capture |
| `lib/face/descriptor.ts` | ~60 | Client helper: `computeDescriptorFromBlob(blob): Float32Array \| null`. Pure helper, no React |
| `lib/face/verify.ts` | ~30 | Server helpers: `euclidean(a, b)`, `float32ToBytes`, `bytesToFloat32` |
| `app/api/face/enroll/route.ts` | ~80 | POST — accept photo + descriptor (FormData), reuse `uploadToHostinger`, upsert `FaceEnrollment` |
| `app/api/face/enrollment-status/route.ts` | ~30 | GET — used by widget / onboarding to decide if a user needs to enroll |
| `public/models/*` | binary | face-api.js weight files (committed once) |

No new pages needed for v1 — enrollment happens from the two existing UI surfaces (employee form + an inline banner in the attendance widget if the user is not enrolled).

---

## 4. Surgical edits to existing files

Every edit is additive and gated by `faceVerifyMode`. With `faceVerifyMode = OFF` (the default), every existing code path runs unchanged.

### 4.1 [components/employee/employee-form.tsx](../components/employee/employee-form.tsx)

- Add a **Profile photo** field (file input + preview)
- On submit, upload via `uploadToHostinger` (already used by `/api/attendance/photo`)
- Persist URL into `User.avatar`
- If a photo is present, run client-side face detection on submit; if a face is found, send the descriptor to `/api/face/enroll` alongside the user create call

### 4.2 [components/attendance/face-capture-dialog.tsx](../components/attendance/face-capture-dialog.tsx)

- Change one prop signature:
  - `onCapture: (blob: Blob) => Promise<void>` → `onCapture: (blob: Blob, descriptor: Float32Array | null) => Promise<void>`
- Inside `handleCapture`, after `canvas.toBlob`, also call `computeDescriptorFromBlob` and pass the descriptor to the callback
- Show inline "No face detected — please retake" hint when descriptor is null in REQUIRED mode
- **Dialog stays a single shared component** — used unchanged for enrollment *and* live attendance

### 4.3 [components/attendance/attendance-widget.tsx](../components/attendance/attendance-widget.tsx)

- `handleCapturedPhoto` (line 670): receive and forward the descriptor to `uploadFacePhoto`
- `uploadFacePhoto` (line 330): add `fd.append('descriptor', base64FromFloat32(descriptor))`
- Toast on response: "✓ Identity verified" / "✗ Face does not match" / "⚠ Not enrolled — enroll first"
- Inline banner if `enrollmentStatus.enrolled === false` and verify mode is `ENFORCE` → opens the same `FaceCaptureDialog` in enrollment mode

### 4.4 [app/api/attendance/photo/route.ts](../app/api/attendance/photo/route.ts)

After the existing size / MIME validation, before `uploadToHostinger`, inject verification:

- If `cfg.faceVerifyMode === 'OFF'` → behave exactly as today
- Else: read `descriptor` field from FormData, look up `FaceEnrollment` for the user, run `euclidean()` against stored descriptor
- Response shape becomes `{ success: true, url, faceMatch: number, verified: boolean }` (extra fields are backwards-compatible — the widget today already ignores unknown fields)
- If `faceVerifyMode === 'ENFORCE'` and mismatch → return 403 with `code: 'FACE_MISMATCH'` and call `safeAudit` mirroring the `FACE_PHOTO_REQUIRED` audit pattern at [lib/hr/attendance-service.ts:679](../lib/hr/attendance-service.ts#L679)
- If user is not enrolled and mode is `ENFORCE` → return 403 with `code: 'FACE_NOT_ENROLLED'`

### 4.5 [app/api/attendance/punch/route.ts](../app/api/attendance/punch/route.ts)

- Accept optional `faceMatch` field in body
- Pass through to `recordPunch` so it can persist to `Attendance.checkInFaceMatch` / `checkOutFaceMatch`
- If `faceMatch` is provided and within threshold, set source to `'WEB+FACE_VERIFIED'` (string concat — `checkInSource` is a plain string column, no enum change needed)

### 4.6 [lib/hr/attendance-service.ts](../lib/hr/attendance-service.ts) → `recordPunch`

- Accept new optional `faceMatch?: number` in input
- Persist to the new `checkInFaceMatch` / `checkOutFaceMatch` columns
- No other logic changes — the upload route is the gatekeeper

### 4.7 [lib/hr/attendance-config.ts](../lib/hr/attendance-config.ts)

- Add `faceVerifyMode` and `faceMatchThreshold` to `AttendanceConfig` interface + defaults + coercer
- The existing `upsertAttendanceConfig` (lines 271-296) already gracefully handles fields missing from a stale Prisma client — **no changes needed there**

### 4.8 [components/attendance/attendance-config-form.tsx](../components/attendance/attendance-config-form.tsx)

Add two new controls right next to `faceCaptureMode` (line 90):

- Radio: `faceVerifyMode` — OFF / WARN / ENFORCE
- Number / slider: `faceMatchThreshold` — 0.4 to 0.7 (default 0.55), with help text

The existing save handler already serializes the full config object — no logic change beyond adding the fields.

### 4.9 [components/attendance/attendance-record-detail.tsx](../components/attendance/attendance-record-detail.tsx)

Display a small badge next to each photo:

- ✓ "Face verified (0.42)" or
- ⚠ "Match score 0.61"

Purely presentational, reads the new `checkInFaceMatch` field.

---

## 5. Enrollment strategy (reusing existing flows)

Three enrollment paths, each reusing an existing UI surface.

### Path A — HR uploads photo in Employee Master (primary)

1. Edit existing employee form, add photo field
2. On save: if face detected client-side → auto-create `FaceEnrollment` record
3. If no face detected → save avatar only; user is prompted at first punch

### Path B — Self-enrollment from the attendance widget (fallback)

- If user has no `FaceEnrollment` and tries to check in:
  - Mode `WARN` → punch goes through; toast says "Enroll your face from the banner"
  - Mode `ENFORCE` → punch blocked with a friendly error; "Enroll now" button opens the same `FaceCaptureDialog` in enrollment mode

### Path C — Admin re-enrollment (drift / bad initial photo)

- "Re-enroll face" button on team attendance row (admin-only)
- Marks the user for re-capture; the next punch capture replaces the stored descriptor

**No new pages needed for v1.** All three paths reuse existing UI surfaces.

---

## 6. Phased rollout (you control this from the admin form)

| Phase | What you do | What happens |
|-------|-------------|--------------|
| **Phase 0 — Today** | Nothing. Deploy code with `faceVerifyMode = OFF` default | System runs exactly as today. Zero risk |
| **Phase 1 — Schema + helpers** | Apply Prisma migration; deploy new files | Schema ready, no behavior change |
| **Phase 2 — Enrollment plumbing** | Deploy employee form photo field + enrollment API | HR can start uploading photos; descriptors auto-compute and store |
| **Phase 3 — Verify in WARN mode (you)** | Set `faceVerifyMode = WARN` for your test org | Verification runs at every punch; mismatches logged + shown as toast, but punches still succeed. **You watch logs** |
| **Phase 4 — Pilot users** | Enroll 2-3 colleagues; review match scores in logs over a week | Tune `faceMatchThreshold` based on real data. Typical good match: 0.3–0.5. Typical mismatch: 0.7+ |
| **Phase 5 — Production** | Flip one org to `faceVerifyMode = ENFORCE` | Mismatches now block punches. Other orgs untouched |

**Killswitch**: flipping `faceVerifyMode = OFF` in the admin form reverts behavior in real time (no code deploy) because every check reads `getAttendanceConfig` per request.

---

## 7. Order of implementation

Each step ends with a working build; nothing half-finished.

1. **Prisma migration** — add `FaceEnrollment` table, 2 fields on `AttendanceConfiguration`, 2 optional fields on `Attendance`. Run `prisma generate`. Verify schema in DB. **Stop and confirm.**
2. **face-api.js + models** — install dep, place models under `/public/models`, write `lib/face/models.ts` + `lib/face/descriptor.ts` + `lib/face/verify.ts`. Add a tiny standalone test page (or one-off script) to confirm models load and descriptors compute. **Stop.**
3. **Enrollment API + employee form field** — `/api/face/enroll`, edit `employee-form.tsx`. HR can enroll users. Test by enrolling yourself, then querying the table. **Stop.**
4. **Wire FaceCaptureDialog to pass descriptors** — extend the prop signature, update the one caller in the widget. With `faceVerifyMode = OFF` the descriptor is computed but ignored. **Confirm punch flow still works unchanged.**
5. **Verification inside `/api/attendance/photo`** — add WARN / ENFORCE logic, return `faceMatch` in response. Flip mode to WARN for your user. Test check-in / check-out. **Stop.**
6. **Admin config form fields + display badges** — wire the toggle so you can switch modes from the UI; add the "verified" badge to the record detail. **Stop.**
7. **Self-enrollment banner in widget** — only after the above is end-to-end working.

---

## 8. Risks & mitigations

| Risk | Mitigation built into this plan |
|------|---------------------------------|
| face-api.js model files (6MB) slow first page load | Lazy load — models load only when a user opens the capture dialog, not on every page |
| False rejections from bad HR-uploaded photos | WARN mode for testing → tune threshold → self-enrollment fallback path |
| User has no camera / camera denied | Existing `FaceCaptureDialog` already handles `NotAllowedError`, `NotFoundError`, etc. — no new error handling needed |
| Twins / siblings fooling the matcher | Real risk with any non-liveness system. Documented. Future upgrade: cloud API with liveness, or a PIN as second factor in ENFORCE mode |
| Existing punch flow breaks during dev | Every change gated by `faceVerifyMode = OFF`; production orgs unaffected until you explicitly flip the toggle |
| Prisma client stale after migration | Existing `upsertAttendanceConfig` already handles this (lines 271-296). No new fragility added |
| Biometric data legal exposure | Add consent checkbox to employee form + enrollment dialog before storing the descriptor; log the consent timestamp |
| Photo of a photo bypass (printed pic) | Acceptable for dev/testing. For production add a "look left, then right" liveness prompt (future step, ~1 day of work) |

---

## 9. Effort estimate

| Step | Files (new + edited) | LOC (est.) |
|------|----------------------|-----------:|
| Schema migration | 1 prisma file | ~20 |
| Face library helpers | 3 new files | ~130 |
| Enrollment API + status API | 2 new files | ~110 |
| Employee form photo field | 1 edited | ~50 |
| FaceCaptureDialog descriptor | 1 edited | ~30 |
| Widget descriptor pass-through | 1 edited | ~40 |
| Photo route verification | 1 edited | ~60 |
| Punch route + service faceMatch | 2 edited | ~25 |
| Config form fields | 1 edited | ~30 |
| Config type additions | 1 edited | ~15 |
| Record detail badge | 1 edited | ~20 |
| **Total** | **6 new, ~9 edits** | **~530 LOC** |

---

## 10. Decisions to confirm before coding

1. **Enrollment count**: 1 reference photo (simpler) or 3 averaged (more robust)?
2. **Photo storage for HR upload**:
   - (a) Hostinger via `uploadToHostinger` — matches attendance pattern, public URL
   - (b) Local `/public/avatars` like existing `/api/auth/upload-avatar`
3. **Consent checkbox**: include in this round, or defer?
4. **Start with step 1 only** (schema migration on dev DB), then review before touching code?

**Sensible defaults if you say "go" without choosing**: 1 photo, Hostinger storage (consistent with attendance), consent checkbox included, schema migration first.

---

## Appendix A — Future upgrade paths (kept clean by this plan)

- **Swap to AWS Rekognition / Azure Face API**: only `lib/face/verify.ts` changes. UI and schema untouched.
- **Add liveness detection**: extend `FaceCaptureDialog` with a "blink" / "turn head" prompt — single component change.
- **Multi-photo averaging**: change `FaceEnrollment.descriptor` to store multiple vectors (or average them at enrollment time). Verification logic is unchanged.
- **Mobile app**: the `/api/attendance/photo` and `/api/face/enroll` endpoints already work with any client that can post FormData.

---

## Appendix B — Why face-api.js for dev/testing (vs cloud APIs)

| Aspect | face-api.js | AWS Rekognition / Azure Face |
|--------|-------------|------------------------------|
| Cost | Free | ~$1 per 1000 calls |
| PII transit | Stays in browser | Sent to cloud |
| Setup | npm install + 6MB models | API keys, IAM, VPC config |
| Accuracy | Good for non-adversarial use | Higher; built-in liveness |
| Offline | Works | Requires internet |
| Liveness | None (need to add manually) | Built-in (Rekognition Liveness) |

For **dev/testing**, face-api.js wins on cost, simplicity, and privacy. The verification helper (`lib/face/verify.ts`) is the only place that knows *how* matching happens — swap it for a cloud SDK later without touching anything else.
