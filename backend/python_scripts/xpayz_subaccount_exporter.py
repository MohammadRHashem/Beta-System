#!/usr/bin/env python3
from __future__ import annotations

import os
import sys
import json
import time
import re
import typing as t
from dataclasses import dataclass
from datetime import datetime
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

DB_HOST = os.getenv('DB_HOST')
DB_USER = os.getenv('DB_USER')
DB_PASSWORD = os.getenv('DB_PASSWORD')
DB_DATABASE = os.getenv('DB_DATABASE')

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
    subtitle: str | None  # <-- ADD THIS LINE
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

    def login(self, email: str, password: str) -> None:
        url = f"{self.base_url}{LOGIN_PATH}"
        payload = {"email": email, "password": password}
        resp = self._request_with_retries("POST", url, json=payload)
        token = resp.json().get("token")
        if not token:
            raise XPayzError(f"Login failed: 'token' missing in response")
        self.session.headers["Authorization"] = f"Bearer {token}"
        # === REVERTED: The .encode().decode() is no longer needed ===
        print("✅ Login successful.")


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
            subtitle=d.get("subtitle"), # <-- ADD THIS LINE
            raw=d,
        )

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
    
    insert_query = """
        INSERT INTO xpayz_transactions (
            xpayz_transaction_id, subaccount_id, amount, operation_direct, sender_name, 
            counterparty_name, counterparty_name_normalized, transaction_date, raw_details
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE 
            operation_direct=VALUES(operation_direct),
            counterparty_name=VALUES(counterparty_name),
            counterparty_name_normalized=VALUES(counterparty_name_normalized);
    """
    
    count = 0
    for tx in transactions:
        # REMOVED the old filter. We now process 'in' and 'out'.
        # if tx.operation_direct != 'in' or not tx.sender_name:
        #     continue

        try:
            # Determine the counterparty based on direction
            counterparty = tx.subtitle

            if not counterparty: # Skip if there's no counterparty
                continue

            amount = float(tx.amount)
            tx_date = isoparse(tx.created_at)
            normalized_counterparty = normalize_name(counterparty)
            
            # Note the new columns in the INSERT query
            values = (
                tx.id,
                subaccount_id,
                amount,
                tx.operation_direct, # New field
                tx.sender_name, # Keep original sender
                counterparty, # New field
                normalized_counterparty, # New field
                tx_date,
                json.dumps(tx.raw)
            )
            cursor.execute(insert_query, values)
            count += cursor.rowcount
        except Exception as e:
            print(f"⚠️ Could not process transaction ID {tx.id}: {e}", file=sys.stderr)
            
    db.commit()
    # === REVERTED: The .encode().decode() is no longer needed ===
    print(f"✅ Database sync complete. Inserted {count} new transaction(s) for subaccount {subaccount_id}.")
    cursor.close()
    db.close()

def main():
    parser = argparse.ArgumentParser(description="XPayz: fetch and store subaccount transactions.")
    parser.add_argument("subaccount_id", help="The numeric ID of the subaccount to fetch.")
    args = parser.parse_args()
    
    email = os.getenv("XPAYZ_EMAIL")
    password = os.getenv("XPAYZ_PASSWORD")

    if not all([email, password, DB_HOST, DB_USER, DB_DATABASE]):
        print("❌ ERROR: Missing required environment variables (XPAYZ_EMAIL, XPAYZ_PASSWORD, DB_...)", file=sys.stderr)
        return 1

    try:
        client = XPayzClient()
        client.login(email, password)
        transactions = list(client.iter_transactions(subaccount_id=args.subaccount_id, per_page=200))
        if transactions:
            save_transactions_to_db(args.subaccount_id, transactions)
        else:
            print(f"No transactions found for subaccount {args.subaccount_id}.")
            
    except XPayzError as e:
        print(f"❌ An API error occurred: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"❌ An unexpected script error occurred: {e}", file=sys.stderr)
        return 1
        
    return 0

if __name__ == "__main__":
    try:
        import dateutil
    except ImportError as e:
        pass
        
    raise SystemExit(main())