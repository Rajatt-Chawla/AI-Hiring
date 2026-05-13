import pdfplumber
import re

def extract_text_from_pdf(file):
    """
    Extracts text from a given PDF file object using pdfplumber.
    """
    text = ""
    try:
        with pdfplumber.open(file) as pdf:
            for page in pdf.pages:
                extracted_page_text = page.extract_text()
                if extracted_page_text:
                    text += extracted_page_text + "\n"
    except Exception as e:
        return f"Error extracting text: {str(e)}"
    
    return text.strip() or "No text found in PDF."

def extract_email(text):
    """
    Extracts the first email found in the text.
    """
    email_pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
    match = re.search(email_pattern, text)
    return match.group(0) if match else "N/A"
