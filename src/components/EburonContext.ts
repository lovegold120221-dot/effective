import { createContext, useContext } from 'react';
import type { EburonContextValue } from '../lib/types';

export const EburonContext = createContext<EburonContextValue | null>(null);

export function useEburon(): EburonContextValue {
  const ctx = useContext(EburonContext);
  if (!ctx) throw new Error('useEburon must be used within EburonProvider');
  return ctx;
}
