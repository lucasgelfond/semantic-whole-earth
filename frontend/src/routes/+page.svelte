<script>
  import { getDB, initSchema, countRows, seedDb } from '../utils/db';
  import { onMount } from 'svelte';

  let content = [];
  let initializing = false;
  let db;

  onMount(async () => {
    const setup = async () => {
      initializing = true;
      db = await getDB();
      await initSchema(db);
      let count = await countRows(db, 'embeddings');

      if (count === 0) {
        seedDb(db);
      }

      // Get Items
      const items = await db.query('SELECT content FROM embeddings order by content asc');
      content = items.rows.map((x) => x.content);
    }

    if (!db && !initializing) {
      setup();
    }
  });
</script>

<pre>{JSON.stringify(content)}</pre>
