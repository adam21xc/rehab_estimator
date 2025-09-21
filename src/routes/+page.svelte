<script lang="ts">
  let dryResult: any = null;
  let sendResult: any = null;
  let scanResult: any = null;
  let gmailResult: any = null;

  // Inputs for the Gmail test endpoint
  let toEmail: string = '';
  let testSubject: string = 'Test email from SvelteKit';
  let testMessage: string = 'Hello, this is a test from the admin page.';

  async function dryRun() {
    dryResult = await (await fetch('/api/send-due?dry=1', { method: 'POST' })).json();
  }
  async function sendDue() {
    sendResult = await (await fetch('/api/send-due', { method: 'POST' })).json();
  }
  async function scanReplies() {
    scanResult = await (await fetch('/api/scan-replies', { method: 'POST' })).json();
  }

  async function gmailTest() {
    try {
      const res = await fetch('/api/gmail-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: toEmail || 'your@email.com',
          subject: testSubject,
          message: testMessage
        })
      });
      gmailResult = await res.json();
    } catch (err) {
      gmailResult = { ok: false, error: String(err) };
    }
  }
</script>

<div class="p-6 space-y-6">
  <h1 class="text-2xl font-semibold">Outreach Admin</h1>

  <div class="grid gap-3 max-w-xl">
    <label class="flex flex-col gap-1">
      <span class="text-sm font-medium">Test email recipient</span>
      <input
        class="border rounded px-3 py-2"
        type="email"
        bind:value={toEmail}
        placeholder="you@domain.com"
        aria-label="Gmail test recipient email"
      />
    </label>

    <label class="flex flex-col gap-1">
      <span class="text-sm font-medium">Test subject</span>
      <input
        class="border rounded px-3 py-2"
        type="text"
        bind:value={testSubject}
        aria-label="Gmail test subject"
      />
    </label>

    <label class="flex flex-col gap-1">
      <span class="text-sm font-medium">Test message</span>
      <!-- svelte-ignore element_invalid_self_closing_tag -->
      <textarea
        class="border rounded px-3 py-2"
        rows="3"
        bind:value={testMessage}
        aria-label="Gmail test message"
      />
    </label>
  </div>

  <div class="flex gap-3">
    <button class="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300" on:click={dryRun}>Dry Run (preview)</button>
    <button class="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700" on:click={sendDue}>Send Due</button>
    <button class="px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700" on:click={scanReplies}>Scan Replies</button>
    <button class="px-4 py-2 rounded bg-purple-600 text-white hover:bg-purple-700" on:click={gmailTest}>Gmail Test</button>
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

   {#if gmailResult}
    <section class="border rounded p-4">
      <h2 class="font-medium mb-2">Gmail Test</h2>
      <pre class="text-sm overflow-auto">{JSON.stringify(gmailResult, null, 2)}</pre>
    </section>
  {/if}
</div>