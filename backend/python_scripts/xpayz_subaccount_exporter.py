#!/usr/bin/env python3
from __future__ import annotations

import os
import sys
import json
import time
import re
import typing as t
import base64
from dataclasses import dataclass
from datetime import datetime, timezone
import argparse
from dateutil.parser import isoparse
from dotenv import load_dotenv

import requests
import mysql.connector

# --- Load Environment Variables ---
load_dotenv()

API_BASE = os.getenv("XPAYZ_API_BASE", "https://api.xpayz.us")
LOGIN_PATH = "/user/customer/auth/signin"
TRANSACTIONS_BASE_PATH = "/payment/customer/v1/web/sub/"
PRINCIPAL_NAME = os.getenv("XPAYZ_PRINCIPAL_NAME", "").strip().lower()

DB_HOST = os.getenv('DB_HOST')
DB_USER = os.getenv('DB_USER')
DB_PASSWORD = os.getenv('DB_PASSWORD')
DB_DATABASE = os.getenv('DB_DATABASE')

# === NEW: Cache file definition ===
TOKEN_CACHE_PATH = os.path.join(os.path.dirname(__file__), 'xpayz_token_cache.json')

class XPayzError(RuntimeError):
    pass

@dataclass
class Transaction:
    id: int
    created_at: str
    amount: str
    operation_direct: str
    sender_name: str | None
    destination_name: str | None
    external_id: str | None
    raw: dict

class XPayzClient:
    def __init__(self, base_url: str = API_BASE, timeout: float = 25.0):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
            "Origin": "https://app.xpayz.us",
            "Referer": "https://app.xpayz.us/",
        })

    def _load_token_from_cache(self) -> bool:
        """Tries to load and validate a token from the cache file."""
        try:
            if not os.path.exists(TOKEN_CACHE_PATH):
                return False
            with open(TOKEN_CACHE_PATH, 'r') as f:
                cache = json.load(f)
            
            token = cache.get('token')
            expires_at = cache.get('expires_at')

            # Check if token exists and is not expired (with a 60-second buffer)
            if token and expires_at and time.time() < expires_at - 60:
                self.session.headers["Authorization"] = f"Bearer {token}"
                # print("✅ Authenticated with cached token.") # Reduced logging for frequent runs
                return True
        except (IOError, json.JSONDecodeError):
            pass
        return False

    def _save_token_to_cache(self, token: str):
        """Saves a new token and its expiration time to the cache file."""
        try:
            payload = json.loads(base64.b64decode(token.split('.')[1] + '=='))
            expires_at = payload.get('exp')

            with open(TOKEN_CACHE_PATH, 'w') as f:
                json.dump({'token': token, 'expires_at': expires_at}, f)
        except Exception as e:
            print(f"⚠️  Warning: Could not save token to cache file: {e}", file=sys.stderr)

    def ensure_auth(self, email: str, password: str) -> None:
        """Ensures the client is authenticated, using cache first."""
        if self._load_token_from_cache():
            return

        print("No valid cached token. Performing full login...")
        url = f"{self.base_url}{LOGIN_PATH}"
        payload = {"email": email, "password": password}
        resp = self._request_with_retries("POST", url, json=payload)
        token = resp.json().get("token")
        if not token:
            raise XPayzError(f"Login failed: 'token' missing in response")
        
        self.session.headers["Authorization"] = f"Bearer {token}"
        self._save_token_to_cache(token)
        print("✅ Login successful and token cached.")

    def iter_transactions(self, subaccount_id: int, per_page: int = 200) -> t.Iterator[Transaction]:
        url = f"{self.base_url}{TRANSACTIONS_BASE_PATH}{subaccount_id}/transactions"
        resp = self._request_with_retries("GET", url, params={"page": 1, "per_page": per_page})
        blob = resp.json()
        items = blob.get("data", []) or []
        for item in items:
            yield self._to_transaction(item)

    def _request_with_retries(self, method: str, url: str, **kwargs) -> requests.Response:
        max_attempts = 3
        backoff = 2.0
        for attempt in range(1, max_attempts + 1):
            try:
                resp = self.session.request(method, url, timeout=self.timeout, **kwargs)
                if resp.status_code < 400:
                    return resp
                if resp.status_code in (429, 502, 503, 504):
                    if attempt < max_attempts:
                        time.sleep(backoff)
                        backoff *= 2
                        continue
                resp.raise_for_status()
            except requests.RequestException as e:
                raise XPayzError(f"{method} {url} failed: {e}")
        raise XPayzError(f"{method} {url} failed after {max_attempts} attempts")

    def _to_transaction(self, d: dict) -> Transaction:
        return Transaction(
            id=d.get("id"),
            created_at=d.get("created_at"),
            amount=d.get("amount"),
            operation_direct=d.get("operation_direct"),
            sender_name=d.get("sender_name"),
            destination_name=d.get("destination_name"),
            external_id=d.get("external_id"),
            raw=d,
        )

# (The database functions below are unchanged)
def get_db_connection():
    try:
        return mysql.connector.connect(
            host=DB_HOST, user=DB_USER, password=DB_PASSWORD, database=DB_DATABASE
        )
    except mysql.connector.Error as e:
        print(f"❌ DB Connection Error: {e}", file=sys.stderr)
        return None

def normalize_name(name: str) -> str:
    if not name: return ""
    name = re.sub(r'[\d.,-]', '', name)
    name = re.sub(r'\b(ltda|me|sa|eireli|epp)\b', '', name, flags=re.IGNORECASE)
    return re.sub(r'\s+', ' ', name).strip().lower()

def save_transactions_to_db(subaccount_id: int, transactions: list[Transaction]):
    db = get_db_connection()
    if not db:
        return
        
    cursor = db.cursor()
    partner_subaccount_id = os.getenv("PARTNER_SUBACCOUNT_NUMBER")
    
    insert_query = """
        INSERT INTO xpayz_transactions (
            xpayz_transaction_id, subaccount_id, amount, operation_direct,
            sender_name, sender_name_normalized, counterparty_name, 
            transaction_date, raw_details, external_id
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE 
            xpayz_transaction_id=xpayz_transaction_id,
            operation_direct=VALUES(operation_direct),
            counterparty_name=VALUES(counterparty_name),
            external_id=VALUES(external_id);
    """
    
    count = 0
    skipped_principal = 0
    for tx in transactions:
        if not tx.sender_name: tx.sender_name = "Unknown"
        if tx.operation_direct == 'in' and PRINCIPAL_NAME and PRINCIPAL_NAME in tx.sender_name.lower():
            skipped_principal += 1
            continue
        try:
            amount = float(tx.amount)
            tx_date = isoparse(tx.created_at)
            normalized = normalize_name(tx.sender_name)
            if tx.operation_direct == 'out':
                counterparty = "USD BETA OUT / E"
            else:
                counterparty = tx.destination_name if tx.destination_name else ""
            values = (tx.id, subaccount_id, amount, tx.operation_direct, tx.sender_name, normalized, counterparty, tx_date, json.dumps(tx.raw), tx.external_id)
            cursor.execute(insert_query, values)
            count += cursor.rowcount
            if str(subaccount_id) == partner_subaccount_id and tx.operation_direct == 'in':
                xpayz_tx_id = cursor.lastrowid 
                link_query = "UPDATE bridge_transactions SET xpayz_transaction_id = %s WHERE payer_document = %s AND amount = %s AND status = 'pending' AND xpayz_transaction_id IS NULL LIMIT 1;"
                payer_doc = ''.join(filter(str.isdigit, tx.sender_name or ''))
                if payer_doc:
                    cursor.execute(link_query, (xpayz_tx_id, payer_doc, amount))
        except Exception as e:
            print(f"⚠️ Could not process transaction ID {tx.id}: {e}", file=sys.stderr)
            
    db.commit()
    print(f"✅ DB Sync: Inserted/Updated {count} txs for subaccount {subaccount_id}. Skipped {skipped_principal} internal transfers.")
    cursor.close()
    db.close()

def main():
    parser = argparse.ArgumentParser(description="XPayz: fetch and store subaccount transactions.")
    parser.add_argument("subaccount_id", help="The numeric ID of the subaccount to fetch.")
    args = parser.parse_args()
    
    email = os.getenv("XPAYZ_EMAIL")
    password = os.getenv("XPAYZ_PASSWORD")

    if not all([email, password, DB_HOST, DB_USER, DB_DATABASE]):
        print("❌ ERROR: Missing required environment variables", file=sys.stderr)
        return 1

    try:
        client = XPayzClient()
        client.ensure_auth(email, password)
        
        # print(f"Fetching transactions for subaccount {args.subaccount_id}...")
        transactions = list(client.iter_transactions(subaccount_id=args.subaccount_id, per_page=200))
        
        if transactions:
            save_transactions_to_db(args.subaccount_id, transactions)
        # else:
            # print(f"No new transactions found for subaccount {args.subaccount_id}.")
            
    except XPayzError as e:
        print(f"❌ An API error occurred: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"❌ An unexpected script error occurred: {e}", file=sys.stderr)
        return 1
        
    return 0

if __name__ == "__main__":
    raise SystemExit(main())