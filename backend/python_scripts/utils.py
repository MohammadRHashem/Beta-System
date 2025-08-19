import json
from prompts import prompt_2
import google.generativeai as genai
from pdf2image import convert_from_path


vision_model = genai.GenerativeModel(model_name="models/gemini-2.0-flash")
genai.configure(api_key="AIzaSyCzaAsTFeqten0g3ajWefZYXLIOHu-rP38")


def pdf_to_images(pdf_path, output_folder, dpi=300):
    images = convert_from_path(pdf_path, dpi=dpi)

    for i, image in enumerate(images):
        image_path = f"{output_folder}/page_{i+1}.png"
        image.save(image_path, "PNG")


def clean_text(response):
    response = response.replace("`", "")
    response = response.replace("json", "")
    response_dict = json.loads(response)
    response_dict["transaction_id"] = response_dict.get("transaction_id", "").replace(
        "O", "0"
    )
    response = json.dumps(response_dict, indent=2)
    return response.strip()


def gemini_img_ocr(image_data, file_extension):
    try:
        mime_type = None
        if file_extension == ".jpg" or file_extension == ".jpeg":
            mime_type = "image/jpeg"
        elif file_extension == ".png":
            mime_type = "image/png"

        contents = [
            {"mime_type": mime_type, "data": image_data},
            {"text": prompt_2},
        ]

        response = vision_model.generate_content(contents)
        return response.text

    except Exception as e:
        # print("Error in gemini_img_ocr:", e)
        return None


def gemini_pdf_ocr(pdf_data):
    try:
        mime_type = "application/pdf"
        contents = [
            {"mime_type": mime_type, "data": pdf_data},
            {"text": prompt_2},
        ]
        response = vision_model.generate_content(contents)
        return response.text

    except Exception as e:
        print("Error in gemini_pdf_ocr:", e)
        return None