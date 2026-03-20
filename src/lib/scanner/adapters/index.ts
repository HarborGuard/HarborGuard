import { IScannerAdapter } from '../types';

class ScannerAdapterRegistry {
  private static adapters = new Map<string, IScannerAdapter>();

  static register(adapter: IScannerAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  static get(name: string): IScannerAdapter | undefined {
    return this.adapters.get(name);
  }

  static getAll(): IScannerAdapter[] {
    return Array.from(this.adapters.values());
  }
}

export { ScannerAdapterRegistry };
