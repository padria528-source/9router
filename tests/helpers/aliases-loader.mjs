// Match the aliases in vitest.config.js for the native node:test suites.
// Resolve only local project modules; all other imports use Node's resolver.
export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    return nextResolve(new URL(`../../src/${specifier.slice(2)}`, import.meta.url).href, context);
  }
  if (specifier.startsWith("open-sse/")) {
    return nextResolve(new URL(`../../open-sse/${specifier.slice(9)}`, import.meta.url).href, context);
  }
  return nextResolve(specifier, context);
}
