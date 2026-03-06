import pdfplumber
import io

def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """
    Takes raw PDF bytes, returns extracted text as a string.
    pdfplumber is better than PyPDF2 for complex resume layouts.
    """
    text_parts = []
    
    try:
        # Open PDF from bytes (not a file path)
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
        
        full_text = "\n".join(text_parts)
        return full_text.strip()
    
    except Exception as e:
        print(f"PDF extraction error: {e}")
        return ""