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

TOKEN_CACHE_PATH = os.path.join(os.path.dirname(__file__), 'xpayz_token_cache.json')

class XPayzError(RuntimeError):
    pass

@dataclass
class Transaction:
    id: int; created_at: str; amount: str; operation_direct: str; sender_name: str | None; destination_name: str | None; external_id: str | None; raw: dict

class XPayzClient:
    def __init__(self, base_url: str = API_BASE, timeout: float = 25.0):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({
            "Accept": "application/json", "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
            "Origin": "https://app.xpayz.us", "Referer": "https://app.xpayz.us/",
        })

    def _load_token_from_cache(self) -> bool:
        try:
            if not os.path.exists(TOKEN_CACHE_PATH): return False
            with open(TOKEN_CACHE_PATH, 'r') as f: cache = json.load(f)
            token = cache.get('token'); expires_at = cache.get('expires_at')
            if token and expires_at and time.time() < expires_at - 60:
                self.session.headers["Authorization"] = f"Bearer {token}"
                return True
        except Exception: pass
        return False

    def _save_token_to_cache(self, token: str):
        try:
            payload = json.loads(base64.b64decode(token.split('.')[1] + '=='))
            expires_at = payload.get('exp')
            with open(TOKEN_CACHE_PATH, 'w') as f: json.dump({'token': token, 'expires_at': expires_at}, f)
        except Exception: pass

    def ensure_auth(self, email: str, password: str) -> None:
        if self._load_token_from_cache(): return
        print("[XPAYZ-PYTHON] No valid cached token. Performing full login...")
        url = f"{self.base_url}{LOGIN_PATH}"
        payload = {"email": email, "password": password}
        resp = self._request_with_retries("POST", url, json=payload)
        token = resp.json().get("token")
        if not token: raise XPayzError("Login failed")
        self.session.headers["Authorization"] = f"Bearer {token}"
        self._save_token_to_cache(token)
        print("[XPAYZ-PYTHON] Login successful and token cached.")

    # === THIS IS THE UPGRADED FUNCTION ===
    def iter_transactions(self, subaccount_id: int, per_page: int = 200, historical: bool = False) -> t.Iterator[Transaction]:
        url = f"{self.base_url}{TRANSACTIONS_BASE_PATH}{subaccount_id}/transactions"
        page = 1
        
        while True:
            # For a normal sync, we only fetch page 1. For historical, we fetch all.
            if not historical and page > 1:
                break
            
            if historical:
                print(f"[XPAYZ-PYTHON] Fetching historical page {page} for subaccount {subaccount_id}...")

            resp = self._request_with_retries("GET", url, params={"page": page, "per_page": per_page})
            blob = resp.json()
            items = blob.get("data", []) or []
            
            if not items:
                if historical: print(f"[XPAYZ-PYTHON] Last page reached. Historical sync complete for {subaccount_id}.")
                break # Exit the loop if the API returns no more transactions

            for item in items:
                yield self._to_transaction(item)
            
            # If not historical, we stop after the first page
            if not historical:
                break
                
            page += 1
            time.sleep(0.5) # Be respectful to the API between pages

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
        return Transaction(id=d.get("id"), created_at=d.get("created_at"), amount=d.get("amount"), operation_direct=d.get("operation_direct"), sender_name=d.get("sender_name"), destination_name=d.get("destination_name"), external_id=d.get("external_id"), raw=d)

def get_db_connection():
    return mysql.connector.connect(host=DB_HOST, user=DB_USER, password=DB_PASSWORD, database=DB_DATABASE)

def normalize_name(name: str) -> str:
    if not name: return ""
    name = re.sub(r'[\d.,-]', '', name)
    name = re.sub(r'\b(ltda|me|sa|eireli|epp)\b', '', name, flags=re.IGNORECASE)
    return re.sub(r'\s+', ' ', name).strip().lower()

def save_transactions_to_db(subaccount_id: int, transactions: list[Transaction]):
    db = get_db_connection()
    cursor = db.cursor()
    # Updated query to refresh raw_details on duplicate
    query = """INSERT INTO xpayz_transactions (xpayz_transaction_id, subaccount_id, amount, operation_direct, sender_name, sender_name_normalized, counterparty_name, transaction_date, raw_details, external_id) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ON DUPLICATE KEY UPDATE operation_direct=VALUES(operation_direct), counterparty_name=VALUES(counterparty_name), external_id=VALUES(external_id), raw_details=VALUES(raw_details);"""
    
    values_to_insert = []
    for tx in transactions:
        if not tx.sender_name: tx.sender_name = "Unknown"
        if tx.operation_direct == 'in' and PRINCIPAL_NAME and PRINCIPAL_NAME in tx.sender_name.lower(): continue
        try:
            amount = float(tx.amount); tx_date = isoparse(tx.created_at); normalized = normalize_name(tx.sender_name)
            counterparty = "USD BETA OUT / E" if tx.operation_direct == 'out' else (tx.destination_name or "")
            values_to_insert.append((tx.id, subaccount_id, amount, tx.operation_direct, tx.sender_name, normalized, counterparty, tx_date, json.dumps(tx.raw), tx.external_id))
        except Exception as e: print(f"⚠️ Could not process TX ID {tx.id}: {e}", file=sys.stderr)
    
    if values_to_insert:
        cursor.executemany(query, values_to_insert)
        db.commit()
        print(f"✅ DB Sync: Upserted {cursor.rowcount} txs for subaccount {subaccount_id}.")
    
    cursor.close()
    db.close()

def main():
    parser = argparse.ArgumentParser(description="XPayz: fetch and store subaccount transactions.")
    parser.add_argument("subaccount_id", help="The numeric ID of the subaccount to fetch.")
    # Add the flag to trigger the historical sync
    parser.add_argument("--historical", action="store_true", help="Fetch all pages of transactions.")
    args = parser.parse_args()
    
    email = os.getenv("XPAYZ_EMAIL")
    password = os.getenv("XPAYZ_PASSWORD")

    try:
        client = XPayzClient()
        client.ensure_auth(email, password)
        # Pass the historical flag to the function
        transactions = list(client.iter_transactions(subaccount_id=args.subaccount_id, per_page=200, historical=args.historical))
        if transactions:
            save_transactions_to_db(args.subaccount_id, transactions)
    except Exception as e:
        print(f"❌ An unexpected script error occurred for subaccount {args.subaccount_id}: {e}", file=sys.stderr)
        return 1
    return 0

if __name__ == "__main__":
    raise SystemExit(main())