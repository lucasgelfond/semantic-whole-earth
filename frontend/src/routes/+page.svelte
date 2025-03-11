<script lang="ts">
import type { PGlite } from '@electric-sql/pglite';
import { getDB, initSchema, countRows, seedDb, search } from '../utils/db';
import { onMount } from 'svelte';
import { writable } from 'svelte/store';
import type { Row } from '../types/row';
import DatabaseControls from '../components/DatabaseControls.svelte';

let content: string[] = [];
let input = '';
const result = writable<Row[] | null>(null);
let ready: boolean | null = null;
let initializing = false;
let db: PGlite;
let worker: Worker;

onMount(() => {
  const setup = async () => {
    initializing = true;
    db = await getDB();
    await initSchema(db);
    let count = await countRows(db, 'embeddings');

    if (count === 0) {
      await seedDb(db);
    }

    // Get Items
    const items = await db.query<{content: string}>('SELECT content FROM embeddings order by content asc');
    content = items.rows.map(row => row.content);
  }

  if (!db && !initializing) {
    setup();
  }

  if (!worker) {
    worker = new Worker(new URL('../utils/worker.ts', import.meta.url), {
      type: 'module'
    });
    // Trigger pipeline initialization immediately
    worker.postMessage({ type: 'init' });
  }

  const onMessageReceived = async (e: MessageEvent) => {
    switch (e.data.status) {
      case 'initiate':
        ready = false;
        break;
      case 'ready':
        ready = true;
        break;
      case 'complete':
        // Pass both the search text and embedding
        const searchResults = await search(db, input, e.data.embedding);
        console.log({searchResults})
        result.set(searchResults);
        break;
    }
  };

  worker.addEventListener('message', onMessageReceived);

  return () => {
    worker.removeEventListener('message', onMessageReceived);
  };
});

function classify(text: string) {
  if (worker && text.trim()) {
    worker.postMessage({ text });
  }
}

function handleKeyPress(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    classify(input);
  }
}
</script>

<div class="flex flex-col gap-4 px-20 py-40">
  <div class="flex gap-2">
    <input 
      type="text"
      class="border rounded px-2 py-1"
      placeholder="Enter text to search..."
      bind:value={input}
      on:keypress={handleKeyPress}
    />
    <button 
      class="bg-blue-500 text-white px-4 py-1 rounded"
      on:click={() => classify(input)}
    >
    Search
    </button>
  </div>

  <DatabaseControls {db} />

  {#if $result}
    <div class="mt-4">
      <h3 class="font-bold">Search Results:</h3>
      <div class="grid gap-4 max-w-3xl">
        {#each $result as item}
          <div class="border rounded p-4 grid grid-cols-[220px_1fr] gap-4">
            <div class="flex flex-col">
              <span class="font-semibold">Issue ID:</span>
              <div class="text-sm break-words">
                {item.parent_issue_id || 'Unknown'}
              </div>
              <span class="font-semibold mt-2">Page:</span>
              <span>{item.page_number}</span>
            </div>
            <div class="h-[150px] overflow-y-auto">
              {item.ocr_result}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {:else if content.length}
    <div class="mt-4">
      <h3 class="font-bold">All Content:</h3>
      <ul class="list-disc pl-5">
        {#each content as item}
          <li>{item}</li>
        {/each}
      </ul>
    </div>
  {/if}
</div>
