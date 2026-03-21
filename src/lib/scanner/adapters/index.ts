import { IScannerAdapter } from '../types';
import { TrivyAdapter } from './TrivyAdapter';
import { GrypeAdapter } from './GrypeAdapter';
import { SyftAdapter } from './SyftAdapter';
import { DockleAdapter } from './DockleAdapter';
import { OsvAdapter } from './OsvAdapter';
import { DiveAdapter } from './DiveAdapter';
import { ScoutAdapter } from './ScoutAdapter';

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

// Register all built-in scanner adapters
ScannerAdapterRegistry.register(new TrivyAdapter());
ScannerAdapterRegistry.register(new GrypeAdapter());
ScannerAdapterRegistry.register(new SyftAdapter());
ScannerAdapterRegistry.register(new DockleAdapter());
ScannerAdapterRegistry.register(new OsvAdapter());
ScannerAdapterRegistry.register(new DiveAdapter());
ScannerAdapterRegistry.register(new ScoutAdapter());

export { ScannerAdapterRegistry };
export { TrivyAdapter } from './TrivyAdapter';
export { GrypeAdapter } from './GrypeAdapter';
export { SyftAdapter } from './SyftAdapter';
export { DockleAdapter } from './DockleAdapter';
export { OsvAdapter } from './OsvAdapter';
export { DiveAdapter } from './DiveAdapter';
export { ScoutAdapter } from './ScoutAdapter';
