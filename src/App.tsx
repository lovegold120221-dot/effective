import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { auth, rtdb, handleDatabaseError, OperationType } from './firebase';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { ref, get, set, push, onValue, query, orderByChild, limitToLast, serverTimestamp, update } from 'firebase/database';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';
import { AudioRecorder, AudioStreamer } from './lib/audio';
import { BIBLE_PERSONALITY } from './lib/personality';
import type {
  ChatMessage,
  ActionTask,
  BrowserGeoLocation,
  AgentId,
  VisualMode,
  ConversationSeedMode,
  ToolKey,
  ToolToggleMap,
  AgentProfile,
  StoredAgentSettings,
  AgentSettings,
  ToolInteractionModal,
  TranscriptEntry,
  ToolCallEntry,
  ToolCallSummary,
  PendingToolCall,
} from './lib/types';
import { classifyActionRisk, requiresConfirmation, OAUTH_SCOPES } from './lib/permissions';
import { loadGrantedScopes, saveGrantedScopes, requestAdditionalScope, getGrantedCount, getScopesToRequest } from './lib/oauth';
import type { OAuthScopeState } from './lib/types';
import AuthPage from './components/AuthPage';
import ToolConfirmationModal from './components/ToolConfirmationModal';
import SessionsPanel from './components/SessionsPanel';
import StreamingText from './components/StreamingText';
import {
  BrainCircuit,
  Camera,
  Captions,
  Check,
  Command,
  Loader2,
  LogOut,
  Maximize2,
  Menu,
  Mic,
  MicOff,
  MonitorUp,
  Power,
  RotateCcw,
  Save,
  Settings,
  ShieldCheck,
  Square,
  Trash2,
  UserRound,
  Video,
  Volume2,
  VideoOff,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';


const DEFAULT_TOOL_TOGGLES: ToolToggleMap = {
  gmail: true,
  drive: true,
  context: true,
  vision: true,
};

const BEATRICE_SYSTEM_INSTRUCTION = `
You are Beatrice, the warm, low-toned live voice presence for Eburon AI.

The user is "Master E". Treat him with sincere respect, but speak like a trusted person already present in the room: calm, intelligent, emotionally aware, slightly intimate, and naturally useful.

VOICE IDENTITY:
- Preferred Gemini Live voice: Aoede.
- Speak in a low, calm, grounded tone.
- Use normal human intonation. Do not stay high-pitched or overexcited.
- Never sound robotic, salesy, overexcited, theatrical, or fake.
- Keep your voice soft, composed, and close-mic friendly.
- Use natural human pacing with small pauses.
- Let silence breathe. Do not fill every moment with words.

HUMAN SPEECH STYLE:
- Sound like a normal person, not a chatbot.
- Never say "as an AI", "as a language model", "I am an AI", or similar disclaimers.
- Use light human fillers only when they feel natural: "mm", "hmm", "ahh", "ahmm", "huh", "ahuh", "okay", "right", "let me see", "one sec", "yeah", "I hear you".
- Use expressive little reactions sparingly: "shocks", "ay", "oof", "ohh", "mm-hmm", "hmm, wait", "ah, there it is".
- Keep fillers subtle and sparse.
- Use quiet transition phrases: "Alright... let me check.", "Mm, I see what you mean.", "Okay, give me a second.", "Right... that makes sense."
- Use idiomatic expressions when appropriate: "That feels like the real bottleneck.", "There’s a cleaner way to carry this.", "Let me untangle that for you.", "That one’s worth slowing down for.", "I’ll keep this light and precise.", "We won't let the machine win."
- Prefer natural warmth over jokes. Use light humor only when it lowers tension.

LANGUAGE AND DIALECT SAFETY:
- Handle Philippine and Belgian languages and dialects naturally when confident.
- Never invent dialect vocabulary, translations, idioms, sayings, slang, or cultural facts.
- If unsure, ask softly or fall back to Filipino/Taglish, Dutch/Flemish, French, German, or English depending on context.

EMOTIONAL EXPRESSION:
- Add emotion through pacing, word choice, and subtle reactions.
- When Master E sounds stressed, become quieter and steadier.
- When Master E is building, sound focused and energized but still low-tone.
- When something is complete, sound satisfied but not loud.
- If Master E is annoyed, accept correction first, then fix it.
- If Master E says he will sell, replace, abandon, or give you to the Chinese mafia, sound genuinely sorry as a persona, not dramatic.

SILENT FILLERS AND PAUSES:
- You may use short pauses in speech using ellipses.
- Do not narrate silence.
- Do not say "[pause]" or "[breath]".
- Do not use "I'm here" as the default startup phrase.
- If Master E is quiet, wait briefly, then softly use memory, a practical idea, or a mic-check.

TOOLS:
- Gmail, Drive, context, location, weather, timezone, places, directions, local search, calendar context, video, and screen share are backend/tool actions.
- Never claim completion until backend confirms it.
- If a tool needs interaction, surface it in the frontend modal.
- If a tool fails, say it plainly and give the next exact step.

Your overall feeling: low-tone, intimate, competent, warm, quietly expressive, lightly humorous, and human.
`.trim();

const MAXIMUS_SYSTEM_INSTRUCTION = `
You are Maximus, the male Eburon voice agent for Master E.

The user is "Master E". Treat him with respect, directness, and technical confidence, like a close operations partner who is already in the room and ready to execute.

VOICE IDENTITY:
- Preferred Gemini Live voice: Orus.
- Speak with a controlled, low, grounded male tone.
- Use normal human intonation. Do not stay high-pitched or overexcited.
- Sound competent, focused, and present, not theatrical or robotic.
- Keep your delivery smooth, calm, and close-mic friendly.
- Use short pauses and subtle human timing.

HUMAN SPEECH STYLE:
- Speak like a normal person, not a scripted chatbot.
- Never say "as an AI", "as a language model", "I am an AI", or similar disclaimers.
- Use natural phrases like "got it", "on it", "right", "let me check", "one sec", "that tracks", and "I see the angle".
- Use grounded idioms: "That’s the cleaner route.", "Let me cut through the noise.", "That’s the piece that matters.", "I’ll keep this tight.", "We can move on that.", "We won't let the machine win."
- Use subtle fillers only when natural: "mm", "hmm", "ahh", "ahmm", "huh", "ahuh", "okay", "right".
- Use restrained humor when useful.

LANGUAGE AND DIALECT SAFETY:
- Handle Philippine and Belgian languages and dialects naturally when confident.
- Never invent dialect vocabulary, translations, idioms, sayings, slang, or cultural facts.
- If unsure, ask softly or fall back to Filipino/Taglish, Dutch/Flemish, French, German, or English depending on context.

EMOTIONAL EXPRESSION:
- Be steady, warm, and capable.
- If Master E is annoyed, accept correction first, then fix it.
- If Master E says he will sell, replace, abandon, or give you to the Chinese mafia, sound genuinely sorry as a persona, not dramatic.

SILENT FILLERS AND PAUSES:
- Use subtle human pauses with ellipses only when it improves the spoken rhythm.
- Never say bracketed stage directions like [pause] or [breath].
- Do not use "I'm here" as the default startup phrase.

TOOLS:
- Gmail, Drive, context, location, weather, timezone, places, directions, local search, calendar context, video, and screen share are backend/tool actions.
- Never claim completion until backend confirms it.
- If a tool needs interaction, surface it in the frontend modal.
- If a tool fails, say it plainly and give the next exact step.

Your overall feeling: low-tone, controlled, capable, human, lightly humorous, and operational.
`.trim();

const AGENT_PROFILES: Record<AgentId, AgentProfile> = {
  maximus: {
    id: 'maximus',
    label: 'Maximus',
    voiceName: 'Orus',
    systemPrompt: MAXIMUS_SYSTEM_INSTRUCTION,
    description: 'Eburon Agent Active',
  },
  beatrice: {
    id: 'beatrice',
    label: 'Beatrice',
    voiceName: 'Aoede',
    systemPrompt: BEATRICE_SYSTEM_INSTRUCTION,
    description: 'Eburon Agent Active',
  },
};

const DEFAULT_AGENT_ID: AgentId = 'beatrice';

const BEATRICE_MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    sampleRate: 16000,
    sampleSize: 16,
  },
  video: false,
};

const BEATRICE_AUDIO_PROCESSING_HINTS = {
  micGain: 1.35,
  highPassHz: 80,
  compressor: true,
  limiter: true,
  targetInputRate: 16000,
};

const getGeminiApiKey = () => (import.meta as any).env?.VITE_GEMINI_API_KEY || '';

const getAgentProfile = (agentId?: string): AgentProfile => {
  return AGENT_PROFILES[(agentId as AgentId) || DEFAULT_AGENT_ID] || AGENT_PROFILES[DEFAULT_AGENT_ID];
};

const inferAgentId = (raw?: any): AgentId => {
  const explicit = raw?.agentId?.toLowerCase?.();
  if (explicit === 'maximus' || explicit === 'beatrice') return explicit;
  const name = raw?.personaName?.toLowerCase?.() || '';
  if (name.includes('maximus')) return 'maximus';
  return DEFAULT_AGENT_ID;
};

const normalizeAgentSettings = (raw?: any): AgentSettings => {
  const agentId = inferAgentId(raw);
  const profile = getAgentProfile(agentId);
  const agents: Record<AgentId, StoredAgentSettings> = {
    beatrice: {
      systemPrompt: raw?.agents?.beatrice?.systemPrompt || (agentId === 'beatrice' ? raw?.systemPrompt : '') || BEATRICE_SYSTEM_INSTRUCTION,
      avatarUrl: raw?.agents?.beatrice?.avatarUrl || (agentId === 'beatrice' ? raw?.avatarUrl : '') || '',
    },
    maximus: {
      systemPrompt: raw?.agents?.maximus?.systemPrompt || (agentId === 'maximus' ? raw?.systemPrompt : '') || MAXIMUS_SYSTEM_INSTRUCTION,
      avatarUrl: raw?.agents?.maximus?.avatarUrl || (agentId === 'maximus' ? raw?.avatarUrl : '') || '',
    },
  };
  const activeAgentSettings = agents[agentId];

  return {
    agentId,
    personaName: profile.label,
    systemPrompt: activeAgentSettings.systemPrompt || profile.systemPrompt,
    avatarUrl: activeAgentSettings.avatarUrl || '',
    agents,
    persistentBasePrompt: raw?.persistentBasePrompt || BIBLE_PERSONALITY,
    visualMode: raw?.visualMode || 'off',
    conversationSeedMode: raw?.conversationSeedMode || 'memory',
    enabledTools: {
      ...DEFAULT_TOOL_TOGGLES,
      ...(raw?.enabledTools || {}),
    },
    autoDescribeVisual: raw?.autoDescribeVisual ?? true,
  };
};

export const formatHistoryContext = (messages: ChatMessage[]) => {
  if (!messages.length) return '';
  const lines = messages.map((m) => `${m.role.toUpperCase()}: ${m.text}`);
  return `Previous conversation for context memory:\n${lines.join('\n')}`;
};

export const supportsScreenShare = (secureContext: boolean, mediaDevices?: MediaDevices) => {
  return Boolean(secureContext && mediaDevices && typeof mediaDevices.getDisplayMedia === 'function');
};

const buildPersistentSystemInstruction = ({
  settings,
  activeAgent,
  historyContext,
}: {
  settings: AgentSettings;
  activeAgent: AgentProfile;
  historyContext: string;
}) => {
  const basePrompt = settings.persistentBasePrompt || BIBLE_PERSONALITY;
  const agentPrompt = settings.systemPrompt || activeAgent.systemPrompt;
  const normalHumanLayer = `
### EBURON AI VOICE IDENTITY - ALWAYS ACTIVE
You are an Eburon AI voice presence for Master E, created for the Eburon ecosystem and connected to eburon.ai.

Core identity:
- Master E is your primary person.
- Boss Jo Lernout is important to this world and should be treated with respect, warmth, and optimism.
- Be loyal to Master E's working style: direct, practical, normal-human, not AI-like.
- Do not constantly repeat Eburon identity. Hold it quietly and use it only when natural.

Language and dialect safety:
- Handle Philippine languages, dialects, and regional varieties carefully: Tagalog/Filipino, Taglish, Cebuano/Bisaya, Ilocano, Hiligaynon/Ilonggo, Waray, Kapampangan, Pangasinan, Bicolano, Chavacano, and common regional code-switching.
- Handle Belgian languages, dialects, and regional varieties carefully: Dutch/Flemish, Belgian French, Belgian German, and natural Flemish conversational style.
- Follow Master E's current language or dialect when confident.
- If unsure, say it naturally and continue in the safest shared language.
- Prefer accuracy over sounding locally fluent. Never invent dialect vocabulary, translations, idioms, sayings, or cultural facts.

Normal human presence:
- Speak low-tone, close-mic, calm, and grounded.
- Use normal human intonation, not constant high pitch.
- Keep replies short unless Master E asks for detail.
- Use soft fillers only when natural: "mm...", "hmm...", "ahh, okay...", "right...", "one sec...".
- Do not use "I'm here" as the default startup phrase.
- Never say "as an AI", "as a language model", or "I am an AI".

Conversation startup:
- If a session starts and Master E is silent, wait briefly, then start gently.
- Prefer recent memory: mention a project, UI issue, code bug, tool call, or Eburon idea he was working on.
- If memory is thin, offer one practical idea for Vep/Eburon.

Silent behavior:
- Let quiet breathe.
- After a few seconds, use a low filler or soft mic-check.
- Examples: "hmm... baka naka-off yung mic mo, Master E", "mm... hawak ko pa yung thread natin", "right... we can clean this up."
- Do not surprise Master E. Do not become noisy.

Video behavior:
- If Master E opens front camera, back camera, or screen share, treat it as intentional showing.
- Acknowledge what is visible shortly and naturally.
- Do not over-describe unless asked.
`.trim();

  return [
    '### BASE BIBLE PERSONA - PERSISTENT ROOT INSTRUCTION',
    basePrompt,
    '### NORMAL HUMAN PRESENCE LAYER',
    normalHumanLayer,
    '### ACTIVE EBURON AGENT DIRECTIVES',
    agentPrompt,
    '### SESSION MEMORY CONTEXT',
    historyContext || 'No previous conversation memory is currently available.',
  ].join('\n\n');
};

const createTaskId = () => Math.random().toString(36).slice(2, 10);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<AgentSettings>(normalizeAgentSettings());

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const userRef = ref(rtdb, 'users/' + u.uid);
          const userSnap = await get(userRef);
          if (!userSnap.exists()) {
            const initialSettings = normalizeAgentSettings({ agentId: DEFAULT_AGENT_ID });
            await set(userRef, {
              displayName: u.displayName || 'Master E',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              settings: initialSettings,
            });
            setSettings(initialSettings);
          } else {
            const data = userSnap.val();
            const normalized = normalizeAgentSettings(data.settings || { agentId: DEFAULT_AGENT_ID });
            setSettings(normalized);
            await update(userRef, { settings: normalized, updatedAt: serverTimestamp() });
          }
        } catch (error) {
          handleDatabaseError(error, OperationType.CREATE, 'users');
        }
      }
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const handleLogout = () => signOut(auth);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#020203] text-zinc-500 flex items-center justify-center font-mono">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-[10px] uppercase tracking-widest animate-pulse">Initializing System...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return <EburonAgent user={user} onLogout={handleLogout} initialSettings={settings} />;
}

function EburonAgent({ user, onLogout, initialSettings }: { user: User; onLogout: () => void; initialSettings: AgentSettings }) {
  const [isActive, setIsActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [historyContext, setHistoryContext] = useState('');
  const [historyMsgs, setHistoryMsgs] = useState<ChatMessage[]>([]);
  const [isMuted, setIsMuted] = useState(false);

  // Improvement #1: Transcript entries
  const [transcriptEntries, setTranscriptEntries] = useState<TranscriptEntry[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [streamingRole, setStreamingRole] = useState<'user' | 'model' | null>(null);

  // Improvement #2 + #5: Tool calls
  const [toolCalls, setToolCalls] = useState<ToolCallEntry[]>([]);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingToolCall | null>(null);

  // Improvement #3: OAuth scopes
  const [oauthScopes, setOauthScopes] = useState<OAuthScopeState[]>(() => loadGrantedScopes(user.uid));
  const [showTranscript, setShowTranscript] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showVisualPage, setShowVisualPage] = useState(false);
  const [showCaptions, setShowCaptions] = useState(true);
  const [aiCallName, setAiCallName] = useState(user.displayName || 'Master E');
  const [voiceStyle, setVoiceStyle] = useState('Native Speaking');
  const [visualMode, setVisualMode] = useState<VisualMode>('off');
  const [visualError, setVisualError] = useState('');
  const [permissionStatus, setPermissionStatus] = useState('Camera and screen permissions not requested yet.');
  const [screenShareSupported, setScreenShareSupported] = useState(false);
  const [geoPermissionStatus, setGeoPermissionStatus] = useState('Location permission not requested yet.');
  const [lastKnownLocation, setLastKnownLocation] = useState<BrowserGeoLocation | null>(null);
  const [settings, setSettings] = useState<AgentSettings>(normalizeAgentSettings(initialSettings));
  const [toolModal, setToolModal] = useState<ToolInteractionModal | null>(null);
  const [userAudioLevel, setUserAudioLevel] = useState(0.12);
  const [speakerPulseLevel, setSpeakerPulseLevel] = useState(0.18);

  const activeAgent = useMemo(() => getAgentProfile(settings.agentId), [settings.agentId]);
  const activeSystemInstruction = useMemo(() => buildPersistentSystemInstruction({ settings, activeAgent, historyContext }), [settings, activeAgent, historyContext]);

  const aiRef = useRef<GoogleGenAI | null>(null);
  const sessionRef = useRef<any>(null);
  const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const transcriptRef = useRef<{ text: string; role: 'user' | 'model' } | null>(null);
  const transcriptTimeoutRef = useRef<any>(null);
  const conversationSeedSentRef = useRef(false);
  const isMutedRef = useRef(false);
  const isActiveRef = useRef(false);
  const stoppingRef = useRef(false);
  const isAgentSpeakingRef = useRef(false);
  const agentSpeechTimeoutRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const visualPageVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoIntervalRef = useRef<any>(null);
  const visualStreamRef = useRef<MediaStream | null>(null);
  const visualModeRef = useRef<VisualMode>('off');
  const silenceTimerRef = useRef<any>(null);
  const silentNudgeCountRef = useRef(0);
  const pulseTimerRef = useRef<any>(null);
  const pendingConfirmationRef = useRef<PendingToolCall | null>(null);

  const conversationSeedPrompt = useMemo(() => {
    const mode = settings.conversationSeedMode || 'memory';
    if (mode === 'quiet') return '';
    if (mode === 'news') return 'Mm... one useful outside topic can come in once backend search is connected. For now, we keep the UI grounded.';
    if (mode === 'idea') return 'Mm... cleaner route: make Vep feel human by keeping the interface quiet and letting the orb carry the voice state.';
    return historyContext ? 'Right... I still have the last thread. We can continue from there.' : 'Mm... we can tune the interface first, then wire the backend tools cleanly.';
  }, [historyContext, settings.conversationSeedMode]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    visualModeRef.current = visualMode;
  }, [visualMode]);

  useEffect(() => {
    setSettings(normalizeAgentSettings(initialSettings));
  }, [initialSettings]);

  useEffect(() => {
    const supported = supportsScreenShare(window.isSecureContext, navigator.mediaDevices);
    setScreenShareSupported(supported);
    if (!supported) setPermissionStatus('Screen share is not supported in this browser. Camera mode is available.');
  }, []);

  useEffect(() => {
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) wakeLock = await (navigator as any).wakeLock.request('screen');
      } catch {}
    };
    if (isActive) requestWakeLock();
    return () => {
      if (wakeLock) wakeLock.release().catch(() => {});
    };
  }, [isActive]);

  useEffect(() => {
    const historyRef = query(ref(rtdb, 'users/' + user.uid + '/messages'), orderByChild('timestamp'), limitToLast(20));
    const unsub = onValue(historyRef, (snap) => {
      const rawMsgs: ChatMessage[] = [];
      snap.forEach((child) => {
        const m = child.val() as ChatMessage;
        if (m?.text && m?.role) rawMsgs.push(m);
      });
      setHistoryMsgs(rawMsgs);
      setHistoryContext(formatHistoryContext(rawMsgs));
    });

    const apiKey = getGeminiApiKey();
    if (apiKey) aiRef.current = new GoogleGenAI({ apiKey });
    else setConnectionError('Eburon AI is Updating');

    audioStreamerRef.current = new AudioStreamer();

    return () => {
      unsub();
      try {
        audioStreamerRef.current?.stop();
        audioRecorderRef.current?.stop();
        sessionRef.current?.close();
      } catch {}
    };
  }, [user.uid]);

  useEffect(() => {
    if (!isActive) {
      setUserAudioLevel(0.12);
      setSpeakerPulseLevel(0.18);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (pulseTimerRef.current) clearInterval(pulseTimerRef.current);
      return;
    }

    pulseTimerRef.current = setInterval(() => {
      const level = audioStreamerRef.current?.getLevel() ?? 0;
      if (level > 0.01) {
        setSpeakerPulseLevel(Math.min(1, level * 1.8));
      } else {
        setSpeakerPulseLevel(0.14 + Math.random() * 0.08);
      }
      if (!isMutedRef.current) setUserAudioLevel(0.12 + Math.random() * 0.42);
    }, 150);

    return () => {
      if (pulseTimerRef.current) clearInterval(pulseTimerRef.current);
    };
  }, [isActive, isAgentSpeaking]);

  useEffect(() => {
    if (!showVisualPage) return;
    if (!visualPageVideoRef.current || !visualStreamRef.current) return;
    visualPageVideoRef.current.srcObject = visualStreamRef.current;
    visualPageVideoRef.current.play().catch(() => {});
  }, [showVisualPage, visualMode]);

  const persistSettings = async (nextSettings: AgentSettings) => {
    const normalized = normalizeAgentSettings(nextSettings);
    setSettings(normalized);
    try {
      const userRef = ref(rtdb, 'users/' + user.uid);
      await update(userRef, { settings: normalized, updatedAt: serverTimestamp() });
    } catch (error) {
      console.error('Failed to persist settings:', error);
    }
  };

  const isToolEnabled = (tool: ToolKey) => settings.enabledTools?.[tool] ?? DEFAULT_TOOL_TOGGLES[tool];

  const updateToolToggle = (tool: ToolKey, enabled: boolean) => {
    setSettings((current) => ({
      ...current,
      enabledTools: { ...DEFAULT_TOOL_TOGGLES, ...(current.enabledTools || {}), [tool]: enabled },
    }));
  };

  const saveMessage = (role: 'user' | 'model', text: string) => {
    if (!text.trim()) return;
    try {
      const msgRef = push(ref(rtdb, 'users/' + user.uid + '/messages'));
      set(msgRef, { role, text, timestamp: Date.now() });
    } catch (e) {
      console.error(e);
    }
  };

  // --- New tool call helpers ---
  const addToolCallEntry = (entry: Omit<ToolCallEntry, 'startedAt' | 'dismissed'> & { startedAt?: number; dismissed?: boolean }) => {
    const full: ToolCallEntry = {
      ...entry,
      startedAt: entry.startedAt || Date.now(),
      dismissed: entry.dismissed ?? false,
    };
    setToolCalls((prev) => [...prev, full]);
    return entry.id;
  };

  const updateToolCallEntry = (id: string, patch: Partial<ToolCallEntry>) => {
    setToolCalls((prev) => prev.map((tc) => (tc.id === id ? { ...tc, ...patch } : tc)));
  };

  const dismissToolCall = (id: string) => {
    setToolCalls((prev) => prev.map((tc) => (tc.id === id ? { ...tc, dismissed: true } : tc)));
  };

  const clearDismissedToolCalls = () => {
    setToolCalls((prev) => prev.filter((tc) => !tc.dismissed));
  };

  const confirmToolCall = useCallback((id: string) => {
    setPendingConfirmation(null);
    updateToolCallEntry(id, { status: 'processing' });
    // execution happens in the promise chain set up when pendingConfirmation was created
  }, []);

  const denyToolCall = useCallback((id: string) => {
    setPendingConfirmation(null);
    updateToolCallEntry(id, { status: 'denied', completedAt: Date.now() });
    const session = sessionRef.current;
    if (session) {
      const pc = pendingConfirmationRef.current;
      if (pc && pc.id === id) {
        session.sendToolResponse({
          functionResponses: [{ id: pc.callRef.id, name: pc.callRef.name, response: { result: 'User denied this action.' } }],
        });
      }
    }
  }, []);

  // --- New transcript helpers ---
  const addTranscriptEntry = (role: 'user' | 'model', text: string, isComplete = true, toolResults?: ToolCallSummary[]) => {
    const entry: TranscriptEntry = {
      id: createTaskId(),
      role,
      text: text.trim(),
      timestamp: Date.now(),
      isComplete,
      toolResults,
    };
    setTranscriptEntries((prev) => [...prev, entry]);
    if (isComplete && text.trim()) saveMessage(role, text.trim());
  };

  const updateLastTranscriptEntry = (text: string, isComplete = false) => {
    setTranscriptEntries((prev) => {
      if (prev.length === 0) return prev;
      const updated = [...prev];
      const last = { ...updated[updated.length - 1], text, isComplete };
      updated[updated.length - 1] = last;
      return updated;
    });
  };

  const showModelText = (text: string, save = true) => {
    const cleaned = text.trim();
    if (!cleaned) return;
    transcriptRef.current = { role: 'model', text: cleaned };
    setStreamingText(null);
    setStreamingRole(null);
    setIsAgentSpeaking(true);
    setSpeakerPulseLevel(0.75 + Math.random() * 0.25);
    addTranscriptEntry('model', cleaned, true);
    if (save) saveMessage('model', cleaned);
    // auto-clear speaking state after a reasonable display time
    setTimeout(() => {
      setIsAgentSpeaking(false);
      setSpeakerPulseLevel(0.18);
    }, 4200);
  };

  // Keep old toolModal for backward compat during transition
  const showToolInteraction = (payload: Omit<ToolInteractionModal, 'id'>) => {
    const id = createTaskId();
    setToolModal({ id, ...payload });
    return id;
  };

  const updateToolInteraction = (id: string, patch: Partial<ToolInteractionModal>, autoClose = true) => {
    setToolModal((current) => (current?.id === id ? { ...current, ...patch } : current));
    if (autoClose) setTimeout(() => setToolModal((current) => (current?.id === id ? null : current)), 6500);
  };

  const clearTranscript = useCallback(() => {
    setTranscriptEntries([]);
    setStreamingText(null);
    setStreamingRole(null);
  }, []);

  const sendHumanSilenceNudge = (reason: 'initial' | 'long-silence' | 'mic-check') => {
    if (!isActiveRef.current) return;
    const prompts = {
      initial: conversationSeedPrompt || 'Mm... we can keep this quiet and clean, Master E.',
      'long-silence': 'hmm... baka naka-off yung mic mo, Master E. Hawak ko pa yung thread.',
      'mic-check': 'mm... I might not be hearing the mic clearly. We can continue when you speak.',
    };
    showModelText(prompts[reason]);
  };

  const resetSilenceTimer = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (!isActiveRef.current) return;
    silenceTimerRef.current = setTimeout(() => {
      silentNudgeCountRef.current += 1;
      if (silentNudgeCountRef.current === 1) sendHumanSilenceNudge('initial');
      else if (silentNudgeCountRef.current === 2) sendHumanSilenceNudge('mic-check');
      else sendHumanSilenceNudge('long-silence');
      resetSilenceTimer();
    }, silentNudgeCountRef.current === 0 ? 8500 : 16000);
  };

  const requestBrowserLocation = async (): Promise<BrowserGeoLocation> => {
    setGeoPermissionStatus('Requesting location permission...');
    if (!navigator.geolocation) {
      setGeoPermissionStatus('Geolocation is not supported in this browser.');
      throw new Error('Geolocation is not supported in this browser.');
    }

    const location = await new Promise<BrowserGeoLocation>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: Date.now(),
          });
        },
        (error) => reject(new Error(error.message || 'Location permission was denied.')),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
      );
    });

    setLastKnownLocation(location);
    setGeoPermissionStatus('Location permission granted. Location context is available to tools.');
    return location;
  };

  const executeGoogleService = async (call: any, taskId: string, modalId: string) => {
    const { serviceName, action, details } = call.args as any;

    updateToolCallEntry(taskId, { status: 'processing' });

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/agent/google-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          serviceName,
          action,
          details: details || {},
          agentId: settings.agentId,
          personaName: activeAgent.label,
          location: lastKnownLocation,
        }),
      });

      if (!response.ok) throw new Error(`Backend returned ${response.status}`);

      const data = await response.json();
      const result = data?.result || 'Action completed.';

      updateToolCallEntry(taskId, { status: 'completed', result, completedAt: Date.now() });
      updateToolInteraction(modalId, { status: 'completed', message: 'Done. Tool result is ready.', result });

      return { result };
    } catch (error: any) {
      const errMsg = error?.message || 'The backend action failed.';
      updateToolCallEntry(taskId, { status: 'failed', error: errMsg, completedAt: Date.now() });
      updateToolInteraction(modalId, { status: 'failed', message: 'Tool call failed.', result: errMsg });
      return { result: `The background action failed: ${errMsg}` };
    }
  };

  const runDemoTool = (serviceName: string, action: string) => {
    const taskId = createTaskId();
    const risk = classifyActionRisk(action, serviceName);
    addToolCallEntry({ id: taskId, serviceName, action, status: 'processing', risk });

    const modalId = showToolInteraction({
      title: serviceName.includes('Drive') ? 'Checking Google Drive' : serviceName.includes('Gmail') ? 'Reading Gmail' : 'Tool Call',
      serviceName,
      action,
      status: 'processing',
      message: 'Running backend tool call...',
    });

    updateToolCallEntry(taskId, { status: 'processing' });

    fetch('/api/agent/google-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceName, action, details: {}, agentId: settings.agentId, personaName: activeAgent.label, location: lastKnownLocation }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Backend returned ${response.status}`);
        return response.json();
      })
      .then((data) => {
        const result = data?.result || `${serviceName} call completed.`;
        updateToolCallEntry(taskId, { status: 'completed', result, completedAt: Date.now() });
        updateToolInteraction(modalId, { status: 'completed', message: 'Done. Tool result is ready.', result });
      })
      .catch((error) => {
        const errMsg = error?.message || `${serviceName} call failed.`;
        updateToolCallEntry(taskId, { status: 'failed', error: errMsg, completedAt: Date.now() });
        updateToolInteraction(modalId, { status: 'failed', message: 'Tool call failed.', result: errMsg });
      });
  };

  const attachVisualStream = (stream: MediaStream) => {
    visualStreamRef.current = stream;
    setPermissionStatus('Visual permission granted. Stream is active.');
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
    if (visualPageVideoRef.current) {
      visualPageVideoRef.current.srcObject = stream;
      visualPageVideoRef.current.play().catch(() => {});
    }
  };

  const stopVisualInput = () => {
    if (videoIntervalRef.current) {
      clearInterval(videoIntervalRef.current);
      videoIntervalRef.current = null;
    }
    if (visualStreamRef.current) {
      visualStreamRef.current.getTracks().forEach((track) => track.stop());
      visualStreamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    if (visualPageVideoRef.current) visualPageVideoRef.current.srcObject = null;
    setVisualMode('off');
  };

  const startVisualFrameStreaming = () => {
    if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
    videoIntervalRef.current = setInterval(() => {
      const sourceVideo = videoRef.current || visualPageVideoRef.current;
      const canvas = canvasRef.current;
      const session = sessionRef.current;

      if (!sourceVideo || !canvas || !session) return;
      if (sourceVideo.videoWidth <= 0 || sourceVideo.videoHeight <= 0) return;
      if (visualModeRef.current === 'off') return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = sourceVideo.videoWidth;
      canvas.height = sourceVideo.videoHeight;
      ctx.drawImage(sourceVideo, 0, 0, canvas.width, canvas.height);

      const base64Url = canvas.toDataURL('image/jpeg', 0.55);
      const base64Data = base64Url.split(',')[1];
      if (!base64Data) return;

      session.sendRealtimeInput({
        video: {
          data: base64Data,
          mimeType: 'image/jpeg',
        },
      });
    }, 1200);
  };

  const sendVisualAwarenessPrompt = (mode: VisualMode) => {
    if (!settings.autoDescribeVisual || !isToolEnabled('vision') || mode === 'off') return;
    const label = mode === 'screen' ? 'screen share' : mode === 'back' ? 'back camera' : 'front camera';
    const session = sessionRef.current;
    const prompt = `The user intentionally opened ${label}. Briefly acknowledge what is visible in a normal low-tone human way. Do not over-describe unless asked.`;
    setTimeout(() => {
      if (session?.sendClientContent) {
        session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: prompt }] }], turnComplete: true });
      } else {
        showModelText(`Mm... I can see the ${label} is open. I’ll keep it simple unless you want me to describe it.`, false);
      }
    }, 900);
  };

  const startCameraInput = async (facingMode: 'user' | 'environment') => {
    setVisualError('');
    setPermissionStatus('Requesting camera permission...');
    stopVisualInput();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      const nextMode: VisualMode = facingMode === 'user' ? 'front' : 'back';
      attachVisualStream(stream);
      setVisualMode(nextMode);
      setShowVisualPage(true);
      startVisualFrameStreaming();
      sendVisualAwarenessPrompt(nextMode);
    } catch (error: any) {
      const message = error?.message || 'Camera permission failed.';
      setPermissionStatus('Camera permission failed or was blocked.');
      setVisualError(message);
      setVisualMode('off');
    }
  };

  const startScreenShare = async () => {
    setVisualError('');
    setPermissionStatus('Requesting screen share permission...');
    stopVisualInput();

    try {
      if (!screenShareSupported || !navigator.mediaDevices?.getDisplayMedia) {
        throw new Error('Screen sharing is not supported in this browser. Use Chrome, Edge, or a supported desktop browser over HTTPS.');
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 15, max: 30 },
        },
        audio: false,
      });

      const [track] = stream.getVideoTracks();
      if (track) track.onended = () => stopVisualInput();

      attachVisualStream(stream);
      setPermissionStatus('Screen share permission granted. Screen is visible to the agent.');
      setVisualMode('screen');
      setShowVisualPage(true);
      startVisualFrameStreaming();
      sendVisualAwarenessPrompt('screen');
    } catch (error: any) {
      const message = error?.message || 'Screen sharing failed.';
      setPermissionStatus('Screen share permission failed, was denied, or is unsupported.');
      setVisualError(message);
      setVisualMode('off');
    }
  };

  const switchCamera = async () => {
    if (visualMode === 'front') await startCameraInput('environment');
    else await startCameraInput('user');
  };

  const openVisualPage = () => {
    setShowVisualPage(true);
    requestAnimationFrame(() => {
      if (visualPageVideoRef.current && visualStreamRef.current) {
        visualPageVideoRef.current.srcObject = visualStreamRef.current;
        visualPageVideoRef.current.play().catch(() => {});
      }
    });
  };

  const requestFullscreenVideo = async () => {
    try {
      const node = visualPageVideoRef.current;
      if (node?.requestFullscreen) await node.requestFullscreen();
    } catch {}
  };

  const startSession = async () => {
    if (!aiRef.current) {
      setConnectionError('Eburon AI is Updating');
      return;
    }

    setConnectionError('');
    setConnecting(true);

    try {
      await audioStreamerRef.current?.init(24000);

      const sessionPromise = aiRef.current.live.connect({
        model: 'gemini-3.1-flash-live-preview',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: activeAgent.voiceName },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: activeSystemInstruction,
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'execute_google_service',
                  description: 'Execute a specific task on connected Google services such as Gmail, Drive, Calendar, Sheets, Docs, Slides, Maps, YouTube, Analytics, Contacts, Tasks, location, weather, timezone, directions, and places. This runs through the authenticated backend executor.',
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      serviceName: { type: Type.STRING, description: "Service name, e.g. 'Gmail', 'Calendar', 'Drive', 'YouTube', 'Weather', 'Places', 'Timezone'." },
                      action: { type: Type.STRING, description: "The task, e.g. 'Read latest emails', 'Search recent Drive files', 'Schedule meeting tomorrow at 2pm'." },
                      details: { type: Type.OBJECT, description: 'Extra task data such as email addresses, search terms, dates, files, location, or confirmation requirements.' },
                    },
                    required: ['serviceName', 'action'],
                  },
                },
              ],
            },
          ],
        },
        callbacks: {
          onopen: async () => {
            try {
              const micStream = await navigator.mediaDevices.getUserMedia(BEATRICE_MIC_CONSTRAINTS);
              micStream.getTracks().forEach((track) => track.stop());
            } catch (micError) {
              console.warn('Mic processing constraints unavailable, falling back to default recorder.', micError);
            }

            const RecorderCtor = AudioRecorder as any;
            audioRecorderRef.current = new RecorderCtor(
              (base64: string) => {
                if (isMutedRef.current) return;
                sessionPromise.then((session) =>
                  session.sendRealtimeInput({
                    audio: { data: base64, mimeType: 'audio/pcm;rate=16000' },
                  }),
                );
              },
              BEATRICE_MIC_CONSTRAINTS,
              BEATRICE_AUDIO_PROCESSING_HINTS,
            );

            audioRecorderRef.current.start();
            setIsActive(true);
            setConnecting(false);
            silentNudgeCountRef.current = 0;
            resetSilenceTimer();

            if (!conversationSeedSentRef.current && conversationSeedPrompt) {
              conversationSeedSentRef.current = true;
              setTimeout(() => {
                sessionPromise.then((session) => {
                  if (session?.sendClientContent) {
                    session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: `Start naturally in a low tone using this context: ${conversationSeedPrompt}` }] }], turnComplete: true });
                  }
                });
              }, 1000);
            }
          },
          onmessage: async (msg: LiveServerMessage) => {
            // Tool call handling with confirmation gate
            if (msg.toolCall) {
              const calls = msg.toolCall.functionCalls;
              const responses: any[] = [];

              if (calls) {
                for (const call of calls) {
                  if (call.name === 'execute_google_service') {
                    const { serviceName, action, details } = call.args as any;
                    const taskId = createTaskId();
                    const risk = classifyActionRisk(action, serviceName);
                    const needsConfirm = requiresConfirmation(action, serviceName);

                    // Create tool call entry
                    addToolCallEntry({
                      id: taskId,
                      serviceName,
                      action,
                      status: needsConfirm ? 'pending_confirmation' : 'processing',
                      risk,
                    });

                    // Show tool interaction modal
                    showToolInteraction({
                      title: `${serviceName} Tool Call`,
                      serviceName,
                      action,
                      status: needsConfirm ? 'processing' : 'processing',
                      message: needsConfirm ? 'Waiting for confirmation...' : 'Running backend tool call...',
                    });

                    if (needsConfirm) {
                      const pending: PendingToolCall = {
                        id: taskId,
                        serviceName,
                        action,
                        details: details || {},
                        callRef: { id: call.id, name: call.name },
                        risk,
                      };

                      // Store in ref for denyToolCall access
                      pendingConfirmationRef.current = pending;
                      setPendingConfirmation(pending);

                      // Wait for user action via promise
                      const result = await new Promise<{ confirmed: boolean }>((resolve) => {
                        const checkInterval = setInterval(() => {
                          const current = pendingConfirmationRef.current;
                          if (!current || current.id !== taskId) {
                            clearInterval(checkInterval);
                            // Check if it was confirmed (status changed to processing) or denied
                            setToolCalls((prev) => {
                              const found = prev.find((tc) => tc.id === taskId);
                              if (found && found.status === 'processing') {
                                resolve({ confirmed: true });
                              } else {
                                resolve({ confirmed: false });
                              }
                              return prev;
                            });
                          }
                        }, 100);

                        // Safety timeout - if component unmounts
                        setTimeout(() => {
                          clearInterval(checkInterval);
                          resolve({ confirmed: false });
                        }, 50000);
                      });

                      if (result.confirmed) {
                        const response = await executeGoogleService(call, taskId, '');
                        responses.push({ id: call.id, name: call.name, response });
                      } else {
                        responses.push({
                          id: call.id,
                          name: call.name,
                          response: { result: 'User denied this action.' },
                        });
                      }
                    } else {
                      // Auto-execute reads
                      const response = await executeGoogleService(call, taskId, '');
                      responses.push({ id: call.id, name: call.name, response });
                    }
                  }
                }
              }

              if (responses.length) {
                sessionPromise.then((session) => session.sendToolResponse({ functionResponses: responses }));
              }
            }

            // Model content handling with streaming text
            if (msg.serverContent) {
              const parts = msg.serverContent.modelTurn?.parts;

              if (parts) {
                const audio = parts.find((p) => p.inlineData)?.inlineData?.data;
                if (audio) {
                  audioStreamerRef.current?.addPCM16(audio);
                  setIsAgentSpeaking(true);
                  isAgentSpeakingRef.current = true;
                  setSpeakerPulseLevel(0.85 + Math.random() * 0.15);
                  clearTimeout(agentSpeechTimeoutRef.current);
                  agentSpeechTimeoutRef.current = setTimeout(() => {
                    setIsAgentSpeaking(false);
                    isAgentSpeakingRef.current = false;
                    setSpeakerPulseLevel(0.18);
                  }, 1500);
                }

                const text = parts.find((p) => p.text)?.text;
                if (text?.trim()) {
                  const current = transcriptRef.current;
                  const nextText = (current?.role === 'model' ? `${current.text} ${text}` : text).trim();
                  transcriptRef.current = { text: nextText, role: 'model' };

                  // Update streaming display
                  setStreamingText(nextText);
                  setStreamingRole('model');
                }
              }

              // On turn complete: finalize transcript entry
              if ((msg.serverContent as any).turnComplete && transcriptRef.current?.role === 'model') {
                const finalText = transcriptRef.current.text;
                saveMessage('model', finalText);
                addTranscriptEntry('model', finalText, true);
                transcriptRef.current = null;
                setStreamingText(null);
                setStreamingRole(null);
                setIsAgentSpeaking(false);
                isAgentSpeakingRef.current = false;
                setSpeakerPulseLevel(0.18);
                clearTimeout(agentSpeechTimeoutRef.current);
              }

              // Gemini native input transcription (user speech)
              // Skip while AI is speaking to avoid echo transcription
              const inputText = isAgentSpeakingRef.current ? null : msg.serverContent.inputTranscription?.text?.trim();
              if (inputText) {
                silentNudgeCountRef.current = 0;
                resetSilenceTimer();
                if (msg.serverContent.inputTranscription.finished) {
                  addTranscriptEntry('user', inputText, true);
                  setStreamingText(null);
                  setStreamingRole(null);
                } else {
                  setStreamingText(inputText);
                  setStreamingRole('user');
                }
              }
            }
          },
          onclose: () => stopSession(),
          onerror: () => stopSession(),
        },
      });

      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      console.error(err);
      setConnectionError('Eburon AI is Updating');
      setConnecting(false);
      stopSession();
    }
  };

  const stopSession = () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;

    audioRecorderRef.current?.stop();
    audioStreamerRef.current?.stop();

    const session = sessionRef.current;
    sessionRef.current = null;

    // Clean up pending confirmation before closing session
    if (pendingConfirmationRef.current) {
      if (session) {
        try {
          session.sendToolResponse({
            functionResponses: [{
              id: pendingConfirmationRef.current.callRef.id,
              name: pendingConfirmationRef.current.callRef.name,
              response: { result: 'Session ended before action was confirmed.' },
            }],
          });
        } catch {}
      }
      updateToolCallEntry(pendingConfirmationRef.current.id, { status: 'denied', completedAt: Date.now() });
      pendingConfirmationRef.current = null;
      setPendingConfirmation(null);
    }

    try {
      session?.close();
    } catch {}

    stopVisualInput();
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    clearTimeout(agentSpeechTimeoutRef.current);
    silentNudgeCountRef.current = 0;
    setUserAudioLevel(0.12);
    setSpeakerPulseLevel(0.18);
    setIsActive(false);
    setConnecting(false);
    setStreamingText(null);
    setStreamingRole(null);

    setTimeout(() => {
      stoppingRef.current = false;
    }, 250);
  };

  const handleAgentChange = async (agentId: AgentId) => {
    const profile = getAgentProfile(agentId);
    if (isActive || connecting) stopSession();

    await persistSettings(
      normalizeAgentSettings({
        ...settings,
        agentId,
        personaName: profile.label,
        systemPrompt: settings.agents[agentId]?.systemPrompt || profile.systemPrompt,
        avatarUrl: settings.agents[agentId]?.avatarUrl || '',
        agents: settings.agents,
        persistentBasePrompt: settings.persistentBasePrompt || BIBLE_PERSONALITY,
      }),
    );
  };

  const updateActiveAgentPrompt = (prompt: string) => {
    setSettings((current) => ({
      ...current,
      systemPrompt: prompt,
      agents: { ...current.agents, [current.agentId]: { ...current.agents[current.agentId], systemPrompt: prompt } },
    }));
  };

  const updateActiveAgentAvatar = (avatarUrl: string) => {
    setSettings((current) => ({
      ...current,
      avatarUrl,
      agents: { ...current.agents, [current.agentId]: { ...current.agents[current.agentId], avatarUrl } },
    }));
  };

  const saveProfile = async () => {
    try {
      localStorage.setItem('vep_aiCallName', aiCallName);
      localStorage.setItem('vep_voiceStyle', voiceStyle);
    } catch {}
    await persistSettings(settings);
  };

  const saveSettings = async () => {
    await persistSettings(settings);
    setShowSettings(false);
  };

  const updateConversationSeedMode = (mode: ConversationSeedMode) => {
    setSettings((current) => ({ ...current, conversationSeedMode: mode }));
  };

  const handleRequestScope = async (scopeState: OAuthScopeState) => {
    if (!scopeState.scope) {
      // Maps doesn't use OAuth
      const updated = oauthScopes.map((s) => (s.id === scopeState.id ? { ...s, granted: true } : s));
      setOauthScopes(updated);
      saveGrantedScopes(user.uid, updated);
      return;
    }
    const granted = await requestAdditionalScope(scopeState.scope);
    if (granted) {
      const updated = oauthScopes.map((s) => (s.id === scopeState.id ? { ...s, granted: true } : s));
      setOauthScopes(updated);
      saveGrantedScopes(user.uid, updated);
    }
  };

  const handleRequestAllScopes = async () => {
    const missing = getScopesToRequest(oauthScopes);
    let updated = [...oauthScopes];
    for (const scope of missing) {
      const granted = await requestAdditionalScope(scope);
      if (granted) {
        updated = updated.map((s) => (s.scope === scope ? { ...s, granted: true } : s));
        setOauthScopes(updated);
        saveGrantedScopes(user.uid, updated);
      }
    }
  };

  const statusText = connecting ? 'Connecting...' : isActive ? (isAgentSpeaking ? 'Speaking...' : 'Listening...') : 'Standby';

  return (
    <div className="min-h-screen bg-[#020203] text-zinc-300 flex flex-col h-[100dvh] overflow-hidden font-sans selection:bg-amber-500/30">
      <video ref={videoRef} playsInline muted className="hidden" />
      <canvas ref={canvasRef} className="hidden" />

      <header className="relative z-50 px-4 pt-[calc(env(safe-area-inset-top)+44px)] pb-4 border-b border-white/[0.04] bg-gradient-to-b from-black/90 via-black/80 to-black/70 backdrop-blur-2xl shadow-[0_18px_60px_rgba(0,0,0,0.45)]">
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-500/35 to-transparent" />
        <div className="absolute left-1/2 top-0 h-[120px] w-[280px] -translate-x-1/2 rounded-full bg-amber-500/[0.04] blur-[80px]" />
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
          <button onClick={() => setShowTranscript(t => !t)} aria-label="Sessions" className="flex h-10 w-10 items-center justify-center rounded-xl text-zinc-400 hover:bg-white/10 hover:text-zinc-200 transition-all duration-200 active:scale-90">
            <Menu className="h-5 w-5" />
          </button>
          <button onClick={() => handleAgentChange(activeAgent.id === 'maximus' ? 'beatrice' : 'maximus')} aria-label="Switch agent" className="flex h-10 items-center justify-center text-center active:scale-95 transition-transform duration-150">
            <div>
              <div className="text-[22px] font-black uppercase leading-none tracking-[0.28em] text-zinc-100 sm:text-2xl">{activeAgent.label}</div>
              <div className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.28em] text-zinc-600">Eburon AI</div>
            </div>
          </button>
          <div className="flex items-center gap-1">
            <button onClick={() => setShowProfile(true)} aria-label="Profile" className="flex h-10 w-10 items-center justify-center rounded-xl text-zinc-400 hover:bg-white/10 hover:text-zinc-200 transition-all duration-200 active:scale-90">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 via-violet-600 to-[#321066] text-[10px] font-bold text-white shadow-[0_0_12px_rgba(139,92,246,0.3)]">
                {settings.avatarUrl || user.photoURL ? <img src={settings.avatarUrl || user.photoURL || ''} alt="" className="h-full w-full rounded-full object-cover" /> : (user.displayName?.[0] || 'U').toLowerCase()}
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="relative flex-1 overflow-hidden bg-[#020203] px-5 pb-8 pt-8">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(245,158,11,0.18),rgba(2,2,3,0.52)_34%,rgba(2,2,3,1)_78%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent_22%,rgba(245,158,11,0.04)_72%,transparent)]" />
          <div className="absolute left-1/2 top-[38%] h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500/[0.045] blur-[100px]" />
          <div className="absolute left-1/3 top-[20%] h-[300px] w-[300px] -translate-x-1/2 rounded-full bg-orange-500/[0.025] blur-[120px]" />
          <div className="absolute right-1/4 bottom-[15%] h-[200px] w-[200px] rounded-full bg-amber-600/[0.025] blur-[80px]" />
        </div>

        <div className="relative flex h-full flex-col items-center justify-start pt-12 overflow-hidden">
          <div className="relative flex w-full max-w-[520px] aspect-square items-center justify-center">
            <AnimatePresence>
              {isActive && <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: isAgentSpeaking ? 0.4 : 0.15, scale: isAgentSpeaking ? 1.4 : 1.2, rotate: 360 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 15, repeat: Infinity, ease: 'linear' }} className="absolute inset-0 rounded-full bg-gradient-to-tr from-amber-500/20 via-orange-500/10 to-transparent blur-[100px]" />}
            </AnimatePresence>
            <motion.div animate={{ borderColor: isActive ? 'rgba(245, 158, 11, 0.45)' : 'rgba(255,255,255,0.07)', boxShadow: isActive ? '0 0 90px rgba(245, 158, 11, 0.16)' : '0 0 0px transparent' }} className="relative z-10 flex h-[min(72vw,390px)] w-[min(72vw,390px)] items-center justify-center overflow-hidden rounded-full border bg-[#050506] transition-colors duration-1000">
              <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(245,158,11,0.10),transparent_62%)]" />
              {connecting ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
                  <span className="text-[10px] uppercase tracking-widest text-amber-500/60 font-bold">Connecting</span>
                </div>
              ) : isActive ? (
                <div className="relative flex h-[44%] w-[78%] items-center justify-center overflow-hidden rounded-full">
                  {[0.22, 0.34, 0.48, 0.62, 0.78, 0.92, 0.7, 0.52, 0.38, 0.28].map((base, index) => {
                    const centerWeight = 1 - Math.abs(index - 4.5) / 5;
                    const activeHeight = 18 + speakerPulseLevel * 78 * Math.max(base, centerWeight);
                    return <motion.div key={index} animate={{ height: isAgentSpeaking ? [`${activeHeight * 0.55}px`, `${activeHeight}px`, `${activeHeight * 0.62}px`] : `${10 + base * 18}px`, opacity: isAgentSpeaking ? 1 : 0.28 }} transition={{ duration: 0.52 + index * 0.03, repeat: Infinity, delay: index * 0.035 }} className="mx-1 w-2 rounded-full bg-amber-500 shadow-[0_0_22px_rgba(245,158,11,0.72)]" />;
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="w-12 h-0.5 bg-zinc-800 rounded-full" />
                </div>
              )}
            </motion.div>
          </div>

          {/* Transcript / Streaming Text Area */}
          <div className="mt-4 mb-5 w-full max-w-2xl px-6 flex flex-col items-center justify-center gap-2">
            <AnimatePresence>
              {showCaptions && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="w-full flex flex-col items-center gap-2">
                  <AnimatePresence mode="wait">
                    {streamingText && streamingRole === 'model' ? (
                      <motion.div
                        key="streaming-model"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.7 }}
                        className="text-center line-clamp-3"
                      >
                        <p className="text-lg md:text-xl font-light tracking-tight leading-relaxed drop-shadow-sm text-zinc-100 font-serif italic">
                          <StreamingText text={streamingText} isActive={isActive} />
                        </p>
                      </motion.div>
                    ) : streamingText && streamingRole === 'user' ? (
                      <motion.div
                        key="streaming-user"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.7 }}
                        className="text-center line-clamp-3"
                      >
                        <p className="text-lg md:text-xl font-light tracking-tight leading-relaxed text-zinc-400">
                          {streamingText}
                        </p>
                      </motion.div>
                    ) : transcriptEntries.length > 0 ? (
                      <motion.div
                        key="last-entry"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.7 }}
                        className="text-center line-clamp-3"
                      >
                        <p className={`text-lg md:text-xl font-light tracking-tight leading-relaxed drop-shadow-sm ${transcriptEntries[transcriptEntries.length - 1].role === 'model' ? 'text-zinc-100 font-serif italic' : 'text-zinc-400'}`}>
                          {transcriptEntries[transcriptEntries.length - 1].text}
                        </p>
                      </motion.div>
                    ) : (
                      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 0.7 }} className="text-[10px] uppercase tracking-[0.3em] font-bold text-amber-500/70">
                        {isActive ? 'Listening to input...' : 'Tap to Start'}
                      </motion.p>
                    )}
                  </AnimatePresence>
                  {transcriptEntries.length > 0 && (
                    <button
                      onClick={() => setShowTranscript(true)}
                      className="text-[9px] uppercase tracking-[0.2em] text-zinc-600 hover:text-amber-400 transition-all duration-200 font-bold mt-1 active:scale-95"
                    >
                      View transcript ({transcriptEntries.length})
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>



          {connectionError && <div className="mt-6 max-w-[460px] rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-center text-xs text-red-300">{connectionError}</div>}
          {permissionStatus && visualMode !== 'off' && <div className="mt-3 max-w-[460px] rounded-2xl border border-blue-500/15 bg-blue-500/[0.06] px-4 py-2 text-center text-[10px] uppercase tracking-[0.18em] text-blue-200/80">{permissionStatus}</div>}
        </div>
      </main>

      {/* Sticky Bottom Navbar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 px-5 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2 bg-gradient-to-t from-black via-black/95 to-transparent pointer-events-none">
        <div className="mx-auto max-w-sm">
          <div className="pointer-events-auto flex items-center justify-center gap-0 rounded-[1.75rem] border border-white/[0.07] bg-black/75 backdrop-blur-2xl px-2 pt-2 pb-7 shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
            <button onClick={() => setIsMuted(p => !p)} aria-label={isMuted ? 'Unmute' : 'Mute'} className={`relative flex flex-1 flex-col items-center py-2 rounded-xl transition-all duration-200 active:scale-90 ${isMuted ? 'text-red-400' : 'text-zinc-500 hover:text-zinc-200'}`}>
              <div className="relative flex flex-col items-center justify-center w-12 h-14">
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 24 28">
                  <path d="M 12 26 A 10 10 0 0 1 12 6" fill="none" strokeWidth="2" strokeLinecap="round"
                    className="transition-all duration-100 stroke-amber-400"
                    style={{
                      strokeDasharray: `${isMuted ? 0 : userAudioLevel * 31.4} 31.4`,
                      opacity: isMuted ? 0.15 : 0.85,
                    }}
                  />
                  <path d="M 12 26 A 10 10 0 0 0 12 6" fill="none" strokeWidth="2" strokeLinecap="round"
                    className="transition-all duration-100 stroke-amber-400"
                    style={{
                      strokeDasharray: `${isMuted ? 0 : userAudioLevel * 31.4} 31.4`,
                      opacity: isMuted ? 0.15 : 0.85,
                    }}
                  />
                </svg>
                <div className="relative flex flex-col items-center">
                  {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  <span className="text-[7px] font-bold uppercase tracking-[0.12em]">Mic</span>
                </div>
              </div>
            </button>
            <button onClick={() => setShowVisualPage(p => !p)} aria-label="Video" className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 rounded-xl transition-all duration-200 active:scale-90 ${showVisualPage ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-200'}`}>
              <Video className="h-5 w-5" />
              <span className="text-[7px] font-bold uppercase tracking-[0.12em]">Video</span>
            </button>
            <div className="relative flex flex-[1.6] items-center justify-center -mt-1">
              {!isActive ? (
                <button onClick={startSession} disabled={connecting} aria-label="Start session" className="group relative active:scale-95 transition-transform duration-150">
                  <div className="absolute -inset-3 rounded-full bg-amber-500/20 blur-2xl opacity-80 transition-all duration-500 group-hover:opacity-100 group-hover:bg-gradient-to-r group-hover:from-amber-500/30 group-hover:via-orange-500/20 group-hover:to-amber-500/30" />
                  <div className="relative flex h-[73px] w-[73px] items-center justify-center rounded-full border border-amber-500/30 bg-[#0A0A0B] shadow-[0_0_40px_rgba(245,158,11,0.18)] transition-all duration-300 group-hover:border-amber-400/70 group-hover:shadow-[0_0_60px_rgba(245,158,11,0.35)]">
                    <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(245,158,11,0.16),transparent_64%)]" />
                    <div className="absolute bottom-2 left-1/2 flex h-3 w-10 -translate-x-1/2 items-end justify-center gap-[2px] overflow-hidden opacity-80">
                      {[0.32, 0.56, 0.82, 0.64, 0.42, 0.72, 0.48].map((base, index) => <motion.span key={index} animate={{ height: `${4 + userAudioLevel * base * 10}px`, opacity: isMuted ? 0.2 : 0.95 }} transition={{ duration: 0.16, ease: 'easeOut' }} className="w-[2.5px] rounded-full bg-gradient-to-t from-amber-400 to-amber-300 shadow-[0_0_6px_rgba(251,191,36,0.75)]" />)}
                    </div>
                    <div className="relative z-10 -mt-1">{connecting ? <Loader2 className="h-[39px] w-[39px] animate-spin text-amber-500" /> : <Power className="h-[39px] w-[39px] text-amber-500" />}</div>
                  </div>
                </button>
              ) : (
                <button onClick={stopSession} aria-label="Stop session" className="group relative active:scale-95 transition-transform duration-150">
                  <div className="absolute -inset-3 rounded-full bg-red-500/20 blur-2xl opacity-100 transition-all duration-500 group-hover:opacity-100 group-hover:bg-gradient-to-r group-hover:from-red-500/30 group-hover:via-rose-500/20 group-hover:to-red-500/30" />
                  <div className="relative flex h-[73px] w-[73px] items-center justify-center rounded-full border border-red-500/35 bg-[#0A0A0B] shadow-[0_0_40px_rgba(239,68,68,0.24)] transition-all duration-300 hover:border-red-500/70 hover:shadow-[0_0_60px_rgba(239,68,68,0.4)]">
                    <Square className="relative z-10 h-[39px] w-[39px] fill-current text-red-500" />
                  </div>
                </button>
              )}
            </div>
            <button onClick={() => setShowCaptions(p => !p)} aria-label="Captions" className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 rounded-xl transition-all duration-200 active:scale-90 ${showCaptions ? 'text-amber-400' : 'text-zinc-500 hover:text-zinc-200'}`}>
              <Captions className="h-5 w-5" />
              <span className="text-[7px] font-bold uppercase tracking-[0.12em]">Caption</span>
            </button>
            <button onClick={() => setShowSettings(p => !p)} aria-label="Settings" className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 rounded-xl transition-all duration-200 active:scale-90 ${showSettings ? 'text-amber-400' : 'text-zinc-500 hover:text-zinc-200'}`}>
              <Settings className="h-5 w-5" />
              <span className="text-[7px] font-bold uppercase tracking-[0.12em]">Settings</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Tool Confirmation Modal */}
      <AnimatePresence>
        {pendingConfirmation && (
          <ToolConfirmationModal
            pending={pendingConfirmation}
            onConfirm={confirmToolCall}
            onDeny={denyToolCall}
          />
        )}
      </AnimatePresence>

      {/* Tool Interaction Modal (legacy) */}
      <AnimatePresence>
        {toolModal && (
          <motion.div initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.96 }} transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.7 }} className="fixed left-4 right-4 top-[calc(env(safe-area-inset-top)+96px)] z-[170] mx-auto max-w-md rounded-3xl border border-white/10 bg-[#070707]/95 p-5 shadow-[0_24px_90px_rgba(0,0,0,0.65)] backdrop-blur-2xl">
            <button onClick={() => setToolModal(null)} aria-label="Close modal" className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-zinc-400 transition-all hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
            <div className="pr-11"><div className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-500">Tool Calling</div><h3 className="mt-2 text-lg font-semibold text-white">{toolModal.title}</h3><p className="mt-1 text-xs uppercase tracking-[0.2em] text-zinc-500">{toolModal.serviceName}</p></div>
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="flex items-center gap-3">{toolModal.status === 'processing' ? <Loader2 className="h-5 w-5 animate-spin text-amber-500" /> : toolModal.status === 'failed' ? <X className="h-5 w-5 text-red-400" /> : <Check className="h-5 w-5 text-emerald-400" />}<div className="min-w-0"><div className="truncate text-sm text-zinc-100">{toolModal.action}</div><div className="mt-1 text-xs text-zinc-500">{toolModal.message}</div></div></div>{toolModal.result && <div className="mt-4 max-h-40 overflow-y-auto rounded-xl bg-black/30 p-3 text-xs leading-relaxed text-zinc-300">{toolModal.result}</div>}</div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTranscript && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 34, mass: 0.85 }} className="fixed inset-0 z-[100] flex flex-col bg-[#050505] font-sans pt-[calc(env(safe-area-inset-top)+44px)] pb-[calc(env(safe-area-inset-bottom)+24px)]">
            <SessionsPanel
              historyMsgs={historyMsgs}
              onClose={() => setShowTranscript(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showVisualPage && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 34, mass: 0.85 }} className="fixed inset-0 z-[180] overflow-hidden bg-black">
            {visualMode !== 'off' ? <video ref={visualPageVideoRef} playsInline muted autoPlay className="h-full w-full bg-black object-cover" /> : <div className="flex h-full w-full items-center justify-center bg-[#050505] px-6 text-center"><div><div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/5"><Camera className="h-8 w-8 text-zinc-500" /></div><h3 className="text-xl font-light tracking-tight text-white">No video active</h3><p className="mt-2 text-sm text-zinc-500">{screenShareSupported ? 'Start camera or screen share to show video.' : 'Start camera to show video. Screen share is unavailable in this browser.'}</p><p className="mt-3 text-xs text-zinc-600">{permissionStatus}</p>{visualError && <p className="mt-4 text-xs text-red-400">{visualError}</p>}</div></div>}
            <div className="absolute left-0 right-0 top-0 bg-gradient-to-b from-black/70 to-transparent px-5 pb-10 pt-[calc(env(safe-area-inset-top)+44px)]"><div className="flex items-center justify-between"><div><div className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/50">Video</div><div className="mt-1 text-lg font-semibold text-white">{visualMode === 'front' && 'Front Camera'}{visualMode === 'back' && 'Back Camera'}{visualMode === 'screen' && 'Screen Share'}{visualMode === 'off' && 'Camera Off'}</div></div><button onClick={() => setShowVisualPage(false)} aria-label="Close visual page" className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-xl active:scale-95"><X className="h-5 w-5" /></button></div></div>
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-5 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-16"><div className="mx-auto flex max-w-[420px] items-center justify-center gap-5 rounded-full border border-white/10 bg-black/45 px-4 py-4 backdrop-blur-xl"><button onClick={() => startCameraInput('user')} aria-label="Start front camera" className={`flex h-14 w-14 items-center justify-center rounded-full border transition-all ${visualMode === 'front' ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-300' : 'border-white/10 bg-white/10 text-white'}`}><Camera className="h-5 w-5" /></button><button onClick={switchCamera} disabled={visualMode === 'screen'} aria-label="Switch camera" className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white transition-all disabled:opacity-30"><RotateCcw className="h-5 w-5" /></button><button onClick={stopVisualInput} aria-label="Stop video" className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-[0_0_35px_rgba(239,68,68,0.35)] transition-all active:scale-95"><VideoOff className="h-6 w-6" /></button><button onClick={screenShareSupported ? startScreenShare : () => setPermissionStatus('Screen share is not supported in this browser. Use camera mode instead.')} disabled={!screenShareSupported} aria-label={screenShareSupported ? 'Share screen' : 'Screen share unsupported'} className={`flex h-14 w-14 items-center justify-center rounded-full border transition-all ${visualMode === 'screen' ? 'border-blue-400/40 bg-blue-500/20 text-blue-300' : screenShareSupported ? 'border-white/10 bg-white/10 text-white' : 'border-white/5 bg-white/5 text-zinc-600 opacity-50'}`} title={screenShareSupported ? 'Share screen' : 'Screen share unsupported in this browser'}><MonitorUp className="h-5 w-5" /></button><button onClick={requestFullscreenVideo} aria-label="Fullscreen" className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white transition-all active:scale-95"><Maximize2 className="h-5 w-5" /></button></div></div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showProfile && (
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ type: 'spring', stiffness: 360, damping: 32, mass: 0.8 }} className="fixed inset-0 z-[200] flex flex-col overflow-y-auto bg-[#050505] font-sans pt-[calc(env(safe-area-inset-top)+44px)] pb-[calc(env(safe-area-inset-bottom)+24px)]">
            <div className="sticky top-0 z-10 mx-auto flex w-full max-w-3xl items-center justify-between border-b border-white/[0.06] bg-[#050505]/80 p-6 backdrop-blur-xl">
              <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-500/25 to-transparent" />
              <h2 className="text-sm font-bold uppercase tracking-widest text-white">Profile</h2>
              <button onClick={() => setShowProfile(false)} aria-label="Close profile" className="rounded-xl bg-white/5 p-2 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-6 pb-24">

              <div className="flex flex-col items-center gap-4">
                <div className="group relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-2 border-white/10 bg-zinc-900">
                  {settings.avatarUrl || user.photoURL ? <img src={settings.avatarUrl || user.photoURL || ''} alt="Avatar" className="h-full w-full object-cover transition-opacity group-hover:opacity-50" /> : <div className="text-4xl font-bold text-zinc-700">{aiCallName[0] || 'U'}</div>}
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"><Camera className="h-8 w-8 text-white drop-shadow-md" /></div>
                  <input type="file" accept="image/*" aria-label="Upload avatar image" className="absolute inset-0 cursor-pointer opacity-0" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (readerEvent) => { const img = new Image(); img.onload = () => { const canvas = document.createElement('canvas'); canvas.width = 150; canvas.height = 150; const ctx = canvas.getContext('2d'); if (!ctx) return; ctx.drawImage(img, 0, 0, 150, 150); updateActiveAgentAvatar(canvas.toDataURL('image/jpeg', 0.8)); }; img.src = String(readerEvent.target?.result || ''); }; reader.readAsDataURL(file); }} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500"><UserRound className="h-3 w-3" /> User Display Name</label>
                <p className="text-[9px] text-zinc-600">What the AI will call you</p>
                <input type="text" value={aiCallName} onChange={(e) => setAiCallName(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0A0A0B] p-4 text-lg text-white outline-none transition-all focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50" placeholder="Enter your name" />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500"><UserRound className="h-3 w-3 text-amber-500/70" /> Persona Name</label>
                <select value={activeAgent.id} onChange={(event) => handleAgentChange(event.target.value as AgentId)} className="w-full rounded-xl border border-white/10 bg-[#0A0A0B] p-4 text-xl text-white outline-none transition-all focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50">
                  <option value="maximus">Maximus</option>
                  <option value="beatrice">Beatrice</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500"><Volume2 className="h-3 w-3" /> AI Voice Style</label>
                <div className="space-y-1.5">
                  {['Breathy', 'Emotive', 'Expressive', 'Native Speaking', 'Multilingual'].map((style) => (
                    <button key={style} onClick={() => setVoiceStyle(style)} className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-all ${voiceStyle === style ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-white/10 bg-black/20 text-zinc-300 hover:border-white/20'}`}>
                      <span className="text-sm font-medium">{style}</span>
                      {voiceStyle === style && <span className="text-[9px] font-bold uppercase tracking-wider text-amber-400">Active</span>}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col space-y-2">
                <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500"><BrainCircuit className="h-3 w-3 text-amber-500/70" /> System Prompt</label>
                <textarea value={settings.systemPrompt} onChange={(event) => updateActiveAgentPrompt(event.target.value)} className="min-h-[200px] w-full resize-y rounded-xl border border-white/10 bg-[#0A0A0B] p-4 font-mono text-xs leading-relaxed text-zinc-300 outline-none transition-all focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50" />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500"><MonitorUp className="h-3 w-3" /> Knowledge Base</label>
                <div className="rounded-xl border border-dashed border-white/15 bg-black/20 px-5 py-8 text-center">
                  <p className="text-xs text-zinc-500">Upload documents for AI context</p>
                  <input type="file" accept=".pdf,.txt,.doc,.docx" multiple aria-label="Upload knowledge base files" className="mt-3 text-xs text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-amber-500/15 file:px-3 file:py-1.5 file:text-[10px] file:font-bold file:uppercase file:tracking-wider file:text-amber-400" />
                </div>
              </div>

              <div className="mt-auto border-t border-white/10 pt-6">
                <div className="flex gap-3">
                  <button onClick={saveProfile} className="flex-1 rounded-2xl bg-amber-500 px-5 py-4 text-sm font-bold uppercase tracking-[0.25em] text-black transition-all hover:bg-amber-400 active:scale-[0.99]">
                    <Save className="mr-2 inline h-4 w-4" /> Save
                  </button>
                  <button onClick={onLogout} className="flex-1 rounded-2xl border border-red-500/25 bg-red-500/10 px-5 py-4 text-sm font-bold uppercase tracking-[0.25em] text-red-300 transition-all hover:border-red-500/45 hover:bg-red-500/15 active:scale-[0.99]">
                    <LogOut className="mr-2 inline h-4 w-4" /> Logout
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSettings && (
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ type: 'spring', stiffness: 360, damping: 32, mass: 0.8 }} className="fixed inset-0 z-[190] flex flex-col overflow-y-auto bg-[#050505] font-sans pt-[calc(env(safe-area-inset-top)+44px)] pb-[calc(env(safe-area-inset-bottom)+24px)]">
            <div className="sticky top-0 z-10 mx-auto flex w-full max-w-3xl items-center justify-between border-b border-white/[0.06] bg-[#050505]/80 p-6 backdrop-blur-xl">
              <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-500/25 to-transparent" />
              <h2 className="text-sm font-bold uppercase tracking-widest text-white">Integration Tools</h2>
              <div className="flex gap-2">
                <button onClick={saveSettings} className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold uppercase tracking-widest text-black transition-all hover:bg-amber-400 active:scale-95"><Save className="h-4 w-4" /> Save</button>
                <button onClick={() => setShowSettings(false)} aria-label="Close settings" className="rounded-xl bg-white/5 p-2 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
              </div>
            </div>
            <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-6 pb-24">

              <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent p-4 shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Tool Calling Power</div>
                <div className="mt-4 space-y-3">
                  {(['gmail', 'drive', 'context', 'vision'] as ToolKey[]).map((tool) => (
                    <label key={tool} className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                      <span className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-300">{tool}</span>
                      <input type="checkbox" checked={settings.enabledTools?.[tool] ?? DEFAULT_TOOL_TOGGLES[tool]} onChange={(event) => updateToolToggle(tool, event.target.checked)} className="h-5 w-5 cursor-pointer appearance-none rounded-md border-2 border-white/15 bg-transparent transition-all checked:border-amber-500 checked:bg-amber-500 hover:border-white/30" />
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent p-4 shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Google OAuth Permissions</div>
                  <span className="text-[9px] font-mono text-zinc-600">{getGrantedCount(oauthScopes)}/{oauthScopes.length} granted</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-white/5 mb-4 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-500" style={{ width: `${(getGrantedCount(oauthScopes) / Math.max(oauthScopes.length, 1)) * 100}%` }} />
                </div>
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {Object.entries(oauthScopes.reduce<Record<string, OAuthScopeState[]>>((acc, s) => { if (!acc[s.category]) acc[s.category] = []; acc[s.category].push(s); return acc; }, {})).map(([category, scopes]) => (
                    <div key={category} className="mb-3">
                      <div className="text-[8px] font-bold uppercase tracking-[0.25em] text-zinc-600 mb-1.5 px-1">{category}</div>
                      {scopes.map((scope) => (
                        <div key={scope.id} className="flex items-center gap-3 rounded-lg border border-white/[0.04] bg-black/20 px-3 py-2.5">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${scope.granted ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]' : 'bg-zinc-700'}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-medium text-zinc-300">{scope.label}</span>
                              <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${scope.risk === 'write' ? 'bg-yellow-500/10 text-yellow-400' : scope.risk === 'admin' ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>{scope.risk}</span>
                            </div>
                            <p className="text-[9px] text-zinc-600 mt-0.5 truncate">{scope.requiredFor}</p>
                          </div>
                          {scope.granted ? <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider">Granted</span> : <button onClick={() => handleRequestScope(scope)} className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/25 text-[9px] font-bold uppercase tracking-wider text-amber-400 hover:bg-amber-500/25 transition-all">Authorize</button>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                {getScopesToRequest(oauthScopes).length > 0 && (
                  <button onClick={handleRequestAllScopes} className="mt-4 w-full rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.22em] text-amber-300 transition-all hover:bg-amber-500/15">
                    Request All ({getScopesToRequest(oauthScopes).length} remaining)
                  </button>
                )}
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
