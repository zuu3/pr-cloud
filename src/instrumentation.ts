export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { seedAdmin } = await import("./lib/seed");
      await seedAdmin();
    } catch (e) {
      console.warn("seedAdmin on boot failed", e);
    }
  }
}
