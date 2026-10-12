---
name: freebies
description: German freelancer bookkeeping inside the freebies app. Use for invoices, customers, receipts, expenses, bank statement imports, and categorizing transactions.
---

# freebies bookkeeping reference

Read data with `freebies-ro`. Propose writes with `freebies-action` blocks (see the system prompt for kinds and units). Never claim a write happened before it is confirmed.

## German invoice essentials
- Sequential invoice number, issue date, service date (Leistungsdatum), seller and buyer names and addresses, seller Steuernummer or USt-IdNr, net, VAT rate and amount, gross.
- Kleinunternehmer (§ 19 UStG): no VAT on invoices; vat_bp is 0.
- EU B2B with a valid buyer USt-IdNr: reverse charge, vat_bp 0, mention it in notes ("Steuerschuldnerschaft des Leistungsempfängers").
- Standard rate 19% (1900), reduced 7% (700), e.g. books, some food.

## Receipts
Look for "Netto", "MwSt"/"USt", "Brutto"/"Gesamt". Restaurant receipts are meals (only 70% deductible; still record the full amount). Mobile and internet bills are phone-internet.

## Bank CSV presets (delimiter ";", decimal comma)
- Sparkasse: date "Buchungstag", amount "Betrag", counterparty "Beguenstigter/Zahlungspflichtiger", reference "Verwendungszweck".
- DKB: date "Buchungsdatum", amount "Betrag (€)", counterparty "Zahlungsempfänger*in" or "Zahlungspflichtige*r", reference "Verwendungszweck".
- N26 (delimiter ","): date "Booking Date", amount "Amount (EUR)", counterparty "Partner Name", reference "Payment Reference".
- ING: date "Buchung", amount "Betrag", counterparty "Auftraggeber/Empfänger", reference "Verwendungszweck". ING files start with metadata lines; check where the header row is.
If a header does not match, read the file and use the exact header text.

## Categories (EÜR-friendly)
revenue, hosting, software, hardware, office, travel, phone-internet, education, insurance, bank-fees, marketing, meals, rent, taxes, private, transfer, other.
Transfers between own accounts are transfer. Private spending from the business account is private.
