from telethon.sync import TelegramClient
from telethon.sessions import StringSession
import os
from pathlib import Path
from dotenv import load_dotenv

# Load credentials from the .env file in the parent directory
script_dir = Path(__file__).resolve().parent
project_root = script_dir.parent 
dotenv_path = project_root / '.env'
load_dotenv(dotenv_path=dotenv_path)

API_ID = os.getenv('TELEGRAM_API_ID')
API_HASH = os.getenv('TELEGRAM_API_HASH')

print("--- Session String Generator ---")
print("This will log you in and print a session string. Copy this string and add it to your .env file as TELEGRAM_SESSION_STRING.")

# We start with an in-memory session
with TelegramClient(StringSession(), int(API_ID), API_HASH) as client:
    session_string = client.session.save()
    print("\nCOPY THE LINE BELOW AND ADD IT TO YOUR .env FILE:\n")
    print(f"TELEGRAM_SESSION_STRING='{session_string}'\n")
    print("Login complete. You can close this script now.")