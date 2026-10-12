#!/usr/bin/env bash
# Seed a throwaway data folder with sample bookkeeping data for demos/screenshots.
# Usage: scripts/seed-demo.sh /tmp/fb-demo   (never point this at your real data)
set -euo pipefail
D="${1:?usage: seed-demo.sh <empty-dir>}"
rm -rf "$D"; mkdir -p "$D"
export FREEBIES_DATA_DIR="$D"
cd "$(dirname "$0")/.."
fb() { node --import tsx src/cli.ts --json "$@"; }
id() { node -pe 'JSON.parse(require("fs").readFileSync(0)).id'; }

fb business set --name "Vishi Choudhary" --address "Torstraße 12, 10119 Berlin" --tax-number "34/567/89012" --vat-id "DE312345678" >/dev/null
A=$(fb clients add --name "Nordlicht Studio GmbH" --email "billing@nordlicht.de" --vat-id "DE298765432" --address "Schanzenstraße 40, 20357 Hamburg" | id)
B=$(fb clients add --name "Kollektiv Acht UG" --email "hallo@acht.berlin" --address "Weserstraße 8, 12047 Berlin" | id)
C=$(fb clients add --name "Atlas Robotics AG" --email "ap@atlas-robotics.ch" --address "Seefeldstrasse 5, 8008 Zürich" --country Switzerland | id)
inv() { printf '{"client_id":"%s","issue_date":"%s","due_date":"%s","items":%s}' "$1" "$2" "$3" "$4" > "$D/i.json"; fb invoices create --from "$D/i.json" | id; }
I1=$(inv "$A" 2026-08-04 2026-08-18 '[{"description":"Brand system, phase 1","quantity":1000,"unit_price_cents":420000,"vat_bp":1900}]')
I2=$(inv "$B" 2026-09-02 2026-09-16 '[{"description":"Website build","quantity":32000,"unit_price_cents":9500,"vat_bp":1900},{"description":"Hosting setup","quantity":1000,"unit_price_cents":15000,"vat_bp":1900}]')
I3=$(inv "$C" 2026-09-28 2026-10-12 '[{"description":"ML pipeline consulting","quantity":18000,"unit_price_cents":12000,"vat_bp":0}]')
I4=$(inv "$A" 2026-10-06 2026-10-20 '[{"description":"Brand system, phase 2","quantity":1000,"unit_price_cents":380000,"vat_bp":1900}]')
fb invoices status "$I1" paid >/dev/null; fb invoices status "$I2" paid >/dev/null
fb invoices status "$I3" sent >/dev/null; fb invoices status "$I4" sent >/dev/null

fb expenses add --date 2026-09-03 --net "41,18" --vat 1900 --supplier "Hetzner Online" --category hosting >/dev/null
fb expenses add --date 2026-09-12 --net "1.249,00" --vat 1900 --supplier "Apple Store" --description "Studio Display" --category hardware >/dev/null
fb expenses add --date 2026-09-20 --net "16,81" --vat 1900 --supplier "Figma" --category software >/dev/null
fb expenses add --date 2026-10-01 --net "42,02" --vat 1900 --supplier "Telekom" --category phone-internet >/dev/null
fb expenses add --date 2026-10-04 --net "56,07" --vat 700 --supplier "Café Kranzler" --description "Client lunch" --category meals >/dev/null

cat > "$D/sparkasse.csv" <<'CSV'
Buchungstag;Betrag;Beguenstigter/Zahlungspflichtiger;Verwendungszweck
2026-08-15;4.998,00;Nordlicht Studio GmbH;Rechnung 2026-0001
2026-09-03;-49,00;Hetzner Online GmbH;Rechnung R0012345
2026-09-12;-1.486,31;Apple Distribution;Studio Display
2026-09-14;3.796,40;Kollektiv Acht UG;RE 2026-0002 Website
2026-09-20;-20,00;Figma Inc;Professional plan
2026-10-01;-50,00;Telekom Deutschland;Mobilfunk Oktober
2026-10-04;-60,00;Cafe Kranzler;Kartenzahlung
2026-10-08;-1.200,00;Finanzamt Berlin;ESt Vorauszahlung Q3
CSV
echo '{"date":"Buchungstag","amount":"Betrag","counterparty":"Beguenstigter/Zahlungspflichtiger","reference":"Verwendungszweck","delimiter":";"}' > "$D/map.json"
fb tx import --file "$D/sparkasse.csv" --format csv --map "$D/map.json" >/dev/null
fb tx list | node -e '
const t=JSON.parse(require("fs").readFileSync(0)); for (const x of t) console.log(x.id+"|"+x.counterparty)' | while IFS="|" read -r tid cp; do
  case "$cp" in
    Hetzner*) fb tx classify "$tid" --category hosting >/dev/null;;
    Figma*) fb tx classify "$tid" --category software >/dev/null;;
    Nordlicht*) fb tx link "$tid" --invoice "$I1" >/dev/null;;
  esac
done
echo "seeded $D"
