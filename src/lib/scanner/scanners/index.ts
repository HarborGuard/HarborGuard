import { TrivyScanner } from './TrivyScanner';
import { GrypeScanner } from './GrypeScanner';
import { SyftScanner } from './SyftScanner';
import { OSVScanner } from './OSVScanner';
import { DockleScanner } from './DockleScanner';
import { DiveScanner } from './DiveScanner';
import { IScannerBase } from '../types';

export const AVAILABLE_SCANNERS: IScannerBase[] = [
  new TrivyScanner(),
  new GrypeScanner(),
  new SyftScanner(),
  new OSVScanner(),
  new DockleScanner(),
  new DiveScanner(),
];

export function getScannerByName(name: string): IScannerBase | undefined {
  return AVAILABLE_SCANNERS.find(scanner => scanner.name === name);
}

export async function getScannerVersions(): Promise<Record<string, string>> {
  const versions: Record<string, string> = {};
  
  for (const scanner of AVAILABLE_SCANNERS) {
    versions[scanner.name] = await scanner.getVersion();
  }
  
  return versions;
}

export {
  TrivyScanner,
  GrypeScanner,
  SyftScanner,
  OSVScanner,
  DockleScanner,
  DiveScanner,
};