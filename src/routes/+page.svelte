<script lang="ts">
  let dryResult: any = null;
  let sendResult: any = null;
  let scanResult: any = null;

  async function dryRun() {
    dryResult = await (await fetch('/api/send-due?dry=1', { method: 'POST' })).json();
  }
  async function sendDue() {
    sendResult = await (await fetch('/api/send-due', { method: 'POST' })).json();
  }
  async function scanReplies() {
    scanResult = await (await fetch('/api/scan-replies', { method: 'POST' })).json();
  }
</script>

<div class="p-6 space-y-6">
  <h1 class="text-2xl font-semibold">Outreach Admin</h1>

  <div class="flex gap-3">
    <button class="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300" on:click={dryRun}>Dry Run (preview)</button>
    <button class="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700" on:click={sendDue}>Send Due</button>
    <button class="px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700" on:click={scanReplies}>Scan Replies</button>
  </div>

  {#if dryResult}
    <section class="border rounded p-4">
      <h2 class="font-medium mb-2">Dry Run</h2>
      <pre class="text-sm overflow-auto">{JSON.stringify(dryResult, null, 2)}</pre>
    </section>
  {/if}

  {#if sendResult}
    <section class="border rounded p-4">
      <h2 class="font-medium mb-2">Send Result</h2>
      <pre class="text-sm overflow-auto">{JSON.stringify(sendResult, null, 2)}</pre>
    </section>
  {/if}

  {#if scanResult}
    <section class="border rounded p-4">
      <h2 class="font-medium mb-2">Scan Replies</h2>
      <pre class="text-sm overflow-auto">{JSON.stringify(scanResult, null, 2)}</pre>
    </section>
  {/if}
</div>