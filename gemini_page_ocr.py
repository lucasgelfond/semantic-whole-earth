import google.generativeai as genai
from pathlib import Path
import os
from dotenv import load_dotenv
from supabase import create_client, Client
from pdf2image import convert_from_path
import uuid
from typing import List, Tuple
import time
import PyPDF2

# Load environment variables
load_dotenv()
genai.configure(api_key=os.getenv('GOOGLE_API_KEY'))
supabase: Client = create_client(
    os.getenv('SUPABASE_URL'),
    os.getenv('SUPABASE_KEY')
)

# Initialize Gemini model
model = genai.GenerativeModel('gemini-2.0-flash')

def issue_exists(filename: str) -> bool:
    """Check if an issue already exists in the database"""
    result = supabase.table('issue').select('id').eq('filename', filename).execute()
    return len(result.data) > 0

def page_exists(issue_id: str, page_num: str) -> bool:
    """Check if a page already exists in the database"""
    result = supabase.table('page').select('id').eq('parent_issue_id', issue_id).eq('page_number', page_num).execute()
    return len(result.data) > 0

def create_issue(filename: str) -> str:
    """Create an issue record and return its ID"""
    data = supabase.table('issue').insert({
        'filename': filename
    }).execute()
    return data.data[0]['id']

def get_issue_id(filename: str) -> str:
    """Get issue ID from database, or create if doesn't exist"""
    result = supabase.table('issue').select('id').eq('filename', filename).execute()
    if result.data:
        return result.data[0]['id']
    return create_issue(filename)

def get_processed_pages(issue_id: str) -> set:
    """Get set of page numbers already processed for this issue"""
    result = supabase.table('page').select('page_number').eq('parent_issue_id', issue_id).execute()
    return {page['page_number'] for page in result.data}

def process_page(image: object, page_num: int, filename: str, issue_id: str) -> Tuple[int, str]:
    """Process a single page with Gemini"""
    prompt = f"""
    Extract and transcribe the text content from this page.
    Maintain the original structure but do not add any annotations.
    """
    
    max_retries = 3
    retry_delay = 1
    
    for attempt in range(max_retries):
        try:
            response = model.generate_content([prompt, image])
            
            # Check if we got a valid response
            if not response.text:
                error_msg = "Copyright detection or empty response"
                # Store the error in the database
                supabase.table('page').insert({
                    'parent_issue_id': issue_id,
                    'page_number': str(page_num),
                    'ocr_result': f"ERROR: {error_msg}",
                    'error': True  # Add this column to your schema
                }).execute()
                return page_num, error_msg
            
            # Store successful result
            supabase.table('page').insert({
                'parent_issue_id': issue_id,
                'page_number': str(page_num),
                'ocr_result': response.text,
                'error': False
            }).execute()
            
            return page_num, None
            
        except Exception as e:
            if attempt == max_retries - 1:
                # Store the error in the database
                supabase.table('page').insert({
                    'parent_issue_id': issue_id,
                    'page_number': str(page_num),
                    'ocr_result': f"ERROR: {str(e)}",
                    'error': True
                }).execute()
                return page_num, str(e)
            time.sleep(retry_delay * (attempt + 1))

def process_pdf(pdf_path: str):
    """Process a PDF file page by page and store results in Supabase"""
    print(f"Processing {pdf_path}")
    
    # Get or create issue record
    filename = Path(pdf_path).name
    issue_id = get_issue_id(filename)
    print(f"Using issue ID: {issue_id}")
    
    # Check total pages
    with open(pdf_path, 'rb') as pdf_file:
        pdf_reader = PyPDF2.PdfReader(pdf_file)
        pdf_page_count = len(pdf_reader.pages)
    
    processed_pages = get_processed_pages(issue_id)
    if len(processed_pages) == pdf_page_count:
        print(f"✓ {filename}: All {pdf_page_count} pages already processed")
        return
    
    print(f"Total pages in PDF: {pdf_page_count}")
    print(f"Pages already in database: {len(processed_pages)}")
    
    from concurrent.futures import ThreadPoolExecutor
    import threading
    
    def process_single_page(page_num):
        thread_name = threading.current_thread().name
        print(f"{thread_name}: Converting page {page_num}/{pdf_page_count}")
        
        try:
            # Convert single page with lower DPI and memory optimization
            images = convert_from_path(
                pdf_path,
                dpi=300,  
                first_page=page_num,
                last_page=page_num,
                thread_count=1,  
            )
            
            if not images:
                print(f"{thread_name}: Failed to convert page {page_num}")
                return
            
            # Process the page
            result = process_page(images[0], page_num, filename, issue_id)
            
            # Clear the image from memory immediately
            images[0].close()
            del images
            
            # Force garbage collection
            import gc
            gc.collect()
            
            page_num, error = result
            if error:
                print(f"{thread_name}: Error processing page {page_num}: {error}")
            else:
                print(f"{thread_name}: Successfully processed page {page_num}")
            
        except Exception as e:
            print(f"{thread_name}: Error processing page {page_num}: {str(e)}")
            # Force garbage collection on error too
            gc.collect()
    
    # Get pages that need processing
    pages_to_process = [
        page_num for page_num in range(1, pdf_page_count + 1)
        if str(page_num) not in processed_pages
    ]
    
    # Process pages with thread pool
    with ThreadPoolExecutor(max_workers=5) as executor:
        executor.map(process_single_page, pages_to_process)
        
    print(f"Completed processing {filename}")

def process_directory(directory: str = "WECs"):
    """Process all PDFs in a directory"""
    pdf_dir = Path(directory)
    if not pdf_dir.exists():
        print(f"Directory {directory} not found")
        return
    
    for pdf_file in sorted(pdf_dir.glob("*.pdf")):
        try:
            process_pdf(str(pdf_file))
            # Force garbage collection between PDFs
            import gc
            gc.collect()
        except Exception as e:
            print(f"Error processing PDF: {str(e)}")

if __name__ == "__main__":
    # Suppress MallocStackLogging warnings
    import sys
    import os
    
    # Redirect stderr to devnull for specific warnings
    stderr = sys.stderr
    devnull = open(os.devnull, 'w')
    sys.stderr = devnull
    
    # Make sure required environment variables are set:
    # GOOGLE_API_KEY, SUPABASE_URL, SUPABASE_KEY
    process_directory()
    
    # Restore stderr
    sys.stderr = stderr
    devnull.close()