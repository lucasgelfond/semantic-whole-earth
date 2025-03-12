import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
	'https://quqkbbcfqdgmgnzutqer.supabase.co',
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1cWtiYmNmcWRnbWduenV0cWVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE0NTAxMjUsImV4cCI6MjA1NzAyNjEyNX0.QXmOk7-4_9GpzJjrx7Zr_bACKecNM8_bkAMo7zECYPI'
);

export type PageData = {
	page_number: number;
	image_url: string;
	ocr_result: string;
};

export type PageMap = Record<number, PageData>;

export async function fetchAllPages(issueId: string): Promise<PageMap> {
	const { data } = await supabase
		.from('page')
		.select('page_number,image_url,ocr_result')
		.eq('parent_issue_id', issueId);

	if (!data) return {};

	return data.reduce((acc, page) => {
		// Convert page_number to number since it's stored as string
		const pageNum = parseInt(page.page_number as string, 10);
		if (!isNaN(pageNum)) {
			acc[pageNum] = {
				...page,
				page_number: pageNum
			};
		}
		return acc;
	}, {} as PageMap);
}
