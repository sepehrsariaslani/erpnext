# ERPNext v16.27.0 Upgrade Notes

## Branches and commits

- Previous custom snapshot backup:
  - `origin/version-16-pre-upgrade`
  - `e2892555799a90f210dc4a592106de643903cc0c`
- Upgraded branch:
  - `version-16`
  - `inspect-conflicts`
  - `8a696c85a44738145e2581709206339eb0286ee0`

## Diff summary

- `903 files changed, 822452 insertions(+), 418457 deletions(-)`

Highest-change areas by file count:

- `erpnext/accounts`
- `banking/src`
- `erpnext/stock`
- `erpnext/public`
- `erpnext/selling`
- `erpnext/manufacturing`
- `erpnext/setup`

## Manual conflict resolutions

These files were manually resolved during the upgrade:

- `erpnext/accounts/doctype/bank_account/bank_account.json`
  - kept both custom `card_number` and upstream `statement_password`
- `erpnext/accounts/doctype/purchase_invoice/purchase_invoice.json`
  - kept upstream v16.27.0 structural additions
- `erpnext/accounts/doctype/purchase_invoice/purchase_invoice.py`
  - kept upstream purchase receipt and permission-flow updates
- `erpnext/manufacturing/doctype/bom/bom.py`
  - kept upstream semi-finished and operating-cost flow
- `erpnext/manufacturing/doctype/job_card/job_card.py`
  - merged custom timer flow with upstream job-card and semi-finished updates
- `erpnext/manufacturing/doctype/work_order/work_order.py`
  - kept upstream `secondary_items` and `non_stock_items` behavior
- `erpnext/manufacturing/page/bom_comparison_tool/bom_comparison_tool.js`
  - kept custom editable qty/time UI and added safer escaping
- `erpnext/patches.txt`
  - kept custom Iran patch and upstream patch additions
- `erpnext/selling/doctype/selling_settings/selling_settings.json`
  - kept custom commission/accounting fields plus upstream new settings

## Custom items explicitly preserved

- Persian print format behavior
- custom manufacturing workspace
- custom selling/accounting fields:
  - `max_structure_disscount`
  - `commission_expense`
  - `commission_payable`
  - `employee_payable`
- custom patch:
  - `erpnext.patches.v16_0.setup_iran_memorandum_accounts`

## New upstream behavior explicitly preserved

- `Payment Request` newer fields and flow
- `Purchase Invoice` newer stock and tax fields
- `Bank Account` PDF statement password support
- `Item` attribute-value search performance update
- manufacturing semi-finished and secondary-items support
- banking app and bank-reconciliation additions from upstream

## Verification already completed

- Python compile check passed for:
  - `purchase_invoice.py`
  - `bom.py`
  - `job_card.py`
  - `work_order.py`
- Fresh merge verification passed for:
  - no conflict markers in resolved files
  - expected custom and upstream fields preserved in key JSON/JS files

## Recommended smoke tests before deployment

1. Open a `Purchase Invoice` and verify:
   - `Update Stock` logic
   - dispatch address rendering
   - custom print format still works
2. Open `Selling Settings` and verify custom fields still exist and save correctly.
3. Create or edit a `Bank Account` and verify:
   - custom `card_number`
   - upstream `statement_password`
4. Check manufacturing flow end-to-end:
   - `BOM`
   - `Work Order`
   - `Job Card`
   - semi-finished or secondary-items flow if used
5. Check Persian sales and purchase print outputs.
6. Check any Iran-specific accounting flow that depends on memorandum accounts.
7. Check banking features separately because upstream banking changes are large.

## Deployment caution

This upgrade is not a small patch-level bump in practical terms. Even though the target stays in ERPNext v16, the delta contains broad upstream changes in:

- accounts
- stock
- manufacturing
- selling
- banking UI and server code

Treat first deployment as a controlled upgrade with smoke testing immediately after migration.
