import { pipeline } from '@huggingface/transformers';

// Use the Singleton pattern to enable lazy construction of the pipeline.
class PipelineSingleton {
	static task = 'feature-extraction';
	static model = 'Supabase/gte-small';
	static instance = null;

	static async getInstance(progress_callback = null) {
		if (this.instance === null) {
			console.log('Creating new pipeline instance...');
			this.instance = pipeline(this.task, this.model, {
				progress_callback,
				dtype: 'fp32',
				device: !!navigator.gpu ? 'webgpu' : 'wasm'
			});
			console.log('Pipeline instance created');
		}
		return this.instance;
	}
}

// Listen for messages from the main thread
self.addEventListener('message', async (event) => {
	console.log('Received message:', event.data);

	// Retrieve the classification pipeline. When called for the first time,
	// this will load the pipeline and save it for future use.
	let classifier = await PipelineSingleton.getInstance((x) => {
		// We also add a progress callback to the pipeline so that we can
		// track model loading.
		console.log('Pipeline loading progress:', x);
		self.postMessage(x);
	});

	console.log('Processing text:', event.data.text);

	// Actually perform the classification
	let output = await classifier(event.data.text, {
		pooling: 'mean',
		normalize: true
	});

	// Extract the embedding output
	const embedding = Array.from(output.data);
	console.log('Generated embedding of length:', embedding.length);

	// Send the output back to the main thread
	self.postMessage({
		status: 'complete',
		embedding
	});
	console.log('Sent results back to main thread');
});
