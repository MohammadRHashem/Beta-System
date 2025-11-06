import sys
import json
import time
from datetime import datetime, timezone
from decimal import Decimal, ROUND_DOWN
from urllib.parse import urljoin
import requests

BASE_URL = "https://usdt.tokenview.io"
MAX_PAGE_SIZE = 50

HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
}

def iso8601_from_epoch(seconds: int) -> str:
    try:
        return datetime.fromtimestamp(int(seconds), tz=timezone.utc).isoformat()
    except (ValueError, TypeError):
        return ""

def fetch_page(session: requests.Session, address: str, page: int, page_size: int, timeout: int = 20) -> dict:
    page_size = min(page_size, MAX_PAGE_SIZE)
    path = f"/api/usdt/addresstxlist/{address}/{page}/{page_size}"
    url = urljoin(BASE_URL, path)
    headers = HEADERS.copy()
    headers["Referer"] = f"{BASE_URL}/en/address/{address}"
    r = session.get(url, headers=headers, timeout=timeout)
    r.raise_for_status()
    return r.json()

def normalize_tx(tx: dict) -> dict:
    raw_value = tx.get("value") or "0"
    try:
        micro = Decimal(str(raw_value))
        usdt = (micro / Decimal(1_000_000)).quantize(Decimal("0.000001"), rounding=ROUND_DOWN)
    except Exception:
        usdt = Decimal("0")

    return {
        "txid": tx.get("txid"),
        "time_iso": iso8601_from_epoch(tx.get("time")),
        "from_address": tx.get("from"),
        "to_address": tx.get("to"),
        "amount_usdt": str(usdt),
    }

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No address provided"}))
        sys.exit(1)
    
    address_to_fetch = sys.argv[1]
    
    session = requests.Session()
    page = 1
    txids_seen = set()
    all_rows = []
    max_pages = 10 # Safety limit to prevent infinite loops

    while page <= max_pages:
        try:
            resp = fetch_page(session, address_to_fetch, page, MAX_PAGE_SIZE)
            data = resp.get("data", {})
            txs = data.get("txs", [])

            if not txs:
                break

            for tx in txs:
                txid = (tx.get("txid") or "").lower()
                if txid and txid not in txids_seen:
                    txids_seen.add(txid)
                    all_rows.append(normalize_tx(tx))
            
            if len(txs) < MAX_PAGE_SIZE:
                break # Reached the last page

            page += 1
            time.sleep(0.5) # Be respectful to the API

        except requests.RequestException as e:
            # Output error as JSON so Node.js can see it
            print(json.dumps({"error": f"Failed to fetch page {page} for {address_to_fetch}: {e}"}))
            sys.exit(1)

    # Output the final result as a single JSON line
    print(json.dumps(all_rows))

if __name__ == "__main__":
    main()