<script lang="ts">
import { createClient } from '@supabase/supabase-js';
import { onMount } from 'svelte';
import { writable } from 'svelte/store';

let input = '';
let result: any[] = [];
let loading = false;
const issueMap = writable<Record<string, any>>({});

const collectionMap: Record<string, string> = {
  'whole-earth-catalogs': 'Whole Earth Catalog',
  'whole-earth-software-review': 'Whole Earth Software Review', 
  'whole-earth-review': 'Whole Earth Review',
  'special-publications': 'Special Publications',
  'coevolution-quarterly': 'CoEvolution Quarterly',
  'whole-earth-magazine': 'Whole Earth Magazine'
};

const supabase = createClient(
  'https://quqkbbcfqdgmgnzutqer.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1cWtiYmNmcWRnbWduenV0cWVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE0NTAxMjUsImV4cCI6MjA1NzAyNjEyNX0.QXmOk7-4_9GpzJjrx7Zr_bACKecNM8_bkAMo7zECYPI'
);

async function getIssues() {
  const { data: issues } = await supabase
    .from('issue')
    .select('*')
    .order('created_at', { ascending: false });

  if (issues) {
    issueMap.set(issues.reduce((acc, issue) => {
      acc[issue.id] = issue;
      return acc;
    }, {} as Record<string, any>));
  }
}

async function search(query: string) {
  if (loading) return;
  
  loading = true;
  try {
    const response = await fetch('https://quqkbbcfqdgmgnzutqer.supabase.co/functions/v1/embed-search', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1cWtiYmNmcWRnbWduenV0cWVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE0NTAxMjUsImV4cCI6MjA1NzAyNjEyNX0.QXmOk7-4_9GpzJjrx7Zr_bACKecNM8_bkAMo7zECYPI'
      },
      body: JSON.stringify({
        query: query,
        match_count: 30 
      })
    });

    if (!response.ok) {
      throw new Error('Search request failed');
    }

    const data = await response.json();
    // @ts-ignore
    result = data.filter(item => !item?.error)
    await getIssues();
    console.log({data});

  } catch (error) {
    console.error('Search error:', error);
  } finally {
    loading = false;
  }
}

function handleKeyPress(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    search(input);
  }
}

onMount(async () => {
  await getIssues();
});

</script>

<div class="flex flex-col gap-4 px-20 py-40">
  <div class="flex gap-2">
    <input 
      type="text"
      class="border rounded px-2 py-1"
      placeholder="Enter text to search..."
      bind:value={input}
      on:keypress={handleKeyPress}
      disabled={loading}
    />
    <button 
      class="bg-blue-500 text-white px-4 py-1 rounded disabled:opacity-50 disabled:cursor-not-allowed"
      on:click={() => search(input)}
      disabled={loading}
    >
      {#if loading}
        <span class="inline-block animate-spin mr-1">⟳</span>
        Searching...
      {:else}
        Search
      {/if}
    </button>
  </div>

  {#if result.length}
    <div class="mt-4">
      <h3 class="font-bold mb-3">Search Results:</h3>
      <div class="grid gap-4 max-w-3xl">
        {#each result as item}
          <div class="border rounded p-4 grid grid-cols-[100px_220px_1fr] gap-4">
            <div class="w-[100px]">
              {#if item.image_url}
                <img src={item.image_url} alt="Page preview" class="w-full h-auto object-contain" />
              {/if}
            </div>
            <div class="flex flex-col">
              {#if $issueMap[item.parent_issue_id]}
                <div class="text-sm text-gray-600" style="display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">
                  {@html $issueMap[item.parent_issue_id].description}
                </div>
                <div class="flex gap-2 mt-2 text-sm">
                  <a href={$issueMap[item.parent_issue_id].internet_archive} class="text-blue-500 hover:underline" target="_blank">Archive</a>
                  <a href={$issueMap[item.parent_issue_id].issue_url} class="text-blue-500 hover:underline" target="_blank">Info</a>
                  <a href={$issueMap[item.parent_issue_id].pdf_download} class="text-blue-500 hover:underline" target="_blank">PDF</a>
                </div>
                <div class="mt-2 text-sm">
                  <div class="font-bold">{collectionMap[$issueMap[item.parent_issue_id].collection]}</div>
                  <div>Published: {$issueMap[item.parent_issue_id].pub_date}</div>
                  <div>Page {item.page_number}/{$issueMap[item.parent_issue_id].num_pages}</div>
                </div>
              {/if}
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
