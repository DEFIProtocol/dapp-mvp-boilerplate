/**
 * Global localStorage polyfill that prevents SecurityError crashes
 * This must be imported BEFORE any other code that might access localStorage
 */

if (typeof window !== "undefined") {
  const memoryStorage = new Map<string, string>();
  let isLocalStorageAvailable = false;

  // Test if localStorage is actually available
  try {
    const testKey = "__ls_test__";
    window.localStorage.setItem(testKey, "test");
    window.localStorage.removeItem(testKey);
    isLocalStorageAvailable = true;
  } catch (e) {
    console.warn("localStorage is not available, using memory fallback");
    isLocalStorageAvailable = false;
  }

  // If localStorage is not available, replace it with a safe implementation
  if (!isLocalStorageAvailable) {
    const safeLocalStorage = {
      getItem(key: string): string | null {
        return memoryStorage.get(key) ?? null;
      },
      setItem(key: string, value: string): void {
        memoryStorage.set(key, value);
      },
      removeItem(key: string): void {
        memoryStorage.delete(key);
      },
      clear(): void {
        memoryStorage.clear();
      },
      key(index: number): string | null {
        const keys = Array.from(memoryStorage.keys());
        return keys[index] ?? null;
      },
      get length(): number {
        return memoryStorage.size;
      },
    };

    // Replace the native localStorage with our safe implementation
    try {
      Object.defineProperty(window, "localStorage", {
        value: safeLocalStorage,
        writable: false,
        configurable: true,
      });
    } catch (e) {
      // If we can't redefine, at least log it
      console.error("Could not polyfill localStorage:", e);
    }
  }
}

export {};
