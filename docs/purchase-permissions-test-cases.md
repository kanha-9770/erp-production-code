# Purchase & Inventory — Permission Test Cases

Exhaustive scenarios for the role-based gating (buttons + pages + server) and the
GRN flow. Every privileged action is enforced **twice**: the button/page is
hidden in the UI, and the server returns **403** if the action is forced (API call).

## Test actors (live grants in Nessco Groupo)

| Actor | Role | Permissions held |
|---|---|---|
| **Admin** | ADMIN (NESSCO GROUP) | *bypass — everything* |
| **UDAY** | Approver | APPROVE_PURCHASE_REQUISITION |
| **Pushkar** | Purchase Manager | APPROVE_PURCHASE_ORDER, PROCESS_PURCHASE, RAISE_PAYMENT_REQUEST |
| **NIRAJ** | Store Keeper | POST_GRN_STOCK, POST_INVENTORY_MOVEMENT, DELETE_INVENTORY_ITEM |
| **Plain user** | e.g. Sales Associate | *none* |

Re-test after login (or wait ≤60s for the permission-version poll).

---

## 1. Action permission matrix (✓ = allowed, ✗ = blocked: button hidden + 403)

| Action | Plain user | Approver | Purchase Mgr | Store Keeper | Admin |
|---|:--:|:--:|:--:|:--:|:--:|
| Raise Requisition (create PR) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Approve Requisition (`productionApproval`) | ✗ | ✓ | ✗ | ✗ | ✓ |
| Raise RFQ (PR→sourcing) | ✗ | ✗ | ✓ | ✗ | ✓ |
| Convert to PO (create PO) | ✗ | ✗ | ✓ | ✗ | ✓ |
| Approve PO (`approvalStatus`) | ✗ | ✗ | ✓ | ✗ | ✓ |
| Receive GRN (create GRN) | ✗ | ✗ | ✗ | ✓ | ✓ |
| Post GRN → stock | ✗ | ✗ | ✗ | ✓ | ✓ |
| Raise Payment (create payment) | ✗ | ✗ | ✓ | ✗ | ✓ |
| Edit a document | ✗ | ✓ | ✓ | ✓ | ✓ |
| Delete a document | ✗ | ✗ | ✓ | ✗ | ✓ |
| Inventory movement (in/out) | ✗ | ✗ | ✗ | ✓ | ✓ |
| Delete inventory item | ✗ | ✗ | ✗ | ✓ | ✓ |
| Reset purchase / inventory data | ✗ | ✗ | ✗ | ✗ | ✓ |

Receiving a GRN needs POST_GRN_STOCK (Store Keeper). The Store Keeper is granted **read access to POs / Open POs** so they can open a PO and click **Receive (GRN)**. **Edit** shows for anyone with *any* capability (so the Approver can open Edit to set approval). **Delete** is buyer/admin only.

---

## 2. Page access matrix (✓ = visible + openable, ✗ = hidden from menu + blocked on URL)

| Page | Plain | Approver | Purchase Mgr | Store Keeper | Accounts | Admin |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| `/purchase-management/requisition` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/purchase-management/sourcing` | ✗ | ✗ | ✓ | ✗ | ✗ | ✓ |
| `/purchase-management/purchase-order` | ✗ | ✗ | ✓ | ✓ | ✗ | ✓ |
| `/purchase-management/open-po` | ✗ | ✗ | ✓ | ✓ | ✗ | ✓ |
| `/purchase-management/suppliers` | ✗ | ✗ | ✓ | ✗ | ✗ | ✓ |
| `/purchase-management/master` | ✗ | ✗ | ✓ | ✗ | ✗ | ✓ |
| `/purchase-management/grn` | ✗ | ✗ | ✓ | ✓ | ✗ | ✓ |
| `/purchase-management/payment-request` | ✗ | ✗ | ✓ | ✗ | ✓ | ✓ |
| `/inventory-management/*` | ✗ | ✗ | ✗ | ✓ | ✗ | ✓ |

Test each ✗ two ways: (a) the tab is absent from the Purchase sub-nav and the sidebar; (b) pasting the URL redirects to `/unauthorized`.

---

## 3. Button visibility on the Requisition page (the screenshot scenario)

| Button | Plain user | Approver | Purchase Mgr | Admin |
|---|:--:|:--:|:--:|:--:|
| New requisition | ✓ | ✓ | ✓ | ✓ |
| Edit | ✗ | ✓ | ✓ | ✓ |
| Delete | ✗ | ✗ | ✓ | ✓ |
| Raise RFQ | ✗ | ✗ | ✓ | ✓ |
| Convert to PO | ✗ | ✗ | ✓ | ✓ |

- **TC-3.1** Plain user opens a PR detail → sees **only** the read-only document + "New requisition" in the header. No Edit/Delete/Raise RFQ/Convert to PO. ✅ *(the original bug)*
- **TC-3.2** Approver opens the PR → sees **Edit** (to approve) but not Delete/RFQ/PO.
- **TC-3.3** Purchase Manager → sees Edit, Delete, Raise RFQ, Convert to PO.

---

## 4. GRN scenarios (the full flow)

Setup: a PO exists (created by Purchase Manager, approved). NIRAJ = Store Keeper.

### Receiving
- **TC-4.1** NIRAJ opens the PO → clicks **Receive (GRN)** → a GRN opens pre-filled (one invoice line, full qty), status **GATE_ENTRY**. ✅
- **TC-4.2** Plain user / Approver on a PO → **no "Receive (GRN)" button** (lacks POST_GRN_STOCK). Forced `POST /api/purchase-system/records {submodule:"grn"}` → **403**.
- **TC-4.3** GRN gate-entry fields (vehicle, challan, gate inspection) save; status can advance GATE_INSPECTION → RECEIVED.

### Receipt math
- **TC-4.4** receivedQty = invoiceQty → `receiptStatus` = **FULL**.
- **TC-4.5** receivedQty < invoiceQty → **PARTIAL**.
- **TC-4.6** receivedQty > invoiceQty → **EXCESS**.
- **TC-4.7** Multiple invoices on one GRN → amounts/quantities aggregate across all lines.

### Posting to inventory (`POST /api/purchase-system/grn/[id]/post-stock`)
- **TC-4.8** NIRAJ clicks **Post to inventory**. Item name matches an existing Store item → that item's `currentStock` increases by receivedQty. Result lists it under `increased`. ✅
- **TC-4.9** Item name has **no** match → a new Store item is auto-created (`STK-####`, unitRate = amount/qty, warehouse from GRN). Listed under `created`.
- **TC-4.10** Click **Post to inventory** again → **no-op** (`alreadyPosted: true`); stock is **not** double-counted (idempotent). Button is replaced by "Stock posted to inventory".
- **TC-4.11** GRN with all receivedQty = 0 → error "This GRN has no received quantities to post" (HTTP 400).
- **TC-4.12** Plain user / Approver / Purchase Manager (no POST_GRN_STOCK) → **no "Post to inventory" button** (a lock hint shows instead). Forced API call → **403**, GRN unchanged.
- **TC-4.13** Aggregation: two invoice lines for the same item name (case-insensitive) → summed into one stock increment.

### Edit / Delete GRN
- **TC-4.14** NIRAJ (has a cap) → **Edit** visible; can update gate/inspection fields.
- **TC-4.15** Plain user → **no Edit, no Delete** on the GRN.
- **TC-4.16** Delete GRN → only Purchase Manager / Admin (PROCESS_PURCHASE). NIRAJ deleting → **403** (Store Keeper lacks PROCESS_PURCHASE). Adjust if store should delete GRNs.

### Payment from GRN / PO
- **TC-4.17** On a GRN, Purchase Manager clicks **Raise Payment** → payment opens pre-filled (poRef, supplier, invoiceNo, invoiceAmount rolled up from invoice lines), status REQUESTED. ✅
- **TC-4.18** On a **PO**, Purchase Manager clicks **Raise Payment** (the new button) → payment opens with poRef + supplier + requestAmount = PO amount (advance, no GRN needed). ✅
- **TC-4.19** Plain user / Store Keeper → **no "Raise Payment" button** (lacks RAISE_PAYMENT_REQUEST). Forced create payment → **403**.

---

## 5. Inventory scenarios

- **TC-5.1** NIRAJ posts a goods movement (inward/outward) → stock adjusts. ✅
- **TC-5.2** Plain user posts a movement via API → **403** (POST_INVENTORY_MOVEMENT).
- **TC-5.3** NIRAJ deletes an inventory item → allowed. Plain user → **403** (DELETE_INVENTORY_ITEM).
- **TC-5.4** Bulk delete items → same gate as single delete.
- **TC-5.5** Reset inventory → only Admin; everyone else **403**.

---

## 6. "How it works" guide

- **TC-6.1** Any user (incl. plain user) sees the **How it works** button in the Purchase sub-nav on every purchase page; opens the workflow dialog. Not gated.
- **TC-6.2** The dialog shows the flow, each step's responsible role, the GRN detail, and the roles legend.

---

## 7. Negative / edge

- **TC-7.1** A user granted then **revoked** a permission loses the button/page within ≤60s (perm-version poll) or on next login.
- **TC-7.2** Deleting a role wipes its grants (cascade) — a granted role deleted → its members lose the capability. Re-grant on the Approvals page.
- **TC-7.3** Bulk **CSV import** of purchase records by a non-privileged user **cannot** set approval/stock fields (they are stripped) — import succeeds with benign defaults.
- **TC-7.4** Admin always passes every case above (bypass).
