import json
import os
from prompts import prompt_2
import google.generativeai as genai
from pdf2image import convert_from_path

# Do NOT configure the API key here at the top level.

def _configure_genai():
    """Helper function to configure the API key just in time."""
    api_key = os.getenv('GOOGLE_API_KEY')
    if api_key:
        genai.configure(api_key=api_key)
    else:
        # This will cause the main script to fail with a clear error
        raise ValueError("GOOGLE_API_KEY is not set in the environment.")

def clean_text_and_load_json(response_text):
    try:
        start = response_text.find('{')
        end = response_text.rfind('}') + 1
        if start == -1 or end == 0:
            return None

        json_str = response_text[start:end]
        response_dict = json.loads(json_str)
        
        response_dict["transaction_id"] = response_dict.get("transaction_id", "").replace("O", "0")
        return response_dict
    except (json.JSONDecodeError, TypeError):
        return None

def gemini_img_ocr(image_data, file_extension):
    try:
        # === THE FIX: Configure the library right before using it ===
        _configure_genai()
        
        vision_model = genai.GenerativeModel(model_name="gemini-2.5-flash")
        mime_type = "image/jpeg" if file_extension in [".jpg", ".jpeg"] else f"image/{file_extension.strip('.')}"
        contents = [
            {"mime_type": mime_type, "data": image_data},
            {"text": prompt_2},
        ]
        response = vision_model.generate_content(contents)
        return response.text
    except Exception as e:
        # Return the actual error message for better debugging
        return json.dumps({"error": f"Gemini API Error: {str(e)}"})

def gemini_pdf_ocr(pdf_data):
    try:
        # === THE FIX: Configure the library right before using it ===
        _configure_genai()
        
        vision_model = genai.GenerativeModel(model_name="gemini-2.5-flash")
        mime_type = "application/pdf"
        contents = [
            {"mime_type": mime_type, "data": pdf_data},
            {"text": prompt_2},
        ]
        response = vision_model.generate_content(contents)
        return response.text
    except Exception as e:
        # Return the actual error message for better debugging
        return json.dumps({"error": f"Gemini API Error: {str(e)}"})