export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface ActionTask {
  id: string;
  serviceName: string;
  action: string;
  status: 'processing' | 'completed' | 'failed';
  result?: string;
}

export interface BrowserGeoLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: number;
}

export type AgentId = 'maximus' | 'beatrice';
export type VisualMode = 'off' | 'front' | 'back' | 'screen';
export type ConversationSeedMode = 'memory' | 'news' | 'idea' | 'quiet';
export type ToolKey = 'gmail' | 'drive' | 'context' | 'vision';
export type ToolToggleMap = Record<ToolKey, boolean>;

export interface AgentProfile {
  id: AgentId;
  label: string;
  voiceName: string;
  systemPrompt: string;
  description: string;
}

export interface StoredAgentSettings {
  systemPrompt: string;
  avatarUrl?: string;
}

export interface AgentSettings {
  agentId: AgentId;
  personaName: string;
  systemPrompt: string;
  avatarUrl: string;
  agents: Record<AgentId, StoredAgentSettings>;
  persistentBasePrompt: string;
  visualMode?: VisualMode;
  conversationSeedMode?: ConversationSeedMode;
  enabledTools?: ToolToggleMap;
  autoDescribeVisual?: boolean;
}

export interface ToolInteractionModal {
  id: string;
  title: string;
  serviceName: string;
  action: string;
  status: 'processing' | 'completed' | 'failed';
  message: string;
  result?: string;
}

// --- New types for improvements ---

export interface TranscriptEntry {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  isComplete: boolean;
  toolResults?: ToolCallSummary[];
}

export interface ToolCallSummary {
  id: string;
  serviceName: string;
  action: string;
}

export type ToolCallStatus = 'pending_confirmation' | 'confirmed' | 'denied' | 'processing' | 'completed' | 'failed' | 'dismissed';
export type ActionRisk = 'read' | 'write' | 'destructive';

export interface ToolCallEntry {
  id: string;
  serviceName: string;
  action: string;
  status: ToolCallStatus;
  result?: string;
  error?: string;
  startedAt: number;
  completedAt?: number;
  dismissed: boolean;
  risk: ActionRisk;
}

export interface PendingToolCall {
  id: string;
  serviceName: string;
  action: string;
  details: Record<string, unknown>;
  callRef: { id: string; name: string };
  risk: ActionRisk;
}

export interface OAuthScopeDef {
  id: string;
  label: string;
  scope: string;
  category: string;
  risk: 'read' | 'write' | 'admin';
  requiredFor: string;
}

export interface OAuthScopeState extends OAuthScopeDef {
  granted: boolean;
}

export interface EburonContextValue {
  user: import('firebase/auth').User;
  settings: AgentSettings;
  setSettings: React.Dispatch<React.SetStateAction<AgentSettings>>;
  activeAgent: AgentProfile;
  isActive: boolean;
  connecting: boolean;
  isAgentSpeaking: boolean;
  isMuted: boolean;
  visualMode: VisualMode;
  connectionError: string;
  permissionStatus: string;
  screenShareSupported: boolean;
  transcriptEntries: TranscriptEntry[];
  streamingText: string | null;
  streamingRole: 'user' | 'model' | null;
  toolCalls: ToolCallEntry[];
  pendingConfirmation: PendingToolCall | null;
  showSidebar: boolean;
  showProfile: boolean;
  showVisualPage: boolean;
  showViewport: boolean;
  toolModal: ToolInteractionModal | null;
  userAudioLevel: number;
  speakerPulseLevel: number;
  onLogout: () => void;
  startSession: () => void;
  stopSession: () => void;
  setIsMuted: (v: boolean) => void;
  startCameraInput: (facingMode: 'user' | 'environment') => void;
  startScreenShare: () => void;
  switchCamera: () => void;
  openVisualPage: () => void;
  stopVisualInput: () => void;
  setShowSidebar: (v: boolean) => void;
  setShowProfile: (v: boolean) => void;
  setShowVisualPage: (v: boolean) => void;
  setShowViewport: (v: boolean) => void;
  setToolModal: (v: ToolInteractionModal | null) => void;
  confirmToolCall: (id: string) => void;
  denyToolCall: (id: string) => void;
  dismissToolCall: (id: string) => void;
  clearTranscript: () => void;
  persistSettings: (s: AgentSettings) => Promise<void>;
  updateAgent: (agentId: AgentId) => void;
}
