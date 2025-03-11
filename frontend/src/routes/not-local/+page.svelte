<script lang="ts">
  import { createClient } from '@supabase/supabase-js';
  import { pipeline } from '@huggingface/transformers';
  import { onMount } from 'svelte';
  import { writable } from 'svelte/store';

  let input = '';
  const result = writable<string[] | null>(null);
  let ready: boolean | null = null;
  let worker: Worker;
  let issueMap = new Map<string, string>();

  interface SearchResult {
    id: string;
    parent_issue_id: string;
    page_number: string;
    ocr_result: string;
    created_at: string;
  }
  
  // Initialize Supabase client
  const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

  onMount(async () => {
    // Fetch all issues and create mapping
    const { data: issues, error: issuesError } = await supabase
      .from('issue')
      .select('id, filename');
    
    if (issues) {
      issues.forEach(issue => {
        issueMap.set(issue.id, issue.filename);
      });
    }

    if (!worker) {
      worker = new Worker(new URL('../../utils/worker.ts', import.meta.url), {
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
          try {
            // Perform hybrid search using Supabase
            const { data: results, error } = await supabase.rpc('hybrid_search', {
              query_text: input,
              query_embedding: e.data.embedding,
              match_count: 10
            });

            if (error) throw error;
            console.log('Hybrid search results:', results);
            result.set(results);
          } catch (error) {
            console.error('Error in hybrid search:', error);
          }
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
  {#if $result}
    <div class="mt-4">
      <h3 class="font-bold">Search Results:</h3>
      <div class="grid gap-4 max-w-3xl">
        {#each $result as item}
          <div class="border rounded p-4 grid grid-cols-[220px_1fr] gap-4">
            <div class="flex flex-col">
              <span class="font-semibold">File:</span>
              <div class="text-sm break-words">
                {issueMap.get(item.parent_issue_id) || 'Unknown file'}
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
  {/if}
</div>
