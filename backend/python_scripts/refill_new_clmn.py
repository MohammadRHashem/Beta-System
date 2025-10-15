import os
import re
from pathlib import Path
from dotenv import load_dotenv
import mysql.connector

# --- Load Environment Variables ---
# Ensures we connect to the correct database
script_dir = Path(__file__).resolve().parent
project_root = script_dir.parent 
dotenv_path = project_root / '.env'
load_dotenv(dotenv_path=dotenv_path)

# --- DB Configuration ---
DB_HOST = os.getenv('DB_HOST')
DB_USER = os.getenv('DB_USER')
DB_PASSWORD = os.getenv('DB_PASSWORD')
DB_DATABASE = os.getenv('DB_DATABASE')

def get_db_connection():
    """Establishes a connection to the database."""
    return mysql.connector.connect(
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_DATABASE
    )

def normalize_name(raw_name):
    """
    The exact same normalization logic from the listener.
    Removes numbers, common business suffixes, and extra whitespace.
    """
    if not raw_name:
        return None
    # Remove all numbers, punctuation (except spaces), and common suffixes
    normalized = re.sub(r'[\d.,-]', '', raw_name)
    normalized = re.sub(r'\b(ltda|me|sa|eireli|epp)\b', '', normalized, flags=re.IGNORECASE)
    # Collapse multiple spaces into one and trim
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    return normalized.lower()

def main():
    """Main execution function to backfill the data."""
    print("--- Starting backfill process for 'sender_name_normalized' ---")
    
    db = None
    try:
        db = get_db_connection()
        cursor = db.cursor(dictionary=True)

        # 1. Select all rows that need to be updated
        cursor.execute("SELECT id, sender_name FROM telegram_transactions WHERE sender_name_normalized IS NULL AND sender_name IS NOT NULL")
        rows_to_update = cursor.fetchall()

        if not rows_to_update:
            print("All records are already up to date. No action needed.")
            return

        print(f"Found {len(rows_to_update)} records to update...")

        update_count = 0
        updates = []
        # 2. Prepare the update queries
        for row in rows_to_update:
            raw_name = row['sender_name']
            normalized_name = normalize_name(raw_name)
            if normalized_name:
                updates.append((normalized_name, row['id']))

        # 3. Execute all updates in a single batch for efficiency
        if updates:
            update_sql = "UPDATE telegram_transactions SET sender_name_normalized = %s WHERE id = %s"
            cursor.executemany(update_sql, updates)
            db.commit()
            update_count = cursor.rowcount
            
        print(f"\nSuccessfully updated {update_count} records.")

    except mysql.connector.Error as err:
        print(f"Database error: {err}")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
    finally:
        if db and db.is_connected():
            cursor.close()
            db.close()
            print("Database connection closed.")

if __name__ == '__main__':
    main()