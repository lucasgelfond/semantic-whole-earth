import { PGlite } from '@electric-sql/pglite';
import { writable, type Writable } from 'svelte/store';
import type { Row } from '../types/row';
import { getDB, initSchema, countRows, seedDb, getIssues } from '../utils/db';
import { vector } from '@electric-sql/pglite/vector';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';

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
		// Clear existing pages
		await db.exec('TRUNCATE TABLE page CASCADE;');

		// Create a temporary table for the CSV
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

		// Import CSV into temporary table
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

		// Create view and insert data
		await db.exec(`
			CREATE VIEW page_import_view AS
			SELECT 
				CAST(NULLIF(column1, '') AS uuid) as id,
				CAST(NULLIF(column2, '') AS uuid) as parent_issue_id,
				column3 as page_number,
				column4 as ocr_result,
				CAST(NULLIF(column5, '') AS timestamp with time zone) as created_at,
				NULLIF(column8, '')::vector(384) as embedding,
				column9 as image_url
			FROM csv_import_data;
		`);

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
			SELECT * FROM page_import_view;
		`);

		// Cleanup
		await db.exec('DROP VIEW IF EXISTS page_import_view;');
		await db.exec('DROP TABLE IF EXISTS csv_import_data;');
	} catch (error) {
		console.error('Error during page import:', error);
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

/**
 * Fetches a tarball file and returns it as a Blob
 * @param url The URL of the tarball to fetch
 * @returns A Blob containing the tarball data
 */
async function fetchTarball(url: string): Promise<Blob> {
	console.log(`Fetching tarball from ${url}...`);

	const tarballResponse = await fetch(url, {
		method: 'GET',
		credentials: 'include',
		headers: {
			Accept: 'application/octet-stream',
			'Content-Type': 'application/octet-stream',
			'Cache-Control': 'no-cache, no-store'
		}
	});

	if (!tarballResponse.ok) {
		throw new Error(
			`Failed to fetch tarball: ${tarballResponse.statusText} (${tarballResponse.status})`
		);
	}

	console.log('Response headers:', Object.fromEntries(tarballResponse.headers));
	const arrayBuffer = await tarballResponse.arrayBuffer();
	console.log('Received binary data, size:', arrayBuffer.byteLength, 'bytes');

	const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
	console.log('Created blob, size:', blob.size, 'bytes, type:', blob.type);

	return blob;
}

/**
 * Deletes any existing database and releases connections
 */
async function deleteOtherDatabases() {
	console.log('Preparing to delete existing database...');

	// First, set the global db to null to release any existing connections
	db.set(null);
	console.log('Released existing database connections');

	// Force garbage collection if possible to release any lingering connections
	if (typeof window.gc === 'function') {
		try {
			window.gc();
			console.log('Forced garbage collection');
		} catch (e) {
			console.log('Could not force garbage collection');
		}
	}

	// Small delay to ensure connections are fully closed
	await new Promise((resolve) => setTimeout(resolve, 500));

	// Check if database exists
	const databases = await indexedDB.databases();
	const existingDb = databases.find((db) => db.name === 'supa-semantic-search');

	if (existingDb) {
		console.log('Found existing database:', existingDb.name, 'version:', existingDb.version);

		// Delete the database from IndexedDB
		console.log('Deleting existing database...');
		const deleteRequest = indexedDB.deleteDatabase('supa-semantic-search');

		await new Promise((resolve, reject) => {
			deleteRequest.onsuccess = () => {
				console.log('Existing database deleted successfully');
				resolve(true);
			};

			deleteRequest.onerror = () => {
				console.error('Error deleting database:', deleteRequest.error);
				reject(new Error(`Failed to delete database: ${deleteRequest.error}`));
			};

			deleteRequest.onblocked = () => {
				console.warn('Database deletion blocked - connections still open');
				// Try to handle blocked state
				window.alert('Please close other tabs using this application and try again.');
				reject(new Error('Database deletion blocked'));
			};
		});

		// Add a delay after deletion to ensure it's complete
		console.log('Waiting for deletion to complete...');
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Verify deletion
		const afterDatabases = await indexedDB.databases();
		const stillExists = afterDatabases.some((db) => db.name === 'supa-semantic-search');

		if (stillExists) {
			console.error('Database still exists after deletion attempt');
			throw new Error('Could not delete existing database');
		} else {
			console.log('Confirmed database deletion');
		}
	} else {
		console.log('No existing database found, proceeding with clean setup');
	}
}

/**
 * Sets up the database by importing a tarball dump
 * Uses PGlite's direct database import capability
 */
async function verifyDb(newDb: PGlite) {
	console.log('Verifying import...');
	const tables = await newDb.query<{ table_name: string }>(
		`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';`
	);
	console.log('Tables found:', tables.rows.map((r) => r.table_name).join(', '));

	// Check counts for main tables
	const issueCounts = await newDb.query<{ count: string }>('SELECT COUNT(*) as count FROM issue;');
	console.log('Issue count:', issueCounts.rows[0].count);

	const pageCounts = await newDb.query<{ count: string }>('SELECT COUNT(*) as count FROM page;');
	console.log('Page count:', pageCounts.rows[0].count);
}

export async function setupFromTarball() {
	console.log('Starting database setup from tarball...');
	const startTime = performance.now();
	let stepStartTime = startTime;
	initializing.set(true);

	const logStepTime = (stepName: string) => {
		const now = performance.now();
		const stepDuration = (now - stepStartTime) / 1000;
		const totalDuration = (now - startTime) / 1000;
		console.log(
			`TIMING - ${stepName}: ${stepDuration.toFixed(2)}s (total: ${totalDuration.toFixed(2)}s)`
		);
		stepStartTime = now;
	};

	try {
		// Delete existing database if it exists
		console.log('Ensuring no existing database...');
		await deleteOtherDatabases();
		logStepTime('Delete existing database');

		// Fetch the tarball as a blob
		const tarballBlob = await fetchTarball('/tarball-wec-dump.tar.gz');
		logStepTime('Fetch tarball');

		// Create a new PGlite instance with the tarball data
		console.log('Creating new database instance with imported data...');

		// Use a different database name to avoid conflicts
		const uniqueDbName = `idb://supa-semantic-search-${Date.now()}`;
		console.log(`Using unique database name: ${uniqueDbName}`);

		const newDb = new PGlite(uniqueDbName, {
			extensions: {
				vector,
				uuid_ossp
			},
			loadDataDir: tarballBlob // Pass the blob directly
		});

		// Wait for the database to be ready
		await newDb.waitReady;
		logStepTime('Create and load database');

		await verifyDb(newDb);
		logStepTime('Verify import');

		// Update global state
		db.set(newDb);
		console.log('Updating global state...');
		await updateIssuesAndContent(newDb);
		logStepTime('Update global state');

		const totalDuration = (performance.now() - startTime) / 1000;
		console.log(`TIMING - Total import time: ${totalDuration.toFixed(2)}s`);
		console.log('Database setup completed successfully');

		return newDb;
	} catch (error) {
		console.error('Failed to setup database from tarball:', error);
		console.error('Error details:', error instanceof Error ? error.message : String(error));
		throw error;
	} finally {
		initializing.set(false);
	}
}
