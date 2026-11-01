# Kuzmos ERP prototype · v0.4

Review `previews/kuzmos-panels.html`. This branch preserves the original Apps Script staff form in `reference/sales/Index.html`. The preview adds a narrow barcode adapter around that source.

## Payment workflow
One payment form covers suppliers, service providers, tax/SGK, company card statements and owner/family payments. Save a plan without moving cash, or confirm a payment with its actual date and account. Use the calendar to confirm due payments. The example day is 20 November 2026.

- Cheque/promissory-note delivery does not move cash. Confirm redemption once, at its actual date.
- Card supplier payments increase card debt; statement settlement moves bank/cash once.
- Bank/cash payments can be partial. Prototype cheque/note redemption requires the full outstanding amount.
- Owner/family payments require a beneficiary and purpose, and remain separate from company operating expenses.

## Inventory / Excel
Download `templates/Kuzmos_Stok_Aktarim_Sablonu.xlsx` or use the download in the preview. Fill the Stok sheet; the Kilavuz sheet explains the fields. Upload, inspect validation and before/after quantities, then apply. One invalid row blocks the complete batch.

EKLE adds stock, SAYIM sets physical stock without going below reservations, URUN changes product metadata/price only. Duplicate file and SKU/branch/action/reference checks prevent repeated additions. SKU and manufacturer barcode are separate text identifiers. Lens identity includes brand, model, power and color.

The native XLSX reader accepts standard XLSX, up to 10 MB / 2000 data rows, and requires modern browser DecompressionStream support. Formulas in Stok, encrypted archives and ZIP64 are rejected. No spreadsheet formulas or macros execute.

## Validation
Node 24: `node --test web/tests/*.test.mjs` from repository root. Tests cover payment timing, duplicate confirmations, card versus cash, cheque/note redemption, lens power, barcode mapping, import atomicity, stale previews, reservations and the actual XLSX template.

## Prototype boundary
Preview data lives only in the current page session. No authentication, live database, bank payment, hardware scanner certification or production stock reservation is provided. Browser visual QA remains outstanding. Balanced-journal modules remain separate; the payment UI is not yet wired into a transactional production ledger. Production requires Supabase tenant/branch authorization, server-side validation and transactions, audit/reversal handling, and accountant-reviewed document/tax/account mappings.
