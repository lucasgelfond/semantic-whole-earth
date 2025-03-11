import { createClient } from '@supabase/supabase-js';
import { pipeline } from '@huggingface/transformers';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Test query string
const TEST_QUERY = 'Ayn Rand';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Performs hybrid search using both semantic and full-text search
 * @param {string} query User's search query
 * @returns {Promise<Array>} Search results
 */
async function hybridSearch(query) {
	try {
		// Initialize the embedding model
		const classifier = await pipeline('feature-extraction', 'Supabase/gte-small', {
			dtype: 'fp32',
			device: 'cpu'
		});

		// Generate embedding for query
		const output = await classifier(query, {
			pooling: 'mean',
			normalize: true
		});

		// Convert to array
		const embedding = Array.from(output.data);

		// Perform hybrid search using Supabase
		const { data: results, error } = await supabase.rpc('hybrid_search', {
			query_text: query,
			query_embedding: embedding,
			match_count: 10
		});

		if (error) throw error;
		return results;
	} catch (error) {
		console.error('Error in hybrid search:', error);
		throw error;
	}
}

// Run test query
(async () => {
	try {
		const results = await hybridSearch(TEST_QUERY);
		console.log('Hybrid search results:', results);
	} catch (error) {
		console.error('Error running test query:', error);
	}
})();
