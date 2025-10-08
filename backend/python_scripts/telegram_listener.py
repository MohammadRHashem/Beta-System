import os
import re
import json
import asyncio
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
from telethon import TelegramClient, events
from telethon.sessions import StringSession
import mysql.connector

# --- Load Environment Variables ---
script_dir = Path(__file__).resolve().parent
project_root = script_dir.parent 
dotenv_path = project_root / '.env'
load_dotenv(dotenv_path=dotenv_path)

# --- Configuration ---
API_ID = os.getenv('TELEGRAM_API_ID')
API_HASH = os.getenv('TELEGRAM_API_HASH')
SESSION_STRING = os.getenv('TELEGRAM_SESSION_STRING')
TARGET_GROUP_ID = int(os.getenv('TELEGRAM_TARGET_GROUP_ID'))

DB_HOST = os.getenv('DB_HOST')
DB_USER = os.getenv('DB_USER')
DB_PASSWORD = os.getenv('DB_PASSWORD')
DB_DATABASE = os.getenv('DB_DATABASE')

# --- Helper Functions ---
def parse_brl_amount(amount_str):
    try:
        cleaned_str = re.sub(r'[^\d,.]', '', amount_str).strip()
        if ',' in cleaned_str and '.' in cleaned_str and cleaned_str.rfind('.') < cleaned_str.rfind(','):
            cleaned_str = cleaned_str.replace(".", "").replace(",", ".")
        else:
            cleaned_str = cleaned_str.replace(",", ".")
        return float(cleaned_str)
    except (ValueError, TypeError):
        return 0.0

def get_db_connection():
    return mysql.connector.connect(host=DB_HOST, user=DB_USER, password=DB_PASSWORD, database=DB_DATABASE)

def robust_name_match(ocr_name, telegram_name):
    """
    Performs a more robust, word-based comparison of two names.
    Returns True if all words from the OCR name are present in the Telegram name.
    """
    ocr_words = set(ocr_name.lower().split())
    telegram_words = set(telegram_name.lower().split())
    
    # The OCR name must not be empty, and all of its words must be in the Telegram name's words
    return ocr_words and ocr_words.issubset(telegram_words)

def parse_and_store_message(message_text, message_id, channel_id):
    # ... This function remains unchanged ...
    # ... I'm including it here for completeness ...
    amount_regex = re.compile(r"Amount:\s*R\$\s*([\d.,]+)")
    sender_block_regex = re.compile(r"Sender Information:\s*-+\s*(.+?)(?=\n\n|\Z)", re.DOTALL)
    sender_name_regex = re.compile(r"Name:\s*([^\n]+)")
    date_regex = re.compile(r"Date:\s*(\d{2}/\d{2}/\d{4}\s\d{2}:\d{2}:\d{2})")

    amount_match = amount_regex.search(message_text)
    sender_block_match = sender_block_regex.search(message_text)
    date_match = date_regex.search(message_text)

    if not (amount_match and sender_block_match and date_match): return False
    sender_block_text = sender_block_match.group(1)
    sender_name_match = sender_name_regex.search(sender_block_text)
    if not sender_name_match: return False

    try:
        amount = parse_brl_amount(amount_match.group(1))
        sender_name = sender_name_match.group(1).strip()
        tx_date = datetime.strptime(date_match.group(1), '%d/%m/%Y %H:%M:%S')
        db = get_db_connection()
        cursor = db.cursor()
        sql = "INSERT INTO telegram_transactions (telegram_message_id, channel_id, amount, sender_name, transaction_date, raw_text) VALUES (%s, %s, %s, %s, %s, %s) ON DUPLICATE KEY UPDATE telegram_message_id=telegram_message_id;"
        values = (message_id, channel_id, amount, sender_name, tx_date, message_text)
        cursor.execute(sql, values)
        db.commit()
        cursor.close()
        db.close()
        print(f"[DB INSERT] Stored TX from Msg ID {message_id}: Amount={amount}, Sender='{sender_name}'")
        return True
    except Exception as e:
        print(f"[ERROR] Failed to parse/store message ID {message_id}: {e}")
        return False

# --- Main Listener Logic ---
print("--- Telegram Listener Service starting... ---")
if not all([API_ID, API_HASH, SESSION_STRING, TARGET_GROUP_ID, DB_HOST]):
    print("FATAL ERROR: Missing credentials in .env file. Exiting.")
    exit()

client = TelegramClient(StringSession(SESSION_STRING), int(API_ID), API_HASH)

@client.on(events.NewMessage(chats=TARGET_GROUP_ID))
async def new_message_handler(event):
    print(f"\n[REAL-TIME] New message detected (ID: {event.message.id}).")
    parse_and_store_message(event.raw_text, event.message.id, event.chat_id)

async def sync_history():
    # ... This function remains unchanged ...
    print("\n--- Starting historical message sync... ---")
    db = get_db_connection()
    cursor = db.cursor()
    cursor.execute("SELECT telegram_message_id FROM telegram_transactions WHERE channel_id = %s", (TARGET_GROUP_ID,))
    existing_ids = {row[0] for row in cursor.fetchall()}
    cursor.close()
    db.close()
    print(f"[SYNC] Found {len(existing_ids)} existing messages in DB.")
    count = 0
    async for message in client.iter_messages(TARGET_GROUP_ID, limit=10000):
        if not message or not message.raw_text: continue
        if message.id not in existing_ids:
            if parse_and_store_message(message.raw_text, message.id, message.chat_id):
                count += 1
    print(f"[SYNC] Historical sync complete. Added {count} new transactions.")

# === NEW: Self-Healing Heartbeat Task ===
async def heartbeat():
    """Periodically performs a lightweight action to ensure the connection is alive and synced."""
    while True:
        await asyncio.sleep(300) # Sleep for 5 minutes
        try:
            # Getting user info is a very lightweight way to check the connection
            me = await client.get_me()
            print(f"[HEARTBEAT] Connection check OK. Logged in as {me.username}. Listener is active.")
        except Exception as e:
            print(f"[HEARTBEAT-ERROR] Connection check failed: {e}. The client will attempt to reconnect automatically.")
            # Telethon's `run_until_disconnected` will handle the reconnection attempt.

async def main():
    """Main function to connect, sync, and run the client with a heartbeat."""
    await client.start()
    print("--- Client connected. ---")
    
    # Create the heartbeat task so it runs in the background
    asyncio.create_task(heartbeat())
    
    await sync_history()
    
    print("\n--- Listener is now running and waiting for new messages... ---")
    await client.run_until_disconnected()

if __name__ == '__main__':
    asyncio.run(main())