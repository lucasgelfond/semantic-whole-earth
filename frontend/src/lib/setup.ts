import { PGlite } from '@electric-sql/pglite';
import { writable, type Writable } from 'svelte/store';
import type { Row } from '../types/row';
import { getDB, initSchema, countRows, seedDb, getIssues } from '../utils/db';

// Create stores for global state
export const db = writable<PGlite | null>(null);
export const issueMap = writable<Record<string, any>>({});
export const content = writable<string[]>([]);
export const result: Writable<Row[] | null> = writable(null);
export const ready = writable<boolean | null>(null);
export const initializing = writable<boolean>(false);

export async function setupFromScratch() {
	initializing.set(true);

	try {
		const newDb = await getDB();
		await initSchema(newDb);
		const count = await countRows(newDb, 'page');
		db.set(newDb);

		if (count === 0) {
			await seedDb(newDb);
		}

		await updateIssuesAndContent(newDb);

		return newDb;
	} catch (error) {
		console.error('Failed to initialize database:', error);
		throw error;
	} finally {
		initializing.set(false);
	}
}
export const seedDbFromCSVs = async (db: PGlite, issuesBlob: Blob): Promise<void> => {
	console.log('Seeding DB from CSV files...');

	try {
		console.log('Blob size:', issuesBlob.size);
		console.log('Blob type:', issuesBlob.type);

		// Clear existing data first
		console.log('Clearing existing data...');
		await db.exec('TRUNCATE TABLE issue CASCADE;');

		// Import directly into issue table
		await db.query(
			`COPY issue FROM '/dev/blob' WITH (
				FORMAT csv,
				HEADER true,
				DELIMITER ',',
				QUOTE '"',
				ESCAPE '"'
			);`,
			[],
			{ blob: issuesBlob }
		);

		// Log final results
		const finalCount = await db.query<{ count: string }>('SELECT COUNT(*) FROM issue;');
		console.log('Final row count in issue table:', finalCount.rows[0].count);
	} catch (error) {
		console.error('Error during import:', error);
		throw error;
	}
};

export const seedDbFromPageCSV = async (db: PGlite, pagesBlob: Blob): Promise<void> => {
	console.log('Seeding pages from CSV file...');

	try {
		console.log('Blob size:', pagesBlob.size);
		console.log('Blob type:', pagesBlob.type);

		// Clear existing pages
		console.log('Clearing existing pages...');
		await db.exec('TRUNCATE TABLE page CASCADE;');

		// First, let's inspect the CSV structure
		console.log('Inspecting CSV structure...');
		const text = await pagesBlob.text();
		const lines = text.split('\n');
		const firstLine = lines[0];
		console.log('CSV Header:', firstLine);
		console.log(
			'First data row preview:',
			lines.length > 1 ? lines[1].substring(0, 200) + '...' : 'No data rows'
		);
		console.log('Total CSV lines:', lines.length);

		// Get the column structure of the page table
		console.log('Getting page table structure...');
		const tableColumns = await db.query(`
			SELECT column_name 
			FROM information_schema.columns 
			WHERE table_name = 'page'
			ORDER BY ordinal_position;
		`);

		const pageColumns = tableColumns.rows.map((row) => row.column_name);
		console.log('Page table columns:', pageColumns);

		// Create a temporary table for the CSV first
		console.log('Creating temporary import table...');
		await db.exec('DROP TABLE IF EXISTS csv_import_data;');
		await db.exec(`
			CREATE TABLE csv_import_data (
				column1 text,
				column2 text,
				column3 text,
				column4 text,
				column5 text,
				column6 text,
				column7 text,
				column8 text,
				column9 text
			);
		`);

		// Import CSV into the temporary table
		console.log('Importing CSV into temporary table...');
		await db.query(
			`COPY csv_import_data FROM '/dev/blob' WITH (
				FORMAT csv,
				HEADER true,
				DELIMITER ',',
				QUOTE '"',
				ESCAPE '"'
			);`,
			[],
			{ blob: pagesBlob }
		);

		// Check the imported data
		const importCount = await db.query<{ count: string }>(
			'SELECT COUNT(*) as count FROM csv_import_data;'
		);
		console.log('Rows imported into temporary table:', importCount.rows[0].count);

		// Sample the imported data
		const sampleRows = await db.query('SELECT * FROM csv_import_data LIMIT 2;');
		console.log('Sample rows from temporary table:', JSON.stringify(sampleRows.rows, null, 2));

		// Now create the view after the table exists
		console.log('Creating view for data transformation...');
		await db.exec('DROP VIEW IF EXISTS page_import_view;');
		await db.exec(`
			CREATE VIEW page_import_view AS
			SELECT 
				CAST(NULLIF(column1, '') AS uuid) as id,
				CAST(NULLIF(column2, '') AS uuid) as parent_issue_id,
				column3 as page_number,
				column4 as ocr_result,
				CAST(NULLIF(column5, '') AS timestamp with time zone) as created_at,
				-- Skip column6 (error)
				-- Skip column7 (fts)
				NULLIF(column8, '')::vector(384) as embedding,
				column9 as image_url
			FROM csv_import_data;
		`);

		// Check the view data
		const viewCount = await db.query<{ count: string }>(
			'SELECT COUNT(*) as count FROM page_import_view;'
		);
		console.log('Rows in view:', viewCount.rows[0].count);

		// Sample the view data
		const viewSample = await db.query(`
			SELECT 
				id, 
				parent_issue_id, 
				page_number, 
				substr(ocr_result, 1, 50) as ocr_preview,
				created_at,
				substr(embedding::text, 1, 30) as embedding_preview,
				image_url
			FROM page_import_view LIMIT 2;
		`);
		console.log('Sample rows from view:', JSON.stringify(viewSample.rows, null, 2));

		// Insert from view to actual table
		console.log('Inserting data into final page table...');
		await db.query(`
			INSERT INTO page (
				id,
				parent_issue_id,
				page_number,
				ocr_result,
				created_at,
				embedding,
				image_url
			)
			SELECT 
				id,
				parent_issue_id,
				page_number,
				ocr_result,
				created_at,
				embedding,
				image_url
			FROM page_import_view;
		`);

		// Log final results
		const finalCount = await db.query<{ count: string }>('SELECT COUNT(*) FROM page;');
		console.log('Final row count in page table:', finalCount.rows[0].count);

		// Cleanup
		console.log('Cleaning up temporary objects...');
		await db.exec('DROP VIEW IF EXISTS page_import_view;');
		await db.exec('DROP TABLE IF EXISTS csv_import_data;');
		console.log('Import completed successfully');
	} catch (error) {
		console.error('Error during page import:', error);
		// Cleanup on error
		console.log('Cleaning up after error...');
		await db.exec('DROP VIEW IF EXISTS page_import_view;').catch(console.error);
		await db.exec('DROP TABLE IF EXISTS csv_import_data;').catch(console.error);
		throw error;
	}
};

// Modify setupFromCSV to handle both files
export async function setupFromCSV() {
	console.log('Starting database setup from CSV...');
	initializing.set(true);

	try {
		console.log('Creating new database instance...');
		const newDb = await getDB();

		console.log('Initializing database schema...');
		await initSchema(newDb);

		// First import issues
		console.log('Fetching issues CSV file...');
		const issuesResponse = await fetch('/pg-dump-issue-psql.csv');
		if (!issuesResponse.ok) {
			throw new Error(`Failed to fetch issues CSV file: ${issuesResponse.statusText}`);
		}
		const issuesBlob = await issuesResponse.blob();
		console.log('Issues CSV file fetched successfully, size:', issuesBlob.size);

		console.log('Importing issues...');
		await seedDbFromCSVs(newDb, issuesBlob);
		console.log('Issues imported successfully');

		// Then import pages with enhanced fetch handling
		console.log('Fetching pages CSV file...');
		try {
			const pagesResponse = await fetch('/pg-dump-page-psql.csv', {
				headers: {
					Accept: 'text/csv',
					Range: 'bytes=0-' // Request entire file
				}
			});

			console.log('Pages response status:', pagesResponse.status);
			console.log('Pages response headers:', Object.fromEntries(pagesResponse.headers));

			// Handle both 200 and 206 responses
			if (!(pagesResponse.status === 200 || pagesResponse.status === 206)) {
				throw new Error(`Failed to fetch pages CSV file: ${pagesResponse.statusText}`);
			}

			// Get the total size if available
			const contentLength = pagesResponse.headers.get('content-length');
			const contentRange = pagesResponse.headers.get('content-range');
			console.log('Content length:', contentLength);
			console.log('Content range:', contentRange);

			// Read the response as an array buffer to handle large files
			const buffer = await pagesResponse.arrayBuffer();
			console.log('Received buffer size:', buffer.byteLength);

			// Convert to blob
			const pagesBlob = new Blob([buffer], { type: 'text/csv' });
			console.log('Pages CSV file fetched successfully, size:', pagesBlob.size);

			console.log('Importing pages...');
			await seedDbFromPageCSV(newDb, pagesBlob);
			console.log('Pages imported successfully');
		} catch (fetchError) {
			console.error('Detailed fetch error:', fetchError);
			if (fetchError instanceof TypeError) {
				console.error('Network error details:', {
					name: fetchError.name,
					message: fetchError.message,
					cause: fetchError.cause
				});
			}
			throw fetchError;
		}

		db.set(newDb);
		await updateIssuesAndContent(newDb);

		console.log('Database setup from CSV completed successfully');
		return newDb;
	} catch (error) {
		console.error('Failed to setup database from CSV:', error);
		throw error;
	} finally {
		initializing.set(false);
	}
}

async function updateIssuesAndContent(database: PGlite) {
	try {
		// Get issues and create map
		const issues = await getIssues(database);
		issueMap.set(
			issues.reduce(
				(acc, issue) => {
					acc[issue.id] = issue;
					return acc;
				},
				{} as Record<string, any>
			)
		);

		// Skip loading content for now to avoid memory issues
		content.set([]);
	} catch (error) {
		console.error('Failed to update issues:', error);
		throw error;
	}
}
