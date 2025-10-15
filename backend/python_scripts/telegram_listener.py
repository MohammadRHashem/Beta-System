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

# --- NAME-BASED CONFIGURATION ---
TARGET_GROUP_NAMES_STR = os.getenv('TELEGRAM_TARGET_GROUP_NAMES')
TARGET_GROUP_NAMES = [name.strip() for name in TARGET_GROUP_NAMES_STR.split(',')] if TARGET_GROUP_NAMES_STR else []

DB_HOST = os.getenv('DB_HOST')
DB_USER = os.getenv('DB_USER')
DB_PASSWORD = os.getenv('DB_PASSWORD')
DB_DATABASE = os.getenv('DB_DATABASE')

# This global list will hold the resolved numeric IDs of the target groups
resolved_group_ids = []

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
    return mysql.connector.connect(
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_DATABASE
    )

def parse_and_store_message(message_text, message_id, channel_id):
    """Parses a message and stores the transaction in the database."""
    amount_regex = re.compile(r"Amount:\s*R\$\s*([\d.,]+)")
    sender_block_regex = re.compile(r"Sender Information:\s*-+\s*(.+?)(?=\n\n|\Z)", re.DOTALL)
    sender_name_regex = re.compile(r"Name:\s*([^\n]+)")
    date_regex = re.compile(r"Date:\s*(\d{2}/\d{2}/\d{4}\s\d{2}:\d{2}:\d{2})")

    amount_match = amount_regex.search(message_text)
    sender_block_match = sender_block_regex.search(message_text)
    date_match = date_regex.search(message_text)

    if not (amount_match and sender_block_match and date_match):
        return False

    sender_block_text = sender_block_match.group(1)
    sender_name_match = sender_name_regex.search(sender_block_text)

    if not sender_name_match:
        return False

    try:
        amount = parse_brl_amount(amount_match.group(1))
        sender_name = sender_name_match.group(1).strip()
        tx_date = datetime.strptime(date_match.group(1), '%d/%m/%Y %H:%M:%S')

        db = get_db_connection()
        cursor = db.cursor()
        
        sql = """
            INSERT INTO telegram_transactions 
            (telegram_message_id, channel_id, amount, sender_name, transaction_date, raw_text)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE telegram_message_id=telegram_message_id;
        """
        values = (message_id, channel_id, amount, sender_name, tx_date, message_text)
        
        cursor.execute(sql, values)
        db.commit()
        
        cursor.close()
        db.close()
        
        print(f"[DB INSERT] Stored TX from Msg ID {message_id}: Amount={amount}, Sender='{sender_name}'")
        return True
    except Exception as e:
        print(f"[ERROR] Failed to parse or store message ID {message_id}: {e}")
        return False

# --- Main Listener Logic ---
print("--- Telegram Listener Service (Name-Based) starting... ---")
if not all([API_ID, API_HASH, SESSION_STRING, TARGET_GROUP_NAMES, DB_HOST]):
    print("FATAL ERROR: Missing credentials or TELEGRAM_TARGET_GROUP_NAMES in .env file. Exiting.")
    exit()

client = TelegramClient(StringSession(SESSION_STRING), int(API_ID), API_HASH)

async def new_message_handler(event):
    """Handles real-time new messages from any of the resolved groups."""
    print(f"\n[REAL-TIME] New message detected (ID: {event.message.id}) in Group ID {event.chat_id}.")
    parse_and_store_message(event.raw_text, event.message.id, event.chat_id)

async def sync_history():
    """Scans historical messages for ALL resolved groups and back-fills the database."""
    print("\n--- Starting historical message sync for all resolved groups... ---")
    db = get_db_connection()
    cursor = db.cursor(dictionary=True)
    cursor.execute("SELECT channel_id, telegram_message_id FROM telegram_transactions")
    existing_entries = {(row['channel_id'], row['telegram_message_id']) for row in cursor.fetchall()}
    cursor.close()
    db.close()
    
    print(f"[SYNC] Found {len(existing_entries)} existing messages in DB.")
    
    total_added = 0
    for group_id in resolved_group_ids:
        try:
            entity = await client.get_entity(group_id)
            print(f"\n[SYNC] Checking history for Group '{entity.title}' (ID: {group_id})...")
            count_per_group = 0
            async for message in client.iter_messages(entity, limit=10000):
                if not message or not message.raw_text:
                    continue
                if (message.chat_id, message.id) not in existing_entries:
                    if parse_and_store_message(message.raw_text, message.id, message.chat_id):
                        count_per_group += 1
            
            print(f"[SYNC] Finished Group '{entity.title}'. Added {count_per_group} new transactions.")
            total_added += count_per_group
        except Exception as e:
            print(f"[SYNC-ERROR] Could not sync history for Group ID {group_id}: {e}")
    
    print(f"\n[SYNC] Historical sync complete. Total new transactions added: {total_added}.")

async def heartbeat():
    """Periodically performs a lightweight action to ensure the connection is alive and synced."""
    while True:
        await asyncio.sleep(300) # Sleep for 5 minutes
        try:
            me = await client.get_me()
            if me:
                print(f"[HEARTBEAT] Connection check OK. Listener is active as {me.username}.")
            else:
                # Should not happen if client is connected, but a good safeguard
                print(f"[HEARTBEAT-WARN] Connection check returned no user. Attempting to stay connected.")
        except Exception as e:
            print(f"[HEARTBEAT-ERROR] Connection check failed: {e}. Client will attempt to reconnect automatically.")

async def main():
    """Main function to find groups by name, then connect, sync, and run."""
    global resolved_group_ids
    await client.start()
    print("--- Client connected. ---")

    print(f"Attempting to resolve group names: {TARGET_GROUP_NAMES}")
    all_dialogs = await client.get_dialogs()
    for name in TARGET_GROUP_NAMES:
        found = False
        for dialog in all_dialogs:
            if dialog.name == name:
                resolved_group_ids.append(dialog.id)
                print(f"[RESOLVED] Found '{dialog.name}' -> ID: {dialog.id}")
                found = True
                break
        if not found:
            print(f"[RESOLVER-ERROR] Could not find any group/channel named '{name}' in your chat list.")
    
    if not resolved_group_ids:
        print("FATAL ERROR: Could not resolve any target group names. Exiting.")
        return

    # Attach the real-time event handler ONLY to the groups we successfully found
    client.add_event_handler(new_message_handler, events.NewMessage(chats=resolved_group_ids))
    
    # Start the self-healing heartbeat task to run in the background
    asyncio.create_task(heartbeat())
    
    await sync_history()
    
    print(f"\n--- Listener is now running on {len(resolved_group_ids)} group(s) and waiting for new messages... ---")
    await client.run_until_disconnected()

if __name__ == '__main__':
    asyncio.run(main())