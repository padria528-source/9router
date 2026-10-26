export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initConsoleLogCapture } = await import("@/lib/consoleLogBuffer");
    initConsoleLogCapture();

    // Server-only: lets capabilities.js read the synced catalog without pulling
    // node:fs into the dashboard's browser bundle.
    const { installCatalogSource } = await import("open-sse/providers/catalogOverride.js");
    await installCatalogSource();

    const { startModelCatalogSync } = await import("@/lib/modelCatalog/sync.js");
    startModelCatalogSync();

    // Bootstrap database adapter eagerly so it's ready before traffic arrives
    const { getAdapter } = await import("@/lib/db/driver.js");
    getAdapter().catch((err) => {
      console.error("[DB] Background startup initialization failed:", err?.message || err);
    });
  }
}
