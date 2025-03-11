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
    create extension if not exists vector;
    
    create table if not exists page (
      id uuid default uuid_generate_v4() primary key,
      parent_issue_id text,
      page_number text not null, 
      ocr_result text,
      fts tsvector GENERATED ALWAYS AS (to_tsvector('english', ocr_result)) STORED,
      embedding vector(384),
      created_at timestamp with time zone default timezone('utc'::text, now())
    );

    CREATE INDEX IF NOT EXISTS page_fts_idx ON page USING gin(fts);
    CREATE INDEX IF NOT EXISTS page_embedding_idx ON page USING hnsw (embedding vector_ip_ops);
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
		const { parent_issue_id, page_number, ocr_result, embedding } = row;
		if (parent_issue_id && page_number && ocr_result) {
			await db.query(
				`INSERT INTO page (parent_issue_id, page_number, ocr_result, embedding) 
				VALUES ($1, $2, $3, $4)`,
				[parent_issue_id, page_number, ocr_result, embedding]
			);
		}
	}
	console.log('done seeding DB');
};

export const getTopTen = async (db: PGlite): Promise<Array<Row>> => {
	const res = await db.query(`SELECT * FROM page LIMIT 10`);
	console.log({ rows: res.rows });
	return res.rows as Array<Row>;
};

export const getAll = async (db: PGlite): Promise<Array<Row>> => {
	const res = await db.query(`SELECT * FROM page ORDER BY ocr_result`);
	return res.rows as Array<Row>;
};
export const search = async (
	db: PGlite,
	query: string,
	embedding: number[],
	match_count = 10,
	full_text_weight = 1.0,
	semantic_weight = 1.0,
	rrf_k = 50
): Promise<Array<Row>> => {
	const res = await db.query(
		`
		with full_text as (
			select
				id,
				row_number() over(order by ts_rank_cd(fts, websearch_to_tsquery('english', $1)) desc) as rank_ix
			from
				page
			where
				fts @@ websearch_to_tsquery('english', $1)
			order by rank_ix
			limit least($2, 10) * 2
		),
		semantic as (
			select
				id,
				row_number() over (order by embedding <#> $3) as rank_ix
			from
				page
			where
				embedding is not null
			order by rank_ix
			limit least($2, 10) * 2
		)
		select
			page.*
		from
			full_text
			full outer join semantic
				on full_text.id = semantic.id
			join page
				on coalesce(full_text.id, semantic.id) = page.id
		order by
			coalesce(1.0 / ($4 + full_text.rank_ix), 0.0) * $5 +
			coalesce(1.0 / ($4 + semantic.rank_ix), 0.0) * $6
			desc
		limit
			least($2, 10)
		`,
		[query, match_count, JSON.stringify(embedding), rrf_k, full_text_weight, semantic_weight]
	);
	return res.rows as Array<Row>;
};

// Helper method to clear all tables from the database
export const clearDb = async (db: PGlite): Promise<void> => {
	try {
		await db.exec(`
			DROP TABLE IF EXISTS page CASCADE;
		`);
		console.log('Successfully cleared database');
	} catch (error) {
		console.error('Error clearing database:', error);
		throw error;
	}
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
