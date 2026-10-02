export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getDb } = await import("./server/db");
    const { startWorker } = await import("./server/worker");
    try {
      getDb(); // validates config and applies migrations at boot
    } catch (err) {
      console.error(err);
      process.exit(1); // refuse to run (KTD13); Next would otherwise stay up serving 500s
    }
    startWorker();
  }
}
