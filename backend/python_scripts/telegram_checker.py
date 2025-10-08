import sys
import os
import json
import re
from pathlib import Path
from dotenv import load_dotenv
from telethon.sync import TelegramClient
from telethon.sessions import StringSession
import asyncio

# --- Load Environment Variables ---
script_dir = Path(__file__).resolve().parent
project_root = script_dir.parent 
dotenv_path = project_root / '.env'
load_dotenv(dotenv_path=dotenv_path)

# --- Telegram Configuration ---
API_ID = os.getenv('TELEGRAM_API_ID')
API_HASH = os.getenv('TELEGRAM_API_HASH')
# IMPORTANT: This is now loaded from .env to avoid storing it in a file
SESSION_STRING = os.getenv('TELEGRAM_SESSION_STRING')
TARGET_GROUP_ID = os.getenv('TELEGRAM_TARGET_GROUP_ID')

# --- Helper Functions (Unchanged) ---
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

def find_match(messages, target_amount, target_sender):
    target_sender_lower = target_sender.lower().strip()
    amount_regex = re.compile(r"Amount:\s*R\$\s*([\d.,]+)")
    sender_block_regex = re.compile(r"Sender Information:\s*-+\s*(.+?)(?=\n\n|\Z)", re.DOTALL)
    sender_name_regex = re.compile(r"Name:\s*([^\n]+)")

    for message in messages:
        if not message or not message.text:
            continue
        text = message.text
        amount_match = amount_regex.search(text)
        sender_block_match = sender_block_regex.search(text)
        if not (amount_match and sender_block_match):
            continue
        sender_block_text = sender_block_match.group(1)
        sender_name_match = sender_name_regex.search(sender_block_text)
        if sender_name_match:
            try:
                msg_amount_str = amount_match.group(1)
                msg_sender_name = sender_name_match.group(1).strip()
                msg_amount_float = parse_brl_amount(msg_amount_str)
                msg_sender_lower = msg_sender_name.lower()
                if msg_amount_float == target_amount and target_sender_lower in msg_sender_lower:
                    return True
            except Exception:
                continue
    return False

# --- Main Execution ---
async def main():
    if not all([API_ID, API_HASH, TARGET_GROUP_ID, SESSION_STRING]):
        print(json.dumps({"status": "error", "message": "Telegram API credentials or SESSION_STRING are not configured."}))
        return

    try:
        target_amount_str = sys.argv[1]
        target_sender_name = sys.argv[2]
    except IndexError:
        print(json.dumps({"status": "error", "message": "Missing amount or sender name arguments."}))
        return
        
    target_amount_float = parse_brl_amount(target_amount_str)
    
    # === THE DEFINITIVE CACHING FIX ===
    # Use an in-memory StringSession to force a fresh connection every time.
    client = TelegramClient(StringSession(SESSION_STRING), int(API_ID), API_HASH)
    # === END FIX ===

    try:
        await client.connect()
        # No need to check for authorization, the string session handles it.
        target_group = await client.get_input_entity(int(TARGET_GROUP_ID))
        
        # This will now always be a fresh call to the server.
        messages = await client.get_messages(target_group, limit=50) # Limit can be smaller now

        if find_match(messages, target_amount_float, target_sender_name):
            print(json.dumps({"status": "found"}))
        else:
            print(json.dumps({"status": "not_found"}))

    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}), file=sys.stderr)
    finally:
        if client.is_connected():
            await client.disconnect()

if __name__ == "__main__":
    asyncio.run(main())