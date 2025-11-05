import os
import re
import sys
import json
import hashlib
import requests
from io import BytesIO
from PIL import Image
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

# --- Constants ---
USDT_TRON_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
USDT_DECIMALS = 6
TRONGRID = "https://api.trongrid.io"

# --- Address Normalization ---
_B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

def _b58encode(b: bytes) -> str:
    n = int.from_bytes(b, "big")
    res = ""
    while n > 0:
        n, r = divmod(n, 58)
        res = _B58_ALPHABET[r] + res
    pad = 0
    for ch in b:
        if ch == 0:
            pad += 1
        else:
            break
    return "1" * pad + res

def _b58check_encode(payload: bytes) -> str:
    chk = hashlib.sha256(hashlib.sha256(payload).digest()).digest()[:4]
    return _b58encode(payload + chk)

def tron_hex_to_base58(addr: str) -> str | None:
    if not addr: return None
    a = addr.strip()
    if a.startswith("T") and len(a) >= 34: return a
    if a.startswith(("0x", "0X")): a = a[2:]
    if len(a) == 40: a = "41" + a
    try:
        raw = bytes.fromhex(a)
    except ValueError:
        return None
    if len(raw) != 21 or raw[0] != 0x41: return None
    return _b58check_encode(raw)

def normalize_tron_address(addr: str) -> str | None:
    return tron_hex_to_base58(addr)

# --- Helpers ---
def extract_txid_from_url(url: str) -> str | None:
    m = re.search(r'/transaction/([0-9a-fA-F]{64})', url or "")
    return m.group(1) if m else None

def load_image_bytes(path: str) -> bytes:
    with Image.open(path) as im:
        buf = BytesIO()
        im.save(buf, format=im.format or "PNG")
        return buf.getvalue()

def safe_json_loads(s: str) -> dict:
    s = (s or "").strip()
    s = re.sub(r"^```json\s*|\s*```$", "", s)
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", s)
        if m: return json.loads(m.group(0))
        return {}

def parse_utc(ts_str: str | None) -> datetime | None:
    if not ts_str: return None
    ts_str = ts_str.strip().replace("T", " ")
    try:
        dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        return dt.astimezone(timezone.utc)
    except ValueError:
        return None

# --- Gemini ---
def call_gemini_extract(image_bytes: bytes, model_name: str, google_api_key: str) -> dict:
    import google.generativeai as genai
    genai.configure(api_key=google_api_key)

    system_prompt = """
    You are an invoice OCR/IE agent for USDT TRC-20 receipts. Extract ONLY these fields and return STRICT JSON.
    {
      "txid": "string | null (The 64-character transaction hash)",
      "explorer_url": "string | null (If a URL like tronscan.org/... is present)",
      "from_address": "string | null (The sender's 'T...' address)",
      "to_address": "string | null (The recipient's 'T...' address)",
      "amount": "number | null (The amount of USDT, always positive)",
      "timestamp": "string | null (The UTC timestamp of the transaction if available, e.g., '2025-11-05 11:47:45')"
    }
    """
    img_part = {"mime_type": "image/png", "data": image_bytes}
    model = genai.GenerativeModel(model_name)
    resp = model.generate_content(
        [{"text": system_prompt}, img_part],
        generation_config={"temperature": 0.0, "response_mime_type": "application/json"}
    )
    return safe_json_loads(getattr(resp, "text", "") or "{}")

# --- TronGrid ---
def trongrid_post(path: str, json_body: dict, api_key: str):
    r = requests.post(f"{TRONGRID}{path}", json=json_body, headers={"TRON-PRO-API-KEY": api_key}, timeout=30)
    r.raise_for_status()
    return r.json()

def trongrid_get(path: str, params: dict, api_key: str):
    r = requests.get(f"{TRONGRID}{path}", params=params, headers={"TRON-PRO-API-KEY": api_key}, timeout=30)
    r.raise_for_status()
    return r.json()

def get_tx_info(txid: str, api_key: str) -> dict:
    return trongrid_post("/wallet/gettransactioninfobyid", {"value": txid}, api_key)

def get_latest_block(api_key: str) -> int | None:
    j = trongrid_post("/wallet/getnowblock", {}, api_key)
    return (j.get("block_header", {}).get("raw_data", {})).get("number")

def compare_amounts(onchain_value_raw: str | int, invoice_amount: float, decimals: int = USDT_DECIMALS, tol=1):
    try:
        raw = int(onchain_value_raw)
    except (ValueError, TypeError):
        return False
    target_raw = int(round(invoice_amount * (10 ** decimals)))
    return abs(raw - target_raw) <= tol

# --- TxID Discovery ---
def find_candidate_txids(to_address_b58: str, amount_human: float, approx_utc: datetime | None, trongrid_key: str, window_minutes: int, max_pages: int = 5):
    params = {
        "limit": 200, "contract_address": USDT_TRON_CONTRACT,
        "only_confirmed": "true", "order_by": "block_timestamp,desc"
    }
    if approx_utc:
        lo = int((approx_utc - timedelta(minutes=window_minutes)).timestamp() * 1000)
        hi = int((approx_utc + timedelta(minutes=window_minutes)).timestamp() * 1000)
        params["min_timestamp"] = lo

    headers = {"TRON-PRO-API-KEY": trongrid_key}
    url = f"{TRONGRID}/v1/accounts/{to_address_b58}/transactions/trc20"
    amount_raw_target = int(round(amount_human * (10 ** USDT_DECIMALS)))
    
    candidates = []
    fingerprint = None
    for _ in range(max_pages):
        q = dict(params)
        if fingerprint: q["fingerprint"] = fingerprint
        r = requests.get(url, params=q, headers=headers, timeout=30)
        r.raise_for_status()
        data = r.json()

        for row in data.get("data", []):
            if (row.get("token_info", {}).get("address") != USDT_TRON_CONTRACT or 
                row.get("to") != to_address_b58):
                continue
            if not compare_amounts(row.get("value", "0"), amount_human):
                continue
            
            candidates.append((row["transaction_id"], row["block_timestamp"]))

        fingerprint = (data.get("meta", {})).get("fingerprint")
        if not fingerprint: break
    
    return sorted(candidates, key=lambda x: x[1], reverse=True)

# --- Main Logic ---
def main():
    if len(sys.argv) < 5:
        print(json.dumps({"status": "ERROR", "reason": "Insufficient arguments"}))
        sys.exit(1)

    image_path = sys.argv[1]
    discover_flag = sys.argv[2] == '--discover-txid'
    our_wallets_json = sys.argv[3]
    message_timestamp_utc = sys.argv[4]

    load_dotenv()
    google_api_key = os.getenv("GOOGLE_API_KEY")
    trongrid_api_key = os.getenv("TRONGRID_API_KEY")
    model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    if not all([google_api_key, trongrid_api_key]):
        print(json.dumps({"status": "ERROR", "reason": "Missing API keys in .env"}))
        sys.exit(1)

    our_wallets = set(json.loads(our_wallets_json))

    try:
        img_bytes = load_image_bytes(image_path)
        extracted = call_gemini_extract(img_bytes, model_name, google_api_key)

        if not extracted.get("txid") and extracted.get("explorer_url"):
            extracted["txid"] = extract_txid_from_url(extracted["explorer_url"])

        to_addr_invoice = normalize_tron_address(extracted.get("to_address"))
        amount_invoice = float(extracted.get("amount", 0))
        txid = extracted.get("txid")

        if not to_addr_invoice or amount_invoice <= 0:
            print(json.dumps({"status": "OCR_FAILURE", "reason": "Missing recipient address or amount from OCR."}))
            return

        is_incoming = to_addr_invoice in our_wallets
        if not is_incoming:
            print(json.dumps({"status": "OUTGOING", "reason": "Recipient address not in our wallet list."}))
            return

        if not txid and discover_flag:
            approx_time = parse_utc(message_timestamp_utc) or datetime.now(timezone.utc)
            candidates = find_candidate_txids(to_addr_invoice, amount_invoice, approx_time, trongrid_api_key, window_minutes=180)
            if candidates:
                txid = candidates[0][0]
            else:
                print(json.dumps({"status": "DISCOVERY_FAILED", "reason": "Could not find a matching transaction on-chain."}))
                return

        if not txid:
            print(json.dumps({"status": "MANUAL_REQUIRED", "reason": "Incoming transaction but no TxID found on receipt."}))
            return

        info = get_tx_info(txid, trongrid_api_key)
        if not info or info.get("receipt", {}).get("result") != "SUCCESS":
            print(json.dumps({"status": "CHAIN_REJECTED", "reason": "Transaction not found or failed on-chain."}))
            return

        events = trongrid_get(f"/v1/transactions/{txid}/events", {}, trongrid_api_key).get("data", [])
        
        for event in events:
            if event.get("contract_address") == USDT_TRON_CONTRACT and event.get("event_name") == "Transfer":
                ev_to = normalize_tron_address(event.get("result", {}).get("to"))
                if ev_to == to_addr_invoice and compare_amounts(event.get("result", {}).get("value"), amount_invoice):
                    print(json.dumps({"status": "CONFIRMED", "txid": txid, "amount": amount_invoice}))
                    return
        
        print(json.dumps({"status": "VALIDATION_FAILED", "reason": "TxID was valid but event details did not match."}))

    except Exception as e:
        print(json.dumps({"status": "ERROR", "reason": str(e)}))

if __name__ == "__main__":
    main()