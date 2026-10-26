// Windows cannot unlink SQLite files while their adapter holds them open.
// Close only the test worker's adapter before removing its temporary DATA_DIR.
export function closeTestDb() {
  const state = global._dbAdapter;
  state?.instance?.close();
  if (state) {
    state.instance = null;
    state.initPromise = null;
    state.logged = false;
  }
}
