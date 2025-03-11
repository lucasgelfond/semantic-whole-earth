import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
import type { Row } from '../types/row';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';

let dbInstance: PGlite | null = null;
// Implement a singleton pattern to make sure we only create one database instance.
export async function getDB(): Promise<PGlite> {
	if (dbInstance) {
		return dbInstance;
	}
	const metaDb = new PGlite('idb://supa-semantic-search', {
		extensions: {
			vector,
			uuid_ossp
		}
	});
	await metaDb.waitReady;
	dbInstance = metaDb;
	return metaDb;
}

// Initialize the database schema.
export const initSchema = async (db: PGlite): Promise<void> => {
	await db.exec(`
    create extension if not exists "uuid-ossp";
    create table if not exists page (
      id uuid default uuid_generate_v4() primary key,
      parent_issue_id text,
      page_number text not null, 
      ocr_result text,
      created_at timestamp with time zone default timezone('utc'::text, now())
    );
  `);
};

// Helper method to count the rows in a table.
export const countRows = async (db: PGlite, table: string): Promise<number> => {
	const res = await db.query(`SELECT COUNT(*) FROM ${table};`);
	return Number((res.rows[0] as { count: string }).count);
};

export const seedDb = async (db: PGlite): Promise<void> => {
	const response = await fetch('/rows.json');
	const rows = await response.json();

	for (const row of rows) {
		const { parent_issue_id, page_number, ocr_result } = row;
		if (parent_issue_id && page_number && ocr_result) {
			console.log({ parent_issue_id, page_number, ocr_result });
			await db.query(
				`INSERT INTO page (parent_issue_id, page_number, ocr_result) 
				VALUES ($1, $2, $3)`,
				[parent_issue_id, page_number, ocr_result]
			);
		}
	}
};

export const getTopTen = async (db: PGlite): Promise<Array<Row>> => {
	const res = await db.query(`SELECT * FROM page LIMIT 10`);
	console.log({ rows: res.rows });
	return res.rows as Array<Row>;
};

export const getAll = async (db: PGlite): Promise<Array<Row>> => {
	const res = await db.query(`SELECT * FROM embeddings ORDER BY content`);
	return res.rows as Array<Row>;
};

export const search = async (
	db: PGlite,
	embedding: number[],
	match_threshold = 0.8,
	limit = 3
): Promise<Array<Row>> => {
	const res = await db.query(
		`
      select * from embeddings
  
      -- The inner product is negative, so we negate match_threshold
      where embeddings.embedding <#> $1 < $2
  
      -- Our embeddings are normalized to length 1, so cosine similarity
      -- and inner product will produce the same query results.
      -- Using inner product which can be computed faster.
      --
      -- For the different distance functions, see https://github.com/pgvector/pgvector
      order by embeddings.embedding <#> $1
      limit $3;
      `,
		[JSON.stringify(embedding), -Number(match_threshold), Number(limit)]
	);
	return res.rows as Array<Row>;
};

// Helper method to clear all tables from the database
export const clearDb = async (db: PGlite): Promise<void> => {
	await db.exec(`
		DROP TABLE IF EXISTS page CASCADE;
		DROP TABLE IF EXISTS embeddings CASCADE;
	`);
};

// Helper method to dump database to a file that can be downloaded
export const dumpDatabase = async (
	db: PGlite,
	compression: 'auto' | 'gzip' | 'none' = 'auto'
): Promise<void> => {
	try {
		const dump = await db.dumpDataDir(compression);

		// Create a download link
		const url = URL.createObjectURL(dump);
		const a = document.createElement('a');
		a.href = url;
		a.download = `pglite-dump-${Date.now()}.tar${compression === 'none' ? '' : '.gz'}`;

		// Trigger download
		document.body.appendChild(a);
		a.click();

		// Cleanup
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	} catch (error) {
		console.error('Failed to dump database:', error);
		throw error;
	}
};
