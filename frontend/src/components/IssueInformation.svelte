<script lang="ts">
  export let issue: any;
  export let collectionMap: Record<string, string>;
  export let currentPageNumber: number;
</script>

<div class="flex flex-col gap-6">
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
  <div class="flex flex-col text-base">
    <div>Published: {issue.pub_date}</div>
    <div>Page {currentPageNumber}/{issue.num_pages}</div>
  </div>
</div> 