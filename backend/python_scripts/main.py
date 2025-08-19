import sys
import os
import json
from dotenv import load_dotenv
from utils import *

# This MUST be loaded before utils is imported if running locally
load_dotenv() 

# --- FIX 2: FAIL LOUDLY IF API KEY IS MISSING ---
api_key = os.getenv('GOOGLE_API_KEY')
if not api_key:
    # Print a clear error to stderr and exit.
    print(json.dumps({"error": "GOOGLE_API_KEY not found in environment variables."}), file=sys.stdout)
    sys.exit(0)

# The default empty response if Gemini fails
EMPTY_RESPONSE = {
    "invoice_id": None, "payment_method": "", "invoice_date": "", "invoice_time": "",
    "amount": "", "currency": "", "sender": {"name": ""}, "recipient": {"name": ""},
    "additional_data": "OCR_FAILED", "image_type": "unknown"
}

def process_file(file_path):
    _, file_extension = os.path.splitext(file_path)
    file_extension = file_extension.lower()
    
    raw_response_text = None
    if file_extension in [".jpg", ".jpeg", ".png"]:
        with open(file_path, "rb") as image_file:
            image_data = image_file.read()
        raw_response_text = gemini_img_ocr(image_data, file_extension)
    elif file_extension == ".pdf":
        with open(file_path, "rb") as pdf_file:
            pdf_data = pdf_file.read()
        raw_response_text = gemini_pdf_ocr(pdf_data)

    # --- FIX 3: ROBUST JSON HANDLING ---
    if raw_response_text:
        # Try to clean and parse the response from Gemini
        json_output = clean_text_and_load_json(raw_response_text)
        if json_output:
            # If successful, return the dictionary
            return json_output
    
    # If anything fails (Gemini returns None, JSON is invalid), return the default empty response
    return EMPTY_RESPONSE

if __name__ == "__main__":
    if len(sys.argv) > 1:
        file_path_arg = sys.argv[1]
        response_dict = process_file(file_path_arg)
        # --- FIX 4: ALWAYS PRINT A SINGLE, VALID JSON STRING ---
        print(json.dumps(response_dict, indent=2))
    else:
        print(json.dumps({"error": "No file path provided"}))