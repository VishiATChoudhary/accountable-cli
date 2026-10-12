-- Leistungsdatum: when the work was delivered; defaults to the issue date on the PDF.
ALTER TABLE invoices ADD COLUMN delivery_date TEXT;
