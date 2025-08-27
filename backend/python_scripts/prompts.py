prompt_2 = f"""
    You are an AI-extractor that extracts data from invoice receipt and structures it. Given the image of an invoice,
    Extract and return the following fields:

    - transaction_id: The ID looks like this: "E18189547202502171718GVpGtoyM2R3". It can include digits and uppercase/lowercase letters. However, be VERY careful: Return the ID **exactly as shown**. If not found, fallback to transaction_number.
    - amount: The total transaction amount (with no currency symbol). Example "6.790,00", display it as "6,790.00" in the JSON output. "357,00" should be displayed as "357.00". "357" should be displayed as "357.00". "2.000" should be displayed as "2,000.00". "2000" should be displayed as "2,000.00". 10.000,00 should be displayed as "10,000.00". 10000,00 should be displayed as "10,000.00". 10000 should be displayed as "10,000.00". 1000 should be displayed as "1,000.00". 1.000 should be displayed as "1,000.00". 1.000,50 should be displayed as "1,000.50".
    - sender: Information about the sender (issuer) of the payment.
        - name: The name of the sender (business or individual).
    - recipient: Information about the recipient (receiver) of the payment.
        - name: The name of the recipient (business or individual).
    sometimes th sender and reciever can be swapped, if you find "Trkbit" or "Trkbit Tecnologia E Informacao Ltda" or "TRKBIT TECNOLOGIA E INFORMACAO LTDA	", as sender name, regardless of case sensitivity, it is the recipient.
    - additional_data: Any extra data related to the transaction.
    - image_type: Classify the image into one of the following types based on its visual context:
        - replay: A photo of another screen (like a phone or tablet) displaying a receipt only. Look for indicators such as phone, screen borders, hands holding a device, or double screen brightness.
        - screenshot: A digital capture of a screen, usually clean and perfectly cropped, with no physical background. Showing a digital receipts directly from a phone or computer screen.
        - live: A photo taken directly of a real, physical receipt using a camera. May include shadows, lighting reflections, fingers, surfaces, or slight angle distortion.
        - others: Any image that does not clearly show a receipt. This includes photos of people, objects, places, abstract images, or anything unrelated to receipts/documents.
     
    Incase a field is not found, keep empty string.
    Return in the following JSON format only:
    
    {{
      "transaction_id": "",
      "transaction_number": "",
      "payment_method": "",
      "invoice_date": "",
      "invoice_time": "",
      "amount": "",
      "currency": "R$",
      "sender": {{
        "name": "",
        "cnpj/cpf": "",
        "institution": "",
        "institution_cnpj": ""
      }},
      "recipient": {{
        "name": "",
        "cnpj/cpf": "",
        "institution": "",
        "pix_key": ""
      }},
      "additional_data": "",
      "image_type": ""
    }}


    Example output:
    {{
      "transaction_id": "E18189547202502171718GVpGtoyM2R3",
      "transaction_number": "18833223234423872",
      "payment_method": "Pix",
      "invoice_date": "17/5/2025",
      "invoice_time": "14:19:17",
      "amount": "6,790.00",
      "currency": "R$",
      "sender": {{
        "name": "M.DE PONTES CLEMENTINO CELULARES",
        "cnpj/cpf": "0090.518/0001-+*",
        "institution": "CLOUDWALK IP LTDA",
        "institution_cnpj": "18.189,547/0001-42"
      }},
      "recipient": {{
        "name": "TRKBIT TECNOLOGIA E INFORMACAO LTDA",
        "cnpj/cpf": ".874/0001- ",
        "institution": "COOPERATIVA DE CREDITO, POUPANGA E SERVIGOS FINANCEIROS",
        "pix_key": "@trkbit.co"
      }},
      "additional_data": "",
      "image_type": ""
    }}

    """