import sys
import os
import json
from dotenv import load_dotenv
from pathlib import Path # Import the modern Path library for robust path handling

# === THE DEFINITIVE FIX: Use pathlib to guarantee the .env path is correct ===
# 1. Get the directory of the current script.
script_dir = Path(__file__).resolve().parent
# 2. Construct the full path to the .env file next to it.
dotenv_path = script_dir / '.env'
# 3. Load the .env file from that explicit path.
load_dotenv(dotenv_path=dotenv_path)

# This must be imported AFTER load_dotenv has run.
from utils import * 

# --- Fail loudly if API key is still missing ---
api_key = os.getenv('GOOGLE_API_KEY')
if not api_key:
    print(json.dumps({"error": "FATAL: GOOGLE_API_KEY not found. Ensure it is in the .env file in the python_scripts directory."}), file=sys.stdout)
    sys.exit(0)

EMPTY_RESPONSE = {
    "transaction_id": None, "payment_method": "", "invoice_date": "", "invoice_time": "",
    "amount": "", "currency": "", "sender": {"name": ""}, "recipient": {"name": "", "pix_key": ""},
    "additional_data": "OCR_FAILED", "image_type": "unknown"
}

def process_file(file_path):
    if not os.path.exists(file_path):
        return {"error": f"File not found at path: {file_path}"}

    _, file_extension = os.path.splitext(file_path)
    file_extension = file_extension.lower()
    
    raw_response_text = None
    try:
        if file_extension in [".jpg", ".jpeg", ".png", ".webp"]:
            with open(file_path, "rb") as image_file:
                image_data = image_file.read()
            raw_response_text = gemini_img_ocr(image_data, file_extension)
        elif file_extension == ".pdf":
            with open(file_path, "rb") as pdf_file:
                pdf_data = pdf_file.read()
            raw_response_text = gemini_pdf_ocr(pdf_data)
    except Exception as e:
        return {"error": f"Error reading file: {str(e)}"}

    if raw_response_text:
        json_output = clean_text_and_load_json(raw_response_text)
        if json_output:
            return json_output
    
    return EMPTY_RESPONSE

if __name__ == "__main__":
    if len(sys.argv) > 1:
        file_path_arg = sys.argv[1]
        response_dict = process_file(file_path_arg)
        print(json.dumps(response_dict, indent=2))
    else:
        print(json.dumps({"error": "No file path provided"}))