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

		// Create a temporary table for inspection
		await db.exec(`
			DROP TABLE IF EXISTS temp_issue_import;
			CREATE TABLE temp_issue_import (LIKE issue INCLUDING ALL);
		`);

		// Import into temp table first
		await db.query(
			`COPY temp_issue_import FROM '/dev/blob' WITH (
				FORMAT csv,
				HEADER true,
				DELIMITER ',',
				QUOTE '"',
				ESCAPE '"'
			);`,
			[],
			{ blob: issuesBlob }
		);

		// Check the imported data
		const importedCount = await db.query('SELECT COUNT(*) FROM temp_issue_import;');
		console.log('Rows in temp import table:', importedCount.rows[0].count);

		const importedSample = await db.query('SELECT id FROM temp_issue_import LIMIT 3;');
		console.log('Sample imported IDs:', importedSample.rows);

		// Now do the actual import
		await db.query(
			`INSERT INTO issue 
			 SELECT * FROM temp_issue_import;`
		);

		// Log final results
		const finalCount = await db.query('SELECT COUNT(*) FROM issue;');
		console.log('Final row count in issue table:', finalCount.rows[0].count);

		// Cleanup
		await db.exec('DROP TABLE IF EXISTS temp_issue_import;');
	} catch (error) {
		console.error('Error during import:', error);
		throw error;
	} finally {
		// Cleanup on error
		await db.exec('DROP TABLE IF EXISTS temp_issue_import;').catch(console.error);
	}
};

export async function setupFromCSV() {
	console.log('Starting database setup from CSV...');
	initializing.set(true);

	try {
		console.log('Creating new database instance...');
		const newDb = await getDB();

		console.log('Initializing database schema...');
		await initSchema(newDb);

		console.log('Fetching CSV file...');
		const response = await fetch('/pg-dump-issue-psql.csv');
		if (!response.ok) {
			throw new Error(`Failed to fetch CSV file: ${response.statusText}`);
		}

		// Get the blob directly from the response
		const csvBlob = await response.blob();
		console.log('CSV file fetched successfully, size:', csvBlob.size);

		console.log('Seeding database from CSV...');
		await seedDbFromCSVs(newDb, csvBlob);
		console.log('Database seeded successfully');

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

	// Get Items
	const items = await database.query<{ ocr_result: string }>(
		'SELECT ocr_result as content FROM page order by ocr_result asc'
	);
	content.set(items.rows.map((row) => row.content));
}
