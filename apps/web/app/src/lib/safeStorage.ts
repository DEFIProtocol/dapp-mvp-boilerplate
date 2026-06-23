/**
 * Safe localStorage wrapper that handles SecurityError and other exceptions
 * This prevents crashes in mobile browsers, private browsing mode, and iframes
 */

class SafeStorage {
  private isAvailable: boolean;
  private memoryFallback: Map<string, string>;

  constructor() {
    this.memoryFallback = new Map();
    this.isAvailable = this.checkAvailability();
  }

  private checkAvailability(): boolean {
    try {
      if (typeof window === "undefined" || !window.localStorage) {
        return false;
      }
      // Test if we can actually use localStorage
      const testKey = "__storage_test__";
      window.localStorage.setItem(testKey, "test");
      window.localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      console.warn("localStorage is not available, using memory fallback:", e);
      return false;
    }
  }

  getItem(key: string): string | null {
    try {
      if (this.isAvailable) {
        return window.localStorage.getItem(key);
      }
      return this.memoryFallback.get(key) ?? null;
    } catch (e) {
      console.warn(`Error reading from storage (${key}):`, e);
      return this.memoryFallback.get(key) ?? null;
    }
  }

  setItem(key: string, value: string): void {
    try {
      if (this.isAvailable) {
        window.localStorage.setItem(key, value);
      }
      // Always update memory fallback as backup
      this.memoryFallback.set(key, value);
    } catch (e) {
      console.warn(`Error writing to storage (${key}):`, e);
      // Fallback to memory storage
      this.memoryFallback.set(key, value);
    }
  }

  removeItem(key: string): void {
    try {
      if (this.isAvailable) {
        window.localStorage.removeItem(key);
      }
      this.memoryFallback.delete(key);
    } catch (e) {
      console.warn(`Error removing from storage (${key}):`, e);
      this.memoryFallback.delete(key);
    }
  }

  clear(): void {
    try {
      if (this.isAvailable) {
        window.localStorage.clear();
      }
      this.memoryFallback.clear();
    } catch (e) {
      console.warn("Error clearing storage:", e);
      this.memoryFallback.clear();
    }
  }
}

// Export singleton instance
export const safeStorage = new SafeStorage();
