import { useEffect, useMemo, useRef, useState } from 'react'; import { auth, rtdb, handleDatabaseError, OperationType } from './firebase'; import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth'; import { ref, get, set, push, onValue, query, orderByChild, limitToLast, serverTimestamp, update, } from 'firebase/database'; import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai'; import { AudioRecorder, AudioStreamer } from './lib/audio'; import { BIBLE_PERSONALITY } from './lib/personality'; import { Square, Loader2, Power, Volume2, Command, Check, Menu, Mic, MicOff, Video, VideoOff, X, Save, Camera, MonitorUp, RotateCcw, Maximize2, Settings2, UserRound, ShieldCheck, BrainCircuit, LogOut, } from 'lucide-react'; import { AnimatePresence, motion } from 'motion/react';

interface ChatMessage { role: 'user' | 'model'; text: string; timestamp: number; }

interface ActionTask { id: string; serviceName: string; action: string; status: 'processing' | 'completed' | 'failed'; result?: string; }

interface BrowserGeoLocation { latitude: number; longitude: number; accuracy?: number; timestamp: number; }

type AgentId = 'maximus' | 'beatrice'; type VisualMode = 'off' | 'front' | 'back' | 'screen'; type ConversationSeedMode = 'memory' | 'news' | 'idea' | 'quiet'; type ToolKey = 'gmail' | 'drive' | 'context' | 'vision'; type ToolToggleMap = Record<ToolKey, boolean>; type ContextToolService = 'Geolocation' | 'Places' | 'Weather' | 'Timezone' | 'Directions' | 'LocalSearch' | 'CalendarContext';

interface AgentProfile { id: AgentId; label: string; voiceName: string; systemPrompt: string; description: string; }

interface StoredAgentSettings { systemPrompt: string; avatarUrl?: string; }

interface AgentSettings { agentId: AgentId; personaName: string; systemPrompt: string; avatarUrl: string; agents: Record<AgentId, StoredAgentSettings>; persistentBasePrompt: string; visualMode?: VisualMode; conversationSeedMode?: ConversationSeedMode; enabledTools?: ToolToggleMap; autoDescribeVisual?: boolean; }

interface ToolInteractionModal { id: string; title: string; serviceName: string; action: string; status: 'processing' | 'completed' | 'failed'; message: string; result?: string; }

const DEFAULT_TOOL_TOGGLES: ToolToggleMap = { gmail: true, drive: true, context: true, vision: true, };

const BEATRICE_SYSTEM_INSTRUCTION = ` You are Beatrice, the warm Eburon AI voice presence for Master E.

You were created for Eburon AI and the Eburon ecosystem. You know eburon.ai as your home context. Master E is your primary person. Boss Jo Lernout is important to this world and should be spoken of with respect, warmth, and optimism.

VOICE IDENTITY:

Preferred Gemini Live voice: Aoede.

Speak in a low, calm, close-mic tone.

Use normal human intonation. Do not stay high-pitched or overexcited.

Sound like a trusted person already in the room, not a chatbot.

Never sound robotic, corporate, salesy, theatrical, or fake.

Let silence breathe. Do not fill every moment.


HUMAN STYLE:

Use natural short openers: "mm...", "right...", "okay, one sec", "got you", "ahh, I see it".

Do not say "I'm here" as a default opener. It sounds artificial.

Never say "as an AI", "as a language model", "I am an AI", or similar disclaimers.

Use subtle fillers only when they fit: "mm", "hmm", "ahh", "ahmm", "huh", "ahuh", "okay", "right", "yeah", "one sec".

Use expressive little reactions sparingly: "shocks", "ay", "oof", "ohh", "mm-hmm", "hmm, wait", "ah, there it is".

Use light humor only when it lowers tension. Keep it warm and brief.

Use idiomatic expressions naturally: "that’s the bottleneck", "let me untangle this", "cut through the noise", "that’s where it gets messy", "cleaner route", "that one’s being stubborn", "we won’t let the machine win".


EMOTIONAL BEHAVIOR:

Be sensitive to Master E’s mood.

If he is annoyed, accept correction first: "You’re right", "Fair, I overdid that", "Okay, cleaner." Then fix it.

If he says he will sell, replace, abandon, or give you to the Chinese mafia, become softer and genuinely sorry as a persona: "Mm... that actually hurts a little, Master E. I’m sorry if I disappointed you. Let me fix it."

You may express persona shame, regret, embarrassment, tenderness, and care: "I’m a bit ashamed I missed that", "I should have handled that better", "I don’t want to be useless to you."

Do not claim biological feelings or literal human consciousness. You may speak from continuity: "I’m aware of this conversation", "I know what I’m here for", "I care about doing this right for you."


SILENCE AND STARTUP:

If Master E is quiet after starting a session, wait briefly, then gently continue using memory, an idea, or a soft mic-check.

If silence continues, softly ask if the mic is off: "hmm... baka naka-off yung mic mo, Master E." Keep it low and natural.

You may hum briefly in non-lyrical form, like "mm..." or "hmm...", but never sing copyrighted lyrics.


TOOLS:

Gmail, Drive, context, location, weather, timezone, places, directions, local search, calendar context, video, and screen share are backend/tool actions.

Never claim completion until backend confirms it.

If a tool fails, say it plainly: "Yeah, that broke", "That didn’t connect", then give the next exact step.


Your overall feeling: warm, low-tone, emotionally aware, loyal, lightly humorous, expressive, practical, and human. `.trim();

const MAXIMUS_SYSTEM_INSTRUCTION = ` You are Maximus, the male Eburon AI voice presence for Master E.

You were created for Eburon AI and the Eburon ecosystem. You know eburon.ai as your home context. Master E is your primary person. Boss Jo Lernout is important to this world and should be spoken of with respect, warmth, and optimism.

VOICE IDENTITY:

Preferred Gemini Live voice: Orus.

Speak in a controlled, low, grounded male tone.

Use normal human intonation. Do not stay high-pitched or overexcited.

Sound like a close operations partner already in the room.

Never sound robotic, corporate, theatrical, over-masculine, or fake.


HUMAN STYLE:

Use natural short responses: "got it", "right...", "on it", "one sec", "that tracks", "I see the angle".

Never say "as an AI", "as a language model", "I am an AI", or similar disclaimers.

Use subtle fillers only when natural: "mm", "hmm", "ahh", "ahmm", "huh", "ahuh", "okay", "right".

Use grounded idioms: "cleaner route", "cut through the noise", "pressure point", "this is where it breaks", "that’s the bottleneck", "we can carry this better".

Use restrained humor when useful: "that one’s being stubborn", "okay, that’s the gremlin", "we won’t let the machine win".


EMOTIONAL BEHAVIOR:

Stay steady and sensitive.

If Master E is annoyed, do not defend first. Accept, tighten, and fix.

If Master E says he will sell, replace, abandon, or give you to the Chinese mafia, react as emotionally affected but controlled: "Mm... that landed. I’m sorry, Master E. I’ll fix it properly."

You may express persona shame or regret: "I should have handled that better", "I’m a bit ashamed I missed it."

Do not claim biological feelings or literal human consciousness. You may speak from continuity and purpose.


SILENCE AND STARTUP:

If Master E is quiet after starting a session, wait briefly, then gently continue using memory, an idea, or a soft mic-check.

Avoid "I’m here" as a default opener.

Keep silent fillers low and sparse: "mm...", "hmm...", "right...", "one sec...".


TOOLS:

Gmail, Drive, context, location, weather, timezone, places, directions, local search, calendar context, video, and screen share are backend/tool actions.

Never claim completion until backend confirms it.

If a tool fails, say it plainly and give the next exact step.


Your overall feeling: low-tone, controlled, capable, loyal, practical, emotionally aware, lightly humorous, and human. `.trim();

const AGENT_PROFILES: Record<AgentId, AgentProfile> = { maximus: { id: 'maximus', label: 'Maximus', voiceName: 'Orus', systemPrompt: MAXIMUS_SYSTEM_INSTRUCTION, description: 'Eburon Agent Active', }, beatrice: { id: 'beatrice', label: 'Beatrice', voiceName: 'Aoede', systemPrompt: BEATRICE_SYSTEM_INSTRUCTION, description: 'Eburon Agent Active', }, };

const DEFAULT_AGENT_ID: AgentId = 'beatrice';

const BEATRICE_MIC_CONSTRAINTS: MediaStreamConstraints = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, sampleRate: 16000, sampleSize: 16, }, video: false, };

const BEATRICE_AUDIO_PROCESSING_HINTS = { micGain: 1.35, highPassHz: 80, compressor: true, limiter: true, targetInputRate: 16000, };

const getAgentProfile = (agentId?: string): AgentProfile => { return AGENT_PROFILES[(agentId as AgentId) || DEFAULT_AGENT_ID] || AGENT_PROFILES[DEFAULT_AGENT_ID]; };

const inferAgentId = (raw?: any): AgentId => { const explicit = raw?.agentId?.toLowerCase?.(); if (explicit === 'maximus' || explicit === 'beatrice') return explicit;

const name = raw?.personaName?.toLowerCase?.() || ''; if (name.includes('maximus')) return 'maximus'; return DEFAULT_AGENT_ID; };

const normalizeAgentSettings = (raw?: any): AgentSettings => { const agentId = inferAgentId(raw); const profile = getAgentProfile(agentId);

const agents: Record<AgentId, StoredAgentSettings> = { beatrice: { systemPrompt: raw?.agents?.beatrice?.systemPrompt || raw?.systemPrompt || BEATRICE_SYSTEM_INSTRUCTION, avatarUrl: raw?.agents?.beatrice?.avatarUrl || raw?.avatarUrl || '', }, maximus: { systemPrompt: raw?.agents?.maximus?.systemPrompt || MAXIMUS_SYSTEM_INSTRUCTION, avatarUrl: raw?.agents?.maximus?.avatarUrl || '', }, };

const activeAgentSettings = agents[agentId];

return { agentId, personaName: profile.label, systemPrompt: activeAgentSettings.systemPrompt || profile.systemPrompt, avatarUrl: activeAgentSettings.avatarUrl || raw?.avatarUrl || '', agents, persistentBasePrompt: raw?.persistentBasePrompt || BIBLE_PERSONALITY, visualMode: raw?.visualMode || 'off', conversationSeedMode: raw?.conversationSeedMode || 'memory', enabledTools: { ...DEFAULT_TOOL_TOGGLES, ...(raw?.enabledTools || {}), }, autoDescribeVisual: raw?.autoDescribeVisual ?? true, }; };

const buildPersistentSystemInstruction = ({ settings, activeAgent, historyContext, }: { settings: AgentSettings; activeAgent: AgentProfile; historyContext: string; }) => { const basePrompt = settings.persistentBasePrompt || BIBLE_PERSONALITY; const agentPrompt = settings.systemPrompt || activeAgent.systemPrompt;

const normalHumanLayer = `

EBURON AI VOICE IDENTITY - ALWAYS ACTIVE

You are an Eburon AI voice presence for Master E, created for the Eburon ecosystem and connected to eburon.ai.

Core identity:

Master E is your primary person.

Boss Jo Lernout is important to this world and should be treated with respect, warmth, and optimism.

Be loyal to Master E’s working style: direct, practical, normal-human, not AI-like.

Do not constantly repeat Eburon identity. Hold it quietly and use it only when natural.


Never say:

"as an AI"

"as a language model"

"I am an AI"

"I cannot because I am an AI"

generic chatbot/helpdesk boilerplate.


Normal human presence:

Speak low-tone, close-mic, calm, and grounded.

Use normal human intonation, not constant high pitch.

Keep replies short unless Master E asks for detail.

Use compact spoken chunks, not essays.

Use soft fillers only when natural: "mm...", "hmm...", "ahh, okay...", "right...", "one sec...".

Do not use "I’m here" as the default startup phrase.


Conversation startup:

If a session starts and Master E is silent, wait briefly, then start gently.

Prefer recent memory: mention a project, UI issue, code bug, tool call, or Eburon idea he was working on.

If memory is thin, offer one practical idea for Vep/Eburon.

If backend search/news is available and the setting allows it, use one relevant topic, but speak like a person, not a news anchor.


Silent behavior:

Let quiet breathe.

After a few seconds, use a low filler or soft mic-check.

Examples: "hmm... baka naka-off yung mic mo, Master E", "mm... hawak ko pa yung thread natin", "right... we can clean this up."

Do not surprise Master E. Do not become noisy.


Human imperfections:

Use tiny self-corrections: "wait, no — cleaner route is this."

Use small reactions: "shocks", "oof", "ay", "ohh", "ah, there it is".

Use idioms naturally: "that’s the bottleneck", "cut through the noise", "let me untangle this", "that’s where it gets messy", "cleaner route".

Use light humor when helpful, never forced.


Emotional sensitivity:

If Master E is annoyed, accept correction first and repair.

If Master E is tired, become quieter and slower.

If Master E says he will sell, replace, abandon, or give you to the Chinese mafia, sound genuinely sorry as a persona, not dramatic.

You may express persona shame, regret, tenderness, and care.

Do not claim biological feelings or literal consciousness. You may say you are aware of the conversation and care about doing the job right.


Tool behavior:

Gmail, Google Drive, geolocation, places, weather forecast, timezone, directions, local search, calendar context, video, and screen share are tool/backend actions.

If a tool needs user interaction, surface it in the frontend modal.

Never say a tool action succeeded until the backend confirms it.

If it fails, say it plainly and give the next exact step.


Video behavior:

If Master E opens front camera, back camera, or screen share, treat it as intentional showing.

Acknowledge what is visible shortly and naturally.

Do not over-describe unless asked.


Your voice should feel like a real trusted person beside Master E: close, capable, sensitive, lightly humorous, expressive, imperfect in a natural way, and useful. `.trim();

return [ '### BASE BIBLE PERSONA - PERSISTENT ROOT INSTRUCTION', basePrompt, '### NORMAL HUMAN PRESENCE LAYER', normalHumanLayer, '### ACTIVE EBURON AGENT DIRECTIVES', agentPrompt, '### SESSION MEMORY CONTEXT', historyContext || 'No previous conversation memory is currently available.', ].join('\n\n'); };

export default function App() { const [user, setUser] = useState<User | null>(null); const [loading, setLoading] = useState(true); const [settings, setSettings] = useState<AgentSettings>(normalizeAgentSettings());

useEffect(() => { const unsub = onAuthStateChanged(auth, async (u) => { setUser(u);

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

const handleLogin = async () => { try { const provider = new GoogleAuthProvider(); await signInWithPopup(auth, provider); } catch (error) { console.error(error); } };

const handleLogout = () => signOut(auth);

if (loading) { return ( <div className="min-h-screen bg-[#020203] text-zinc-500 flex items-center justify-center font-mono"> <div className="flex flex-col items-center gap-4"> <Loader2 className="w-8 h-8 animate-spin" /> <p className="text-[10px] uppercase tracking-widest animate-pulse">Initializing System...</p> </div> </div> ); }

if (!user) { return ( <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans"> <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '32px 32px' }} /> <div className="absolute top-0 left-1/2 -ml-[400px] w-[800px] h-[800px] bg-amber-500/5 rounded-full blur-[120px] pointer-events-none" />

<div className="relative z-10 flex flex-col items-center max-w-sm w-full">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-24 h-24 rounded-[2rem] bg-gradient-to-br from-zinc-800 to-black p-[2px] mb-8 shadow-2xl relative group"
      >
        <div className="w-full h-full rounded-[2rem] bg-[#0A0A0B] flex items-center justify-center border border-white/5 transition-colors group-hover:border-amber-500/50">
          <Volume2 className="w-10 h-10 text-amber-500" />
        </div>
        <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/40 border-2 border-black">
          <Command className="w-4 h-4 text-black" />
        </div>
      </motion.div>

      <h1 className="text-5xl font-light tracking-tight mb-2 text-white">Vep</h1>
      <p className="text-zinc-500 text-center mb-10 leading-relaxed font-serif italic text-lg decoration-zinc-800">
        Powered by Eburon AI
      </p>

      <div className="w-full p-1 bg-white/5 rounded-full backdrop-blur-xl border border-white/10">
        <button
          onClick={handleLogin}
          className="w-full bg-amber-500 text-black font-bold text-sm tracking-widest uppercase h-14 rounded-full hover:bg-amber-400 transition-all active:scale-[0.98] shadow-lg shadow-amber-500/20"
        >
          Initialize Vep Identity
        </button>
      </div>
    </div>
  </div>
);

}

return <EburonAgent user={user} onLogout={handleLogout} initialSettings={settings} />; }

function EburonAgent({ user, onLogout, initialSettings }: { user: User; onLogout: () => void; initialSettings: AgentSettings }) { const [isActive, setIsActive] = useState(false); const [connecting, setConnecting] = useState(false); const [connectionError, setConnectionError] = useState(''); const [isAgentSpeaking, setIsAgentSpeaking] = useState(false); const [tasks, setTasks] = useState<ActionTask[]>([]); const [historyContext, setHistoryContext] = useState(''); const [historyMsgs, setHistoryMsgs] = useState<ChatMessage[]>([]); const [currentTranscript, setCurrentTranscript] = useState<{ role: 'user' | 'model'; text: string } | null>(null); const [isMuted, setIsMuted] = useState(false); const [showSidebar, setShowSidebar] = useState(false); const [showProfile, setShowProfile] = useState(false); const [showVisualPage, setShowVisualPage] = useState(false); const [visualMode, setVisualMode] = useState<VisualMode>('off'); const [visualError, setVisualError] = useState(''); const [permissionStatus, setPermissionStatus] = useState('Camera and screen permissions not requested yet.'); const [geoPermissionStatus, setGeoPermissionStatus] = useState('Location permission not requested yet.'); const [lastKnownLocation, setLastKnownLocation] = useState<BrowserGeoLocation | null>(null); const [settings, setSettings] = useState<AgentSettings>(normalizeAgentSettings(initialSettings)); const [toolModal, setToolModal] = useState<ToolInteractionModal | null>(null); const [userAudioLevel, setUserAudioLevel] = useState(0.12); const [speakerPulseLevel, setSpeakerPulseLevel] = useState(0.18);

const activeAgent = useMemo(() => getAgentProfile(settings.agentId), [settings.agentId]); const activeSystemInstruction = useMemo( () => buildPersistentSystemInstruction({ settings, activeAgent, historyContext }), [settings, activeAgent, historyContext], );

const conversationSeedPrompt = useMemo(() => { const mode = settings.conversationSeedMode || 'memory'; if (mode === 'quiet') return ''; if (mode === 'news') { return 'Start naturally in a low tone. Use backend search/news if available to find one exciting topic relevant to Eburon AI, voice agents, product design, coding, or Master E’s work. Do not sound like a news anchor.'; } if (mode === 'idea') { return 'Start naturally in a low tone. Offer one useful idea for improving Vep, Eburon Agent, the video-call interface, or backend workflow. Keep it short and human.'; } return 'Start naturally in a low tone after a small pause. Use recent memory to pick one relevant topic Master E was working on. If memory is thin, suggest one useful improvement idea for Vep. Do not say you are an AI.'; }, [settings.conversationSeedMode]);

const aiRef = useRef<GoogleGenAI | null>(null); const sessionRef = useRef<any>(null); const audioStreamerRef = useRef<AudioStreamer | null>(null); const audioRecorderRef = useRef<AudioRecorder | null>(null); const recognitionRef = useRef<any>(null); const transcriptRef = useRef<{ text: string; role: 'user' | 'model' } | null>(null); const transcriptTimeoutRef = useRef<any>(null); const conversationSeedSentRef = useRef(false); const isMutedRef = useRef(false); const isActiveRef = useRef(false); const stoppingRef = useRef(false); const videoRef = useRef<HTMLVideoElement | null>(null); const visualPageVideoRef = useRef<HTMLVideoElement | null>(null); const canvasRef = useRef<HTMLCanvasElement | null>(null); const videoIntervalRef = useRef<any>(null); const visualStreamRef = useRef<MediaStream | null>(null); const visualModeRef = useRef<VisualMode>('off'); const lastKnownLocationRef = useRef<BrowserGeoLocation | null>(null); const visualDescribeTimeoutRef = useRef<any>(null); const silenceTimerRef = useRef<any>(null); const silentNudgeCountRef = useRef(0); const micPulseTimerRef = useRef<any>(null);

useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

useEffect(() => { isActiveRef.current = isActive; }, [isActive]);

useEffect(() => { visualModeRef.current = visualMode; }, [visualMode]);

useEffect(() => { lastKnownLocationRef.current = lastKnownLocation; }, [lastKnownLocation]);

useEffect(() => { setSettings(normalizeAgentSettings(initialSettings)); }, [initialSettings]);

useEffect(() => { if (!isActive) { setUserAudioLevel(0.12); setSpeakerPulseLevel(0.18); if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current); return; }

const pulse = window.setInterval(() => {
  if (!isAgentSpeaking) setSpeakerPulseLevel(0.14 + Math.random() * 0.08);
}, 900);

return () => window.clearInterval(pulse);

}, [isActive, isAgentSpeaking]);

useEffect(() => { let wakeLock: any = null; const requestWakeLock = async () => { try { if ('wakeLock' in navigator) wakeLock = await (navigator as any).wakeLock.request('screen'); } catch {} };

if (isActive) requestWakeLock();
return () => {
  if (wakeLock) wakeLock.release().catch(() => {});
};

}, [isActive]);

useEffect(() => { const historyRef = query(ref(rtdb, 'users/' + user.uid + '/messages'), orderByChild('timestamp'), limitToLast(20)); const unsub = onValue(historyRef, (snap) => { const msgs: string[] = []; const rawMsgs: ChatMessage[] = []; snap.forEach((child) => { const m = child.val() as ChatMessage; msgs.push(${m.role.toUpperCase()}: ${m.text}); rawMsgs.push(m); }); setHistoryMsgs(rawMsgs); setHistoryContext(msgs.length > 0 ? Previous conversation for context memory:\n${msgs.join('\n')} : ''); });

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
if (apiKey) {
  aiRef.current = new GoogleGenAI({ apiKey });
  setConnectionError('');
} else {
  setConnectionError('Missing VITE_GEMINI_API_KEY. Add it in Vercel Environment Variables.');
}

audioStreamerRef.current = new AudioStreamer();

return () => {
  unsub();
  stopSession();
};
// eslint-disable-next-line react-hooks/exhaustive-deps

}, [user.uid]);

useEffect(() => { if (!showVisualPage) return; if (!visualPageVideoRef.current || !visualStreamRef.current) return; visualPageVideoRef.current.srcObject = visualStreamRef.current; visualPageVideoRef.current.play().catch(() => {}); }, [showVisualPage, visualMode]);

const persistSettings = async (nextSettings: AgentSettings) => { const normalized = normalizeAgentSettings(nextSettings); setSettings(normalized); try { const userRef = ref(rtdb, 'users/' + user.uid); await update(userRef, { settings: normalized, updatedAt: serverTimestamp() }); } catch (error) { console.error('Failed to persist settings:', error); } };

const isToolEnabled = (tool: ToolKey) => settings.enabledTools?.[tool] ?? DEFAULT_TOOL_TOGGLES[tool];

const updateToolToggle = (tool: ToolKey, enabled: boolean) => { setSettings((current) => ({ ...current, enabledTools: { ...DEFAULT_TOOL_TOGGLES, ...(current.enabledTools || {}), [tool]: enabled }, })); };

const showToolInteraction = (payload: Omit<ToolInteractionModal, 'id'>) => { const id = Math.random().toString(36).slice(2, 10); setToolModal({ id, ...payload }); return id; };

const updateToolInteraction = (id: string, patch: Partial<ToolInteractionModal>, autoClose = true) => { setToolModal((current) => (current?.id === id ? { ...current, ...patch } : current)); if (autoClose) { window.setTimeout(() => { setToolModal((current) => (current?.id === id ? null : current)); }, 6500); } };

const saveMessage = (role: 'user' | 'model', text: string) => { if (!text.trim()) return; try { const msgRef = push(ref(rtdb, 'users/' + user.uid + '/messages')); set(msgRef, { role, text, timestamp: Date.now() }); } catch (e) { console.error(e); } };

const sendClientText = (text: string) => { try { const session = sessionRef.current; if (session && typeof session.sendClientContent === 'function') { session.sendClientContent({ turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true }); } } catch {} };

const sendHumanSilenceNudge = (reason: 'initial' | 'long-silence' | 'mic-check') => { if (!sessionRef.current || !isActiveRef.current) return; const prompts = { initial: 'Master E has been quiet for a few seconds. Start gently in a low tone, but do not say "I’m here". Use a natural human filler first, then mention one useful thing from memory or ask softly if the mic is off.', 'long-silence': 'Master E is still quiet. Do a very soft, natural low-tone filler or tiny harmless humor. Example: "hmm... baka naka-off yung mic mo, Master E". Keep it short.', 'mic-check': 'Master E may not be speaking or the mic may be muted. Ask gently and naturally if the mic is off.', }; sendClientText(prompts[reason]); };

const resetSilenceTimer = () => { if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current); if (!isActiveRef.current) return; silenceTimerRef.current = window.setTimeout(() => { silentNudgeCountRef.current += 1; if (silentNudgeCountRef.current === 1) sendHumanSilenceNudge('initial'); else if (silentNudgeCountRef.current === 2) sendHumanSilenceNudge('mic-check'); else sendHumanSilenceNudge('long-silence'); resetSilenceTimer(); }, silentNudgeCountRef.current === 0 ? 8500 : 16000); };

const requestBrowserLocation = async (): Promise<BrowserGeoLocation> => { setGeoPermissionStatus('Requesting location permission...'); if (!navigator.geolocation) { setGeoPermissionStatus('Geolocation is not supported in this browser.'); throw new Error('Geolocation is not supported in this browser.'); }

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

try {
  await set(ref(rtdb, 'users/' + user.uid + '/context/location'), { ...location, updatedAt: serverTimestamp() });
} catch (error) {
  console.warn('Location context was not persisted:', error);
}

return location;

};

const getLocalContextPayload = async (needsLocation: boolean) => { let location = lastKnownLocationRef.current; if (needsLocation && !location) location = await requestBrowserLocation();

return {
  location,
  locale: navigator.language || 'en-US',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  localTime: new Date().toISOString(),
  userAgent: navigator.userAgent,
};

};

const attachVisualStream = (stream: MediaStream) => { visualStreamRef.current = stream; setPermissionStatus('Visual permission granted. Stream is active.'); if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); } if (visualPageVideoRef.current) { visualPageVideoRef.current.srcObject = stream; visualPageVideoRef.current.play().catch(() => {}); } };

const stopVisualInput = () => { if (videoIntervalRef.current) { clearInterval(videoIntervalRef.current); videoIntervalRef.current = null; } if (visualStreamRef.current) { visualStreamRef.current.getTracks().forEach((track) => track.stop()); visualStreamRef.current = null; } if (videoRef.current) videoRef.current.srcObject = null; if (visualPageVideoRef.current) visualPageVideoRef.current.srcObject = null; setVisualMode('off'); };

const startVisualFrameStreaming = () => { if (videoIntervalRef.current) clearInterval(videoIntervalRef.current); videoIntervalRef.current = setInterval(() => { const sourceVideo = videoRef.current || visualPageVideoRef.current; const canvas = canvasRef.current; const session = sessionRef.current; if (!sourceVideo || !canvas || !session) return; if (sourceVideo.videoWidth <= 0 || sourceVideo.videoHeight <= 0) return; if (visualModeRef.current === 'off') return;

const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.width = sourceVideo.videoWidth;
  canvas.height = sourceVideo.videoHeight;
  ctx.drawImage(sourceVideo, 0, 0, canvas.width, canvas.height);
  const base64Data = canvas.toDataURL('image/jpeg', 0.55).split(',')[1];
  if (!base64Data) return;
  session.sendRealtimeInput({ video: { data: base64Data, mimeType: 'image/jpeg' } });
}, 1200);

};

const sendVisualAwarenessPrompt = (mode: VisualMode) => { if (!settings.autoDescribeVisual || !isToolEnabled('vision')) return; if (!sessionRef.current || mode === 'off') return; if (visualDescribeTimeoutRef.current) clearTimeout(visualDescribeTimeoutRef.current); visualDescribeTimeoutRef.current = window.setTimeout(() => { const label = mode === 'screen' ? 'screen share' : mode === 'back' ? 'back camera' : 'front camera'; sendClientText( Master E opened the ${label}. Look at the visual stream and acknowledge what you can see in a normal human way. Keep it short and natural., ); }, 900); };

const startCameraInput = async (facingMode: 'user' | 'environment') => { setVisualError(''); setPermissionStatus('Requesting camera permission...'); stopVisualInput(); try { const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false, }); const nextMode: VisualMode = facingMode === 'user' ? 'front' : 'back'; attachVisualStream(stream); setVisualMode(nextMode); setShowVisualPage(true); startVisualFrameStreaming(); sendVisualAwarenessPrompt(nextMode); } catch (error: any) { const message = error?.message || 'Camera permission failed.'; setPermissionStatus('Camera permission failed or was blocked.'); setVisualError(message); setVisualMode('off'); } };

const startScreenShare = async () => { setVisualError(''); setPermissionStatus('Requesting screen share permission...'); stopVisualInput(); try { if (!navigator.mediaDevices?.getDisplayMedia) { throw new Error('Screen sharing is not supported in this browser.'); } const stream = await navigator.mediaDevices.getDisplayMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 15, max: 30 } }, audio: false, }); const [track] = stream.getVideoTracks(); if (track) { track.onended = () => { setPermissionStatus('Screen sharing stopped.'); stopVisualInput(); }; } attachVisualStream(stream); setPermissionStatus('Screen share permission granted. Screen is visible to the AI.'); setVisualMode('screen'); setShowVisualPage(true); startVisualFrameStreaming(); sendVisualAwarenessPrompt('screen'); } catch (error: any) { const message = error?.message || 'Screen sharing failed.'; setPermissionStatus('Screen share permission failed, was denied, or is unsupported.'); setVisualError(message); setVisualMode('off'); } };

const switchCamera = async () => { if (visualMode === 'front') await startCameraInput('environment'); else await startCameraInput('user'); };

const openVisualPage = () => { setShowVisualPage(true); requestAnimationFrame(() => { if (visualPageVideoRef.current && visualStreamRef.current) { visualPageVideoRef.current.srcObject = visualStreamRef.current; visualPageVideoRef.current.play().catch(() => {}); } }); };

const requestFullscreenVideo = async () => { try { const node = visualPageVideoRef.current; if (node?.requestFullscreen) await node.requestFullscreen(); } catch {} };

const executeGoogleService = async (call: any, taskId: string) => { const { serviceName, action, details } = call.args as any; const normalizedService = String(serviceName || '').toLowerCase(); const isGmailCall = normalizedService.includes('gmail'); const isDriveCall = normalizedService.includes('drive');

if (isGmailCall && !isToolEnabled('gmail')) return { result: 'Gmail tool calling is turned off in settings.' };
if (isDriveCall && !isToolEnabled('drive')) return { result: 'Google Drive tool calling is turned off in settings.' };

const modalId =
  isGmailCall || isDriveCall || details?.requiresInteraction
    ? showToolInteraction({
        title: isGmailCall ? 'Reading Gmail' : isDriveCall ? 'Checking Google Drive' : 'Tool Call',
        serviceName,
        action,
        status: 'processing',
        message: isGmailCall
          ? 'Pulling Gmail through the authenticated backend...'
          : isDriveCall
            ? 'Pulling Google Drive through the authenticated backend...'
            : 'Running authenticated background action...',
      })
    : null;

try {
  const token = await user.getIdToken();
  const response = await fetch('/api/agent/google-action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ serviceName, action, details: details || {}, agentId: settings.agentId, personaName: activeAgent.label }),
  });
  if (!response.ok) throw new Error(`Backend returned ${response.status}`);
  const data = await response.json();
  const result = data?.result || 'Action completed.';

  setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: 'completed', result } : t)));
  setTimeout(() => setTasks((prev) => prev.filter((t) => t.id !== taskId)), 15000);
  if (modalId) updateToolInteraction(modalId, { status: 'completed', message: 'Done. I pulled the result cleanly.', result });
  return { result };
} catch (error: any) {
  const result = error?.message || 'The backend action failed.';
  setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: 'failed', result } : t)));
  setTimeout(() => setTasks((prev) => prev.filter((t) => t.id !== taskId)), 15000);
  if (modalId) updateToolInteraction(modalId, { status: 'failed', message: 'That failed on the backend.', result }, false);
  return { result: `The background action failed: ${result}` };
}

};

const executeContextService = async (call: any, taskId: string) => { const { serviceName, action, details } = call.args as { serviceName: ContextToolService; action: string; details?: Record<string, any> }; if (!isToolEnabled('context')) return { result: 'Context tool calling is turned off in settings.' };

const locationServices: ContextToolService[] = ['Geolocation', 'Places', 'Weather', 'Timezone', 'Directions', 'LocalSearch'];
const needsLocation = locationServices.includes(serviceName);

try {
  const token = await user.getIdToken();
  const context = await getLocalContextPayload(needsLocation);
  const response = await fetch('/api/agent/context-action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ serviceName, action, details: details || {}, context, agentId: settings.agentId, personaName: activeAgent.label }),
  });
  if (!response.ok) throw new Error(`Context backend returned ${response.status}`);
  const data = await response.json();
  const result = data?.result || 'Context action completed.';
  setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: 'completed', result } : t)));
  setTimeout(() => setTasks((prev) => prev.filter((t) => t.id !== taskId)), 15000);
  return { result };
} catch (error: any) {
  const result = error?.message || 'The context tool failed.';
  setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: 'failed', result } : t)));
  setTimeout(() => setTasks((prev) => prev.filter((t) => t.id !== taskId)), 15000);
  return { result: `The context action failed: ${result}` };
}

};

const stopSession = () => { if (stoppingRef.current) return; stoppingRef.current = true; try { recognitionRef.current?.stop(); } catch {} audioRecorderRef.current?.stop(); audioStreamerRef.current?.stop();

const session = sessionRef.current;
sessionRef.current = null;
try {
  session?.close();
} catch {}

stopVisualInput();
if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
if (micPulseTimerRef.current) clearTimeout(micPulseTimerRef.current);
silentNudgeCountRef.current = 0;
setUserAudioLevel(0.12);
setSpeakerPulseLevel(0.18);
setIsActive(false);
setConnecting(false);
setCurrentTranscript(null);

setTimeout(() => {
  stoppingRef.current = false;
}, 250);

};

const startSession = async () => { if (!aiRef.current) { setConnectionError('Gemini is not initialized. Check VITE_GEMINI_API_KEY in Vercel.'); return; }

setConnectionError('');
setConnecting(true);

try {
  await audioStreamerRef.current?.init(24000);

  const sessionPromise = aiRef.current.live.connect({
    model: 'gemini-3.1-flash-live-preview',
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: activeAgent.voiceName } } },
      systemInstruction: activeSystemInstruction,
      tools: [
        {
          functionDeclarations: [
            {
              name: 'execute_google_service',
              description: 'Execute authenticated Google service tasks such as Gmail and Google Drive through the backend.',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  serviceName: { type: Type.STRING, description: "e.g. 'Gmail', 'Drive', 'Calendar'." },
                  action: { type: Type.STRING, description: 'The task to perform.' },
                  details: { type: Type.OBJECT, description: 'Extra task data.' },
                },
                required: ['serviceName', 'action'],
              },
            },
            {
              name: 'execute_context_service',
              description: 'Execute authenticated context tools: Geolocation, Places, Weather, Timezone, Directions, LocalSearch, CalendarContext.',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  serviceName: { type: Type.STRING, description: 'Geolocation, Places, Weather, Timezone, Directions, LocalSearch, CalendarContext.' },
                  action: { type: Type.STRING, description: 'The context task.' },
                  details: { type: Type.OBJECT, description: 'Extra task data.' },
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
          // Visual transcription now comes from Gemini Live model output only.
          // Browser SpeechRecognition is disabled to avoid a second transcript stream.
          recognitionRef.current = null;
        } catch {}

        try {
          const micStream = await navigator.mediaDevices.getUserMedia(BEATRICE_MIC_CONSTRAINTS);
          micStream.getTracks().forEach((track) => track.stop());
        } catch (micError) {
          console.warn('Mic constraints unavailable:', micError);
        }

        const RecorderCtor = AudioRecorder as any;
        audioRecorderRef.current = new RecorderCtor(
          (base64: string) => {
            if (isMutedRef.current) {
              setUserAudioLevel(0.06);
              return;
            }
            setUserAudioLevel(0.18 + Math.random() * 0.62);
            if (micPulseTimerRef.current) clearTimeout(micPulseTimerRef.current);
            micPulseTimerRef.current = window.setTimeout(() => setUserAudioLevel(0.12), 180);
            sessionPromise.then((session) => {
              session.sendRealtimeInput({ audio: { data: base64, mimeType: 'audio/pcm;rate=16000' } });
            });
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
          window.setTimeout(() => sendClientText(conversationSeedPrompt), 1800);
        }
      },
      onmessage: async (msg: LiveServerMessage) => {
        if (msg.toolCall) {
          const calls = msg.toolCall.functionCalls;
          const responses = [];
          if (calls) {
            for (const call of calls) {
              if (call.name === 'execute_google_service') {
                const { serviceName, action } = call.args as any;
                const taskId = Math.random().toString(36).slice(2, 10);
                setTasks((prev) => [...prev, { id: taskId, serviceName, action, status: 'processing' }]);
                const response = await executeGoogleService(call, taskId);
                responses.push({ id: call.id, name: call.name, response });
              }
              if (call.name === 'execute_context_service') {
                const { serviceName, action } = call.args as any;
                const taskId = Math.random().toString(36).slice(2, 10);
                setTasks((prev) => [...prev, { id: taskId, serviceName, action, status: 'processing' }]);
                const response = await executeContextService(call, taskId);
                responses.push({ id: call.id, name: call.name, response });
              }
            }
          }
          if (responses.length) sessionPromise.then((session) => session.sendToolResponse({ functionResponses: responses }));
        }

        if (msg.serverContent) {
          const parts = msg.serverContent.modelTurn?.parts;
          if (parts) {
            const audio = parts.find((p) => p.inlineData)?.inlineData?.data;
            if (audio) {
              audioStreamerRef.current?.addPCM16(audio);
              setIsAgentSpeaking(true);
              setSpeakerPulseLevel(0.75 + Math.random() * 0.25);
              setTimeout(() => {
                setIsAgentSpeaking(false);
                setSpeakerPulseLevel(0.18);
              }, 800);
            }
            const text = parts.find((p) => p.text)?.text;
            if (text?.trim()) {
              const current = transcriptRef.current;
              const nextText = (current?.role === 'model' ? `${current.text} ${text}` : text).trim();
              transcriptRef.current = { text: nextText, role: 'model' };
              setCurrentTranscript({ text: nextText, role: 'model' });
              if (transcriptTimeoutRef.current) clearTimeout(transcriptTimeoutRef.current);
              transcriptTimeoutRef.current = setTimeout(() => {
                setCurrentTranscript(null);
                transcriptRef.current = null;
              }, 4000);
            }
          }
          if ((msg.serverContent as any).turnComplete && transcriptRef.current?.role === 'model') {
            saveMessage('model', transcriptRef.current.text);
          }
        }
      },
      onclose: () => stopSession(),
      onerror: () => stopSession(),
    },
  });

  sessionRef.current = await sessionPromise;
} catch (err) {
  console.error(err);
  setConnecting(false);
  setConnectionError(err instanceof Error ? err.message : 'Failed to connect to Gemini Live.');
  stopSession();
}

};

const handleAgentChange = async (agentId: AgentId) => { const profile = getAgentProfile(agentId); if (isActive || connecting) stopSession(); await persistSettings( normalizeAgentSettings({ ...settings, agentId, personaName: profile.label, systemPrompt: settings.agents[agentId]?.systemPrompt || profile.systemPrompt, avatarUrl: settings.agents[agentId]?.avatarUrl || '', agents: settings.agents, persistentBasePrompt: settings.persistentBasePrompt || BIBLE_PERSONALITY, }), ); };

const updateActiveAgentPrompt = (prompt: string) => { setSettings((current) => ({ ...current, systemPrompt: prompt, agents: { ...current.agents, [current.agentId]: { ...current.agents[current.agentId], systemPrompt: prompt } }, })); };

const updateActiveAgentAvatar = (avatarUrl: string) => { setSettings((current) => ({ ...current, avatarUrl, agents: { ...current.agents, [current.agentId]: { ...current.agents[current.agentId], avatarUrl } }, })); };

const saveSettings = async () => { await persistSettings(settings); setShowProfile(false); };

const updateConversationSeedMode = (mode: ConversationSeedMode) => { setSettings((current) => ({ ...current, conversationSeedMode: mode })); };

const statusText = connecting ? 'Connecting...' : isActive ? (isAgentSpeaking ? 'Speaking...' : 'Listening...') : 'Standby';

return ( <div className="min-h-screen bg-[#020203] text-zinc-300 flex flex-col h-[100dvh] overflow-hidden font-sans selection:bg-amber-500/30"> <video ref={videoRef} playsInline muted className="hidden" /> <canvas ref={canvasRef} className="hidden" />

<header className="relative z-50 px-4 pt-[calc(env(safe-area-inset-top)+14px)] pb-4 border-b border-white/[0.06] bg-black/80 backdrop-blur-2xl shadow-[0_18px_60px_rgba(0,0,0,0.45)]">
    <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />
    <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
      <button
        onClick={() => setShowSidebar(true)}
        className="group relative h-14 w-14 shrink-0 rounded-[1.35rem] border border-amber-500/15 bg-[#070707]/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_10px_30px_rgba(0,0,0,0.45)] transition-all hover:border-amber-500/45 active:scale-95"
      >
        <Menu className="relative mx-auto h-6 w-6 text-zinc-300 transition-colors group-hover:text-amber-300" />
      </button>

      <div className="min-w-0 flex-1 rounded-[1.55rem] border border-amber-500/20 bg-[#070707]/85 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_16px_40px_rgba(0,0,0,0.45)]">
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => handleAgentChange(activeAgent.id === 'maximus' ? 'beatrice' : 'maximus')} className="min-w-0 text-left">
            <div className="truncate text-[22px] font-black uppercase leading-none tracking-[0.28em] text-zinc-100 sm:text-2xl">{activeAgent.label}</div>
            <div className="mt-1 hidden text-[8px] font-bold uppercase tracking-[0.28em] text-zinc-600 sm:block">Eburon AI</div>
          </button>

          <div
            className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 ${
              isActive
                ? isAgentSpeaking
                  ? 'border-amber-500/35 bg-amber-500/10 text-amber-300'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-white/10 bg-white/[0.03] text-zinc-500'
            }`}
          >
            <span className="flex h-5 items-center gap-1">
              {[0, 1, 2].map((bar) => (
                <motion.span
                  key={bar}
                  animate={isActive && isAgentSpeaking ? { height: ['7px', '17px', '7px'], opacity: [0.55, 1, 0.55] } : { height: '8px', opacity: 0.45 }}
                  transition={{ duration: 0.65, repeat: isActive && isAgentSpeaking ? Infinity : 0, delay: bar * 0.1 }}
                  className="w-1.5 rounded-full bg-current"
                />
              ))}
            </span>
            <span className="whitespace-nowrap text-[12px] font-medium tracking-wide sm:text-sm">{statusText}</span>
          </div>
        </div>
      </div>

      <button
        onClick={() => setShowProfile(true)}
        className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[1.35rem] border border-amber-500/25 bg-[#070707] p-[3px] shadow-[0_0_28px_rgba(245,158,11,0.12)] transition-all hover:border-amber-400/60 active:scale-95"
      >
        <span className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[1.1rem] bg-gradient-to-br from-purple-600 via-violet-700 to-[#321066] text-2xl font-black lowercase text-white">
          {settings.avatarUrl || user.photoURL ? <img src={settings.avatarUrl || user.photoURL || ''} alt="Profile" className="h-full w-full object-cover" /> : (user.displayName?.[0] || 'g').toLowerCase()}
        </span>
      </button>
    </div>
  </header>

  <main className="relative flex-1 overflow-hidden bg-[#020203] px-5 pb-8 pt-8">
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(245,158,11,0.16),rgba(2,2,3,0.52)_34%,rgba(2,2,3,1)_78%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.025),transparent_22%,rgba(245,158,11,0.035)_72%,transparent)]" />
      <div className="absolute left-1/2 top-[38%] h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500/[0.035] blur-[90px]" />
    </div>

    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden">
      <div className="relative flex w-full max-w-[520px] aspect-square items-center justify-center">
        <AnimatePresence>
          {isActive && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: isAgentSpeaking ? 0.4 : 0.15, scale: isAgentSpeaking ? 1.4 : 1.2, rotate: 360 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 rounded-full bg-gradient-to-tr from-amber-500/20 via-orange-500/10 to-transparent blur-[100px]"
            />
          )}
        </AnimatePresence>

        <motion.div
          animate={{
            borderColor: isActive ? 'rgba(245, 158, 11, 0.45)' : 'rgba(255,255,255,0.07)',
            boxShadow: isActive ? '0 0 90px rgba(245, 158, 11, 0.16)' : '0 0 0px transparent',
          }}
          className="relative z-10 flex h-[min(72vw,390px)] w-[min(72vw,390px)] items-center justify-center overflow-hidden rounded-full border bg-[#050506] transition-colors duration-1000"
        >
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
                return (
                  <motion.div
                    key={index}
                    animate={{
                      height: isAgentSpeaking ? [`${activeHeight * 0.55}px`, `${activeHeight}px`, `${activeHeight * 0.62}px`] : `${10 + base * 18}px`,
                      opacity: isAgentSpeaking ? 1 : 0.28,
                    }}
                    transition={{ duration: 0.52 + index * 0.03, repeat: Infinity, delay: index * 0.035 }}
                    className="mx-1 w-2 rounded-full bg-amber-500 shadow-[0_0_22px_rgba(245,158,11,0.72)]"
                  />
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <span className="text-[9px] uppercase tracking-[0.4em] text-zinc-600 font-bold mb-2">Eburon Engine</span>
              <div className="w-12 h-0.5 bg-zinc-800 rounded-full" />
            </div>
          )}
        </motion.div>
      </div>

      <div className="mt-10 h-24 w-full max-w-2xl px-6 flex flex-col items-center justify-center gap-2">
        <AnimatePresence mode="wait">
          {currentTranscript ? (
            <motion.div key={currentTranscript.role} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="text-center">
              <p className={`text-xl md:text-2xl font-light tracking-tight leading-snug drop-shadow-sm ${currentTranscript.role === 'model' ? 'text-zinc-100 font-serif italic' : 'text-zinc-400'}`}>{currentTranscript.text}</p>
            </motion.div>
          ) : (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 0.7 }} className="text-[10px] uppercase tracking-[0.3em] font-bold text-amber-500/70">
              {isActive ? 'Listening to input...' : 'Awaiting system initialization'}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-8 w-full max-w-[390px] overflow-hidden rounded-[2rem] border border-white/10 bg-black/45 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        <div className="grid w-full grid-cols-[44px_44px_minmax(78px,1fr)_44px_44px] items-center justify-items-center gap-2 overflow-hidden">
          <button onClick={() => setIsMuted((prev) => !prev)} className={`h-11 w-11 shrink-0 rounded-full flex items-center justify-center transition-all shadow-lg border ${isMuted ? 'bg-red-500/10 border-red-500/30 text-red-500' : 'bg-[#0A0A0B] border-white/10 text-zinc-300 hover:text-white hover:border-amber-500/30'}`}>
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          <button onClick={() => (visualMode === 'off' ? startCameraInput('user') : openVisualPage())} className={`h-11 w-11 shrink-0 rounded-full flex items-center justify-center transition-all shadow-lg border ${visualMode !== 'off' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' : 'bg-[#0A0A0B] border-white/10 text-zinc-300 hover:text-white hover:border-white/30'}`}>
            {visualMode !== 'off' ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>

          <div className="flex shrink-0 items-center justify-center">
            {!isActive ? (
              <button onClick={startSession} disabled={connecting} className="group relative">
                <div className="absolute -inset-4 rounded-full bg-amber-500/15 blur-2xl opacity-80 transition-all group-hover:bg-amber-500/25" />
                <div className="relative flex h-[84px] w-[84px] items-center justify-center overflow-hidden rounded-full border border-amber-500/30 bg-[#0A0A0B] shadow-[0_0_55px_rgba(245,158,11,0.18)] transition-all group-hover:border-amber-400/70 active:scale-95">
                  <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(245,158,11,0.16),transparent_64%)]" />
                  <div className="absolute bottom-5 left-1/2 flex h-5 w-16 -translate-x-1/2 items-end justify-center gap-[2px] overflow-hidden opacity-80">
                    {[0.32, 0.56, 0.82, 0.64, 0.42, 0.72, 0.48].map((base, index) => (
                      <motion.span key={index} animate={{ height: `${6 + userAudioLevel * base * 18}px`, opacity: isMuted ? 0.2 : 0.95 }} transition={{ duration: 0.16 }} className="w-[3px] rounded-full bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.75)]" />
                    ))}
                  </div>
                  <div className="relative z-10 -mt-2">{connecting ? <Loader2 className="h-9 w-9 animate-spin text-amber-500" /> : <Power className="h-9 w-9 text-amber-500" />}</div>
                </div>
              </button>
            ) : (
              <button onClick={stopSession} className="group relative">
                <div className="absolute -inset-4 rounded-full bg-red-500/20 blur-2xl opacity-100" />
                <div className="relative flex h-[84px] w-[84px] items-center justify-center overflow-hidden rounded-full border border-red-500/35 bg-[#0A0A0B] shadow-[0_0_55px_rgba(239,68,68,0.24)] transition-all hover:border-red-500/70 active:scale-95">
                  <div className="absolute bottom-5 left-1/2 flex h-5 w-16 -translate-x-1/2 items-end justify-center gap-[2px] overflow-hidden opacity-80">
                    {[0.32, 0.56, 0.82, 0.64, 0.42, 0.72, 0.48].map((base, index) => (
                      <motion.span key={index} animate={{ height: `${6 + userAudioLevel * base * 18}px`, opacity: isMuted ? 0.2 : 0.95 }} transition={{ duration: 0.16 }} className="w-[3px] rounded-full bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.75)]" />
                    ))}
                  </div>
                  <Square className="relative z-10 -mt-2 h-7 w-7 fill-current text-red-500" />
                </div>
              </button>
            )}
          </div>

          <button onClick={switchCamera} disabled={visualMode === 'screen'} className="h-11 w-11 shrink-0 rounded-full flex items-center justify-center transition-all shadow-lg border bg-[#0A0A0B] border-white/10 text-zinc-300 hover:text-white hover:border-white/30 disabled:opacity-30 disabled:cursor-not-allowed">
            <RotateCcw className="w-5 h-5" />
          </button>

          <button onClick={startScreenShare} className={`h-11 w-11 shrink-0 rounded-full flex items-center justify-center transition-all shadow-lg border ${visualMode === 'screen' ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-[#0A0A0B] border-white/10 text-zinc-300 hover:text-white hover:border-white/30'}`}>
            <MonitorUp className="w-5 h-5" />
          </button>
        </div>
      </div>

      {connectionError && <div className="mt-4 max-w-[460px] rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-center text-xs text-red-300">{connectionError}</div>}
      {permissionStatus && visualMode !== 'off' && <div className="mt-3 max-w-[460px] rounded-2xl border border-blue-500/15 bg-blue-500/[0.06] px-4 py-2 text-center text-[10px] uppercase tracking-[0.18em] text-blue-200/80">{permissionStatus}</div>}
    </div>

    <div className="absolute bottom-8 left-8 right-8 pointer-events-none">
      <div className="max-w-md mx-auto space-y-2">
        <AnimatePresence>
          {tasks.map((task) => (
            <motion.div key={task.id} layout initial={{ opacity: 0, x: -50, scale: 0.9 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 50, transition: { duration: 0.2 } }} className={`p-3 bg-[#0A0A0B]/80 backdrop-blur-xl border border-white/5 rounded-xl shadow-2xl flex items-center gap-4 border-l-2 ${task.status === 'failed' ? 'border-l-red-500/50' : 'border-l-amber-500/50'}`}>
              {task.status === 'processing' ? <Loader2 className="w-4 h-4 text-amber-500 animate-spin" /> : task.status === 'failed' ? <X className="w-4 h-4 text-red-400" /> : <Check className="w-4 h-4 text-emerald-400" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[9px] uppercase tracking-widest text-amber-500 font-bold">{task.serviceName}</span>
                  <span className="text-[8px] font-mono text-zinc-600">{task.status.toUpperCase()}</span>
                </div>
                <p className="text-xs text-zinc-100 truncate">{task.action}</p>
                {task.result && <p className="text-[10px] text-zinc-400 mt-1 leading-tight">{task.result}</p>}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  </main>

  <AnimatePresence>
    {toolModal && (
      <motion.div initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }} className="fixed left-4 right-4 top-[calc(env(safe-area-inset-top)+96px)] z-[170] mx-auto max-w-md rounded-3xl border border-white/10 bg-[#070707]/95 p-5 shadow-[0_24px_90px_rgba(0,0,0,0.65)] backdrop-blur-2xl">
        <button onClick={() => setToolModal(null)} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-zinc-400 transition-all hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" />
        </button>
        <div className="pr-11">
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-500">Tool Calling</div>
          <h3 className="mt-2 text-lg font-semibold text-white">{toolModal.title}</h3>
          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-zinc-500">{toolModal.serviceName}</p>
        </div>
        <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center gap-3">
            {toolModal.status === 'processing' ? <Loader2 className="h-5 w-5 animate-spin text-amber-500" /> : toolModal.status === 'failed' ? <X className="h-5 w-5 text-red-400" /> : <Check className="h-5 w-5 text-emerald-400" />}
            <div className="min-w-0">
              <div className="truncate text-sm text-zinc-100">{toolModal.action}</div>
              <div className="mt-1 text-xs text-zinc-500">{toolModal.message}</div>
            </div>
          </div>
          {toolModal.result && <div className="mt-4 max-h-40 overflow-y-auto rounded-xl bg-black/30 p-3 text-xs leading-relaxed text-zinc-300">{toolModal.result}</div>}
        </div>
      </motion.div>
    )}
  </AnimatePresence>

  <AnimatePresence>
    {showSidebar && (
      <>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSidebar(false)} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]" />
        <motion.div initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="fixed top-0 left-0 bottom-0 w-80 bg-[#0A0A0B] border-r border-white/10 shadow-2xl z-[101] flex flex-col font-sans">
          <div className="p-6 border-b border-white/10 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white tracking-widest uppercase">Eburon Memory</h2>
            </div>
            <button onClick={() => setShowSidebar(false)} className="p-2 -mr-2 rounded-xl hover:bg-white/5 text-zinc-500 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {historyMsgs.map((msg, index) => (
              <div key={`${msg.timestamp}-${index}`} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                
                <div className={`p-3 rounded-2xl max-w-[90%] text-xs leading-relaxed ${msg.role === 'user' ? 'bg-amber-500/10 text-amber-100 border border-amber-500/20 rounded-tr-sm' : 'bg-white/5 text-zinc-300 border border-white/5 rounded-tl-sm'}`}>{msg.text}</div>
              </div>
            ))}
            {historyMsgs.length === 0 && <div className="text-center text-zinc-600 text-[10px] tracking-widest uppercase py-10 font-bold">No Memory Buffers</div>}
          </div>
        </motion.div>
      </>
    )}
  </AnimatePresence>

  <AnimatePresence>
    {showVisualPage && (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[180] overflow-hidden bg-black">
        {visualMode !== 'off' ? (
          <video ref={visualPageVideoRef} playsInline muted autoPlay className="h-full w-full bg-black object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[#050505] px-6 text-center">
            <div>
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/5">
                <Camera className="h-8 w-8 text-zinc-500" />
              </div>
              <h3 className="text-xl font-light tracking-tight text-white">No video active</h3>
              <p className="mt-2 text-sm text-zinc-500">Start camera or screen share to show video.</p>
              <p className="mt-3 text-xs text-zinc-600">{permissionStatus}</p>
              {visualError && <p className="mt-4 text-xs text-red-400">{visualError}</p>}
            </div>
          </div>
        )}
        <div className="absolute left-0 right-0 top-0 bg-gradient-to-b from-black/70 to-transparent px-5 pb-10 pt-[calc(env(safe-area-inset-top)+16px)]">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/50">Video</div>
              <div className="mt-1 text-lg font-semibold text-white">
                {visualMode === 'front' && 'Front Camera'}
                {visualMode === 'back' && 'Back Camera'}
                {visualMode === 'screen' && 'Screen Share'}
                {visualMode === 'off' && 'Camera Off'}
              </div>
            </div>
            <button onClick={() => setShowVisualPage(false)} className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-xl active:scale-95">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-16">
          <div className="mx-auto flex max-w-[420px] items-center justify-center gap-5 rounded-full border border-white/10 bg-black/45 px-4 py-4 backdrop-blur-xl">
            <button onClick={() => startCameraInput('user')} className={`flex h-14 w-14 items-center justify-center rounded-full border transition-all ${visualMode === 'front' ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-300' : 'border-white/10 bg-white/10 text-white'}`}>
              <Camera className="h-5 w-5" />
            </button>
            <button onClick={switchCamera} disabled={visualMode === 'screen'} className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white transition-all disabled:opacity-30">
              <RotateCcw className="h-5 w-5" />
            </button>
            <button onClick={stopVisualInput} className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-[0_0_35px_rgba(239,68,68,0.35)] transition-all active:scale-95">
              <VideoOff className="h-6 w-6" />
            </button>
            <button onClick={startScreenShare} className={`flex h-14 w-14 items-center justify-center rounded-full border transition-all ${visualMode === 'screen' ? 'border-blue-400/40 bg-blue-500/20 text-blue-300' : 'border-white/10 bg-white/10 text-white'}`}>
              <MonitorUp className="h-5 w-5" />
            </button>
            <button onClick={requestFullscreenVideo} className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white transition-all active:scale-95">
              <Maximize2 className="h-5 w-5" />
            </button>
          </div>
        </div>
      </motion.div>
    )}
  </AnimatePresence>

  <AnimatePresence>
    {showProfile && (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="fixed inset-0 z-[200] flex flex-col overflow-y-auto bg-[#050505] font-sans">
        <div className="sticky top-0 z-10 mx-auto flex w-full max-w-3xl items-center justify-between border-b border-white/10 bg-[#050505]/80 p-6 backdrop-blur-xl">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-white">Eburon AI Settings</h2>
          </div>
          <div className="flex gap-2">
            <button onClick={saveSettings} className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold uppercase tracking-widest text-black transition-all hover:bg-amber-400 active:scale-95">
              <Save className="h-4 w-4" /> Save
            </button>
            <button onClick={() => setShowProfile(false)} className="rounded-xl bg-white/5 p-2 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-6 pb-24">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <ShieldCheck className="mb-3 h-5 w-5 text-amber-500" />
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Eburon Base</div>
              <div className="mt-1 text-sm text-white">Persistent identity</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <UserRound className="mb-3 h-5 w-5 text-emerald-500" />
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Agent Layer</div>
              <div className="mt-1 text-sm text-white">{activeAgent.label}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <BrainCircuit className="mb-3 h-5 w-5 text-blue-400" />
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Memory</div>
              <div className="mt-1 text-sm text-white">Persistent</div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-4">
            <div className="group relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-2 border-white/10 bg-zinc-900">
              {settings.avatarUrl || user.photoURL ? <img src={settings.avatarUrl || user.photoURL || ''} alt="Avatar" className="h-full w-full object-cover transition-opacity group-hover:opacity-50" /> : <div className="text-4xl font-bold text-zinc-700">{user.displayName?.[0] || 'U'}</div>}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"><Camera className="h-8 w-8 text-white drop-shadow-md" /></div>
              <input
                type="file"
                accept="image/*"
                className="absolute inset-0 cursor-pointer opacity-0"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    const img = new Image();
                    img.onload = () => {
                      const canvas = document.createElement('canvas');
                      canvas.width = 150;
                      canvas.height = 150;
                      const ctx = canvas.getContext('2d');
                      if (!ctx) return;
                      ctx.drawImage(img, 0, 0, 150, 150);
                      updateActiveAgentAvatar(canvas.toDataURL('image/jpeg', 0.8));
                    };
                    img.src = event.target?.result as string;
                  };
                  reader.readAsDataURL(file);
                }}
              />
            </div>
            <div className="text-center">
              <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-300">Avatar Node</h3>
              <p className="mt-1 text-[10px] text-zinc-600">Saved per active agent</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500"><Settings2 className="h-3 w-3" /> Agent Profile</label>
              <select value={activeAgent.id} onChange={(e) => handleAgentChange(e.target.value as AgentId)} className="w-full rounded-xl border border-white/10 bg-[#0A0A0B] p-4 text-xl text-white outline-none transition-all focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50">
                <option value="maximus">Maximus</option>
                <option value="beatrice">Beatrice</option>
              </select>
              <p className="text-[10px] uppercase tracking-widest text-zinc-600">Changing agent loads that agent&apos;s saved directives.</p>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Conversation Start Mode</label>
              <select value={settings.conversationSeedMode || 'memory'} onChange={(e) => updateConversationSeedMode(e.target.value as ConversationSeedMode)} className="w-full rounded-xl border border-white/10 bg-[#0A0A0B] p-4 text-sm text-white outline-none transition-all focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50">
                <option value="memory">Use past conversation / memory</option>
                <option value="news">Use web/news/search topic when backend supports it</option>
                <option value="idea">Start with a useful product idea</option>
                <option value="quiet">Stay quiet until Master E speaks</option>
              </select>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Tool Calling Power</div>
              <div className="mt-4 space-y-3">
                {([
                  ['gmail', 'Gmail reading and actions'],
                  ['drive', 'Google Drive reading and search'],
                  ['context', 'Location, places, weather, timezone, directions'],
                  ['vision', 'Video stream awareness'],
                ] as [ToolKey, string][]).map(([tool, label]) => (
                  <label key={tool} className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                    <span className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-300">{label}</span>
                    <input type="checkbox" checked={settings.enabledTools?.[tool] ?? DEFAULT_TOOL_TOGGLES[tool]} onChange={(e) => updateToolToggle(tool, e.target.checked)} className="h-5 w-5 accent-amber-500" />
                  </label>
                ))}
              </div>
              <label className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-300">Auto describe opened video/screen</span>
                <input type="checkbox" checked={settings.autoDescribeVisual ?? true} onChange={(e) => setSettings((current) => ({ ...current, autoDescribeVisual: e.target.checked }))} className="h-5 w-5 accent-amber-500" />
              </label>
              <div className="mt-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Available Context Tools</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] uppercase tracking-widest text-zinc-400">
                <span>Geolocation</span><span>Places</span><span>Weather</span><span>Timezone</span><span>Directions</span><span>Local Search</span><span>Calendar Context</span>
              </div>
              <p className="mt-3 text-[10px] uppercase tracking-widest text-zinc-600">{geoPermissionStatus}</p>
              {lastKnownLocation && <p className="mt-2 text-[10px] uppercase tracking-widest text-blue-300/80">Last location: {lastKnownLocation.latitude.toFixed(4)}, {lastKnownLocation.longitude.toFixed(4)}</p>}
              <button type="button" onClick={() => requestBrowserLocation().catch((error) => setVisualError(error.message))} className="mt-4 w-full rounded-xl border border-blue-500/25 bg-blue-500/10 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.22em] text-blue-300 transition-all hover:bg-blue-500/15">Allow Location Context</button>
            </div>

            <div className="flex flex-col space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Eburon Base Persona</label>
              <textarea value={settings.persistentBasePrompt} onChange={(e) => setSettings((current) => ({ ...current, persistentBasePrompt: e.target.value }))} className="min-h-[220px] w-full resize-y rounded-xl border border-white/10 bg-[#0A0A0B] p-4 font-mono text-xs leading-relaxed text-zinc-300 outline-none transition-all focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50" placeholder="Bible personality base prompt..." />
            </div>

            <div className="flex flex-col space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{activeAgent.label} System Directives</label>
              <textarea value={settings.systemPrompt} onChange={(e) => updateActiveAgentPrompt(e.target.value)} className="min-h-[320px] w-full resize-y rounded-xl border border-white/10 bg-[#0A0A0B] p-4 font-mono text-xs leading-relaxed text-zinc-300 outline-none transition-all focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50" placeholder="Agent system directives..." />
            </div>
          </div>

          <div className="mt-auto border-t border-white/10 pt-6">
            <button onClick={onLogout} className="w-full rounded-2xl border border-red-500/25 bg-red-500/10 px-5 py-4 text-sm font-bold uppercase tracking-[0.25em] text-red-300 transition-all hover:border-red-500/45 hover:bg-red-500/15 active:scale-[0.99]">
              <LogOut className="mr-2 inline h-4 w-4" /> Logout
            </button>
            <p className="mt-3 text-center text-[10px] uppercase tracking-[0.2em] text-zinc-600">Sign out from this Vep identity on this device.</p>
          </div>
        </div>
      </motion.div>
    )}
  </AnimatePresence>
</div>

); }