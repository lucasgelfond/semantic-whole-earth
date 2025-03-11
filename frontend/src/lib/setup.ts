import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
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

export async function setupFromDump(dumpFile: Blob | File) {
	initializing.set(true);

	try {
		console.log('Setting up from dump file:', dumpFile.name);

		// First try to delete existing database
		const existingDb = await indexedDB.databases();
		console.log('Existing databases:', existingDb);

		// Use the correct database name format
		const dbName = '/pglite/supa-semantic-search';
		if (existingDb.some((db) => db.name === dbName)) {
			console.log('Deleting existing database');
			await indexedDB.deleteDatabase(dbName);

			// Wait a moment for the deletion to complete
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		console.log('Creating new database instance');
		const newDb = new PGlite('idb://supa-semantic-search', {
			loadDataDir: dumpFile,
			extensions: {
				vector,
				uuid_ossp
			},
			debug: 5
		});

		console.log('Waiting for database to be ready');
		await newDb.waitReady;

		console.log('Setting database in store');
		db.set(newDb);

		console.log('Updating issues and content');
		await updateIssuesAndContent(newDb);

		console.log('Database setup complete');
		return newDb;
	} catch (error) {
		console.error('Failed to load database from dump:', error);
		throw error;
	} finally {
		initializing.set(false);
	}
}

export async function setupFromScratch() {
	initializing.set(true);

	try {
		const newDb = await getDB();
		await initSchema(newDb);
		const count = await countRows(newDb, 'page');

		if (count === 0) {
			await seedDb(newDb);
		}

		db.set(newDb);
		await updateIssuesAndContent(newDb);

		return newDb;
	} catch (error) {
		console.error('Failed to initialize database:', error);
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
