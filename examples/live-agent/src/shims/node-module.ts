export function createRequire() {
  return function browserRequire() {
    throw new Error("createRequire is not available in the browser build.");
  };
}
