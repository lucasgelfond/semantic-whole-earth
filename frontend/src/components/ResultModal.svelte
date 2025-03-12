<script lang="ts">
  export let item: any;
  export let issue: any;
  export let collectionMap: Record<string, string>;
</script>

<div class="h-screen p-8">
  <div class="grid grid-cols-[1fr_600px] gap-12 h-full">
    {#if item.image_url}
      <div class="h-full">
        <img src={item.image_url} alt="Page preview" class="h-full w-full object-contain" />
      </div>
    {/if}
    <div class="flex flex-col gap-6 overflow-y-auto">
      {#if issue}
        <div class="text-2xl font-bold">{collectionMap[issue.collection]}</div>
        <div class="text-gray-600 text-lg">{@html issue.description}</div>
        <div class="flex gap-6 text-base">
          <a 
            href={issue.internet_archive} 
            class="text-blue-500 hover:underline" 
            target="_blank"
            on:click|stopPropagation
          >
            View in Archive
          </a>
          <a 
            href={issue.issue_url} 
            class="text-blue-500 hover:underline" 
            target="_blank"
            on:click|stopPropagation
          >
            Issue Info
          </a>
          <a 
            href={issue.pdf_download} 
            class="text-blue-500 hover:underline" 
            target="_blank"
            on:click|stopPropagation
          >
            Download PDF
          </a>
        </div>
        <div class="text-base">
          <div>Published: {issue.pub_date}</div>
          <div>Page {item.page_number}/{issue.num_pages}</div>
        </div>
      {/if}
      <div class="text-lg leading-relaxed">
        {item.ocr_result}
      </div>
    </div>
  </div>
</div>