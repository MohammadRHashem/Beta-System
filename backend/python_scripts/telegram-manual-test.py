import os
import logging
import subprocess
import tempfile
from dotenv import load_dotenv
from telegram import Update
# CORRECTED IMPORTS for the new library version (v20+)
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

# --- Configuration ---
# Load environment variables from the .env file in the current directory
load_dotenv()

# Set up basic logging to see bot activity in the console
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# Get required tokens from environment variables
TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY')

# --- Bot Command Handlers (must be 'async' in the new version) ---

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Sends a welcome message when the /start command is issued."""
    user = update.effective_user
    welcome_message = (
        f"Hi {user.first_name}!\n\n"
        "I am your Invoice Testing Bot.\n\n"
        "Simply send me an image (JPG, PNG) or a document (PDF) "
        "of an invoice, and I will process it using the Gemini Vision "
        "script and return the extracted JSON data."
    )
    # API calls are now asynchronous and must be 'awaited'
    await update.message.reply_text(welcome_message)

async def handle_file(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handles incoming photos and documents, processes them, and replies with the result."""
    message = update.message
    file_to_process = None
    original_filename = "unknown_file"

    if message.photo:
        # Get the largest available photo. get_file() is now async.
        file_to_process = await message.photo[-1].get_file()
        original_filename = f"{file_to_process.file_id}.jpg"
    elif message.document:
        # Handle documents. get_file() is now async.
        file_to_process = await message.document.get_file()
        original_filename = message.document.file_name
    
    if not file_to_process:
        await message.reply_text("I can only process photos (JPG, PNG) or documents (PDF).")
        return

    await message.reply_text(f"Processing '{original_filename}'... Please wait a moment.")
    
    # Use a temporary file to safely handle the download
    with tempfile.NamedTemporaryFile(delete=True) as temp_file:
        try:
            # Download the file content. download_to_drive is the new method.
            await file_to_process.download_to_drive(custom_path=temp_file.name)
            temp_file_path = temp_file.name
            
            logger.info(f"File downloaded to temporary path: {temp_file_path}")

            # Prepare environment for the subprocess to ensure it has the API key
            script_env = os.environ.copy()
            script_env['GOOGLE_API_KEY'] = GOOGLE_API_KEY

            # Call the main.py script as a subprocess
            script_path = os.path.join(os.path.dirname(__file__), 'main.py')
            
            result = subprocess.run(
                ['python3', script_path, temp_file_path],
                capture_output=True,
                text=True,
                check=True, # Raise an error if main.py fails
                env=script_env
            )

            logger.info("main.py script executed successfully.")

            # Format the JSON output for better readability in Telegram
            json_output = result.stdout
            # Telegram's MarkdownV2 requires escaping certain characters.
            # For simplicity, we'll just send it as a plain code block.
            formatted_reply = f"✅ Success! Here is the extracted JSON:\n\n```json\n{json_output}\n```"
            await message.reply_text(formatted_reply, parse_mode='MarkdownV2')

        except subprocess.CalledProcessError as e:
            logger.error(f"Error executing main.py: {e.stderr}")
            error_reply = f"❌ Error processing the file.\n\nScript error:\n`{e.stderr}`"
            await message.reply_text(error_reply)
        except Exception as e:
            logger.error(f"An unexpected error occurred: {e}")
            await message.reply_text(f"An unexpected error occurred: {e}")

def main() -> None:
    """Starts the bot using the new Application class."""
    # Pre-flight checks
    if not TELEGRAM_BOT_TOKEN:
        logger.critical("TELEGRAM_BOT_TOKEN not found in .env file. Bot cannot start.")
        return
    if not GOOGLE_API_KEY:
        logger.critical("GOOGLE_API_KEY not found in .env file. Bot will not be able to process invoices.")
        return

    # Create the Application and pass it your bot's token. This replaces Updater.
    application = Application.builder().token(TELEGRAM_BOT_TOKEN).build()

    # Register command handlers directly on the application
    application.add_handler(CommandHandler("start", start))

    # Register a message handler for photos and documents using the corrected 'filters'
    application.add_handler(MessageHandler(filters.PHOTO | filters.DOCUMENT, handle_file))

    # Start the Bot. This replaces updater.start_polling() and updater.idle()
    logger.info("Bot is starting...")
    application.run_polling()

if __name__ == '__main__':
    main()
