/**
 * Global localStorage polyfill that prevents SecurityError crashes
 * This must be imported BEFORE any other code that might access localStorage
 */

if (typeof window !== "undefined") {
  const memoryStorage = new Map<string, string>();
  let nativeLocalStorage: Storage | null = null;
  
  // Try to get a reference to the native localStorage
  try {
    nativeLocalStorage = window.localStorage;
    // Test if it actually works
    const testKey = "__ls_test__";
    nativeLocalStorage.setItem(testKey, "test");
    nativeLocalStorage.removeItem(testKey);
  } catch (e) {
    // localStorage is blocked, we'll use memory storage
    nativeLocalStorage = null;
    console.warn("localStorage is blocked, using memory fallback");
  }
  
  // Create safe localStorage implementation
  const safeLocalStorage = {
    getItem(key: string): string | null {
      if (nativeLocalStorage) {
        try {
          return nativeLocalStorage.getItem(key);
        } catch (e) {
          return memoryStorage.get(key) ?? null;
        }
      }
      return memoryStorage.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      if (nativeLocalStorage) {
        try {
          nativeLocalStorage.setItem(key, value);
          return;
        } catch (e) {
          // Fall through to memory storage
        }
      }
      memoryStorage.set(key, value);
    },
    removeItem(key: string): void {
      if (nativeLocalStorage) {
        try {
          nativeLocalStorage.removeItem(key);
          return;
        } catch (e) {
          // Fall through to memory storage
        }
      }
      memoryStorage.delete(key);
    },
    clear(): void {
      if (nativeLocalStorage) {
        try {
          nativeLocalStorage.clear();
          return;
        } catch (e) {
          // Fall through to memory storage
        }
      }
      memoryStorage.clear();
    },
    key(index: number): string | null {
      if (nativeLocalStorage) {
        try {
          return nativeLocalStorage.key(index);
        } catch (e) {
          // Fall through to memory storage
        }
      }
      const keys = Array.from(memoryStorage.keys());
      return keys[index] ?? null;
    },
    get length(): number {
      if (nativeLocalStorage) {
        try {
          return nativeLocalStorage.length;
        } catch (e) {
          // Fall through to memory storage
        }
      }
      return memoryStorage.size;
    },
  };

  // Replace localStorage immediately, before any access attempts
  try {
    Object.defineProperty(window, "localStorage", {
      value: safeLocalStorage,
      writable: false,
      configurable: true,
    });
    console.log("localStorage polyfill installed successfully");
  } catch (e) {
    console.error("Could not polyfill localStorage:", e);
  }
}

export {};
