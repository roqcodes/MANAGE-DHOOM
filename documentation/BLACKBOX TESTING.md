# BUYHUB ERP — UI workflow runbook (acceptance test discovery)

This runbook maps **navigation, forms, required fields, and user actions** as exposed in the DHOOM-MANAGE admin ERP UI. It does not prescribe expected accounting outcomes.

---

## 1. Prerequisites

| Prerequisite | Where / how |
|--------------|-------------|
| **Sign in** | Staff account with RBAC read access to the paths below (sidebar items can be hidden per role). |
| **Active store** | Header **store switcher** sets the default store for lists and many forms. Forms also show **Store** / **Destination store** (required on ERP documents). Error if missing: *“Select a store using the header switcher before saving.”* |
| **Salesman PIN** | Valid **3-digit Salesman PIN** for a staff user (required to save/issue sales invoices). |
| **Tax rates (optional setup)** | **Business → Tax rates** (`/admin/config/tax`). Product defaults can prefill line tax %. |
| **Landed cost masters (optional)** | **Purchases → Landed Cost Items** (`/admin/erp/landed-costs`) — name, default rate, tax %. |
| **Item units / categories / brands (optional)** | **Items** section: Item Units, Categories, Brands. |
| **Cash/bank accounts** | **Banking → Cash Accounts** (`/admin/erp/banking`) — needed for **Paid through account** on payments. |
| **Currency** | Display follows business currency settings (₹ when configured as INR). |

---

## 2. Navigation paths (sidebar → URL)

| Task | Sidebar | Direct URL |
|------|---------|------------|
| **Products** | Items → Products | `/admin/products` |
| **Supplier (vendor)** | Purchases → Vendors | `/admin/vendors` · create `/admin/vendors/new` |
| **Customer** | Sales → Customers | `/admin/customers` (catch-all admin route) |
| **Purchase bill** | Purchases → Purchase Bills | `/admin/erp/purchase-bills` · create `/admin/erp/purchase-bills/new` |
| **Landed cost setup** | Purchases → Landed Cost Items | `/admin/erp/landed-costs` |
| **Supplier payment** | Purchases → Payments Made | `/admin/erp/supplier-payments` · create `/admin/erp/supplier-payments/new` |
| **Sales invoice** | Sales → Invoices | `/admin/erp/invoices` · create `/admin/erp/invoices/new` |
| **Customer payment** | Sales → Payments Received | `/admin/erp/payments` · create `/admin/erp/payments/new` |
| **Store stock view** | Inventory → Store inventory | `/admin/erp/store-inventory` |
| **Stock movements** | Inventory → Item Transactions | `/admin/erp/item-transactions` |
| **All reports** | Reports → All Reports | `/admin/erp/reports` → `/admin/erp/reports/{slug}` |
| **Finance dashboard** | Reports → Financial Summary | `/admin/erp/financial-summary` |
| **GL / journals** | Accounts → Chart of Accounts, Journal Entries | `/admin/erp/accounts`, `/admin/erp/journal-entries` |
| **VAT compliance** | VAT → VAT Returns / VAT Payments | `/admin/erp/vat-returns`, `/admin/erp/vat-payments` |
| **Bank balances** | Banking → Cash Accounts, Payment Statement | `/admin/erp/banking`, `/admin/erp/payment-statement` |

**Global search / command palette** can jump to the same destinations (keywords on each nav item).

---

## 3. Product creation (`/admin/products`)

**Open form:** **Add product** (list toolbar) → **Product** modal (multi-step).

### 3.1 Details tab — sections & fields

**Basic information**

| Field | Required |
|-------|----------|
| Name | Yes (validation: *“Product name is required.”*) |
| Category | Optional |
| Manufacturer / Brand | Optional |
| Description | Optional |

**Pricing & defaults**

| Field | Required / notes |
|-------|------------------|
| Sales price | Marked required on create unless you use a variant layout (see below). HTML `min="0.01"` on input. |
| MRP | Optional (if enabled for tenant) |
| Purchase price | Optional; can be `0` |
| Tax % | Optional (defaults on new draft) |
| Markup % | Optional |

**Identification & type**

| Field | Required |
|-------|----------|
| Barcode | Optional |
| Product code (internal SKU) | Optional |
| HSN/SAC | Optional |
| Unit of measure | Optional |
| Item type | **Physical goods** (default) or **Service** |

**Media** (images/videos): optional.

**Opening / stock:** Not on the details step. **Variant/SKU** step can include **stock** for SKUs (online catalog context). ERP store stock is driven by purchase/receive flows, not this field alone.

### 3.2 Variants tab (create flow)

On create, choose a **variant layout**:

- **None (simple)** — default SKU path; validation expects **Name + Sales price > 0** to continue/save.
- **Standard Variants** or **Variant Groups** — if layout ≠ **None**, details step can pass with **name only**; set **price / purchase price / tax** per SKU (including `0` where inputs allow).

**Actions:** Continue → Variants → **Create product** / save details.

### 3.3 Saving with purchase & sale rates at ₹0

| Path | UI behavior |
|------|-------------|
| **Full product modal** | With layout **None**, UI blocks create until **Sales price > 0** (*“Product name and default price are required.”*). **Workaround:** pick **Standard Variants** or **Variant Groups**, enter name, set **Sales price** and **Purchase price** to `0` on SKU rows, complete create. |
| **Quick create** (from purchase bill line: **New product**) | Fields: name (required), barcode, category, purchase price (allows `0`), tax %, HSN. No separate sale price field on this mini-form. |
| **After create** | Edit product (`/admin/products/{id}` or list edit) and set **Sales price** / **Purchase price** to `0` on details or variant rows where numeric min allows `0`. |

---

## 4. Supplier & customer

### 4.1 Vendor — **Add vendor** (`/admin/vendors/new`)

| Field | Required |
|-------|----------|
| Name | Yes |
| Address | Yes |
| Vendor type | Yes (dropdown: ServiceProvider, Supplier, Manufacturer, Shipper) |
| PO box, TRN, Email, Phone, Fax | Optional |
| Opening balance, Opening balance date | Optional |
| Notes | Optional |
| Active | Checkbox (default on) |

**Save** → vendor ERP profile `/admin/vendors/{id}/erp`.

**On purchase bill:** **Supplier** = searchable **VendorSearchSelect** (required).

### 4.2 Customer — **Add customer** (page or **Add customer** on invoice)

| Field | Required |
|-------|----------|
| Company name | Yes |
| First / last name, contact display name | Optional |
| Address, location, email, mobile, landline, PO box, TRN | Optional |
| Credit limit, opening balance, opening balance date | Optional |
| Notes, photo | Optional |

**On invoice:** **Customer** search (required); create mode allows inline **Add customer**.

---

## 5. Purchase bill (purchase invoice)

**Paths:** **Purchase Bills → New** or `/admin/erp/purchase-bills/new`.  
**Title:** **Purchase entry** (create) / **Edit purchase bill** (edit).

### 5.1 Purchase header

| Field | Required |
|-------|----------|
| Bill number (PB) | Auto / document number field on create |
| **Supplier** | **Yes** |
| **Destination store** | **Yes** |
| Purchase date | Optional (defaults today) |
| Due date | Optional (defaults ~30 days after purchase date on create) |
| Expected delivery | Optional |
| Vendor bill number, GRN reference, Batch reference | Optional |
| PO link | Optional (locks supplier when loaded from PO) |
| Reference, Notes | Optional |

### 5.2 Purchase items (line grid)

| Column | Notes |
|--------|--------|
| Search product / New product / Add line | Link product via search when possible |
| Item name | Text |
| Qty, Rate, Tax % | Editable |
| Expiry | Date (shown on bills) |
| Amount | Read-only display |
| Details | Expands **line context** (stock/pricing hints for store + vendor) — needs store + linked product |

**No per-line discount column** on this form.

### 5.3 Landed costs

- Quick-add buttons from **active landed cost masters**, or **Custom landed cost**.
- Per row: **Landed item** (name), **Qty**, **Rate**, **Tax %**, amount, delete.
- **Allocation** (when lines exist): method **Quantity** | **Value** | **Custom**; per-line allocated amounts; warning until allocation matches landed total.
- **No “weight” allocation** label in the UI.

### 5.4 Totals sidebar

| Field | Level |
|-------|--------|
| Subtotal, Tax, Landed | Display |
| **Discount** | **Invoice-level** numeric (not per line) |
| Grand total | Display |

### 5.5 Stock receipt

Checkbox **Mark items as received** (default **on** when not from PO):  
*“When finalized, increases store stock on this bill…”*  
Hidden when bill is tied to a **PO link** (receive handled via PO/receive flow).

### 5.6 Actions & validation (user-visible)

| Action | When |
|--------|------|
| **Save draft** | Always (if draft) |
| **Save & finalize** | Standalone bill (no PO link); disabled if landed allocation unbalanced |
| **Cancel** | Back to list |

**Messages you may see:**

- Vendor and store required  
- Add at least one valid line item  
- Landed cost allocation must match before finalize  
- Grand total must be **> 0** to finalize  
- Landed allocation warning banner  

**Not on this form:** payment method, amount paid, payment status.

### 5.7 Purchase completion sequence (typical standalone bill)

1. Set **header** (supplier, store, dates).  
2. Add **lines** (products, qty, rate, tax %).  
3. Add **landed costs**; pick allocation method; balance allocations.  
4. Optional: invoice-level **Discount** in sidebar.  
5. Confirm **Mark items as received** if stock should increase on finalize.  
6. **Save draft** OR **Save & finalize**.  
7. Open bill detail `/admin/erp/purchase-bills/{id}`:  
   - If still draft: **Finalize & post to payable**  
   - **Record payment** → `/admin/erp/supplier-payments/new?billId=…`  
   - **Record discount** → modal (commercial discount → vendor credit; does not edit original bill lines)

**PO-driven bill:** **Save & finalize** hidden on form; finalize/payment from detail/PO/receive flows as applicable.

---

## 6. Supplier payment — **Add payment made**

`/admin/erp/supplier-payments/new` (optional `?billId=` / `?vendorId=`)

| Field | Required |
|-------|----------|
| Store | Yes |
| Payment date | Yes |
| Payment mode | Cash, Card, Cheque, Bank Remittance, Bank Transfer |
| Paid through account | Yes |
| Bank charges (+ expense account if used) | Optional |
| Vendor | For adding bill lines |
| Bill lines / amounts | Allocate to purchase bills |
| Reference, Notes | Optional |

**Save payment** — separate from bill entry.

---

## 7. Sales invoice

**Paths:** `/admin/erp/invoices/new`, edit via list/detail.

### 7.1 Invoice details

| Field | Required |
|-------|----------|
| **Customer** | Yes |
| Invoice number (INV) | Auto on create |
| **Store** | Yes |
| Invoice date, Due date | Optional (due auto-extends from invoice date on create) |
| Notes | Optional |
| **Salesman PIN** | **Yes** (3 digits; must verify to a salesman name) |
| **Item rates are tax inclusive** | Checkbox (default on) |

Credit limit: if customer has limit, **Available credit** shown; save blocked when exceeded.

### 7.2 Invoice items

| Column | Notes |
|--------|--------|
| Product search | Adds linked line |
| Item, Qty, Rate, Tax % | Editable |
| Tax amount, Total | Display |
| Details | Stock/sales context (needs store + product) |

**No per-line discount column.**

### 7.3 Totals sidebar

**Sub total**, **Tax**, **Discount** (invoice-level), **Total**.

### 7.4 Actions

| Action | Notes |
|--------|--------|
| **Save draft** | Requires valid salesman PIN |
| **Save & finalize** | Same; each line must be linked to a product via search; total **> 0** |
| **Cancel** | Back to list/detail |

### 7.5 Sales completion sequence

1. Customer, store, dates, **Salesman PIN**, tax inclusive flag.  
2. Add lines (search products, qty, rate, tax %).  
3. Optional invoice-level **Discount**.  
4. **Save draft** or **Save & finalize**.  
5. Invoice detail `/admin/erp/invoices/{id}`:  
   - **Finalize & post to receivable** (if still draft)  
   - **Record payment** → `/admin/erp/payments/new?invoiceId=…`  
   - **Record discount** → commercial discount (credit note; original invoice not edited)

**Stock:** Line **Details** shows availability; no separate “post stock” button on the invoice form (finalize issues the invoice).

---

## 8. Customer payment — **Payments Received**

`/admin/erp/payments/new` (`?invoiceId=` / `?customerId=`)

| Field | Required |
|-------|----------|
| Store | Yes |
| Payment date | Yes |
| Payment mode | Cash, CreditCard, Cheque, BankRemittance, BankTransfer, UPI |
| Paid through account | Yes |
| Bank charges | Optional |
| Customer / invoice allocation lines | As UI flow |
| Reference, Notes | Optional |

---

## 9. Discounts vs test scenario wording

| Intent | Where in UI |
|--------|-------------|
| **Invoice/bill-level discount** | **Discount** field in purchase/sales **Total** sidebar |
| **“Item-level” line discount** | **Not present** on purchase or sales line grids |
| **Post-hoc commercial discount** | **Record discount** on bill/invoice detail (or credit note flows); creates **vendor credit** / **credit note** |

**Returns:** **Vendor Credits**, **Credit Notes** in sidebar; **Vendor credit** form also references purchase receives in some flows.

---

## 10. Report navigation & filters

**Hub:** `/admin/erp/reports` (categories below). Each report: `/admin/erp/reports/{slug}`.  
**Toolbar (typical):** date preset/range or **As of**, **Store**, extra filters per report, search, **Refresh**, **Export** (CSV / XLSX / PDF when rows exist).

### Business Overview
| Report | Filters (visible config) |
|--------|---------------------------|
| Balance Sheet | As of, Store |
| Profit and Loss | Date range, Store |
| Cash Flow Statement | Date range, Store |
| Day Book | Date range, Store |
| Finance Summary | Date range, Store |

Also: **Financial Summary** page `/admin/erp/financial-summary`.

### Sales
| Report | Filters |
|--------|---------|
| Daily / Monthly Collection Report | Date range, Store |
| Sales by Customer / Item / Salesman | Date range, Store, Channel, Salesman |
| Credit Note Report | Date range, Store, Salesman |

### Inventory
| Report | Filters |
|--------|---------|
| Stock Report | Store, Brand, Category, Stock level |
| Minus Stock Report | Store, Brand, Category |
| Store Wise Stock | Store |
| Stock GL vs WAC | Store |
| Dead Stock | As of, Store, Brand, Category, Customer search, Expired days range |
| Stock Transfer Report | Date range, From store, To store, Status |

**Operational lists (not only “Reports”):** **Store inventory**, **Item Transactions** (type, date range, search; scoped to active store).

### Purchases and Expenses
| Report | Filters |
|--------|---------|
| Purchase By Item | Date range, Store, Brand, Category |
| Purchase By Vendor | Date range, Store |

**Bill-level detail:** purchase bill **detail/print** screens and **Vendor Statement** (chronological bills/payments/credits).

### Receivables / Payables
| Report | Filters |
|--------|---------|
| Customer Balance | Store, Customer search, Salesman |
| Customer Statement | Date range, Store, Customer search |
| Customer aging (summary, details, values) | As of, Store, Customer search, Age range, Salesman |
| Vendor Balance | Store, Vendor search |
| Vendor Statement | Date range, Store, Vendor search |
| PB aging (summary, details, values) | As of, Store, Vendor search, Age range |

### Payments
| Report | Filters |
|--------|---------|
| Payments Received | Date range, Store, Salesman |

**Supplier payments:** list at `/admin/erp/supplier-payments`; **Payment Statement** under Banking.

### Accountant
| Report | Filters |
|--------|---------|
| Trial Balance | As of, Store |
| General Ledger | Date range, Store, Account |
| Account Transactions | Date range, Store, Account, Account type |
| AR/AP GL Reconciliation | As of, Store |

### Taxes
| Report | Filters |
|--------|---------|
| VAT Return Summary | Date range, Store, Store search |
| VAT Return Details | Date range, Store, Customer search |

**VAT menus:** VAT Returns, VAT Payments.

### Activity
Activity Log; Deleted Invoices (with filters per report definition).

---

## 11. End-to-end user action checklist (manual test)

1. **Store** — select in header.  
2. **Products (×2)** — `/admin/products` → Add product (variant layout if both rates must be ₹0).  
3. **Vendor** — `/admin/vendors/new` → Save.  
4. **Customer** — `/admin/customers` or Add customer on invoice.  
5. **Landed masters (if needed)** — `/admin/erp/landed-costs`.  
6. **Purchase bill** — `/admin/erp/purchase-bills/new` → header, lines, landed costs, allocation, discount, receive checkbox → **Save & finalize** (or draft → detail finalize).  
7. **Supplier payment (if testing payment)** — detail **Record payment** or Payments Made → new.  
8. **Sales invoice** — `/admin/erp/invoices/new` → customer, PIN, lines, tax inclusive, discount → **Save & finalize**.  
9. **Customer payment (if testing)** — detail **Record payment** or Payments Received → new.  
10. **Reports** — `/admin/erp/reports` + store inventory + item transactions; set filters; export if needed.

---

## 12. UI limitations relevant to your scenario

| Topic | Limitation |
|-------|------------|
| **Item-level discounts** | No line discount on purchase/sales forms; use sidebar discount or **Record discount** after posting. |
| **Landed allocation by weight** | UI offers **Quantity**, **Value**, **Custom** only. |
| **₹0 default purchase & sale rates** | Simple product create requires **sales price > 0** unless using variant layout or edit-after-create; sales price input has `min="0.01"` on details step. |
| **Zero-value finalize** | Purchase and sales **finalize** require **grand total > 0**. |
| **Payment on same screen** | Payments are **separate** documents after finalize. |
| **Purchase receives** | Separate receive pages exist (`/admin/erp/purchase-receives/...`); not in main sidebar; PO/receive path differs from standalone bill + **Mark items as received**. |
| **Salesman PIN** | Mandatory for invoice save/issue. |
| **RBAC** | Missing permissions hide routes/actions. |
| **Sync feedback** | Saves may queue locally (*Save draft* / finalize messaging); allow sync to complete before verifying reports. |

---

## 13. Gaps without a live browser session

This runbook is built from **admin UI structure, labels, routes, and validation messages** in the product. For acceptance testing, confirm in a running environment: exact button visibility per role, PO/receive edge paths, and any tenant flags (e.g. MRP on products). I did not create business records or execute clicks in a deployed instance during this discovery pass.

If you want, we can next turn this into a printable test script with blank columns for tester initials and screenshots only—still without expected numbers.