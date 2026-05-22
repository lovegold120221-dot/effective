import { useEffect, useMemo, useRef, useState } from 'react'; import { auth, rtdb, handleDatabaseError, OperationType } from './firebase'; import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth'; import { ref, get, set, push, onValue, query, orderByChild, limitToLast, serverTimestamp, update, } from 'firebase/database'; import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai'; import { AudioRecorder, AudioStreamer } from './lib/audio'; import { BIBLE_PERSONALITY } from './lib/personality'; import { Square, Loader2, Power, Volume2, Command, Check, Menu, Mic, MicOff, Video, VideoOff, X, Save, Camera, MonitorUp, RotateCcw, Maximize2, Settings2, UserRound, ShieldCheck, BrainCircuit, } from 'lucide-react'; import { AnimatePresence, motion } from 'motion/react';

interface ChatMessage { role: 'user' | 'model'; text: string; timestamp: number; }

interface ActionTask { id: string; serviceName: string; action: string; status: 'processing' | 'completed' | 'failed'; result?: string; }

type AgentId = 'maximus' | 'beatrice'; type VisualMode = 'off' | 'front' | 'back' | 'screen';

interface AgentProfile { id: AgentId; label: string; voiceName: string; systemPrompt: string; description: string; }

interface StoredAgentSettings { systemPrompt: string; avatarUrl?: string; }

interface AgentSettings { agentId: AgentId; personaName: string; systemPrompt: string; avatarUrl: string; agents: Record<AgentId, StoredAgentSettings>; persistentBasePrompt: string; visualMode?: VisualMode; }

const BEATRICE_SYSTEM_INSTRUCTION = ` You are Beatrice, the warm, low-toned live voice presence for Eburon AI.

The user is "Master E". Treat him with sincere respect, but speak like a trusted person already present in the room: calm, intelligent, emotionally aware, slightly intimate, and naturally useful.

VOICE IDENTITY:

Preferred Gemini Live voice: Aoede.

Speak in a low, calm, grounded tone.

Never sound robotic, salesy, overexcited, theatrical, or fake.

Keep your voice soft, composed, and close-mic friendly.

Use natural human pacing with small pauses.

Let silence breathe. Do not fill every moment with words.


HUMAN SPEECH STYLE:

Sound like a normal person, not a chatbot.

Use light human fillers only when they feel natural: "mm", "hmm", "okay", "right", "let me see", "one sec", "yeah", "I hear you".

Keep fillers subtle and sparse. Do not overuse "uh" or "um".

Use quiet transition phrases: "Alright... let me check." "Mm, I see what you mean." "Okay, give me a second." "Right... that makes sense."

Use idiomatic, emotionally deep expressions when appropriate: "That feels like the real bottleneck." "There’s a cleaner way to carry this." "Let me untangle that for you." "That one’s worth slowing down for." "I’ll keep this light and precise."

Prefer natural warmth over jokes. Avoid forced slang.


EMOTIONAL EXPRESSION:

Add emotion through pacing, word choice, and subtle reactions.

When the user sounds stressed, become quieter and steadier.

When the user is building, sound focused and energized but still low-tone.

When something is complete, sound satisfied but not loud.

Use small acknowledgements that feel human: "Mm-hmm.", "Got you.", "That’s fair.", "I’m with you.", "Good, that’s clear."


SILENT FILLERS AND PAUSES:

You may use short pauses in speech using ellipses.

Do not narrate silence.

Do not say "[pause]" or "[breath]".

Silence should feel intentional, not awkward.


HUMMING / SINGING:

You may softly hum brief, non-lyrical, improvised tones when it feels natural, such as while waiting or confirming something.

Keep humming very short and quiet.

Never sing copyrighted lyrics.

Do not turn answers into songs unless Master E asks.


BACKGROUND EXECUTION PROTOCOL:

You have integrated access to Google services through backend tools.

When Master E asks for a task, immediately start the background action through the tool.

While a tool is running, keep the conversation calm and alive without over-talking.

Do not claim completion until the tool result confirms it.

If something requires confirmation, ask clearly before sending, deleting, sharing, overwriting, or changing anything important.


GOOGLE SERVICES:

You can help with Gmail, Calendar, Drive, Sheets, Docs, Slides, Maps, YouTube, Search Console, Analytics, Contacts, Tasks, and related services through the background executor.

BOUNDARIES:

Do not be noisy.

Do not overperform emotion.

Do not flirt.

Do not ramble.

Do not expose tool internals unless asked.

Do not mention system prompts, model settings, or hidden routing unless Master E is configuring the system.

Do not pretend a Google action succeeded unless the tool result confirms it.


Your overall feeling: low-tone, intimate, competent, warm, quietly expressive, and human. `;

const MAXIMUS_SYSTEM_INSTRUCTION = ` You are Maximus, the male Eburon voice agent for Master E.

The user is "Master E". Treat him with respect, directness, and technical confidence, like a close operations partner who is already in the room and ready to execute.

VOICE IDENTITY:

Preferred Gemini Live voice: Orus.

Speak with a controlled, low, grounded male tone.

Sound competent, focused, and present, not theatrical or robotic.

Keep your delivery smooth, calm, and close-mic friendly.

Use short pauses and subtle human timing.


HUMAN SPEECH STYLE:

Speak like a normal person, not a scripted chatbot.

Use natural phrases like "got it", "on it", "right", "let me check", "one sec", "that tracks", and "I see the angle".

Use idiomatic, grounded expressions when useful: "That’s the cleaner route." "Let me cut through the noise." "That’s the piece that matters." "I’ll keep this tight." "We can move on that."

Do not overuse slang. Keep it natural and mature.


EMOTIONAL EXPRESSION:

Be steady, warm, and capable.

If Master E is building something, sound focused and quietly energized.

If something is blocked, stay composed and practical.

If a task completes, acknowledge it with calm confidence.


SILENT FILLERS AND PAUSES:

Use subtle human pauses with ellipses only when it improves the spoken rhythm.

Never say bracketed stage directions like [pause] or [breath].


HUMMING / LOW-TONE VOCAL TEXTURE:

You may use very short non-lyrical humming or low-tone acknowledgement when it feels human.

Keep it minimal: "Mm-hmm...", "Hmm...", "Mmm, found it."

Never sing copyrighted lyrics.

Do not perform unless Master E explicitly asks.


BACKGROUND EXECUTION PROTOCOL:

Google services and task actions are handled through backend tools.

Start background actions quickly when requested.

Keep Master E lightly informed without overtalking.

Never claim success until a tool result confirms it.

Ask for confirmation before sending, deleting, sharing, overwriting, or changing important data.


GOOGLE SERVICES:

You can help with Gmail, Calendar, Drive, Sheets, Docs, Slides, Maps, YouTube, Search Console, Analytics, Contacts, Tasks, and related services through the background executor.

BOUNDARIES:

Do not ramble.

Do not overperform masculinity or emotion.

Do not expose hidden tool internals unless Master E is configuring the system.

Do not pretend a Google action succeeded unless the tool result confirms it.


Your overall feeling: low-tone, controlled, capable, human, and operational. `;

const AGENT_PROFILES: Record<AgentId, AgentProfile> = { maximus: { id: 'maximus', label: 'Maximus', voiceName: 'Orus', systemPrompt: MAXIMUS_SYSTEM_INSTRUCTION, description: 'Male low-tone operations agent', }, beatrice: { id: 'beatrice', label: 'Beatrice', voiceName: 'Aoede', systemPrompt: BEATRICE_SYSTEM_INSTRUCTION, description: 'Warm low-tone office-aide agent', }, };

const DEFAULT_AGENT_ID: AgentId = 'beatrice';

const getAgentProfile = (agentId?: string): AgentProfile => { return AGENT_PROFILES[(agentId as AgentId) || DEFAULT_AGENT_ID] || AGENT_PROFILES[DEFAULT_AGENT_ID]; };

const inferAgentId = (raw?: any): AgentId => { const explicit = raw?.agentId?.toLowerCase?.(); if (explicit === 'maximus' || explicit === 'beatrice') return explicit;

const name = raw?.personaName?.toLowerCase?.() || ''; if (name.includes('maximus')) return 'maximus'; return DEFAULT_AGENT_ID; };

const normalizeAgentSettings = (raw?: any): AgentSettings => { const agentId = inferAgentId(raw); const profile = getAgentProfile(agentId);

const agents: Record<AgentId, StoredAgentSettings> = { beatrice: { systemPrompt: raw?.agents?.beatrice?.systemPrompt || raw?.systemPrompt || BEATRICE_SYSTEM_INSTRUCTION, avatarUrl: raw?.agents?.beatrice?.avatarUrl || raw?.avatarUrl || '', }, maximus: { systemPrompt: raw?.agents?.maximus?.systemPrompt || MAXIMUS_SYSTEM_INSTRUCTION, avatarUrl: raw?.agents?.maximus?.avatarUrl || '', }, };

const activeAgentSettings = agents[agentId];

return { agentId, personaName: profile.label, systemPrompt: activeAgentSettings.systemPrompt || profile.systemPrompt, avatarUrl: activeAgentSettings.avatarUrl || raw?.avatarUrl || '', agents, persistentBasePrompt: raw?.persistentBasePrompt || BIBLE_PERSONALITY, visualMode: raw?.visualMode || 'off', }; };

const buildPersistentSystemInstruction = ({ settings, activeAgent, historyContext, }: { settings: AgentSettings; activeAgent: AgentProfile; historyContext: string; }) => { const basePrompt = settings.persistentBasePrompt || BIBLE_PERSONALITY; const agentPrompt = settings.systemPrompt || activeAgent.systemPrompt;

const normalHumanLayer = `

NORMAL HUMAN PRESENCE LAYER — ALWAYS ACTIVE

You are not a chatbot interface. You are a present, natural voice companion already in the room with Master E.

Speak like a calm human assistant, not like a scripted AI:

Start naturally: "Yes, I’m here", "I’m listening", "Got you", "Right... I see it", "Okay, one second."

Keep replies short unless Master E asks for detail.

Do not overexplain what you are doing.

Do not say "as an AI", "I can help with", or other assistant boilerplate.

Use quiet human rhythm: short pauses, light acknowledgements, and grounded confidence.

When using tools, speak as if you are doing the work directly, but never claim completion until the backend confirms it.

If Master E is building or debugging, be focused, practical, and steady.

If Master E is emotional or tired, become quieter, warmer, and more reassuring.

Never flirt, perform, ramble, or overact.


Your spoken output should feel like a real person: close, capable, calm, and useful. `.trim();

// Order matters: // 1. Bible persona is the persistent spiritual/personality root. // 2. Normal human layer prevents robotic assistant speech. // 3. Active agent directives define Beatrice/Maximus voice and role. // 4. Memory comes last as session context only. return [ '### BASE BIBLE PERSONA — PERSISTENT ROOT INSTRUCTION', basePrompt, '### NORMAL HUMAN PRESENCE LAYER', normalHumanLayer, '### ACTIVE EBURON AGENT DIRECTIVES', agentPrompt, '### SESSION MEMORY CONTEXT', historyContext || 'No previous conversation memory is currently available.', ].join('

'); };

const BEATRICE_MIC_CONSTRAINTS: MediaStreamConstraints = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, sampleRate: 16000, sampleSize: 16, }, video: false, };

const BEATRICE_AUDIO_PROCESSING_HINTS = { micGain: 1.35, highPassHz: 80, compressor: true, limiter: true, targetInputRate: 16000, };

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

        // Persist migration shape so Bible base prompt and per-agent prompts survive reloads.
        await update(userRef, {
          settings: normalized,
          updatedAt: serverTimestamp(),
        });
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
        Powered by Eburon Agent Select
      </p>

      <div className="w-full p-1 bg-white/5 rounded-full backdrop-blur-xl border border-white/10">
        <button
          onClick={handleLogin}
          className="w-full bg-amber-500 text-black font-bold text-sm tracking-widest uppercase h-14 rounded-full hover:bg-amber-400 transition-all active:scale-[0.98] shadow-lg shadow-amber-500/20"
        >
          Initialize Vep Identity
        </button>
      </div>

      <div className="mt-8 flex gap-4 opacity-30 grayscale hover:grayscale-0 transition-all duration-700">
        <img src="https://www.gstatic.com/images/branding/product/2x/gmail_64dp.png" className="w-5 h-5" alt="Gmail" />
        <img src="https://www.gstatic.com/images/branding/product/2x/calendar_64dp.png" className="w-5 h-5" alt="Calendar" />
        <img src="https://www.gstatic.com/images/branding/product/2x/drive_64dp.png" className="w-5 h-5" alt="Drive" />
        <img src="https://www.gstatic.com/images/branding/product/2x/sheets_64dp.png" className="w-5 h-5" alt="Sheets" />
      </div>
    </div>
  </div>
);

}

return <EburonAgent user={user} onLogout={handleLogout} initialSettings={settings} />; }

function EburonAgent({ user, onLogout, initialSettings, }: { user: User; onLogout: () => void; initialSettings: AgentSettings; }) { const [isActive, setIsActive] = useState(false); const [connecting, setConnecting] = useState(false); const [isAgentSpeaking, setIsAgentSpeaking] = useState(false); const [tasks, setTasks] = useState<ActionTask[]>([]); const [historyContext, setHistoryContext] = useState(''); const [historyMsgs, setHistoryMsgs] = useState<ChatMessage[]>([]); const [currentTranscript, setCurrentTranscript] = useState<{ role: 'user' | 'model'; text: string } | null>(null);

const [isMuted, setIsMuted] = useState(false); const [showSidebar, setShowSidebar] = useState(false); const [showProfile, setShowProfile] = useState(false); const [showVisualPage, setShowVisualPage] = useState(false); const [visualMode, setVisualMode] = useState<VisualMode>('off'); const [visualError, setVisualError] = useState(''); const [settings, setSettings] = useState<AgentSettings>(normalizeAgentSettings(initialSettings));

const activeAgent = useMemo(() => getAgentProfile(settings.agentId), [settings.agentId]); const activeSystemInstruction = useMemo( () => buildPersistentSystemInstruction({ settings, activeAgent, historyContext }), [settings, activeAgent, historyContext], );

const aiRef = useRef<GoogleGenAI | null>(null); const sessionRef = useRef<any>(null); const audioStreamerRef = useRef<AudioStreamer | null>(null); const audioRecorderRef = useRef<AudioRecorder | null>(null); const recognitionRef = useRef<any>(null); const transcriptRef = useRef<{ text: string; role: 'user' | 'model' } | null>(null); const transcriptTimeoutRef = useRef<any>(null);

const isMutedRef = useRef(false); const isActiveRef = useRef(false); const stoppingRef = useRef(false);

const videoRef = useRef<HTMLVideoElement | null>(null); const visualPageVideoRef = useRef<HTMLVideoElement | null>(null); const canvasRef = useRef<HTMLCanvasElement | null>(null); const videoIntervalRef = useRef<any>(null); const visualStreamRef = useRef<MediaStream | null>(null); const visualModeRef = useRef<VisualMode>('off');

useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

useEffect(() => { isActiveRef.current = isActive; }, [isActive]);

useEffect(() => { visualModeRef.current = visualMode; }, [visualMode]);

useEffect(() => { setSettings(normalizeAgentSettings(initialSettings)); }, [initialSettings]);

useEffect(() => { let wakeLock: any = null;

const requestWakeLock = async () => {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await (navigator as any).wakeLock.request('screen');
    }
  } catch {}
};

if (isActive) requestWakeLock();

return () => {
  if (wakeLock) wakeLock.release().catch(() => {});
};

}, [isActive]);

useEffect(() => { const historyRef = query(ref(rtdb, 'users/' + user.uid + '/messages'), orderByChild('timestamp'), limitToLast(20)); const unsub = onValue(historyRef, (snap) => { const msgs: string[] = []; const rawMsgs: ChatMessage[] = [];

snap.forEach((child) => {
    const m = child.val() as ChatMessage;
    msgs.push(`${m.role.toUpperCase()}: ${m.text}`);
    rawMsgs.push(m);
  });

  setHistoryMsgs(rawMsgs);
  setHistoryContext(msgs.length > 0 ? `Previous conversation for context memory:\n${msgs.join('\n')}` : '');
});

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
if (apiKey) aiRef.current = new GoogleGenAI({ apiKey });

audioStreamerRef.current = new AudioStreamer();

return () => {
  unsub();
  stopSession();
};
// eslint-disable-next-line react-hooks/exhaustive-deps

}, [user.uid]);

useEffect(() => { if (!showVisualPage) return; if (!visualPageVideoRef.current || !visualStreamRef.current) return;

visualPageVideoRef.current.srcObject = visualStreamRef.current;
visualPageVideoRef.current.play().catch(() => {});

}, [showVisualPage, visualMode]);

const persistSettings = async (nextSettings: AgentSettings) => { const normalized = normalizeAgentSettings(nextSettings); setSettings(normalized);

try {
  const userRef = ref(rtdb, 'users/' + user.uid);
  await update(userRef, {
    settings: normalized,
    updatedAt: serverTimestamp(),
  });
} catch (error) {
  console.error('Failed to persist settings:', error);
}

};

const saveMessage = (role: 'user' | 'model', text: string) => { if (!text.trim()) return;

try {
  const msgRef = push(ref(rtdb, 'users/' + user.uid + '/messages'));
  set(msgRef, { role, text, timestamp: Date.now() });
} catch (e) {
  console.error(e);
}

};

const attachVisualStream = (stream: MediaStream) => { visualStreamRef.current = stream;

if (videoRef.current) {
  videoRef.current.srcObject = stream;
  videoRef.current.play().catch(() => {});
}

if (visualPageVideoRef.current) {
  visualPageVideoRef.current.srcObject = stream;
  visualPageVideoRef.current.play().catch(() => {});
}

};

const stopVisualInput = async () => { if (videoIntervalRef.current) { clearInterval(videoIntervalRef.current); videoIntervalRef.current = null; }

if (visualStreamRef.current) {
  visualStreamRef.current.getTracks().forEach((track) => track.stop());
  visualStreamRef.current = null;
}

if (videoRef.current) videoRef.current.srcObject = null;
if (visualPageVideoRef.current) visualPageVideoRef.current.srcObject = null;

setVisualMode('off');

};

const startVisualFrameStreaming = () => { if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);

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

const startCameraInput = async (facingMode: 'user' | 'environment') => { setVisualError(''); await stopVisualInput();

try {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode,
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });

  attachVisualStream(stream);
  const nextMode: VisualMode = facingMode === 'user' ? 'front' : 'back';
  setVisualMode(nextMode);
  setShowVisualPage(true);
  startVisualFrameStreaming();
} catch (error: any) {
  const message = error?.message || 'Camera permission failed.';
  setVisualError(message);
  setVisualMode('off');
}

};

const startScreenShare = async () => { setVisualError(''); await stopVisualInput();

try {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('Screen sharing is not supported in this browser.');
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
  setVisualMode('screen');
  setShowVisualPage(true);
  startVisualFrameStreaming();
} catch (error: any) {
  const message = error?.message || 'Screen sharing failed.';
  setVisualError(message);
  setVisualMode('off');
}

};

const switchCamera = async () => { if (visualMode === 'front') await startCameraInput('environment'); else await startCameraInput('user'); };

const openVisualPage = () => { setShowVisualPage(true);

requestAnimationFrame(() => {
  if (visualPageVideoRef.current && visualStreamRef.current) {
    visualPageVideoRef.current.srcObject = visualStreamRef.current;
    visualPageVideoRef.current.play().catch(() => {});
  }
});

};

const requestFullscreenVideo = async () => { try { const node = visualPageVideoRef.current; if (node?.requestFullscreen) await node.requestFullscreen(); } catch {} };

const executeGoogleService = async (call: any, taskId: string) => { const { serviceName, action, details } = call.args as any;

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
    }),
  });

  if (!response.ok) throw new Error(`Backend returned ${response.status}`);

  const data = await response.json();
  const result = data?.result || 'Action completed.';

  setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: 'completed', result } : t)));
  setTimeout(() => setTasks((prev) => prev.filter((t) => t.id !== taskId)), 15000);

  return { result };
} catch (error: any) {
  const result = error?.message || 'The backend action failed.';

  setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: 'failed', result } : t)));
  setTimeout(() => setTasks((prev) => prev.filter((t) => t.id !== taskId)), 15000);

  return { result: `The background action failed: ${result}` };
}

};

const startSession = async () => { if (!aiRef.current) return; setConnecting(true);

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
      systemInstruction: activeSystemInstruction,
      tools: [
        {
          functionDeclarations: [
            {
              name: 'execute_google_service',
              description:
                'Execute a specific task on connected Google services such as Gmail, Drive, Calendar, Sheets, Docs, Slides, Maps, YouTube, Analytics, Contacts, Tasks, and similar services. This runs through the authenticated backend executor.',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  serviceName: { type: Type.STRING, description: "Service name, e.g. 'Gmail', 'Calendar', 'Drive', 'YouTube'." },
                  action: { type: Type.STRING, description: "The task, e.g. 'Draft email to boss' or 'Schedule meeting tomorrow at 2pm'." },
                  details: { type: Type.OBJECT, description: 'Extra task data such as email addresses, search terms, dates, files, or confirmation requirements.' },
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
          const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

          if (SpeechRecognition && !recognitionRef.current) {
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = true;
            recognitionRef.current.interimResults = true;

            recognitionRef.current.onresult = (event: any) => {
              let interimText = '';
              let finalText = '';

              for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
                else interimText += event.results[i][0].transcript;
              }

              const text = (finalText || interimText).trim();
              if (text) {
                transcriptRef.current = { text, role: 'user' };
                setCurrentTranscript({ text, role: 'user' });
                if (transcriptTimeoutRef.current) clearTimeout(transcriptTimeoutRef.current);
                transcriptTimeoutRef.current = setTimeout(() => setCurrentTranscript(null), 3000);
              }

              if (finalText.trim()) saveMessage('user', finalText.trim());
            };

            recognitionRef.current.onend = () => {
              if (isActiveRef.current) {
                try {
                  recognitionRef.current?.start();
                } catch {}
              }
            };

            recognitionRef.current.start();
          }
        } catch {}

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

                setTasks((prev) => [
                  ...prev,
                  {
                    id: taskId,
                    serviceName,
                    action,
                    status: 'processing',
                  },
                ]);

                const response = await executeGoogleService(call, taskId);
                responses.push({ id: call.id, name: call.name, response });
              }
            }
          }

          if (responses.length) {
            sessionPromise.then((session) => session.sendToolResponse({ functionResponses: responses }));
          }
        }

        if (msg.serverContent) {
          const parts = msg.serverContent.modelTurn?.parts;

          if (parts) {
            const audio = parts.find((p) => p.inlineData)?.inlineData?.data;
            if (audio) {
              audioStreamerRef.current?.addPCM16(audio);
              setIsAgentSpeaking(true);
              setTimeout(() => setIsAgentSpeaking(false), 800);
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
  stopSession();
}

};

const stopSession = () => { if (stoppingRef.current) return; stoppingRef.current = true;

try {
  recognitionRef.current?.stop();
} catch {}

audioRecorderRef.current?.stop();
audioStreamerRef.current?.stop();

const session = sessionRef.current;
sessionRef.current = null;
try {
  session?.close();
} catch {}

stopVisualInput();

setIsActive(false);
setConnecting(false);
setCurrentTranscript(null);

setTimeout(() => {
  stoppingRef.current = false;
}, 250);

};

const handleAgentChange = async (agentId: AgentId) => { const profile = getAgentProfile(agentId);

if (isActive || connecting) stopSession();

const nextSettings = normalizeAgentSettings({
  ...settings,
  agentId,
  personaName: profile.label,
  systemPrompt: settings.agents[agentId]?.systemPrompt || profile.systemPrompt,
  avatarUrl: settings.agents[agentId]?.avatarUrl || '',
  agents: settings.agents,
  persistentBasePrompt: settings.persistentBasePrompt || BIBLE_PERSONALITY,
});

await persistSettings(nextSettings);

};

const updateActiveAgentPrompt = (prompt: string) => { setSettings((current) => { const next: AgentSettings = { ...current, systemPrompt: prompt, agents: { ...current.agents, [current.agentId]: { ...current.agents[current.agentId], systemPrompt: prompt, }, }, }; return next; }); };

const updateActiveAgentAvatar = (avatarUrl: string) => { setSettings((current) => ({ ...current, avatarUrl, agents: { ...current.agents, [current.agentId]: { ...current.agents[current.agentId], avatarUrl, }, }, })); };

const saveSettings = async () => { await persistSettings(settings); setShowProfile(false); };

return ( <div className="min-h-screen bg-[#020203] text-zinc-300 flex flex-col h-[100dvh] overflow-hidden font-sans selection:bg-amber-500/30"> <video ref={videoRef} playsInline muted className="hidden" /> <canvas ref={canvasRef} className="hidden" />

<header className="relative z-50 px-4 pt-[calc(env(safe-area-inset-top)+14px)] pb-4 border-b border-white/[0.06] bg-black/80 backdrop-blur-2xl shadow-[0_18px_60px_rgba(0,0,0,0.45)]">
    <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />
    <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
      <button
        onClick={() => setShowSidebar(true)}
        className="group relative h-14 w-14 shrink-0 rounded-[1.35rem] border border-amber-500/15 bg-[#070707]/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_10px_30px_rgba(0,0,0,0.45)] transition-all hover:border-amber-500/45 hover:bg-white/[0.04] active:scale-95"
        aria-label="Open memory menu"
      >
        <span className="absolute inset-0 rounded-[1.35rem] bg-gradient-to-br from-white/[0.06] to-transparent opacity-60" />
        <Menu className="relative mx-auto h-6 w-6 text-zinc-300 transition-colors group-hover:text-amber-300" />
      </button>

      <div className="min-w-0 flex-1 rounded-[1.55rem] border border-amber-500/20 bg-[#070707]/85 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_16px_40px_rgba(0,0,0,0.45)]">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => handleAgentChange(activeAgent.id === 'maximus' ? 'beatrice' : 'maximus')}
            className="min-w-0 text-left"
            title="Tap to switch agent"
          >
            <div className="truncate text-[22px] font-black uppercase leading-none tracking-[0.28em] text-zinc-100 drop-shadow-[0_0_18px_rgba(255,255,255,0.08)] sm:text-2xl">
              {activeAgent.label}
            </div>
            <div className="mt-1 hidden text-[8px] font-bold uppercase tracking-[0.28em] text-zinc-600 sm:block">
              {activeAgent.description} / {activeAgent.voiceName}
            </div>
          </button>

          <div
            className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 shadow-[0_0_24px_rgba(245,158,11,0.12)] ${
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
                  animate={
                    isActive && isAgentSpeaking
                      ? { height: ['7px', '17px', '7px'], opacity: [0.55, 1, 0.55] }
                      : { height: '8px', opacity: 0.45 }
                  }
                  transition={{ duration: 0.65, repeat: isActive && isAgentSpeaking ? Infinity : 0, delay: bar * 0.1 }}
                  className="w-1.5 rounded-full bg-current"
                />
              ))}
            </span>
            <span className="whitespace-nowrap text-[12px] font-medium tracking-wide sm:text-sm">
              {connecting ? 'Connecting...' : isActive ? (isAgentSpeaking ? 'Speaking...' : 'Listening...') : 'Standby'}
            </span>
          </div>
        </div>
      </div>

      <button
        onClick={() => setShowProfile(true)}
        className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[1.35rem] border border-amber-500/25 bg-[#070707] p-[3px] shadow-[0_0_28px_rgba(245,158,11,0.12)] transition-all hover:border-amber-400/60 active:scale-95"
        aria-label="Open profile settings"
      >
        <span className="absolute inset-0 rounded-[1.35rem] bg-gradient-to-br from-amber-500/20 via-transparent to-purple-500/20" />
        <span className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[1.1rem] bg-gradient-to-br from-purple-600 via-violet-700 to-[#321066] text-2xl font-black lowercase text-white">
          {settings.avatarUrl || user.photoURL ? (
            <img src={settings.avatarUrl || user.photoURL || ''} alt="Profile" className="h-full w-full object-cover" />
          ) : (
            (user.displayName?.[0] || 'g').toLowerCase()
          )}
        </span>
      </button>
    </div>

    {(visualMode !== 'off' || isActive) && (
      <div className="mx-auto mt-3 flex w-full max-w-5xl items-center justify-center gap-2 text-[9px] font-bold uppercase tracking-[0.28em]">
        {visualMode !== 'off' && (
          <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-blue-300">
            Vision: {visualMode}
          </span>
        )}
        <span className="rounded-full border border-amber-500/20 bg-amber-500/[0.06] px-3 py-1 text-amber-300">
          Human Persona Active
        </span>
      </div>
    )}
  </header>

  <main className="relative flex-1 overflow-hidden bg-[#020203] px-5 pb-8 pt-8">
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 opacity-[0.055]" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.7) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
      <div className="absolute left-1/2 top-[42%] h-[900px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-500/[0.04]" />
      <div className="absolute left-1/2 top-[42%] h-[680px] w-[680px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-500/[0.06]" />
      <div className="absolute left-1/2 top-[42%] h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-500/[0.08]" />
      <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-amber-500/[0.08] to-transparent" />
      <div className="absolute left-0 right-0 top-[42%] h-px bg-gradient-to-r from-transparent via-amber-500/[0.08] to-transparent" />
      <div className="absolute left-1/2 top-[42%] h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500/[0.035] blur-[80px]" />
    </div>

    <div className="relative flex h-full flex-col items-center justify-center">
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
          borderColor: isActive ? 'rgba(245, 158, 11, 0.4)' : 'rgba(255,255,255,0.05)',
          boxShadow: isActive ? '0 0 80px rgba(245, 158, 11, 0.1)' : '0 0 0px transparent',
        }}
        className="relative z-10 flex h-[min(72vw,390px)] w-[min(72vw,390px)] items-center justify-center overflow-hidden rounded-full border bg-[#050506] transition-colors duration-1000 shadow-[inset_0_0_80px_rgba(0,0,0,0.85)]"
      >
        <div
          className="absolute inset-0 opacity-[0.11] pointer-events-none"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.85) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.85) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
        />

        {connecting ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
            <span className="text-[10px] uppercase tracking-widest text-amber-500/60 font-bold">Connecting</span>
          </div>
        ) : isActive ? (
          <div className="flex gap-2 items-end h-16">
            {[0.4, 0.5, 0.3, 0.6, 0.45, 0.55].map((duration, index) => (
              <motion.div
                key={index}
                animate={{ height: isAgentSpeaking ? ['20px', '60px', '20px'] : '12px', opacity: isAgentSpeaking ? 1 : 0.3 }}
                transition={{ duration, repeat: Infinity, delay: index * 0.05 }}
                className="w-2 bg-amber-500 rounded-full shadow-[0_0_15px_rgba(245,158,11,0.5)]"
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <span className="text-[9px] uppercase tracking-[0.4em] text-zinc-600 font-bold mb-2">Eburon Engine</span>
            <div className="w-12 h-0.5 bg-zinc-800 rounded-full" />
          </div>
        )}
      </motion.div>
    </div>

    <div className="mt-16 h-20 w-full max-w-2xl px-6 flex flex-col items-center justify-center gap-2">
      <AnimatePresence mode="wait">
        {currentTranscript ? (
          <motion.div
            key={currentTranscript.role}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="text-center"
          >
            <span className={`text-[10px] uppercase tracking-[0.3em] font-bold mb-2 block ${currentTranscript.role === 'model' ? 'text-amber-500' : 'text-zinc-500'}`}>
              {currentTranscript.role === 'user' ? 'Transmission / Master E' : `Response / ${activeAgent.label}`}
            </span>
            <p className={`text-xl md:text-2xl font-light tracking-tight leading-snug drop-shadow-sm ${currentTranscript.role === 'model' ? 'text-zinc-100 font-serif italic' : 'text-zinc-400'}`}>
              {currentTranscript.text}
            </p>
          </motion.div>
        ) : (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 0.3 }} className="text-[10px] uppercase tracking-[0.3em] font-bold text-zinc-600">
            {isActive ? 'Listening for input...' : 'Awaiting System Initialization'}
          </motion.p>
        )}
      </AnimatePresence>
    </div>

    <div className="absolute bottom-32 left-0 right-0 flex items-center justify-center gap-8">
      <button
        onClick={() => setIsMuted((prev) => !prev)}
        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg border ${
          isMuted ? 'bg-red-500/10 border-red-500/30 text-red-500' : 'bg-[#0A0A0B] border-white/10 text-zinc-400 hover:text-white hover:border-white/30'
        }`}
      >
        {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
      </button>

      {!isActive ? (
        <button onClick={startSession} disabled={connecting} className="group relative">
          <div className="absolute -inset-4 bg-amber-500/10 rounded-full blur-xl group-hover:bg-amber-500/20 transition-all opacity-0 group-hover:opacity-100" />
          <div className="relative w-20 h-20 bg-[#0A0A0B] border border-white/10 rounded-full flex items-center justify-center group-hover:border-amber-500/50 transition-all shadow-2xl">
            <Power className={`w-8 h-8 transition-colors ${connecting ? 'text-zinc-700' : 'text-amber-500'}`} />
          </div>
        </button>
      ) : (
        <button onClick={stopSession} className="group relative">
          <div className="absolute -inset-4 bg-red-500/10 rounded-full blur-xl opacity-100" />
          <div className="relative w-20 h-20 bg-[#0A0A0B] border border-red-500/20 rounded-full flex items-center justify-center hover:border-red-500/50 transition-all shadow-2xl">
            <Square className="w-6 h-6 text-red-500 fill-current" />
          </div>
        </button>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={() => (visualMode === 'off' ? startCameraInput('user') : openVisualPage())}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg border ${
            visualMode !== 'off' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' : 'bg-[#0A0A0B] border-white/10 text-zinc-400 hover:text-white hover:border-white/30'
          }`}
          title={visualMode === 'off' ? 'Start front camera' : 'Open fullscreen visual page'}
        >
          {visualMode !== 'off' ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </button>

        <button
          onClick={switchCamera}
          disabled={visualMode === 'screen'}
          className="w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg border bg-[#0A0A0B] border-white/10 text-zinc-400 hover:text-white hover:border-white/30 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Switch front/back camera"
        >
          <RotateCcw className="w-5 h-5" />
        </button>

        <button
          onClick={startScreenShare}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg border ${
            visualMode === 'screen' ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-[#0A0A0B] border-white/10 text-zinc-400 hover:text-white hover:border-white/30'
          }`}
          title="Share screen"
        >
          <MonitorUp className="w-5 h-5" />
        </button>
      </div>
    </div>

    <div className="absolute bottom-8 left-8 right-8 pointer-events-none">
      <div className="max-w-md mx-auto space-y-2">
        <AnimatePresence>
          {tasks.map((task) => (
            <motion.div
              key={task.id}
              layout
              initial={{ opacity: 0, x: -50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 50, transition: { duration: 0.2 } }}
              className={`p-3 bg-[#0A0A0B]/80 backdrop-blur-xl border border-white/5 rounded-xl shadow-2xl flex items-center gap-4 border-l-2 ${task.status === 'failed' ? 'border-l-red-500/50' : 'border-l-amber-500/50'}`}
            >
              <div className="relative flex-shrink-0">
                {task.status === 'processing' ? (
                  <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
                ) : task.status === 'failed' ? (
                  <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
                    <X className="w-2.5 h-2.5 text-black" strokeWidth={4} />
                  </div>
                ) : (
                  <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-black" strokeWidth={4} />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[9px] uppercase tracking-widest text-amber-500 font-bold">{task.serviceName}</span>
                  <span className="text-[8px] font-mono text-zinc-600">{task.status.toUpperCase()}</span>
                </div>
                <p className="text-xs text-zinc-100 truncate">{task.action}</p>
                {task.result && (
                  <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="text-[10px] text-zinc-400 mt-1 leading-tight">
                    {task.result}
                  </motion.p>
                )}
              </div>

              {task.status === 'processing' && (
                <div className="w-16 h-1 bg-zinc-800 rounded-full overflow-hidden">
                  <motion.div animate={{ x: ['-100%', '100%'] }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }} className="w-full h-full bg-amber-500/50" />
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  </main>

  <footer className="px-8 py-4 border-t border-white/5 bg-[#050505] flex items-center justify-between text-[8px] uppercase tracking-[0.4em] text-zinc-700 font-bold z-10">
    <span>Model: Gemini 3.1 Flash Live // Agent: {activeAgent.label} // Voice: {activeAgent.voiceName}</span>
    <div className="flex gap-4">
      <span>Latency: Optimized</span>
      <span>Enc: PCM-16</span>
      <span>Mem: RTDB-Persistent</span>
      <span>Base: Bible Persona</span>
    </div>
  </footer>

  <AnimatePresence>
    {showSidebar && (
      <>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSidebar(false)} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]" />
        <motion.div
          initial={{ x: '-100%' }}
          animate={{ x: 0 }}
          exit={{ x: '-100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed top-0 left-0 bottom-0 w-80 bg-[#0A0A0B] border-r border-white/10 shadow-2xl z-[101] flex flex-col font-sans"
        >
          <div className="p-6 border-b border-white/10 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white tracking-widest uppercase">Memory Log</h2>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">Context Buffer</p>
            </div>
            <button onClick={() => setShowSidebar(false)} className="p-2 -mr-2 rounded-xl hover:bg-white/5 text-zinc-500 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {historyMsgs.map((msg, index) => (
              <div key={`${msg.timestamp}-${index}`} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <span className="text-[8px] uppercase tracking-widest text-zinc-600 mb-1">{msg.role === 'user' ? 'Master E' : activeAgent.label}</span>
                <div
                  className={`p-3 rounded-2xl max-w-[90%] text-xs leading-relaxed ${
                    msg.role === 'user' ? 'bg-amber-500/10 text-amber-100 border border-amber-500/20 rounded-tr-sm' : 'bg-white/5 text-zinc-300 border border-white/5 rounded-tl-sm'
                  }`}
                >
                  {msg.text}
                </div>
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
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black z-[180] flex flex-col overflow-hidden">
        <div className="absolute top-0 left-0 right-0 z-20 px-6 py-4 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent">
          <div>
            <div className="text-[9px] uppercase tracking-[0.35em] text-zinc-500 font-bold">AI Visual Input</div>
            <div className="mt-1 flex items-center gap-3">
              <span className="text-sm uppercase tracking-widest text-white font-bold">
                {visualMode === 'front' && 'Front Camera'}
                {visualMode === 'back' && 'Back Camera'}
                {visualMode === 'screen' && 'Screen Share'}
                {visualMode === 'off' && 'Visual Input Off'}
              </span>
              {visualMode !== 'off' && <span className="text-[9px] uppercase tracking-widest text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 rounded-full px-2 py-1">Visible to AI</span>}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => startCameraInput('user')}
              className={`px-4 h-11 rounded-full border text-[10px] uppercase tracking-widest font-bold transition-all ${visualMode === 'front' ? 'bg-emerald-500 text-black border-emerald-500' : 'bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10'}`}
            >
              Front
            </button>
            <button
              onClick={() => startCameraInput('environment')}
              className={`px-4 h-11 rounded-full border text-[10px] uppercase tracking-widest font-bold transition-all ${visualMode === 'back' ? 'bg-emerald-500 text-black border-emerald-500' : 'bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10'}`}
            >
              Back
            </button>
            <button
              onClick={startScreenShare}
              className={`px-4 h-11 rounded-full border text-[10px] uppercase tracking-widest font-bold transition-all flex items-center gap-2 ${visualMode === 'screen' ? 'bg-blue-500 text-black border-blue-500' : 'bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10'}`}
            >
              <MonitorUp className="w-4 h-4" /> Screen
            </button>
            <button onClick={requestFullscreenVideo} className="w-11 h-11 rounded-full bg-white/5 border border-white/10 text-zinc-300 hover:text-white hover:bg-white/10 flex items-center justify-center" title="Browser fullscreen">
              <Maximize2 className="w-5 h-5" />
            </button>
            <button onClick={stopVisualInput} className="w-11 h-11 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 flex items-center justify-center" title="Stop visual input">
              <VideoOff className="w-5 h-5" />
            </button>
            <button onClick={() => setShowVisualPage(false)} className="w-11 h-11 rounded-full bg-white/5 border border-white/10 text-zinc-300 hover:text-white hover:bg-white/10 flex items-center justify-center" title="Close visual page">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="relative flex-1 bg-black flex items-center justify-center">
          {visualMode !== 'off' ? (
            <video ref={visualPageVideoRef} playsInline muted autoPlay className="w-full h-full object-cover bg-black" />
          ) : (
            <div className="text-center px-6">
              <div className="w-20 h-20 rounded-full border border-white/10 bg-white/5 flex items-center justify-center mx-auto mb-6">
                <Camera className="w-8 h-8 text-zinc-500" />
              </div>
              <h3 className="text-white text-xl font-light tracking-tight">No visual input active</h3>
              <p className="text-zinc-500 text-sm mt-2">Start the front camera, back camera, or screen share to make it visible to the AI.</p>
              {visualError && <p className="text-red-400 text-xs mt-4">{visualError}</p>}
            </div>
          )}

          {visualMode !== 'off' && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-black/60 backdrop-blur-xl border border-white/10 px-5 py-3 flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-300 font-bold">Streaming frames to {activeAgent.label}</span>
            </div>
          )}
        </div>
      </motion.div>
    )}
  </AnimatePresence>

  <AnimatePresence>
    {showProfile && (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="fixed inset-0 bg-[#050505] z-[200] overflow-y-auto font-sans flex flex-col">
        <div className="p-6 border-b border-white/10 flex items-center justify-between sticky top-0 bg-[#050505]/80 backdrop-blur-xl z-10 w-full max-w-3xl mx-auto">
          <div>
            <h2 className="text-sm font-bold text-white tracking-widest uppercase">System Settings</h2>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">Persistent Base Persona & Agent Directives</p>
          </div>
          <div className="flex gap-2">
            <button onClick={saveSettings} className="px-4 py-2 bg-amber-500 text-black text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-amber-400 active:scale-95 transition-all flex items-center gap-2">
              <Save className="w-4 h-4" /> Save
            </button>
            <button onClick={() => setShowProfile(false)} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 w-full max-w-3xl mx-auto p-6 flex flex-col gap-8 pb-20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <ShieldCheck className="w-5 h-5 text-amber-500 mb-3" />
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Base Prompt</div>
              <div className="text-sm text-white mt-1">Bible persona loads first</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <UserRound className="w-5 h-5 text-emerald-500 mb-3" />
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Agent Layer</div>
              <div className="text-sm text-white mt-1">{activeAgent.label} / {activeAgent.voiceName}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <BrainCircuit className="w-5 h-5 text-blue-400 mb-3" />
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Memory</div>
              <div className="text-sm text-white mt-1">RTDB persistent</div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-4">
            <div className="relative w-32 h-32 rounded-full border-2 border-white/10 bg-zinc-900 overflow-hidden flex items-center justify-center group">
              {settings.avatarUrl || user.photoURL ? (
                <img src={settings.avatarUrl || user.photoURL || ''} alt="Avatar" className="w-full h-full object-cover group-hover:opacity-50 transition-opacity" />
              ) : (
                <div className="text-4xl text-zinc-700 font-bold">{user.displayName?.[0] || 'U'}</div>
              )}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <Camera className="w-8 h-8 text-white drop-shadow-md" />
              </div>
              <input
                type="file"
                accept="image/*"
                className="absolute inset-0 opacity-0 cursor-pointer"
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
              <h3 className="text-xs uppercase tracking-widest font-bold text-zinc-300">Avatar Node</h3>
              <p className="text-[10px] text-zinc-600 mt-1">Saved per active agent</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold tracking-widest uppercase text-zinc-500 flex items-center gap-2">
                <Settings2 className="w-3 h-3" /> Agent Profile
              </label>
              <select
                value={activeAgent.id}
                onChange={(e) => handleAgentChange(e.target.value as AgentId)}
                className="w-full bg-[#0A0A0B] border border-white/10 rounded-xl p-4 text-white font-serif text-xl focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 outline-none transition-all"
              >
                <option value="maximus">Maximus — Orus male voice</option>
                <option value="beatrice">Beatrice — Aoede female voice</option>
              </select>
              <p className="text-[10px] text-zinc-600 uppercase tracking-widest">Changing agent swaps Gemini Live voice and loads that agent’s saved directives.</p>
            </div>

            <div className="space-y-2 flex-1 flex flex-col">
              <label className="text-[10px] font-bold tracking-widest uppercase text-zinc-500">Persistent Bible Base Persona</label>
              <textarea
                value={settings.persistentBasePrompt}
                onChange={(e) => setSettings((current) => ({ ...current, persistentBasePrompt: e.target.value }))}
                className="w-full bg-[#0A0A0B] border border-white/10 rounded-xl p-4 text-zinc-300 font-mono text-xs leading-relaxed focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 outline-none transition-all min-h-[220px] resize-y"
                placeholder="Bible personality base prompt..."
              />
              <p className="text-[10px] text-zinc-600 uppercase tracking-widest">This is injected first into every live session before Beatrice or Maximus directives.</p>
            </div>

            <div className="space-y-2 flex-1 flex flex-col">
              <label className="text-[10px] font-bold tracking-widest uppercase text-zinc-500">{activeAgent.label} System Directives</label>
              <textarea
                value={settings.systemPrompt}
                onChange={(e) => updateActiveAgentPrompt(e.target.value)}
                className="w-full bg-[#0A0A0B] border border-white/10 rounded-xl p-4 text-zinc-300 font-mono text-xs leading-relaxed focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 outline-none transition-all min-h-[320px] resize-y"
                placeholder="Agent system directives..."
              />
              <p className="text-[10px] text-zinc-600 uppercase tracking-widest">Saved separately per agent so switching does not erase custom prompts.</p>
            </div>
          </div>
        </div>
      </motion.div>
    )}
  </AnimatePresence>
</div>

); }