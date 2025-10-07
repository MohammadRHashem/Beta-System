import sys
import os
import json
import re
from pathlib import Path
from dotenv import load_dotenv
from telethon.sync import TelegramClient

# --- Load Environment Variables ---
script_dir = Path(__file__).resolve().parent
dotenv_path = script_dir / '.env'
load_dotenv(dotenv_path=dotenv_path)

# --- Telegram Configuration ---
API_ID = os.getenv('TELEGRAM_API_ID')
API_HASH = os.getenv('TELEGRAM_API_HASH')
SESSION_NAME = os.getenv('TELEGRAM_SESSION_NAME', 'telegram_session')
TARGET_GROUP_ID = os.getenv('TELEGRAM_TARGET_GROUP_ID')

# --- Helper Functions ---
def parse_brl_amount(amount_str):
    """Converts a BRL string like 'R$ 6,500.00' to a float."""
    try:
        # Remove "R$", trim whitespace, replace thousands separator, and use dot for decimal
        cleaned_str = amount_str.replace("R$", "").strip().replace(".", "").replace(",", ".")
        return float(cleaned_str)
    except (ValueError, TypeError):
        return 0.0

def find_match(messages, target_amount, target_sender):
    """Searches through Telegram messages for a matching transaction."""
    target_sender_lower = target_sender.lower().strip()
    
    amount_regex = re.compile(r"Amount: R\$ ([\d.,]+)")
    sender_regex = re.compile(r"Name: (.+)")

    for message in messages:
        if not message or not message.text:
            continue

        text = message.text
        
        amount_match = amount_regex.search(text)
        sender_match = sender_regex.search(text)

        if amount_match and sender_match:
            try:
                msg_amount_str = amount_match.group(1)
                msg_sender_name = sender_match.group(1).strip()

                msg_amount_float = parse_brl_amount(msg_amount_str)
                msg_sender_lower = msg_sender_name.lower()
                
                # Check for a match
                if msg_amount_float == target_amount and msg_sender_lower == target_sender_lower:
                    return True
            except Exception:
                continue # Ignore malformed messages
    return False

# --- Main Execution ---
async def main():
    if not all([API_ID, API_HASH, TARGET_GROUP_ID]):
        print(json.dumps({"status": "error", "message": "Telegram API credentials are not configured in .env"}))
        return

    try:
        target_amount_str = sys.argv[1]
        target_sender_name = sys.argv[2]
    except IndexError:
        print(json.dumps({"status": "error", "message": "Missing amount or sender name arguments."}))
        return
        
    target_amount_float = parse_brl_amount(target_amount_str)
    
    client = TelegramClient(str(script_dir / SESSION_NAME), int(API_ID), API_HASH)

    try:
        await client.connect()
        # If not authorized, it will prompt for phone/code/password in the console on first run
        if not await client.is_user_authorized():
             print(json.dumps({"status": "error", "message": f"Telegram session '{SESSION_NAME}' is not authorized. Please run the backend manually once to log in."}), file=sys.stderr)
             return

        target_group = await client.get_entity(int(TARGET_GROUP_ID))
        
        # Fetch a reasonable number of recent messages to check against
        messages = await client.get_messages(target_group, limit=200)

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
    import asyncio
    asyncio.run(main())