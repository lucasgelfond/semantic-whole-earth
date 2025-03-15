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

		// First, let's inspect the CSV structure
		const text = await pagesBlob.text();
		const lines = text.split('\n', 2); // Get header and first line only
		console.log('CSV Header:', JSON.stringify(lines[0]));
		console.log('First data row preview:', JSON.stringify(lines[1].substring(0, 200) + '...'));

		// Create temporary table for import with all columns as text first
		await db.exec(`
			DROP TABLE IF EXISTS temp_page_import;
			CREATE TABLE temp_page_import (
				id text,
				parent_issue_id text,
				page_number text,
				ocr_result text,
				created_at text,
				error text,
				fts text,
				embedding text,
				image_url text
			);
		`);

		// Import into temp table first
		await db.query(
			`COPY temp_page_import FROM '/dev/blob' WITH (
				FORMAT csv,
				HEADER true,
				DELIMITER ',',
				QUOTE '"',
				ESCAPE '"'
			);`,
			[],
			{ blob: pagesBlob }
		);

		// Log import stats
		const importCount = await db.query<{ count: string }>('SELECT COUNT(*) FROM temp_page_import;');
		console.log('Rows in temp import table:', JSON.stringify(importCount.rows[0].count));

		// Sample the imported data
		const sampleRows = await db.query('SELECT * FROM temp_page_import LIMIT 2;');
		console.log('Sample imported rows:', JSON.stringify(sampleRows.rows, null, 2));

		// After the COPY command, add these diagnostic queries:
		console.log('Checking imported data...');

		// Check for any null IDs
		const nullIds = await db.query(`
			SELECT COUNT(*) as count 
			FROM temp_page_import 
			WHERE id IS NULL OR id = '';
		`);
		console.log('Rows with null IDs:', JSON.stringify(nullIds.rows[0].count));

		// Check for invalid UUIDs
		const invalidUuids = await db.query(`
			SELECT id, parent_issue_id 
			FROM temp_page_import 
			WHERE id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
			OR parent_issue_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
			LIMIT 5;
		`);
		console.log('Sample invalid UUIDs:', JSON.stringify(invalidUuids.rows, null, 2));

		// Check column counts
		const columnInfo = await db.query(`
			SELECT column_name, data_type 
			FROM information_schema.columns 
			WHERE table_name = 'temp_page_import'
			ORDER BY ordinal_position;
		`);
		console.log('Temp table columns:', JSON.stringify(columnInfo.rows, null, 2));

		// Sample a few rows with specific columns
		const sampleDetailedRows = await db.query(`
			SELECT 
				id,
				parent_issue_id,
				page_number,
				substr(ocr_result, 1, 50) as ocr_preview,
				created_at,
				substr(embedding::text, 1, 30) as embedding_preview
			FROM temp_page_import 
			LIMIT 3;
		`);
		console.log('Detailed sample rows:', JSON.stringify(sampleDetailedRows.rows, null, 2));

		// Check for any oversized fields
		const longFields = await db.query(`
			SELECT id,
				length(ocr_result) as ocr_length,
				length(embedding::text) as embedding_length
			FROM temp_page_import 
			ORDER BY length(ocr_result) DESC 
			LIMIT 3;
		`);
		console.log('Longest field samples:', JSON.stringify(longFields.rows, null, 2));

		// Clear existing pages
		console.log('Clearing existing pages...');
		await db.exec('TRUNCATE TABLE page CASCADE;');

		// Insert from temp table to main table with proper type casting
		await db.query(`
			INSERT INTO page (
				id,
				parent_issue_id,
				page_number,
				ocr_result,
				embedding,
				created_at,
				image_url
			)
			SELECT 
				CAST(id AS uuid),
				CAST(parent_issue_id AS uuid),
				page_number,
				ocr_result,
				CASE 
					WHEN embedding IS NULL OR embedding = '' THEN NULL
					ELSE embedding::vector(384)
				END,
				CASE 
					WHEN created_at IS NULL OR created_at = '' THEN CURRENT_TIMESTAMP
					ELSE CAST(created_at AS timestamp with time zone)
				END,
				image_url
			FROM temp_page_import
			WHERE CAST(parent_issue_id AS uuid) IN (SELECT id FROM issue);
		`);

		// Log results
		const finalCount = await db.query<{ count: string }>('SELECT COUNT(*) FROM page;');
		console.log('Final row count in page table:', JSON.stringify(finalCount.rows[0].count));

		// Cleanup
		await db.exec('DROP TABLE IF EXISTS temp_page_import;');
	} catch (error) {
		console.error('Error during page import:', error);
		// Cleanup on error
		await db.exec('DROP TABLE IF EXISTS temp_page_import;').catch(console.error);
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
