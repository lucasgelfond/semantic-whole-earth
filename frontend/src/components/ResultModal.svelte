<script lang="ts">
  import { onMount } from 'svelte';
  import { writable } from 'svelte/store';
  import type { PageMap, PageData } from '$lib/pageUtils';
  import { fetchAllPages } from '$lib/pageUtils';
  import IssueInformation from './IssueInformation.svelte';
  
  export let item: PageData;
  export let issue: any;
  export let collectionMap: Record<string, string>;

  const currentPageNumber = writable(Number(item.page_number) || 1);
  const allPages = writable<PageMap>({});
  const loading = writable(false);

  async function loadAllPages() {
    loading.set(true);
    try {
      const pages = await fetchAllPages(issue.id);
      allPages.set(pages);
    } finally {
      loading.set(false);
    }
  }

  function changePage(newPageNumber: number) {
    if ($loading) return;
    newPageNumber = Number(newPageNumber);
    if (newPageNumber < 1 || newPageNumber > issue.num_pages) return;
    if (!$allPages[newPageNumber]) return;
    
    currentPageNumber.set(newPageNumber);
  }

  // Handle keyboard navigation
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft' && $currentPageNumber > 1) {
      changePage($currentPageNumber - 1);
    } else if (event.key === 'ArrowRight' && $currentPageNumber < issue.num_pages) {
      changePage($currentPageNumber + 1);
    }
  }

  let cleanup: () => void;

  onMount(() => {
    // Set the initial page
    allPages.set({ [item.page_number]: item });
    window.addEventListener('keydown', handleKeydown);
    cleanup = () => window.removeEventListener('keydown', handleKeydown);
    
    // Load all pages
    loadAllPages();
    
    return cleanup;
  });

</script>

<div class="flex flex-col h-screen p-8">
  <div class="flex flex-1 gap-12">
    <div class="flex flex-col flex-1">
      <div class="flex flex-col items-center bg-gray-50 relative">
        {#if $allPages[$currentPageNumber]?.image_url}
          <img 
            src={$allPages[$currentPageNumber].image_url} 
            alt="Page {$currentPageNumber}" 
            class="w-full h-auto object-contain" 
          />
          
          <!-- Navigation arrows -->
          <div class="absolute inset-x-0 top-1/2 flex justify-between px-4 transform -translate-y-1/2 pointer-events-none">
            <button 
              class="pointer-events-auto bg-black/50 text-white p-4 rounded-full hover:bg-black/70 disabled:opacity-30 disabled:cursor-not-allowed"
              disabled={$currentPageNumber <= 1 || $loading || !$allPages[$currentPageNumber - 1]}
              on:click={() => changePage($currentPageNumber - 1)}
            >
              ←
            </button>
            <button 
              class="pointer-events-auto bg-black/50 text-white p-4 rounded-full hover:bg-black/70 disabled:opacity-30 disabled:cursor-not-allowed"
              disabled={$currentPageNumber >= issue.num_pages || $loading || !$allPages[$currentPageNumber + 1]}
              on:click={() => changePage($currentPageNumber + 1)}
            >
              →
            </button>
          </div>
        {/if}
      </div>
    </div>

    <div class="flex flex-col gap-6 overflow-y-auto w-[600px]">
      <IssueInformation 
        {issue}
        {collectionMap}
        currentPageNumber={$currentPageNumber}
      />
      
      <div class="text-lg leading-relaxed">
        {$allPages[$currentPageNumber]?.ocr_result}
      </div>
    </div>
  </div>
</div>