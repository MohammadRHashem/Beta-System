import os
from pathlib import Path
from dotenv import load_dotenv
from telethon.sync import TelegramClient

# --- Load Environment Variables (using the robust method) ---
script_dir = Path(__file__).resolve().parent
project_root = script_dir.parent 
dotenv_path = project_root / '.env'
load_dotenv(dotenv_path=dotenv_path)

# --- Telegram Configuration ---
API_ID = os.getenv('TELEGRAM_API_ID')
API_HASH = os.getenv('TELEGRAM_API_HASH')
# Ensure this session name EXACTLY matches the one in your .env and telegram_checker.py
SESSION_NAME = os.getenv('TELEGRAM_SESSION_NAME', 'telegram_session') 

# --- Main Execution ---
def main():
    print("--- Starting Telegram Session Generator ---")

    if not all([API_ID, API_HASH]):
        print("\nERROR: TELEGRAM_API_ID or TELEGRAM_API_HASH not found in .env file.")
        print(f"Looked for .env at: {dotenv_path}")
        return

    # Use a 'with' block to ensure the client connects and disconnects properly
    with TelegramClient(str(script_dir / SESSION_NAME), int(API_ID), API_HASH) as client:
        print(f"\nSuccessfully initialized client. Session will be saved as '{SESSION_NAME}.session'")
        
        # This simple call will trigger the login prompts if not already authorized
        me = client.get_me()
        
        if me:
            print(f"\nSUCCESS! Logged in as: {me.first_name} {me.last_name or ''} (@{me.username})")
            print(f"Session file '{SESSION_NAME}.session' has been created/updated.")
            print("You can now restart your main backend application.")
        else:
            print("\nERROR: Could not log in. Please check your credentials and try again.")

if __name__ == "__main__":
    main()