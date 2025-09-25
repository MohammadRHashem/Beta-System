import json
import os # Import os to get environment variables
from prompts import prompt_2
import google.generativeai as genai
from pdf2image import convert_from_path

# --- FIX 1: LOAD API KEY FROM ENVIRONMENT ---
# The key is now loaded securely and is not hardcoded.
api_key = os.getenv('GOOGLE_API_KEY')
genai.configure(api_key=api_key)

vision_model = genai.GenerativeModel(model_name="gemini-2.5-flash-lite")

def clean_text_and_load_json(response_text):
    # This function now expects raw text and returns a Python dictionary
    try:
        # Find the start and end of the JSON block
        start = response_text.find('{')
        end = response_text.rfind('}') + 1
        if start == -1 or end == 0:
            return None # No JSON found

        json_str = response_text[start:end]
        response_dict = json.loads(json_str)
        
        # Perform any cleaning if necessary
        response_dict["invoice_id"] = response_dict.get("invoice_id", "").replace("O", "0")
        return response_dict
    except (json.JSONDecodeError, TypeError):
        return None # Return None if JSON is invalid

def gemini_img_ocr(image_data, file_extension):
    try:
        mime_type = "image/jpeg" if file_extension in [".jpg", ".jpeg"] else "image/png"
        contents = [
            {"mime_type": mime_type, "data": image_data},
            {"text": prompt_2},
        ]
        response = vision_model.generate_content(contents)
        return response.text
    except Exception:
        return None # Return None on any API error

def gemini_pdf_ocr(pdf_data):
    try:
        mime_type = "application/pdf"
        contents = [
            {"mime_type": mime_type, "data": pdf_data},
            {"text": prompt_2},
        ]
        response = vision_model.generate_content(contents)
        return response.text
    except Exception:
        return None