import type { ActionRisk, OAuthScopeDef } from './types';

const WRITE_PATTERNS = /send|compose|draft|create|add|insert|schedule|invite|upload|update|modify|write|set|post|put|share|grant/i;
const DESTRUCTIVE_PATTERNS = /delete|remove|trash|permanent|destroy|erase|purge|unsubscribe|revoke/i;

export function classifyActionRisk(action: string, _serviceName: string): ActionRisk {
  if (DESTRUCTIVE_PATTERNS.test(action)) return 'destructive';
  if (WRITE_PATTERNS.test(action)) return 'write';
  return 'read';
}

export function requiresConfirmation(action: string, serviceName: string): boolean {
  return classifyActionRisk(action, serviceName) !== 'read';
}

export const OAUTH_SCOPES: OAuthScopeDef[] = [
  {
    id: 'gmail.read',
    label: 'Read Gmail',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    category: 'gmail',
    risk: 'read',
    requiredFor: 'Reading emails, searching inbox',
  },
  {
    id: 'gmail.send',
    label: 'Send Gmail',
    scope: 'https://www.googleapis.com/auth/gmail.send',
    category: 'gmail',
    risk: 'write',
    requiredFor: 'Composing and sending emails',
  },
  {
    id: 'gmail.modify',
    label: 'Manage Gmail',
    scope: 'https://www.googleapis.com/auth/gmail.modify',
    category: 'gmail',
    risk: 'write',
    requiredFor: 'Labeling, archiving, marking read',
  },
  {
    id: 'drive.read',
    label: 'Read Drive',
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    category: 'drive',
    risk: 'read',
    requiredFor: 'Searching and reading files',
  },
  {
    id: 'drive.file',
    label: 'Modify Drive',
    scope: 'https://www.googleapis.com/auth/drive.file',
    category: 'drive',
    risk: 'write',
    requiredFor: 'Creating and editing files',
  },
  {
    id: 'calendar.read',
    label: 'Read Calendar',
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    category: 'calendar',
    risk: 'read',
    requiredFor: 'Checking schedule, finding free time',
  },
  {
    id: 'calendar.events',
    label: 'Manage Calendar',
    scope: 'https://www.googleapis.com/auth/calendar.events',
    category: 'calendar',
    risk: 'write',
    requiredFor: 'Creating and modifying events',
  },
  {
    id: 'contacts.read',
    label: 'Read Contacts',
    scope: 'https://www.googleapis.com/auth/contacts.readonly',
    category: 'contacts',
    risk: 'read',
    requiredFor: 'Looking up contact information',
  },
  {
    id: 'maps.read',
    label: 'Maps & Places',
    scope: '',
    category: 'maps',
    risk: 'read',
    requiredFor: 'Location, directions, place search (uses browser geolocation)',
  },
];

export const SERVICE_COLORS: Record<string, string> = {
  Gmail: 'border-red-500/50 bg-red-500/10 text-red-300',
  Calendar: 'border-blue-500/50 bg-blue-500/10 text-blue-300',
  Drive: 'border-green-500/50 bg-green-500/10 text-green-300',
  YouTube: 'border-red-600/50 bg-red-600/10 text-red-400',
  Maps: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300',
  Weather: 'border-sky-500/50 bg-sky-500/10 text-sky-300',
  Places: 'border-orange-500/50 bg-orange-500/10 text-orange-300',
  Contacts: 'border-purple-500/50 bg-purple-500/10 text-purple-300',
  Sheets: 'border-green-600/50 bg-green-600/10 text-green-400',
  Docs: 'border-blue-600/50 bg-blue-600/10 text-blue-400',
  Slides: 'border-yellow-500/50 bg-yellow-500/10 text-yellow-300',
  Tasks: 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300',
  default: 'border-amber-500/50 bg-amber-500/10 text-amber-300',
};

export function getServiceColor(serviceName: string): string {
  return SERVICE_COLORS[serviceName] || SERVICE_COLORS.default;
}

export function getServiceStatusColorClass(status: string): string {
  switch (status) {
    case 'pending_confirmation': return 'bg-yellow-500';
    case 'processing': return 'bg-amber-500 animate-pulse';
    case 'completed': return 'bg-emerald-500';
    case 'failed': return 'bg-red-500';
    case 'denied': return 'bg-zinc-500';
    case 'dismissed': return 'bg-zinc-700';
    default: return 'bg-zinc-600';
  }
}
