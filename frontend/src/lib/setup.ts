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
