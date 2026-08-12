const callbackUrl = process.env.ANALYSIS_SANDBOX_CALLBACK_URL?.trim();
const callbackToken = process.env.ANALYSIS_SANDBOX_CALLBACK_TOKEN?.trim();
const sandboxName = process.env.ANALYSIS_SANDBOX_NAME?.trim();
const jobId = process.env.ANALYSIS_SANDBOX_JOB_ID?.trim();
const exitCode = Number.parseInt(process.argv[2] || "", 10);

if (!callbackUrl || !callbackToken || !sandboxName || !jobId) {
  process.exit(0);
}

try {
  const response = await fetch(callbackUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${callbackToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jobId,
      sandboxName,
      ...(Number.isInteger(exitCode) ? { exitCode } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`shutdown callback returned HTTP ${response.status}`);
  }

  console.log(`[DRIVXIS Sandbox] Shutdown requested for ${sandboxName}`);
} catch (error) {
  console.error(
    `[DRIVXIS Sandbox] Could not request immediate shutdown; the timeout remains active: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
}
