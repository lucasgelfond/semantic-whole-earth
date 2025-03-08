import google.generativeai as genai
from pathlib import Path
import os
from dotenv import load_dotenv
from supabase import create_client, Client
from pdf2image import convert_from_path
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
from typing import List, Tuple
import time

# Load environment variables
load_dotenv()
genai.configure(api_key=os.getenv('GOOGLE_API_KEY'))
supabase: Client = create_client(
    os.getenv('SUPABASE_URL'),
    os.getenv('SUPABASE_KEY')
)

# Thread-local storage for API clients
thread_local = threading.local()

def get_genai_model():
    """Get thread-local Gemini model instance"""
    if not hasattr(thread_local, 'model'):
        thread_local.model = genai.GenerativeModel('gemini-2.0-flash')
    return thread_local.model

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

def process_page(args: Tuple[object, int, str, str]) -> Tuple[int, str]:
    """Process a single page with Gemini"""
    image, page_num, filename, issue_id = args
    model = get_genai_model()
    
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
    
    # Convert PDF to images
    images = convert_from_path(pdf_path, dpi=300)
    total_pages = len(images)
    print(f"Total pages in PDF: {total_pages}")
    
    # Get already processed pages
    processed_pages = get_processed_pages(issue_id)
    print(f"Pages already in database: {len(processed_pages)}")
    
    # Prepare work items for missing pages
    work_items = []
    for page_num, image in enumerate(images, start=1):
        if str(page_num) not in processed_pages:
            work_items.append((image, page_num, filename, issue_id))
    
    if not work_items:
        print(f"All {total_pages} pages already processed for {filename}")
        return
    
    print(f"Processing {len(work_items)} remaining pages")
    
    # Process missing pages in parallel
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(process_page, item) for item in work_items]
        
        for future in as_completed(futures):
            page_num, error = future.result()
            if error:
                print(f"Error processing page {page_num}: {error}")
            else:
                print(f"Successfully processed page {page_num}")

def process_directory(directory: str = "WECs"):
    """Process all PDFs in a directory"""
    pdf_dir = Path(directory)
    if not pdf_dir.exists():
        print(f"Directory {directory} not found")
        return
    
    # Process PDFs in parallel
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = [
            executor.submit(process_pdf, str(pdf_file))
            for pdf_file in pdf_dir.glob("*.pdf")
        ]
        
        for future in as_completed(futures):
            try:
                future.result()
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