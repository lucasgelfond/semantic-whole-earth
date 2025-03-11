<script lang="ts">
  import type { PGlite } from '@electric-sql/pglite';
  import { getDB, initSchema, countRows, seedDb, getTopTen, getBlob, clearDb, getIssues, importBlob } from '../utils/db';
  import { db } from '$lib/setup';
  import { get } from 'svelte/store';
  import { setupFromDump, setupFromScratch } from '$lib/setup';

  async function handleInitSchema() {
    const dbInstance = get(db);
    if (!dbInstance) {
      console.error('Database not initialized');
      return;
    }
    await initSchema(dbInstance);
    console.log('Schema initialized');
  }

  async function handleCountRows() {
    const dbInstance = get(db);
    if (!dbInstance) {
      console.error('Database not initialized');
      return;
    }
    const count = await countRows(dbInstance, 'page');
    console.log(`Row count: ${count}`);
  }

  async function handleSeedDb() {
    const dbInstance = get(db);
    if (!dbInstance) {
      console.error('Database not initialized');
      return;
    }
    await seedDb(dbInstance);
    console.log('Database seeded');
  }

  async function handleTopTen() {
    const dbInstance = get(db);
    if (!dbInstance) {
      console.error('Database not initialized');
      return;
    }
    const topTen = await getTopTen(dbInstance);
    console.log('Top ten rows:', topTen);
  }

  async function handleDumpDB() {
    const dbInstance = get(db);
    if (!dbInstance) {
      console.error('Database not initialized');
      return;
    }
    await getBlob(dbInstance);
  }

  async function handleClearDb() {
    const dbInstance = get(db);
    if (!dbInstance) {
      console.error('Database not initialized');
      return;
    }
    await clearDb(dbInstance);
    console.log('Database cleared');
  }

  async function handleGetIssues() {
    const dbInstance = get(db);
    if (!dbInstance) {
      console.error('Database not initialized');
      return;
    }
    const issues = await getIssues(dbInstance);
    console.log('Issues:', issues);
  }

  async function handleImportBlob(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = input.files;

    const dbInstance = get(db);
    if (!dbInstance || !files || files.length !== 1) {
      console.error('Database not initialized or incorrect number of files');
      return;
    }

    try {
      await importBlob(dbInstance, files[0]);
      console.log('Successfully imported database from file');
    } catch (error) {
      console.error('Failed to import database:', error);
    }
  }

  async function handleSetupFromDump() {
    try {
      await setupFromDump();
      console.log('Database setup from dump complete');
    } catch (error) {
      console.error('Failed to setup from dump:', error);
    }
  }

  async function handleSetupFromScratch() {
    try {
      await setupFromScratch();
      console.log('Database setup from scratch complete');
    } catch (error) {
      console.error('Failed to setup from scratch:', error);
    }
  }
</script>

<div class="flex gap-2">
  <button 
    class="bg-emerald-500 text-white px-4 py-1 rounded"
    on:click={handleSetupFromDump}
  >
    Setup from Dump
  </button>
  <button 
    class="bg-amber-500 text-white px-4 py-1 rounded"
    on:click={handleSetupFromScratch}
  >
    Setup from Scratch
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
  <button 
    class="bg-pink-500 text-white px-4 py-1 rounded"
    on:click={handleDumpDB}
  >
    Dump DB
  </button>
  <button 
    class="bg-blue-500 text-white px-4 py-1 rounded"
    on:click={handleClearDb}
  >
    Clear DB
  </button>
  <button 
    class="bg-indigo-500 text-white px-4 py-1 rounded"
    on:click={handleGetIssues}
  >
    Get Issues
  </button>
</div> 