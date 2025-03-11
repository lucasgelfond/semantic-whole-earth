<script lang="ts">
  import type { PGlite } from '@electric-sql/pglite';
  import { getDB, initSchema, countRows, seedDb, getTopTen, dumpDatabase } from '../utils/db';

  export let db: PGlite | null = null;

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

  async function handleDumpDB() {
    if (!db) {
      console.error('Database not initialized');
      return;
    }
    await dumpDatabase(db);
  }
</script>

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
  <button 
    class="bg-pink-500 text-white px-4 py-1 rounded"
    on:click={handleDumpDB}
  >
    Dump DB
  </button>
</div> 