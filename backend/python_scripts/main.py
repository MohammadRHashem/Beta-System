import os
import argparse
import json
from utils import *


def process_file(file_path):
    _, file_extension = os.path.splitext(file_path)
    file_extension = file_extension.lower()

    response = None

    if file_extension in [".jpg", ".jpeg", ".png"]:
        with open(file_path, "rb") as image_file:
            image_data = image_file.read()
        response = gemini_img_ocr(image_data, file_extension)

    elif file_extension == ".pdf":
        with open(file_path, "rb") as pdf_file:
            pdf_data = pdf_file.read()
        response = gemini_pdf_ocr(pdf_data)

    else:
        return None

    # THE FIX: If the response from Gemini is None, return a default JSON.
    # Changed {{ to { to fix the TypeError.
    if response is None:
        empty_response = {
            "transaction_id": "",
            "transaction_number": "",
            "payment_method": "",
            "invoice_date": "",
            "invoice_time": "",
            "amount": "",
            "currency": "R$",
            "sender": {
                "name": "",
                "cnpj/cpf": "",
                "institution": "",
                "institution_cnpj": ""
            },
            "recipient": {
                "name": "",
                "cnpj/cpf": "",
                "institution": "",
                "pix_key": ""
            },
            "additional_data": "",
            "image_type": "other"
        }
        return json.dumps(empty_response, indent=2)

    return clean_text(response)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Process a file (PDF or image) using OCR."
    )
    parser.add_argument("file_path", type=str, help="Path to the file to process")

    args = parser.parse_args()
    response = process_file(args.file_path)
    if response:
        print(response)