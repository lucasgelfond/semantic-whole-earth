<script lang="ts">
  import type { PGlite } from '@electric-sql/pglite';
  import { getDB, initSchema, countRows, seedDb, getTopTen, getBlob, clearDb, getIssues, importBlob } from '../utils/db';
  import { db } from '$lib/setup';
  import { get } from 'svelte/store';
  import { setupFromDump, setupFromScratch } from '$lib/setup';

  let uploadedFile: File | null = null;
  let uploadStatus = '';
  let isLoading = false;

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

  async function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      uploadedFile = input.files[0];
      uploadStatus = `Selected file: ${uploadedFile.name}`;
    }
  }

  async function handleSetupFromDump() {
    if (!uploadedFile) {
      uploadStatus = 'Please select a file first';
      return;
    }

    isLoading = true;
    uploadStatus = 'Setting up database from dump...';

    try {
      await setupFromDump(uploadedFile);
      uploadStatus = 'Database setup from dump complete';
    } catch (error) {
      uploadStatus = `Failed to setup from dump: ${error}`;
      console.error('Failed to setup from dump:', error);
    } finally {
      isLoading = false;
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

<div class="flex flex-col gap-4">
  <div class="flex items-center gap-4">
    <input 
      type="file"
      accept="*"
      on:change={handleFileSelect}
      class="border rounded px-2 py-1"
    />
    {#if uploadStatus}
      <span class={isLoading ? "text-blue-500" : "text-gray-600"}>
        {uploadStatus}
      </span>
    {/if}
  </div>

  <div class="flex gap-2">
    <button 
      class="bg-emerald-500 text-white px-4 py-1 rounded disabled:opacity-50"
      on:click={handleSetupFromDump}
      disabled={!uploadedFile || isLoading}
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
</div>