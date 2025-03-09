import os
from pathlib import Path
from supabase import create_client, Client
from dotenv import load_dotenv
import PyPDF2

# Load environment variables and initialize Supabase client
load_dotenv()
supabase: Client = create_client(
    os.getenv('SUPABASE_URL'),
    os.getenv('SUPABASE_KEY')
)

def check_page_counts():
    """
    Compare page counts between PDFs and database records
    """
    # Get all issues
    issues = supabase.table('issue').select('*').execute()
    
    for issue in issues.data:
        issue_id = issue['id']
        filename = issue['filename']
        
        # Get count of pages in database for this issue
        pages = supabase.table('page')\
            .select('id')\
            .eq('parent_issue_id', issue_id)\
            .execute()
        
        db_page_count = len(pages.data)
        
        # Get PDF page count
        pdf_path = Path("WECs") / filename
        if not pdf_path.exists():
            print(f"PDF not found for {filename}")
            continue
            
        with open(pdf_path, 'rb') as pdf_file:
            pdf_reader = PyPDF2.PdfReader(pdf_file)
            pdf_page_count = len(pdf_reader.pages)
        
        # Compare counts
        if db_page_count != pdf_page_count:
            print(f"Mismatch for {filename}: PDF has {pdf_page_count} pages, DB has {db_page_count} pages")
        else:
            print(f"✓ {filename}: {pdf_page_count} pages")

if __name__ == "__main__":
    check_page_counts()
