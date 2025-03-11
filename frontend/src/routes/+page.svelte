<script lang="ts">
	import type { PGlite } from '@electric-sql/pglite';
  import { getDB, initSchema, countRows, seedDb, search, getTopTen } from '../utils/db';
  import { onMount } from 'svelte';
  import { writable } from 'svelte/store';
  import type { Row } from '../types/row';

  let content: string[] = [];
  let input = '';
  const result = writable<string[] | null>(null);
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
          // Inner product search
          const searchResults = await search(db, e.data.embedding);
          console.log({searchResults})
          result.set(searchResults.map(row => row.content));
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

  async function handleGetDB() {
    db = await getDB();
    console.log('Database instance retrieved');
  }

  async function handleInitSchema() {
    if (!db) {
      console.error('Database not initialized');
      return;
    }
    await initSchema(db);
    console.log('Schema initialized');
  }

  async function handleCountRows() {
    if (!db) {
      console.error('Database not initialized');
      return;
    }
    const count = await countRows(db, 'page');
    console.log(`Row count: ${count}`);
  }

  async function handleSeedDb() {
    if (!db) {
      console.error('Database not initialized');
      return;
    }
    await seedDb(db);
    console.log('Database seeded');
  }

  async function handleTopTen() {
    if (!db) {
      console.error('Database not initialized');
      return;
    }
    const topTen = await getTopTen(db);
    console.log('Top ten rows:', topTen);
  }
</script>

<div class="flex flex-col gap-4">
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

  <div class="flex gap-2">
    <button 
      class="bg-green-500 text-white px-4 py-1 rounded"
      on:click={handleGetDB}
    >
      Get DB
    </button>
    <button 
      class="bg-yellow-500 text-white px-4 py-1 rounded"
      on:click={handleInitSchema}
    >
      Init Schema
    </button>
    <button 
      class="bg-purple-500 text-white px-4 py-1 rounded"
      on:click={handleCountRows}
    >
      Count Rows
    </button>
    <button 
      class="bg-red-500 text-white px-4 py-1 rounded"
      on:click={handleSeedDb}
    >
      Seed DB
    </button>
    <button 
      class="bg-orange-500 text-white px-4 py-1 rounded"
      on:click={handleTopTen}
    >
      Top Ten
    </button>
  </div>

  {#if $result}
    <div class="mt-4">
      <h3 class="font-bold">Search Results:</h3>
      <ul class="list-disc pl-5">
        {#each $result as item}
          <li>{item}</li>
        {/each}
      </ul>
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
