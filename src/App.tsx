import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Square, 
  Trash2, 
  Link, 
  Upload, 
  AlertCircle, 
  RefreshCw, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  Wifi, 
  Clock, 
  Terminal, 
  HardDrive, 
  CircleDot, 
  Database,
  Calendar,
  FileVideo,
  PlusCircle,
  HelpCircle,
  Edit,
  X,
  Check,
  Volume2,
  VolumeX,
  Sparkles,
  Radio,
  Megaphone,
  UserPlus,
  Heart,
  MessageSquare,
  Settings,
  Trophy,
  Crown,
  Globe,
  Youtube
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface VideoMetadata {
  id: string;
  title: string;
  type: 'local' | 'url';
  source: string;
  size?: number;
  createdAt: string;
}

interface Schedule {
  id: string;
  channelId?: string; // 'kanal1' | 'kanal2' | 'kanal3' | 'kanal4'
  title: string;
  videoType: 'local' | 'url' | 'window';
  videoSource: string;
  videoTitle: string;
  scheduledTime: string;
  scheduledEndTime?: string;
  streamKey: string;
  streamProtocol?: 'rtmp' | 'rtmps';
  loop: boolean;
  shortsMode?: boolean;
  dualStream?: boolean;
  proxyUrl?: string; // SOCKS5/HTTP Proxy URL
  youtubeLiveUrl?: string; // YouTube Live URL/ID for live views
  status: 'Bekliyor' | 'Yayında' | 'Tamamlandı' | 'Hata';
  isCurrentlyRunning: boolean;
  errorMsg?: string;
  createdAt: string;
  actualStartTime?: string;
  actualEndTime?: string;
  geminiBotEnabled?: boolean;
  geminiBotPrompt?: string;
  geminiBotTtsEnabled?: boolean;
}

// Safe LocalStorage helpers to prevent sandbox/cross-origin iframe crashes
const getLocalStorageItemSafe = (key: string, defaultValue: string = ''): string => {
  try {
    return localStorage.getItem(key) || defaultValue;
  } catch (e) {
    return defaultValue;
  }
};

const setLocalStorageItemSafe = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    // silently ignore
  }
};

interface ServerStatus {
  serverTime: string;
  totalSchedules: number;
  activeStreamsCount: number;
  totalVideos: number;
  memoryUsage: number;
  uptime: number;
  lastCronPingTime?: string | null;
}

export default function App() {
  // App states
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [videos, setVideos] = useState<VideoMetadata[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  
  // Refs to track selectedVideoId and inspectScheduleId to prevent stale closures in periodic loops
  const selectedVideoIdRef = useRef('');
  const inspectScheduleIdRef = useRef<string | null>(null);

  // Function to resolve clean public cron url, preventing 302 Redirect issues on sandbox environments
  const getCronUrl = () => {
    return window.location.origin + '/api/cron';
  };

  // -------------------------------------------------------------
  // CANLI YAYIN ASİSTANI (ALERTS, CONFETTI & TTS) STATE ENGINE
  // -------------------------------------------------------------
  const [alertVideoIdOrUrl, setAlertVideoIdOrUrl] = useState('');
  const [isAlertWatcherActive, setIsAlertWatcherActive] = useState(false);
  const [isOverlayView, setIsOverlayView] = useState(false);
  const [overlayAudioUnlocked, setOverlayAudioUnlocked] = useState(false);
  const [copiedOverlay, setCopiedOverlay] = useState(false);
  const [activeOverlayAlert, setActiveOverlayAlert] = useState<{
    id: string;
    type: 'SUBSCRIBE' | 'LIKE' | 'COMMENT_TTS' | 'QUIZ_WIN';
    author: string;
    message: string;
    greetingText?: string;
  } | null>(null);

  // Auto-clear helper for active overlay alert card
  useEffect(() => {
    if (activeOverlayAlert) {
      const timer = setTimeout(() => {
        setActiveOverlayAlert(null);
      }, 7000);
      return () => clearTimeout(timer);
    }
  }, [activeOverlayAlert]);

  // Read URL parameters to detect if running in OBS Overlay Mode
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isOverlay = window.location.search.includes('overlay=true') || window.location.hash.includes('overlay');
      setIsOverlayView(isOverlay);
      if (isOverlay) {
        setIsAlertWatcherActive(true); // Auto watchdog in OBS Overlay
      }
    }
  }, []);

  const [alertsFeedHistory, setAlertsFeedHistory] = useState<Array<{
    id: string;
    author: string;
    message: string;
    timestamp: number;
    type: 'SUBSCRIBE' | 'LIKE' | 'COMMENT_TTS' | 'QUIZ_WIN';
    greetingText?: string;
  }>>([]);

  // TRIVIA / Q&A QUIZ INTERACTIVE GAME MODE
  const [isQuizActive, setIsQuizActive] = useState(false);
  const [quizQuestion, setQuizQuestion] = useState('Yayınımızda sorduğumuz sorunun cevabı nedir?');
  const [quizCorrectAnswer, setQuizCorrectAnswer] = useState('0');
  const [quizWinnerOnlyFirst, setQuizWinnerOnlyFirst] = useState(true);
  const [quizSolved, setQuizSolved] = useState(false);
  const [quizWinnersList, setQuizWinnersList] = useState<Array<{
    id: string;
    author: string;
    answer: string;
    timestamp: number;
    greetingText?: string;
  }>>([]);
  
  // Custom audio & effects controls
  const [isTtsFired, setIsTtsFired] = useState(true);
  const [isGeminiEnhanced, setIsGeminiEnhanced] = useState(true);
  const [isConfettiFired, setIsConfettiFired] = useState(true);
  const [isSfxFired, setIsSfxFired] = useState(true);
  const [selectedTtsVoiceIndex, setSelectedTtsVoiceIndex] = useState<number>(-1);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  // Simulator state values
  const [simName, setSimName] = useState('Kemal Gökdemir');
  const [simMessage, setSimMessage] = useState('Kolay gelsin abi, harika yayın yapıyorsun!');
  const [simType, setSimType] = useState<'SUBSCRIBE' | 'LIKE' | 'COMMENT_TTS'>('SUBSCRIBE');
  const [simLoading, setSimLoading] = useState(false);
  const [alertConfigLoading, setAlertConfigLoading] = useState(false);

  // Load available browser text-to-speech voices
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const loadVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        setAvailableVoices(voices);
        
        // Target Turkish automatically
        const trIndex = voices.findIndex(v => v.lang.toLowerCase().includes('tr'));
        if (trIndex >= 0) {
          setSelectedTtsVoiceIndex(trIndex);
        } else if (voices.length > 0) {
          setSelectedTtsVoiceIndex(0);
        }
      };
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  // Exquisite local audio alert synthesis to guarantee zero dependencies
  const playSfxApplause = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      for (let i = 0; i < 22; i++) {
        const delay = i * 0.07 + Math.random() * 0.035;
        const bufferSize = ctx.sampleRate * 0.12;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let j = 0; j < bufferSize; j++) {
          data[j] = Math.random() * 2 - 1;
        }
        const sourceNode = ctx.createBufferSource();
        sourceNode.buffer = buffer;
        const filterNode = ctx.createBiquadFilter();
        filterNode.type = 'bandpass';
        filterNode.frequency.value = 920 + Math.random() * 260;
        filterNode.Q.value = 2.2;

        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(0, ctx.currentTime + delay);
        gainNode.gain.linearRampToValueAtTime(0.32, ctx.currentTime + delay + 0.005);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.1);

        sourceNode.connect(filterNode);
        filterNode.connect(gainNode);
        gainNode.connect(ctx.destination);
        sourceNode.start(ctx.currentTime + delay);
      }
    } catch (e) {
      console.warn('Audio synthesis support warning:', e);
    }
  };

  const playSfxChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      const playTone = (freq: number, start: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gainNode.gain.setValueAtTime(0, start);
        gainNode.gain.linearRampToValueAtTime(0.2, start + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, start + duration);
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + duration);
      };
      playTone(1046.50, now, 0.4); // C6 tone
      playTone(1318.51, now + 0.08, 0.5); // E6 tone
      playTone(1567.98, now + 0.16, 0.65); // G6 tone
    } catch (e) {
      console.warn('Audio synthesis support warning:', e);
    }
  };

  const playSfxVictoryFanfare = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      
      const playFreq = (freq: number, start: number, duration: number, vol: number) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        
        gainNode.gain.setValueAtTime(0, start);
        gainNode.gain.linearRampToValueAtTime(vol, start + 0.01);
        gainNode.gain.setValueAtTime(vol, start + duration - 0.05);
        gainNode.gain.linearRampToValueAtTime(0, start + duration);
        
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + duration);
      };

      // Trumpet / arcade fanfare
      playFreq(523.25, now, 0.12, 0.12);       // C5
      playFreq(659.25, now + 0.12, 0.12, 0.12); // E5
      playFreq(783.99, now + 0.24, 0.12, 0.12); // G5
      playFreq(1046.50, now + 0.36, 0.40, 0.16); // C6 chord blast
      playFreq(1318.51, now + 0.36, 0.40, 0.12); // E6 chord
    } catch (e) {
      console.warn('Audio synthesis support warning:', e);
    }
  };

  // Dedicated Quiz Winner Event Handler
  const handleQuizWinner = async (author: string, answer: string) => {
    // 1. Double Confetti Blow out
    if (isConfettiFired) {
      confetti({ particleCount: 110, spread: 80, origin: { y: 0.6, x: 0.15 } });
      confetti({ particleCount: 110, spread: 80, origin: { y: 0.6, x: 0.85 } });
    }

    // 2. Play trumpet alert
    if (isSfxFired) {
      playSfxVictoryFanfare();
    }

    // 3. Resolve greeting using AI or offline
    let finalGreeting = "";
    if (isGeminiEnhanced) {
      try {
        const decorRes = await fetch('/api/alerts/generate-greeting', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'QUIZ_WIN', name: author, message: answer })
        });
        if (decorRes.ok) {
          const decorData = await decorRes.json();
          finalGreeting = decorData.greeting || "";
        }
      } catch (e) {
        console.warn('Gemini quiz winner greeting failed:', e);
      }
    }

    if (!finalGreeting) {
      const templates = [
        `Tebrikler! ${author} canlı yayında sorduğumuz soruya doğru cevap olan "${answer}" yanıtını vererek bilgi yarışmasını kazandı! Harbiden süpersin!`,
        `Harika bir zeka performansı! ${author} doğru cevabı bildi: "${answer}". Alkışlar senin için gelsin!`,
        `Mükemmel! Doğru cevap geldi! ${author} "${answer}" diyerek yarışmamızın şampiyonu olmayı başardı!`
      ];
      finalGreeting = templates[Math.floor(Math.random() * templates.length)];
    }

    // 4. TTS audio
    if (isTtsFired && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(finalGreeting);
      if (selectedTtsVoiceIndex >= 0 && availableVoices[selectedTtsVoiceIndex]) {
        utterance.voice = availableVoices[selectedTtsVoiceIndex];
      }
      utterance.lang = utterance.voice?.lang || 'tr-TR';
      window.speechSynthesis.speak(utterance);
    }

    // Set current active alert in visual overlay card
    setActiveOverlayAlert({
      id: `overlay-${Date.now()}`,
      type: 'QUIZ_WIN',
      author,
      message: answer,
      greetingText: finalGreeting
    });

    // 5. Save in Winners list
    const newWinner = {
      id: `winner-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      author,
      answer,
      timestamp: Date.now(),
      greetingText: finalGreeting
    };

    setQuizWinnersList(prev => [newWinner, ...prev]);

    // Also trigger as an alert item in general stream log
    setAlertsFeedHistory(prev => {
      const updated = [
        {
          id: `feed-quiz-${Date.now()}`,
          author,
          message: `Soru Cevap: "${answer}"`,
          timestamp: Date.now(),
          type: 'QUIZ_WIN' as any,
          greetingText: finalGreeting
        },
        ...prev
      ];
      return updated.slice(0, 40);
    });

    if (quizWinnerOnlyFirst) {
      setQuizSolved(true);
    }
  };

  // Main Incoming Alert Evaluator (Fires confetti, plays sound effect, processes TTS text)
  const handleIncomingAlert = async (type: 'SUBSCRIBE' | 'LIKE' | 'COMMENT_TTS', author: string, message: string) => {
    // 1. Confetti explosion check
    if (isConfettiFired) {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.7, x: 0.25 }
      });
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.7, x: 0.75 }
      });
    }

    // 2. Synthesize audio cues
    if (isSfxFired) {
      if (type === 'SUBSCRIBE') {
        playSfxApplause();
      } else if (type === 'LIKE') {
        playSfxChime();
      } else {
        // Soft chime ring for comment arrivals
        playSfxChime();
      }
    }

    // 3. Resolve greeting language using Gemini API or server direct templates
    let finalGreeting = "";
    if (isGeminiEnhanced) {
      try {
        const decorRes = await fetch('/api/alerts/generate-greeting', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, name: author, message })
        });
        if (decorRes.ok) {
          const decorData = await decorRes.json();
          finalGreeting = decorData.greeting || "";
        }
      } catch (e) {
        console.warn('Gemini welcome generator failed:', e);
      }
    }

    if (!finalGreeting) {
      // Offline fallback templates
      const templates = {
        SUBSCRIBE: [
          `${author} kanala abone oldu! Ailemize hoş geldin, desteğin için sonsuz teşekkür ederiz!`,
          `Harika bir haber! ${author} aramıza katıldı. Abone olduğun için çok teşekkürler!`,
          `Müjde! ${author} aboneniz oldu. Alkışlar ${author} için gelsin, hoş geldin!`
        ],
        LIKE: [
          `${author} yayını beğendi! Çok teşekkürler, harika bir destek!`,
          `${author} yayına harika bir beğeni bıraktı, desteğinizi hissetmek mükemmel!`,
          `Süpersin ${author}! Yayını beğendiğin ve bizi desteklediğin için çok teşekkürler!`
        ],
        COMMENT_TTS: [
          `${author} sohbete yazdı: "${message || ''}"`
        ]
      };
      const arr = templates[type] || [`${author} yanımızda, teşekkür ederiz!`];
      finalGreeting = arr[Math.floor(Math.random() * arr.length)];
    }

    // 4. Speak aloud using Speech Synthesis Utterance
    if (isTtsFired && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(finalGreeting);
      if (selectedTtsVoiceIndex >= 0 && availableVoices[selectedTtsVoiceIndex]) {
        utterance.voice = availableVoices[selectedTtsVoiceIndex];
      }
      utterance.lang = utterance.voice?.lang || 'tr-TR';
      utterance.rate = 1.0;
      utterance.volume = 1.0;
      window.speechSynthesis.speak(utterance);
    }

    // Set current active alert in visual overlay card
    setActiveOverlayAlert({
      id: `overlay-${Date.now()}`,
      type,
      author,
      message,
      greetingText: finalGreeting
    });

    // 5. Save in local app feed memory
    setAlertsFeedHistory(prev => {
      const updated = [
        {
          id: `feed-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
          author,
          message,
          timestamp: Date.now(),
          type,
          greetingText: finalGreeting
        },
        ...prev
      ];
      return updated.slice(0, 40); // cap size at 40
    });
  };

  // Set active watch target in backend server
  const handleUpdateAlertConfig = async (activate: boolean) => {
    setAlertConfigLoading(true);
    try {
      const res = await fetch('/api/alerts/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoIdOrUrl: activate ? alertVideoIdOrUrl : '' })
      });
      if (res.ok) {
        const data = await res.json();
        setIsAlertWatcherActive(activate && !!data.activeVideoId);
        if (!activate) {
          // Speak silent stop confirmation
          if (isTtsFired && 'speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance("Canlı yayın sohbet takibi sonlandırıldı.");
            window.speechSynthesis.speak(utterance);
          }
        } else {
          try {
            localStorage.setItem('alert_video_url_or_id', alertVideoIdOrUrl);
          } catch (e) {}
          // Speak ready confirmation
          if (isTtsFired && 'speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance("Canlı yayın sohbet takibi başlatıldı. Yeni olaylar dinleniyor.");
            window.speechSynthesis.speak(utterance);
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAlertConfigLoading(false);
    }
  };

  // Fire simulator alerts
  const handleTriggerSimulatedAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simName.trim()) return;
    setSimLoading(true);
    try {
      if (simType === 'QUIZ_WIN' as any) {
        await handleQuizWinner(simName, quizCorrectAnswer);
      } else {
        const res = await fetch('/api/alerts/trigger-manual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: simType,
            author: simName,
            message: simType === 'COMMENT_TTS' ? simMessage : ''
          })
        });
        if (res.ok) {
          // Trigger client process loop
          await handleIncomingAlert(simType, simName, simType === 'COMMENT_TTS' ? simMessage : '');
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSimLoading(false);
    }
  };

  // Initial config synchronisation
  useEffect(() => {
    const fetchAlertSettings = async () => {
      try {
        const res = await fetch('/api/alerts/config');
        if (res.ok) {
          const config = await res.json();
          if (config.activeVideoId) {
            setAlertVideoIdOrUrl(config.activeVideoId);
            setIsAlertWatcherActive(true);
          }
        }
      } catch (e) {}
    };
    fetchAlertSettings();
  }, []);

  // Periodic watch poller for new events parsed by our background parser on the server
  useEffect(() => {
    if (!isAlertWatcherActive) return;
    
    let active = true;
    const poller = setInterval(async () => {
      try {
        const res = await fetch('/api/alerts/feed');
        if (!res.ok || !active) return;
        const data = await res.json();
        
        if (data.feed && Array.isArray(data.feed) && data.feed.length > 0) {
          for (const alertRow of data.feed) {
            const incomingCommentText = (alertRow.message || '').trim().toLowerCase();
            const targetAnswerText = quizCorrectAnswer.trim().toLowerCase();
            const isQuizActiveMatch = isQuizActive && (!quizSolved || !quizWinnerOnlyFirst) && 
                                     incomingCommentText === targetAnswerText && 
                                     targetAnswerText !== '';
                                     
            if (isQuizActiveMatch) {
              await handleQuizWinner(alertRow.author, alertRow.message || '');
            } else {
              await handleIncomingAlert(alertRow.commandType || 'SUBSCRIBE', alertRow.author, alertRow.message || '');
            }
          }
        }
      } catch (err) {
        console.warn('Alert feed poll warning:', err);
      }
    }, 4500);

    return () => {
      active = false;
      clearInterval(poller);
    };
  }, [
    isAlertWatcherActive, 
    isTtsFired, 
    isGeminiEnhanced, 
    isConfettiFired, 
    isSfxFired, 
    selectedTtsVoiceIndex, 
    availableVoices,
    isQuizActive,
    quizQuestion,
    quizCorrectAnswer,
    quizWinnerOnlyFirst,
    quizSolved
  ]);
  
  // Form states
  const [schedTitle, setSchedTitle] = useState('');
  const [selectedVideoId, setSelectedVideoId] = useState('');
  const [geminiBotEnabled, setGeminiBotEnabled] = useState(false);
  const [geminiBotPrompt, setGeminiBotPrompt] = useState('Sohbette sorulan soruları cana yakın, samimi ve Türkçe olarak cevapla. Kanal ismimiz TubeFlow Auto. İzleyicileri yayını beğenmeye ve abone olmaya davet et.');
  const [geminiBotTtsEnabled, setGeminiBotTtsEnabled] = useState(false);
  
  // 🖥️ Window Capture States
  const [mediaSelectionType, setMediaSelectionType] = useState<'library' | 'window'>('library');
  const [windowCaptureMode, setWindowCaptureMode] = useState<'desktop' | 'list' | 'manual'>('desktop');
  const [customWindowTitle, setCustomWindowTitle] = useState('');
  const [availableWindows, setAvailableWindows] = useState<string[]>([]);
  const [selectedWindowTitle, setSelectedWindowTitle] = useState('');
  const [isLoadingWindows, setIsLoadingWindows] = useState(false);

  const fetchWindows = async () => {
    setIsLoadingWindows(true);
    try {
      const res = await fetch('/api/windows');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.windows) {
          setAvailableWindows(data.windows);
          if (data.windows.length > 0) {
            setSelectedWindowTitle(data.windows[0]);
          }
        }
      }
    } catch (e) {
      console.error('Failed to fetch window list:', e);
    } finally {
      setIsLoadingWindows(false);
    }
  };

  useEffect(() => {
    if (mediaSelectionType === 'window') {
      fetchWindows();
    }
  }, [mediaSelectionType]);
  
  useEffect(() => {
    selectedVideoIdRef.current = selectedVideoId;
  }, [selectedVideoId]);

  // Keep inspectScheduleId ref up to date
  const [scheduledDateTime, setScheduledDateTime] = useState('');
  const [scheduledEndDateTime, setScheduledEndDateTime] = useState('');
  const [startTimeType, setStartTimeType] = useState<'immediate' | 'scheduled'>('immediate');

  const [activeChannel, setActiveChannel] = useState<'kanal1' | 'kanal2' | 'kanal3' | 'kanal4'>(() => {
    return (getLocalStorageItemSafe('active_channel') as 'kanal1' | 'kanal2' | 'kanal3' | 'kanal4') || 'kanal1';
  });

  const [customStreamKey, setCustomStreamKey] = useState(() => {
    const active = (getLocalStorageItemSafe('active_channel') as 'kanal1' | 'kanal2' | 'kanal3' | 'kanal4') || 'kanal1';
    return getLocalStorageItemSafe(`yt_stream_key_${active}`) || getLocalStorageItemSafe('yt_stream_key') || '';
  });
  const [streamProtocol, setStreamProtocol] = useState<'rtmp' | 'rtmps'>(() => {
    const active = (getLocalStorageItemSafe('active_channel') as 'kanal1' | 'kanal2' | 'kanal3' | 'kanal4') || 'kanal1';
    return (getLocalStorageItemSafe(`yt_stream_protocol_${active}`) as 'rtmp' | 'rtmps') || (getLocalStorageItemSafe('yt_stream_protocol') as 'rtmp' | 'rtmps') || 'rtmps';
  });
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [shortsMode, setShortsMode] = useState(false);
  const [dualStreamEnabled, setDualStreamEnabled] = useState(true);
  const [showStreamKey, setShowStreamKey] = useState(false);
  const [streamProxyUrl, setStreamProxyUrl] = useState('');
  const [youtubeLiveUrl, setYoutubeLiveUrl] = useState(() => {
    const active = (getLocalStorageItemSafe('active_channel') as 'kanal1' | 'kanal2' | 'kanal3' | 'kanal4') || 'kanal1';
    return getLocalStorageItemSafe(`yt_live_view_url_${active}`) || getLocalStorageItemSafe('yt_live_view_url') || '';
  });

  // Sync settings when active channel changes
  useEffect(() => {
    setLocalStorageItemSafe('active_channel', activeChannel);
    
    // Load setting for selected channel
    const savedKey = getLocalStorageItemSafe(`yt_stream_key_${activeChannel}`);
    const savedProto = getLocalStorageItemSafe(`yt_stream_protocol_${activeChannel}`) as 'rtmp' | 'rtmps';
    const savedViewUrl = getLocalStorageItemSafe(`yt_live_view_url_${activeChannel}`);
    
    // Fallback to global if not saved per-channel yet
    const finalKey = savedKey !== '' ? savedKey : (getLocalStorageItemSafe('yt_stream_key') || '');
    const finalProto = savedProto ? savedProto : ((getLocalStorageItemSafe('yt_stream_protocol') as 'rtmp' | 'rtmps') || 'rtmps');
    const finalViewUrl = savedViewUrl !== '' ? savedViewUrl : (getLocalStorageItemSafe('yt_live_view_url') || '');
    
    setCustomStreamKey(finalKey);
    setStreamProtocol(finalProto);
    setYoutubeLiveUrl(finalViewUrl);
  }, [activeChannel]);

  // Keep saved per-channel settings fresh in localStorage as the user types/updates them
  useEffect(() => {
    if (customStreamKey !== undefined) {
      setLocalStorageItemSafe(`yt_stream_key_${activeChannel}`, customStreamKey.trim());
    }
  }, [customStreamKey, activeChannel]);

  useEffect(() => {
    if (youtubeLiveUrl !== undefined) {
      setLocalStorageItemSafe(`yt_live_view_url_${activeChannel}`, youtubeLiveUrl.trim());
    }
  }, [youtubeLiveUrl, activeChannel]);

  const [editProxyUrl, setEditProxyUrl] = useState('');
  const [editYoutubeLiveUrl, setEditYoutubeLiveUrl] = useState('');
  const [scheduleDeleteConfirmId, setScheduleDeleteConfirmId] = useState<string | null>(null);
  const [videoDeleteConfirmId, setVideoDeleteConfirmId] = useState<string | null>(null);

  // Free public proxies states
  const [freeProxies, setFreeProxies] = useState<{ 
    protocol: string; 
    ipPort: string; 
    formatted: string;
    latency?: number;
    signal?: number;
    country?: string;
  }[]>([]);
  const [loadingFreeProxies, setLoadingFreeProxies] = useState(false);
  const [showFreeProxySelector, setShowFreeProxySelector] = useState(false);
  const [freeProxyFilter, setFreeProxyFilter] = useState<'all' | 'socks5' | 'socks4' | 'http'>('all');

  const loadFreeProxies = async () => {
    setLoadingFreeProxies(true);
    try {
      const res = await fetch('/api/free-proxies');
      const data = await res.json();
      if (data.success && data.proxies) {
        setFreeProxies(data.proxies);
      }
    } catch (e) {
      console.error("Free proxy fetch fail:", e);
    } finally {
      setLoadingFreeProxies(false);
    }
  };

  // Error states for clean display
  const [localFormError, setLocalFormError] = useState('');

  // External URL upload state
  const [extTitle, setExtTitle] = useState('');
  const [extUrl, setExtUrl] = useState('');

  // Selected file upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Active logs visual inspection panel
  const [inspectScheduleId, setInspectScheduleId] = useState<string | null>(null);
  useEffect(() => {
    inspectScheduleIdRef.current = inspectScheduleId;
  }, [inspectScheduleId]);

  const [activeLogs, setActiveLogs] = useState('');
  const logsEndRef = useRef<HTMLDivElement | null>(null);
  const [logsAutoScroll, setLogsAutoScroll] = useState(true);

  // Real-time live viewer counts for active streams
  const [viewerCounts, setViewerCounts] = useState<Record<string, { count: number; isSimulated: boolean }>>({});

  useEffect(() => {
    const activeScheds = schedules.filter(s => s.status === 'Yayında');
    if (activeScheds.length === 0) {
      if (Object.keys(viewerCounts).length > 0) {
        setViewerCounts({});
      }
      return;
    }

    const fetchCounts = async () => {
      const newCounts = { ...viewerCounts };
      for (const sched of activeScheds) {
        // If they provided a custom youtube Live URL or ID
        if (sched.youtubeLiveUrl && sched.youtubeLiveUrl.trim()) {
          try {
            const res = await fetch(`/api/viewer-count?urlOrId=${encodeURIComponent(sched.youtubeLiveUrl.trim())}`);
            if (res.ok) {
              const data = await res.json();
              newCounts[sched.id] = { count: data.count, isSimulated: data.isSimulated };
            }
          } catch (e) {
            console.warn("Izleyici sayisi alinamadi:", e);
          }
          // Intentionally space out sequential fetches to avoid hammering endpoints
          await new Promise(resolve => setTimeout(resolve, 800));
        } else {
          // Fallback simulation: nice fluctuating numbers to look alive
          const base = 28;
          const minutes = new Date().getMinutes();
          // Use id character numeric sum as seed
          const seed = sched.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
          const fluctuation = Math.sin(minutes + seed) * 9;
          const count = Math.max(8, Math.round(base + fluctuation));
          newCounts[sched.id] = { count, isSimulated: true };
        }
      }
      setViewerCounts(newCounts);
    };

    fetchCounts();
    const timer = setInterval(fetchCounts, 25000); // Check every 25 seconds to protect CPU/bandwidth
    return () => clearInterval(timer);
  }, [schedules.map(s => `${s.id}-${s.status}-${s.youtubeLiveUrl}`).join(',')]);

  // Editing state variables for existing schedule items
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editStreamKey, setEditStreamKey] = useState('');
  const [editStreamProtocol, setEditStreamProtocol] = useState<'rtmp' | 'rtmps'>('rtmp');
  const [editScheduledTime, setEditScheduledTime] = useState('');
  const [editScheduledEndTime, setEditScheduledEndTime] = useState('');
  const [editLoop, setEditLoop] = useState(false);
  const [editShortsMode, setEditShortsMode] = useState(false);
  const [editDualStream, setEditDualStream] = useState(false);
  const [editChannelId, setEditChannelId] = useState<'kanal1' | 'kanal2' | 'kanal3' | 'kanal4'>('kanal1');
  const [editGeminiBotEnabled, setEditGeminiBotEnabled] = useState(false);
  const [editGeminiBotPrompt, setEditGeminiBotPrompt] = useState('');
  const [editGeminiBotTtsEnabled, setEditGeminiBotTtsEnabled] = useState(false);

  // Gemini active replies state
  const [consoleTab, setConsoleTab] = useState<'ffmpeg' | 'gemini_bot'>('ffmpeg');
  const [botReplies, setBotReplies] = useState<Array<{
    id: string;
    author: string;
    userMessage: string;
    botResponse: string;
    timestamp: number;
    ttsSpoken: boolean;
  }>>([]);

  // UI state monitors
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [localTimeClock, setLocalTimeClock] = useState('');

  const isCronActive = (() => {
    if (!status || !status.lastCronPingTime || !status.serverTime) return false;
    try {
      const serverTimeMs = new Date(status.serverTime).getTime();
      const lastPing = new Date(status.lastCronPingTime).getTime();
      if (isNaN(serverTimeMs) || isNaN(lastPing)) return false;
      const diff = (serverTimeMs - lastPing) / 1000;
      return diff < 1500; // active if ping in last 25 minutes
    } catch (e) {
      return false;
    }
  })();

  // Fetch initial data
  const fetchData = async () => {
    try {
      const [statusRes, videosRes, schedulesRes] = await Promise.all([
        fetch('/api/status'),
        fetch('/api/videos'),
        fetch('/api/schedules')
      ]);

      if (statusRes.status === 429 || videosRes.status === 429 || schedulesRes.status === 429) {
        throw new Error('İstek sınırı aşıldı (Rate Exceeded). Lütfen sayfayı biraz dinlendirin.');
      }

      if (!statusRes.ok || !videosRes.ok || !schedulesRes.ok) {
        throw new Error('Sunucu şu anda meşgul veya yeniden yükleniyor olabilir. Lütfen bekleyin...');
      }

      const statusData = await statusRes.json();
      const videosData = await videosRes.json();
      const schedulesData = await schedulesRes.json();

      setStatus(statusData);
      setVideos(videosData);
      setSchedules(schedulesData);
      
      // Auto-set the first video option if nothing selected yet or if the previously selected video is deleted
      if (videosData.length > 0) {
        setSelectedVideoId(prev => {
          if (!prev) {
            return videosData[0].id;
          }
          const exists = videosData.some((v: any) => v.id === prev);
          if (exists) {
            return prev;
          }
          return videosData[0].id;
        });
      } else {
        setSelectedVideoId('');
      }

      // Auto-select active live streams into the inspect panel to prevent empty telemetry view
      const activeRunningSchedule = schedulesData.find((s: any) => s.status === 'Yayında');
      if (activeRunningSchedule && !inspectScheduleIdRef.current) {
        setInspectScheduleId(activeRunningSchedule.id);
      }
      
      setErrorMessage('');
    } catch (err: any) {
      if (err.message && (err.message.includes('fetch') || err.message.includes('failed to fetch') || err.message.includes('Failed to fetch'))) {
        setErrorMessage('Sunucuya bağlanılamıyor. Sunucu çevrimdışı, ağ bağlantısı yok veya sunucu yeniden başlıyor olabilir.');
      } else {
        setErrorMessage('Veriler güncellenirken hata oluştu: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Run periodic telemetry updates
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000); // 15 seconds is perfect for durable, rate-safe sync
    return () => clearInterval(interval);
  }, []);

  // Sync real-time clock indicator in Header
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setLocalTimeClock(now.toLocaleString('tr-TR', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      }));
    };
    updateTime();
    const clockInterval = setInterval(updateTime, 1000);
    return () => clearInterval(clockInterval);
  }, []);

  // Fetch FFmpeg logs when active stream inspection is enabled
  useEffect(() => {
    if (!inspectScheduleId) return;

    // Skip polling if the schedules list loaded and this schedule is no longer available
    if (schedules.length > 0 && !schedules.some(s => s.id === inspectScheduleId)) {
      setInspectScheduleId(null);
      return;
    }

    const controller = new AbortController();
    let isMounted = true;

    const fetchLogs = async () => {
      try {
        const res = await fetch(`/api/schedules/${inspectScheduleId}/logs`, {
          signal: controller.signal
        });
        if (res.ok && isMounted) {
          const data = await res.json();
          setActiveLogs(data.logs);
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.warn('Silent log update skip (transient connection delay):', err.message);
        }
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 8000); // Pool logs every 8 seconds to stay completely safe
    return () => {
      isMounted = false;
      controller.abort();
      clearInterval(interval);
    };
  }, [inspectScheduleId, schedules]);

  // Fetch Gemini bot replies when active stream is inspected
  useEffect(() => {
    if (!inspectScheduleId) {
      setBotReplies([]);
      return;
    }

    let active = true;
    const fetchBotReplies = async () => {
      try {
        const res = await fetch(`/api/schedules/${inspectScheduleId}/bot-replies`);
        if (res.ok && active) {
          const data = await res.json();
          if (data.success && data.replies) {
            setBotReplies(data.replies);

            // Audio speech synthesis for any un-spoken bot replies if TTS is active
            const inspectedSchedule = schedules.find(s => s.id === inspectScheduleId);
            const isTtsActiveForBot = inspectedSchedule?.geminiBotTtsEnabled;

            if (isTtsActiveForBot && 'speechSynthesis' in window) {
              for (const reply of data.replies) {
                if (!reply.ttsSpoken) {
                  // Mark as spoken on server immediately so other client instances/polls don't repeat-play
                  await fetch(`/api/schedules/${inspectScheduleId}/bot-replies/${reply.id}/speak`, { method: 'POST' });
                  
                  // Speak the message!
                  const speakText = `${reply.author} sohbete yazdı: "${reply.userMessage}". Cevap: ${reply.botResponse}`;
                  const utterance = new SpeechSynthesisUtterance(speakText);
                  if (selectedTtsVoiceIndex >= 0 && availableVoices[selectedTtsVoiceIndex]) {
                    utterance.voice = availableVoices[selectedTtsVoiceIndex];
                  }
                  utterance.lang = utterance.voice?.lang || 'tr-TR';
                  window.speechSynthesis.speak(utterance);
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn('Bot replies poller error:', err);
      }
    };

    fetchBotReplies();
    const interval = setInterval(fetchBotReplies, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [inspectScheduleId, schedules, selectedTtsVoiceIndex, availableVoices]);

  // Keep logs view scrolled to bottom
  useEffect(() => {
    if (logsAutoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeLogs, logsAutoScroll]);

  // Safe Date / Time formatter helpers to prevent UI crash on invalid inputs
  const formatDateTimeSafe = (isoString?: string) => {
    if (!isoString) return 'Belirtilmedi';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return 'Belirtilmedi';
      return d.toLocaleString('tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch (e) {
      return 'Geçersiz Tarih';
    }
  };

  const formatTimeSafe = (isoString?: string) => {
    if (!isoString) return 'Belirtilmedi';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return 'Belirtilmedi';
      return d.toLocaleTimeString('tr-TR', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return 'Geçersiz Saat';
    }
  };

  // Action: Add scheduled stream
  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalFormError('');
    if (!schedTitle.trim()) {
      setLocalFormError('Lütfen yayın için belirleyici bir başlık girin.');
      return;
    }
    if (startTimeType === 'scheduled' && !scheduledDateTime) {
      setLocalFormError('Yayın başlangıç tarih ve saati seçilmelidir.');
      return;
    }
    if (!customStreamKey.trim()) {
      setLocalFormError('Yayını başlatabilmek için YouTube Canlı Yayın Anahtarı (Stream Key) gereklidir.');
      return;
    }

    let finalScheduledTime = '';
    try {
      if (startTimeType === 'immediate') {
        finalScheduledTime = new Date().toISOString();
      } else {
        const checkStartDate = new Date(scheduledDateTime);
        if (isNaN(checkStartDate.getTime())) {
          setLocalFormError('Lütfen geçerli bir yayın başlangıç tarih ve saati seçin.');
          return;
        }
        finalScheduledTime = checkStartDate.toISOString();
      }
    } catch (e) {
      setLocalFormError('Başlangıç tarihi işlenirken bir hata oluştu. Lütfen doğru tarih formatı girin.');
      return;
    }

    let finalScheduledEndTime = '';
    if (scheduledEndDateTime) {
      try {
        const checkEndDate = new Date(scheduledEndDateTime);
        if (isNaN(checkEndDate.getTime())) {
          setLocalFormError('Lütfen geçerli bir yayın bitiş tarih ve saati seçin.');
          return;
        }
        finalScheduledEndTime = checkEndDate.toISOString();
        const startMs = new Date(scheduledDateTime).getTime();
        const endMs = checkEndDate.getTime();
        if (endMs <= startMs) {
          setLocalFormError('Yayın bitiş tarihi ve saati, başlangıç tarih/saatinden daha ileri bir zaman olmalıdır.');
          return;
        }
      } catch (e) {
        setLocalFormError('Bitiş tarihi işlenirken bir hata oluştu. Lütfen doğru tarih formatı girin.');
        return;
      }
    }

    let videoType: 'local' | 'url' | 'window' = 'local';
    let videoSource = '';
    let videoTitle = '';

    if (mediaSelectionType === 'window') {
      videoType = 'window';
      if (windowCaptureMode === 'desktop') {
        videoSource = '__desktop__';
        videoTitle = '🖥️ TÜM MASAÜSTÜ / EKRAN YAKALAMA';
      } else if (windowCaptureMode === 'manual') {
        if (!customWindowTitle.trim()) {
          setLocalFormError('Lütfen yakalamak istediğiniz pencerenin tam başlığını girin.');
          return;
        }
        videoSource = customWindowTitle.trim();
        videoTitle = `🖥️ ÖZEL PENCERE: ${customWindowTitle.trim()}`;
      } else {
        if (!selectedWindowTitle) {
          setLocalFormError('Lütfen yakalamak istediğiniz pencereyi seçin.');
          return;
        }
        videoSource = selectedWindowTitle;
        videoTitle = `🖥️ PENCERE: ${selectedWindowTitle}`;
      }
    } else {
      if (!selectedVideoId) {
        setLocalFormError('Lütfen yayınlanacak video kütüphanesinden bir öğe seçin.');
        return;
      }
      const video = videos.find(v => v.id === selectedVideoId);
      if (!video) {
        setLocalFormError('Seçilen video kütüphanede bulunamadı.');
        return;
      }
      videoType = video.type;
      videoSource = video.source;
      videoTitle = video.title;
    }

    try {
      // Save stream key and live url locally so user doesn't have to enter them again
      setLocalStorageItemSafe(`yt_stream_key_${activeChannel}`, customStreamKey.trim());
      if (youtubeLiveUrl.trim()) {
        setLocalStorageItemSafe(`yt_live_view_url_${activeChannel}`, youtubeLiveUrl.trim());
      }

      const res = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: activeChannel,
          title: schedTitle,
          videoType: videoType,
          videoSource: videoSource,
          videoTitle: videoTitle,
          scheduledTime: finalScheduledTime,
          scheduledEndTime: finalScheduledEndTime,
          streamKey: customStreamKey.trim(),
          streamProtocol: streamProtocol,
          loop: loopEnabled,
          shortsMode: shortsMode,
          dualStream: dualStreamEnabled,
          proxyUrl: streamProxyUrl.trim() || undefined,
          youtubeLiveUrl: youtubeLiveUrl.trim() || undefined,
          geminiBotEnabled: geminiBotEnabled,
          geminiBotPrompt: geminiBotPrompt,
          geminiBotTtsEnabled: geminiBotTtsEnabled
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Planlama oluşturulurken hata meydana geldi.');
      }

      const createdSchedule = await res.json();

      setSchedTitle('');
      setScheduledDateTime('');
      setScheduledEndDateTime('');
      setStreamProxyUrl('');
      setLoopEnabled(false);
      setShortsMode(false);
      setDualStreamEnabled(true);
      setGeminiBotEnabled(false);
      setGeminiBotPrompt('Sohbette sorulan soruları cana yakın, samimi ve Türkçe olarak cevapla. Kanal ismimiz TubeFlow Auto. İzleyicileri yayını beğenmeye ve abone olmaya davet et.');
      setGeminiBotTtsEnabled(false);
      setLocalFormError('');

      if (startTimeType === 'immediate') {
        const startRes = await fetch(`/api/schedules/${createdSchedule.id}/start`, { method: 'POST' });
        if (startRes.ok) {
          setSuccessMessage('Yayın anlık olarak başarıyla başlatıldı! Yayın şu an aktif.');
          setInspectScheduleId(createdSchedule.id);
        } else {
          const startErr = await startRes.json();
          setErrorMessage('Yayın planı eklendi ancak anında başlatılamadı: ' + startErr.error);
        }
      } else {
        setSuccessMessage('Yayın zamanlaması başarıyla eklendi! Bilgisayarınız kapalı olsa dahi yayın tam saatinde başlatılacaktır.');
      }

      setTimeout(() => {
        setSuccessMessage('');
        setErrorMessage('');
      }, 5000);
      fetchData();
    } catch (err: any) {
      setLocalFormError(err.message || 'Bir hata oluştu.');
    }
  };

  // Action: Add External video URL
  const handleAddExternalUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extTitle.trim() || !extUrl.trim()) {
      alert('Lütfen video başlığı ve direkt bağlantı URL girin.');
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch('/api/videos/add-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: extTitle,
          url: extUrl
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Bağlantı eklenemedi.');
      }

      setExtTitle('');
      setExtUrl('');
      setSuccessMessage('Uzaktan oynatılabilir video başarıyla kütüphaneye eklendi.');
      setTimeout(() => setSuccessMessage(''), 5000);
      fetchData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Action: Upload MP4 Video via Seamless Chunks (highly robust, works for large files 500MB+ on Cloud Run)
  const handleUploadVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      alert('Lütfen yüklemek için bilgisayarınızdan bir video dosyası seçin.');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB per chunk
    const totalChunks = Math.ceil(uploadFile.size / CHUNK_SIZE);
    const uploadId = 'upload_' + Date.now() + '_' + Math.round(Math.random() * 100000);
    const videoTitle = uploadTitle || uploadFile.name;

    // Recursive chunk sender
    const sendNextChunk = (chunkIndex: number) => {
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, uploadFile.size);
      const chunkBlob = uploadFile.slice(start, end);

      const formData = new FormData();
      formData.append('chunk', chunkBlob, uploadFile.name);
      formData.append('originalName', uploadFile.name);
      formData.append('chunkIndex', String(chunkIndex));
      formData.append('totalChunks', String(totalChunks));
      formData.append('uploadId', uploadId);
      formData.append('videoTitle', videoTitle);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/videos/upload-chunk', true);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          // Calculate overall progress across all chunks
          const chunkProgress = event.loaded / event.total;
          const overallProgress = Math.round(((chunkIndex + chunkProgress) / totalChunks) * 100);
          setUploadProgress(Math.min(overallProgress, 99)); // Keep at 99% until fully completed & registered
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          try {
            const response = JSON.parse(xhr.responseText);
            if (response.completed) {
              setUploading(false);
              setUploadProgress(100);
              setUploadFile(null);
              setUploadTitle('');
              setSuccessMessage('Dosya başarıyla parça parça yüklendi ve kütüphaneye eklendi!');
              setTimeout(() => setSuccessMessage(''), 5000);
              fetchData();
            } else {
              // Upload next chunk
              sendNextChunk(chunkIndex + 1);
            }
          } catch (e) {
            setUploading(false);
            if (xhr.responseText.includes('<!DOCTYPE') || xhr.responseText.includes('<html')) {
              alert('Sunucu güncelleniyor veya yeniden başlatılıyor olabilir. Lütfen sayfayı yenileyip birkaç saniye sonra tekrar deneyin.');
            } else {
              alert('Sunucu yanıtı ayrıştırılamadı. Dosya yükleme yarıda kalmış olabilir, lütfen tekrar deneyin.');
            }
          }
        } else {
          setUploading(false);
          try {
            const err = JSON.parse(xhr.responseText);
            alert('Yükleme hatası: ' + err.error);
          } catch(e) {
            if (xhr.responseText.includes('<!DOCTYPE') || xhr.responseText.includes('<html')) {
              alert('Sunucu geçici olarak hazır değil (Ağ güncelleniyor). Lütfen birkaç saniye bekleyip tekrar deneyin.');
            } else {
              alert(`Yükleme başarısız oldu (Hata Kodu: ${xhr.status}).`);
            }
          }
        }
      };

      xhr.onerror = () => {
        setUploading(false);
        alert('Dosya aktarılırken ağ hatası meydana geldi. Lütfen internetinizi kontrol edin.');
      };

      xhr.send(formData);
    };

    // Begin chunked upload from index 0
    sendNextChunk(0);
  };

  // Action: Delete Video template
  const handleDeleteVideo = async (id: string) => {
    try {
      const res = await fetch(`/api/videos/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSuccessMessage('Video kaldırıldı.');
        setVideoDeleteConfirmId(null);
        setTimeout(() => setSuccessMessage(''), 3000);
        fetchData();
      } else {
        const data = await res.json();
        setErrorMessage(data.error || 'Silme işlemi başarısız.');
        setTimeout(() => setErrorMessage(''), 3000);
      }
    } catch (err: any) {
      setErrorMessage('Silme işlemi başarısız: ' + err.message);
      setTimeout(() => setErrorMessage(''), 3000);
    }
  };

  // Action: Delete Schedule
  const handleDeleteSchedule = async (id: string) => {
    try {
      const res = await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
      if (res.ok) {
        if (inspectScheduleId === id) {
          setInspectScheduleId(null);
          setActiveLogs('');
        }
        setSuccessMessage('Zamanlanmış yayın planı kaldırıldı.');
        setScheduleDeleteConfirmId(null);
        setTimeout(() => setSuccessMessage(''), 3000);
        fetchData();
      } else {
        const data = await res.json();
        setErrorMessage(data.error || 'Silme hatası.');
        setTimeout(() => setErrorMessage(''), 3000);
      }
    } catch (err: any) {
      setErrorMessage('Silme hatası: ' + err.message);
      setTimeout(() => setErrorMessage(''), 3000);
    }
  };

  // Action: Force Start Stream
  const handleForceStart = async (id: string) => {
    try {
      const res = await fetch(`/api/schedules/${id}/start`, { method: 'POST' });
      if (res.ok) {
        setSuccessMessage('Yayın şimdi anlık olarak başlatılıyor!');
        setInspectScheduleId(id);
        setTimeout(() => setSuccessMessage(''), 4000);
        fetchData();
      } else {
        const data = await res.json();
        alert(data.error);
      }
    } catch (err) {
      alert('Yayın başlatılamadı.');
    }
  };

  // Action: Force Stop Stream
  const handleForceStop = async (id: string) => {
    try {
      const res = await fetch(`/api/schedules/${id}/stop`, { method: 'POST' });
      if (res.ok) {
        setSuccessMessage('Yayın durdurma komutu gönderildi.');
        setTimeout(() => setSuccessMessage(''), 4000);
        fetchData();
      } else {
        const data = await res.json();
        alert(data.error);
      }
    } catch (err) {
      alert('Yayın durdurulamadı.');
    }
  };

  // Action: Update Schedule (Edit)
  const handleUpdateSchedule = async (id: string) => {
    if (!editTitle.trim()) {
      alert('Yayın başlığı boş olamaz.');
      return;
    }
    if (!editStreamKey.trim()) {
      alert('Yayın anahtarı boş olamaz.');
      return;
    }
    
    let finalEditScheduledTime: string | undefined = undefined;
    if (editScheduledTime) {
      try {
        const checkDate = new Date(editScheduledTime);
        if (isNaN(checkDate.getTime())) {
          alert('Lütfen geçerli bir başlangıç tarih ve saati girin.');
          return;
        }
        finalEditScheduledTime = checkDate.toISOString();
      } catch (e) {
        alert('Başlangıç tarihi dönüştürülemedi.');
        return;
      }
    }

    let finalEditScheduledEndTime = '';
    if (editScheduledEndTime) {
      try {
        const checkDate = new Date(editScheduledEndTime);
        if (isNaN(checkDate.getTime())) {
          alert('Lütfen geçerli bir bitiş tarih ve saati girin.');
          return;
        }
        finalEditScheduledEndTime = checkDate.toISOString();
        if (finalEditScheduledTime) {
          const startMs = new Date(editScheduledTime).getTime();
          const endMs = checkDate.getTime();
          if (endMs <= startMs) {
            alert('Bitiş tarihi, başlangıç tarihinden sonra olmalıdır.');
            return;
          }
        }
      } catch (e) {
        alert('Bitiş tarihi dönüştürülemedi.');
        return;
      }
    }

    try {
      const res = await fetch(`/api/schedules/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: editChannelId,
          title: editTitle.trim(),
          streamKey: editStreamKey.trim(),
          streamProtocol: editStreamProtocol,
          scheduledTime: finalEditScheduledTime,
          scheduledEndTime: finalEditScheduledEndTime,
          loop: editLoop,
          shortsMode: editShortsMode,
          dualStream: editDualStream,
          proxyUrl: editProxyUrl.trim() || undefined,
          youtubeLiveUrl: editYoutubeLiveUrl.trim() || undefined,
          geminiBotEnabled: editGeminiBotEnabled,
          geminiBotPrompt: editGeminiBotPrompt,
          geminiBotTtsEnabled: editGeminiBotTtsEnabled
        })
      });

      if (res.ok) {
        setSuccessMessage('Planlama başarıyla güncellendi.');
        setTimeout(() => setSuccessMessage(''), 3000);
        setEditingScheduleId(null);
        fetchData();
      } else {
        const data = await res.json();
        alert(data.error || 'Planlama güncellenirken bir hata oluştu.');
      }
    } catch (err: any) {
      alert('Planlama güncellenirken hata: ' + err.message);
    }
  };

  const startEditingSchedule = (sched: Schedule) => {
    setEditingScheduleId(sched.id);
    setEditTitle(sched.title);
    setEditStreamKey(sched.streamKey);
    setEditStreamProtocol(sched.streamProtocol || 'rtmps');
    
    // Format dates to YYYY-MM-DDThh:mm local input format
    const formatToLocalValue = (isoString?: string) => {
      if (!isoString) return '';
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return '';
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    
    setEditScheduledTime(formatToLocalValue(sched.scheduledTime));
    setEditScheduledEndTime(formatToLocalValue(sched.scheduledEndTime));
    setEditLoop(sched.loop);
    setEditShortsMode(!!sched.shortsMode);
    setEditDualStream(!!sched.dualStream);
    setEditProxyUrl(sched.proxyUrl || '');
    setEditYoutubeLiveUrl(sched.youtubeLiveUrl || '');
    setEditChannelId((sched.channelId || 'kanal1') as 'kanal1' | 'kanal2' | 'kanal3' | 'kanal4');
    setEditGeminiBotEnabled(!!sched.geminiBotEnabled);
    setEditGeminiBotPrompt(sched.geminiBotPrompt || 'Sohbette sorulan soruları cana yakın, samimi ve Türkçe olarak cevapla. Kanal ismimiz TubeFlow Auto. İzleyicileri yayını beğenmeye ve abone olmaya davet et.');
    setEditGeminiBotTtsEnabled(!!sched.geminiBotTtsEnabled);
  };

  // Helper bytes converter
  const formatBytes = (bytes?: number) => {
    if (!bytes) return 'N/A';
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Resolves the YouTube watch URL based on handle or full link
  const resolveWatchUrl = (input: string) => {
    if (!input) return '';
    const trimmed = input.trim();
    // If it's already a full HTTP/HTTPS link, return it as is
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    // If they typed something that looks like youtube.com/... without protocol
    if (trimmed.includes('youtube.com') || trimmed.includes('youtu.be')) {
      return `https://${trimmed}`;
    }
    // Otherwise, treat as channel handle
    const handleOnly = trimmed.replace(/^@/, '');
    return `https://www.youtube.com/@${handleOnly}/live`;
  };

  const getStatusBadge = (statusStr: Schedule['status']) => {
    switch (statusStr) {
      case 'Bekliyor':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border border-zinc-700 text-zinc-400 bg-black">
            <Clock className="w-3 h-3 text-zinc-500" />
            Zamanlandı
          </span>
        );
      case 'Yayında':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest bg-[#FF0000] text-white animate-pulse">
            <CircleDot className="w-3 h-3 fill-white text-white" />
            CANLI YAYINDA
          </span>
        );
      case 'Tamamlandı':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest bg-white text-black border border-white">
            <CheckCircle2 className="w-3 h-3" />
            Tamamlandı
          </span>
        );
      case 'Hata':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border border-[#FF0000] text-[#FF0000] bg-black">
            <AlertCircle className="w-3 h-3" />
            BAĞLANTI KESİLDİ
          </span>
        );
    }
  };

  if (isOverlayView) {
    return (
      <div className="fixed inset-0 min-h-screen bg-transparent overflow-hidden flex items-center justify-center font-sans select-none">
        {!overlayAudioUnlocked ? (
          <div 
            onClick={() => {
              setOverlayAudioUnlocked(true);
              playSfxChime();
              if ('speechSynthesis' in window) {
                const utterance = new SpeechSynthesisUtterance("Sinyal takip motoru kuruldu. Sesler ve konfeti yayına aktarılmaya hazır!");
                if (selectedTtsVoiceIndex >= 0 && availableVoices[selectedTtsVoiceIndex]) {
                  utterance.voice = availableVoices[selectedTtsVoiceIndex];
                }
                utterance.lang = utterance.voice?.lang || 'tr-TR';
                window.speechSynthesis.speak(utterance);
              }
            }}
            className="w-full max-w-lg p-8 mx-4 bg-zinc-950/95 border-2 border-dashed border-amber-500/60 rounded-xl shadow-2xl shadow-amber-500/10 cursor-pointer hover:border-amber-400 group transition duration-300 flex flex-col items-center justify-center text-center gap-5 pointer-events-auto"
          >
            <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center border border-amber-500/40 animate-pulse group-hover:scale-105 transition">
              <Radio className="w-8 h-8 text-amber-500" />
            </div>
            <div>
              <h2 className="text-xl font-black uppercase text-white tracking-tight italic">
                🎙️ OBS Overlay Sesini Kilitle / Etkinleştir
              </h2>
              <p className="text-zinc-500 text-xs font-mono uppercase mt-2">
                Tarayıcı Güvenliği (Autoplay Blocked) Aşaması
              </p>
            </div>
            <p className="text-zinc-300 text-xs leading-relaxed max-w-sm border-t border-zinc-900 pt-3">
              Yayın seslerini, alkışları, konfetileri ve yapay zeka seslendirmelerini canlı yayına aktarabilmek için <strong className="text-amber-400">BURAYA TIKLAYIN</strong>.
            </p>
            <div className="px-4 py-1.5 bg-amber-500 text-black text-[9px] font-black uppercase tracking-widest rounded group-hover:bg-amber-400">
              SES & EFEKTLERİ AKTİF ET
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 w-full h-full flex items-center justify-center p-6 bg-transparent pointer-events-none">
            {/* Status indicator on screen edge for setup convenience */}
            <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1 border border-zinc-800 text-[8px] font-mono font-bold tracking-wider text-zinc-500 uppercase flex items-center gap-1.5 rounded opacity-40 hover:opacity-100 transition duration-300 pointer-events-auto cursor-pointer" onClick={() => setOverlayAudioUnlocked(false)}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
              <span>OBS Sinyal Aktif • {alertVideoIdOrUrl ? `Takip Edilen ID: ${alertVideoIdOrUrl}` : 'YAYIN BEKLENİYOR'}</span>
            </div>

            {activeOverlayAlert ? (
              <div 
                className={`w-full max-w-xl bg-black/95 backdrop-blur-xl border-4 p-8 rounded-2xl shadow-2xl flex flex-col gap-4 text-center animate-bounce-in relative overflow-hidden pointer-events-auto ${
                  activeOverlayAlert.type === 'SUBSCRIBE' 
                    ? 'border-rose-500/80 shadow-rose-500/20' 
                    : activeOverlayAlert.type === 'LIKE' 
                      ? 'border-amber-500/80 shadow-amber-500/20' 
                      : activeOverlayAlert.type === 'QUIZ_WIN'
                        ? 'border-yellow-400/90 shadow-yellow-400/20'
                        : 'border-blue-500/80 shadow-blue-500/20'
                }`}
              >
                {/* Decorative glow lines */}
                <div className={`absolute top-0 left-0 right-0 h-1.5 animate-pulse ${
                  activeOverlayAlert.type === 'SUBSCRIBE' 
                    ? 'bg-rose-500' 
                    : activeOverlayAlert.type === 'LIKE' 
                      ? 'bg-amber-500' 
                      : activeOverlayAlert.type === 'QUIZ_WIN'
                        ? 'bg-yellow-400'
                        : 'bg-blue-500'
                }`} />

                {/* Event Badge Icon */}
                <div className="flex justify-center mb-1">
                  {activeOverlayAlert.type === 'SUBSCRIBE' ? (
                    <span className="p-3 bg-rose-950/55 rounded-full border border-rose-500/40 text-rose-400 animate-pulse">
                      <UserPlus className="w-8 h-8" />
                    </span>
                  ) : activeOverlayAlert.type === 'LIKE' ? (
                    <span className="p-3 bg-amber-950/55 rounded-full border border-amber-500/40 text-amber-500 animate-pulse">
                      <Heart className="w-8 h-8 fill-amber-500" />
                    </span>
                  ) : activeOverlayAlert.type === 'QUIZ_WIN' ? (
                    <span className="p-3 bg-yellow-950/80 rounded-full border border-yellow-400/50 text-yellow-400 animate-bounce">
                      <Trophy className="w-10 h-10" />
                    </span>
                  ) : (
                    <span className="p-3 bg-blue-950/55 rounded-full border border-blue-500/40 text-blue-400">
                      <MessageSquare className="w-8 h-8" />
                    </span>
                  )}
                </div>

                {/* Subtitle / Action Label */}
                <div className={`text-[11px] font-black tracking-widest uppercase italic block ${
                  activeOverlayAlert.type === 'SUBSCRIBE' 
                    ? 'text-rose-400' 
                    : activeOverlayAlert.type === 'LIKE' 
                      ? 'text-amber-400' 
                      : activeOverlayAlert.type === 'QUIZ_WIN'
                        ? 'text-yellow-400 font-extrabold text-xs animate-pulse'
                        : 'text-blue-400'
                }`}>
                  {activeOverlayAlert.type === 'SUBSCRIBE' && '👤 KANALA YENİ ABONE!'}
                  {activeOverlayAlert.type === 'LIKE' && '❤️ YENİ BEĞENİ!'}
                  {activeOverlayAlert.type === 'QUIZ_WIN' && '🏆 DOĞRU CEVAP ŞAMPİYONU!'}
                  {activeOverlayAlert.type === 'COMMENT_TTS' && '💬 SOHBET SESLİ YORUMU'}
                </div>

                {/* Author Name */}
                <h1 className="text-3xl font-black text-white uppercase italic tracking-tight drop-shadow-md">
                  {activeOverlayAlert.author}
                </h1>

                {/* Custom Message or Greeting Text */}
                {activeOverlayAlert.message && activeOverlayAlert.type !== 'COMMENT_TTS' && (
                  <p className="text-zinc-400 font-mono text-xs max-w-sm mx-auto italic mt-1 border-t border-zinc-900 pt-3">
                    "{activeOverlayAlert.message}"
                  </p>
                )}

                {/* Speech Text Display Bubble */}
                {activeOverlayAlert.greetingText && (
                  <div className={`mt-2 p-3 bg-zinc-950/80 rounded-xl border font-sans text-xs max-w-sm mx-auto text-zinc-200 leading-relaxed font-semibold italic ${
                    activeOverlayAlert.type === 'SUBSCRIBE' 
                      ? 'border-rose-950/60 text-rose-100' 
                      : activeOverlayAlert.type === 'LIKE' 
                        ? 'border-amber-950/60 text-amber-100' 
                        : activeOverlayAlert.type === 'QUIZ_WIN'
                          ? 'border-yellow-950/60 text-yellow-105'
                          : 'border-zinc-800 text-zinc-100'
                  }`}>
                    🚀 {activeOverlayAlert.greetingText}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  const filteredSchedules = schedules.filter(s => (s.channelId || 'kanal1') === activeChannel);

  return (
    <div id="app" className="min-h-screen bg-[#0A0A0A] text-[#F0F0F0] flex flex-col font-sans selection:bg-[#FF0000] selection:text-white border-8 border-[#1A1A1A]">
      
      {/* HEADER SECTION */}
      <header id="header" className="border-b border-[#222] bg-[#0A0A0A] px-6 py-6 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#FF0000] flex items-center justify-center font-black text-2xl skew-x-[-10deg] text-white select-none">
              YT
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-black tracking-tighter uppercase italic leading-none text-white">
                TubeFlow <span className="text-[#FF0000] not-italic">Auto</span>
              </h1>
              <p className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mt-1">Bulut Tabanlı Canlı Yayın Otomasyonu</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* Server Online Clock */}
            <div className="flex items-center gap-2 bg-black px-4 py-2 border border-zinc-700 font-mono text-xs text-zinc-300">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              <span className="uppercase font-bold tracking-wider text-zinc-400">Bulut Sunucu Aktif:</span>
              <span className="font-bold text-[#FF0000]">{localTimeClock}</span>
            </div>

            {/* Quick Status indicators */}
            <div className="flex bg-black border border-zinc-700">
              <div className="px-3 py-1.5 text-center border-r border-zinc-800">
                <p className="text-[9px] text-zinc-500 font-black uppercase tracking-wider">AKTİF YAYIN</p>
                <p className="text-sm font-black text-[#FF0000] flex items-center justify-center gap-1">
                  {status?.activeStreamsCount || 0}
                  {status?.activeStreamsCount && status.activeStreamsCount > 0 ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#FF0000] animate-ping inline-block"></span>
                  ) : null}
                </p>
              </div>
              <div className="px-3 py-1.5 text-center border-r border-zinc-800">
                <p className="text-[9px] text-zinc-500 font-black uppercase tracking-wider">PLANLAR</p>
                <p className="text-sm font-black text-white">{status?.totalSchedules || 0}</p>
              </div>
              <div className="px-3 py-1.5 text-center">
                <p className="text-[9px] text-zinc-500 font-black uppercase tracking-wider">VİDEOLAR</p>
                <p className="text-sm font-black text-white">{videos.length || 0}</p>
              </div>
            </div>

            <button 
              id="refresh_btn"
              onClick={fetchData} 
              className="p-2 bg-black hover:bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-white transition duration-200"
              title="Verileri Yenile"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

        </div>
      </header>

      {/* SYSTEM BROADCAST TIPS BANNER */}
      <div className="max-w-7xl mx-auto w-full px-6 mt-6">
        <div className="bg-[#0F0F0F] border-2 border-zinc-800 p-5 text-xs text-zinc-300">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-[#FF0000] shrink-0 mt-0.5" />
            <div>
              <span className="font-extrabold text-white uppercase tracking-wider block mb-1">🔴 PC KAPALIYKEN BİLE KESİNTİSİZ HİZMET</span>
              <p className="text-zinc-400">Bu otomasyon sunucu taraflı çalışır; tarayıcı sekmesini kapatabilir, bilgisayarınızı tamamen kapatabilirsiniz. FFmpeg döngüleri belirlenen takvim gününde YouTube sunucusuna yayını bağımsız olarak iletir.</p>
              
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 text-zinc-500 text-[11px] font-mono border-t border-zinc-800/80 pt-2.5">
                <span>📹 <b className="text-zinc-400">Yayın Anahtarı:</b> YouTube canlı yayın panelindeki gizli "Yayın Anahtarı".</span>
                <span>🔁 <b className="text-zinc-400">Sonsuz Döngü (Loop):</b> Video sona erdikçe yayını otomatik kesmeden başa döndürür.</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FEEDBACK STATUS ALERTS */}
      {successMessage && (
        <div className="max-w-7xl mx-auto w-full px-6 mt-4">
          <div className="bg-white text-black border-l-4 border-[#FF0000] text-xs font-black uppercase tracking-wider p-4 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-[#FF0000]" />
            <p>{successMessage}</p>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="max-w-7xl mx-auto w-full px-6 mt-4">
          <div className="bg-black border-2 border-[#FF0000] text-white text-xs font-black uppercase tracking-wider p-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-[#FF0000]" />
            <p>{errorMessage}</p>
          </div>
        </div>
      )}

      {/* CHANNEL NAVIGATION MENU */}
      <div className="max-w-7xl mx-auto w-full px-6 mt-6">
        <div className="border border-zinc-800 bg-[#0c0c0c] p-1 grid grid-cols-2 md:grid-cols-4 gap-1.5 md:gap-2">
          {(['kanal1', 'kanal2', 'kanal3', 'kanal4'] as const).map((ch, idx) => {
            const isActive = activeChannel === ch;
            // Get active streams for this channel
            const activeStreamsCount = schedules.filter(s => (s.channelId || 'kanal1') === ch && s.status === 'Yayında').length;
            const totalSchedulesCount = schedules.filter(s => (s.channelId || 'kanal1') === ch).length;

            return (
              <button
                key={ch}
                onClick={() => setActiveChannel(ch)}
                className={`p-3 md:p-4 border transition duration-200 text-left select-none relative overflow-hidden focus:outline-none cursor-pointer ${
                  isActive
                    ? 'bg-[#151515] border-[#FF0000] text-white'
                    : 'bg-black border-zinc-900 hover:border-zinc-800 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {isActive && (
                  <div className="absolute top-0 right-0 w-2.5 h-2.5 bg-[#FF0000]"></div>
                )}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-1.5">
                    <p className={`text-[10px] font-mono tracking-widest uppercase font-extrabold ${isActive ? 'text-[#FF0000]' : 'text-zinc-600'}`}>
                      🎬 KANAL {idx + 1}
                    </p>
                    <span className={`inline-flex items-center gap-1 text-[9px] font-mono tracking-wide px-1.5 py-0.5 font-bold uppercase ${activeStreamsCount > 0 ? 'bg-[#FF0000]/10 border border-[#FF0000]/30 text-[#FF0000]' : 'bg-zinc-900 text-zinc-600 border border-zinc-800'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${activeStreamsCount > 0 ? 'bg-[#FF0000] animate-pulse' : 'bg-zinc-700'}`}></span>
                      {activeStreamsCount}/3 Canlı
                    </span>
                  </div>
                  
                  <h3 className="text-[11px] md:text-xs font-black uppercase tracking-wider mt-0.5">
                    {ch === 'kanal1' ? 'ANA HABER / YAYIN' : ch === 'kanal2' ? 'YEDEK / GÜNDEM' : ch === 'kanal3' ? 'SHORTS KANALI' : 'YABANCI DİL / DIŞ YAYIN'}
                  </h3>
                  
                  <p className="text-[9px] uppercase tracking-wider text-zinc-600 font-bold mt-1.5 flex justify-between">
                    <span>{totalSchedulesCount} Toplam Yayın</span>
                    {activeStreamsCount >= 3 && (
                      <span className="text-[#FF0000] animate-pulse font-black text-[8px]">LIMIT DOLU</span>
                    )}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* MAIN LAYOUT WRAPPER */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: BUILDER & CONFIGURATIONS (5 cols) */}
        <section id="sidebar_configuration" className="lg:col-span-5 flex flex-col gap-6">

          {/* 1. YENİ YAYIN PLANLA CARD */}
          <div className="bg-[#0F0F0F] border-2 border-zinc-800 p-6 flex flex-col gap-4">
            <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
              <Calendar className="w-5 h-5 text-[#FF0000]" />
              <h2 className="text-lg font-black uppercase italic tracking-tight text-white">Yayın Planlama Konsolu</h2>
            </div>

            <form onSubmit={handleAddSchedule} className="space-y-4">
              {localFormError && (
                <div className="bg-black border border-[#FF0000] text-[#FF0000] text-[11px] font-bold p-3 uppercase tracking-wider animate-pulse flex items-center gap-2">
                  <span className="text-sm">⚠</span>
                  <span>{localFormError}</span>
                </div>
              )}
              <div>
                <label className="block text-[10px] uppercase font-bold tracking-[0.2em] text-zinc-500 mb-1">YAYIN BAŞLIĞI</label>
                <input 
                  type="text" 
                  value={schedTitle} 
                  onChange={(e) => setSchedTitle(e.target.value)} 
                  placeholder="Örn: 7/24 Kesintisiz Chill Radyo" 
                  className="w-full text-xs bg-black border border-zinc-700 p-3 font-semibold text-white focus:outline-none focus:border-[#FF0000] placeholder-zinc-800 tracking-wider uppercase"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold tracking-[0.2em] text-zinc-500 mb-1.5">MEDYA SEÇİMİ</label>
                
                {/* Selector Tab for Media Selection Type */}
                <div className="grid grid-cols-2 bg-black border border-zinc-800 p-1 mb-2.5 rounded text-[10px] font-black uppercase tracking-wider">
                  <button
                    type="button"
                    onClick={() => setMediaSelectionType('library')}
                    className={`py-1.5 transition flex items-center justify-center gap-1 ${
                      mediaSelectionType === 'library'
                        ? 'bg-zinc-900 text-white font-bold border border-zinc-700'
                        : 'text-zinc-550 hover:text-zinc-350'
                    }`}
                  >
                    🎞️ KÜTÜPHANE VİDEOSU
                  </button>
                  <button
                    type="button"
                    onClick={() => setMediaSelectionType('window')}
                    className={`py-1.5 transition flex items-center justify-center gap-1 ${
                      mediaSelectionType === 'window'
                        ? 'bg-zinc-900 text-white font-bold border border-zinc-700'
                        : 'text-zinc-550 hover:text-zinc-350'
                    }`}
                  >
                    🖥️ PENCERE YAKALA
                  </button>
                </div>

                {mediaSelectionType === 'library' ? (
                  videos.length === 0 ? (
                    <div className="text-xs text-zinc-600 p-3 bg-black border border-zinc-800 italic">
                      Kütüphanenizde oynatılabilir video bulunmamaktadır. Sağ taraftan yeni dosyalar ekleyin.
                    </div>
                  ) : (
                    <select 
                      value={selectedVideoId} 
                      onChange={(e) => setSelectedVideoId(e.target.value)} 
                      className="w-full text-xs bg-black border border-zinc-700 p-3 font-semibold text-white focus:outline-none focus:border-[#FF0000] tracking-wider uppercase"
                    >
                      {videos.map(v => (
                        <option key={v.id} value={v.id} className="bg-black text-white">
                          [{v.type === 'local' ? 'DOSYA' : 'LINK'}] {v.title}
                        </option>
                      ))}
                    </select>
                  )
                ) : (
                  <div className="space-y-3 bg-zinc-950 p-3.5 border border-zinc-900 rounded text-left">
                    {/* Information box explaining Cloud environment limitation */}
                    <div className="bg-amber-950/40 border border-amber-900/50 p-3 rounded text-[10px] space-y-1.5 leading-relaxed text-amber-300">
                      <div className="flex items-center gap-1.5 font-bold text-amber-400">
                        <AlertCircle size={12} className="shrink-0" />
                        <span>BULUT SUNUCU BİLGİLENDİRMESİ</span>
                      </div>
                      <p className="normal-case">
                        Bu uygulama şu an <strong className="text-white">Google Cloud</strong> bulut sunucularında çalışmaktadır. Bulut sunucuları güvenlik sebebiyle sizin evinizdeki yerel bilgisayarınızda açık olan pencereleri (<strong className="text-white">GTA V, Chrome vb.</strong>) doğrudan algılayamaz.
                      </p>
                      <p className="normal-case text-zinc-400 font-medium">
                        👉 <strong className="text-amber-400">Nasıl Kullanılır?</strong> Gerçek pencerelerinizi yakalamak için bu projeyi bilgisayarınıza indirip <strong className="text-white">yerel olarak (Localhost) çalıştırmanız</strong> gerekmektedir. Yerel modda PowerShell üzerinden tüm açık pencereleriniz otomatik olarak listelenecektir.
                      </p>
                    </div>

                    {/* 3-way Window/Screen Sub-selector */}
                    <div className="grid grid-cols-3 gap-1 bg-black p-0.5 border border-zinc-805 rounded text-[9px] font-bold uppercase tracking-wider text-center">
                      <button
                        type="button"
                        onClick={() => setWindowCaptureMode('desktop')}
                        className={`py-1 transition rounded ${
                          windowCaptureMode === 'desktop'
                            ? 'bg-zinc-900 text-white border border-zinc-700 font-extrabold'
                            : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        🖥️ TÜM EKRAN
                      </button>
                      <button
                        type="button"
                        onClick={() => setWindowCaptureMode('list')}
                        className={`py-1 transition rounded ${
                          windowCaptureMode === 'list'
                            ? 'bg-zinc-900 text-white border border-zinc-700 font-extrabold'
                            : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        📋 PENCERE SEÇ
                      </button>
                      <button
                        type="button"
                        onClick={() => setWindowCaptureMode('manual')}
                        className={`py-1 transition rounded ${
                          windowCaptureMode === 'manual'
                            ? 'bg-zinc-900 text-white border border-zinc-700 font-extrabold'
                            : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        ✏️ PENCERE ADI
                      </button>
                    </div>

                    {windowCaptureMode === 'desktop' && (
                      <div className="text-center p-3 border border-dashed border-zinc-800 bg-black/40">
                        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest block mb-1">🖥️ TÜM EKRAN YAKALAMA AKTİF</span>
                        <p className="text-[10px] text-zinc-400 normal-case leading-relaxed">
                          Bilgisayarınızın tüm masaüstünü / ana ekranını anlık olarak yakalar ve canlı yayına verir. Başlat çubuğunda gizli olan veya görünmeyen tüm uygulama ve oyunları ekranınızda açarak yayınlayabilirsiniz.
                        </p>
                      </div>
                    )}

                    {windowCaptureMode === 'list' && (
                      <div className="space-y-2">
                        <label className="block text-[8px] uppercase font-bold tracking-wider text-zinc-550 mb-0.5">AÇIK PENCERELER LİSTESİ</label>
                        <div className="flex gap-2">
                          <select
                            value={selectedWindowTitle}
                            onChange={(e) => setSelectedWindowTitle(e.target.value)}
                            disabled={isLoadingWindows || availableWindows.length === 0}
                            className="flex-1 text-xs bg-black border border-zinc-700 p-2.5 font-semibold text-white focus:outline-none focus:border-[#FF0000] tracking-wider uppercase disabled:opacity-50"
                          >
                            {availableWindows.length === 0 ? (
                              <option value="">AÇIK PENCERE BULUNAMADI</option>
                            ) : (
                              availableWindows.map(win => (
                                <option key={win} value={win} className="bg-black text-white">
                                  {win}
                                </option>
                              ))
                            )}
                          </select>
                          <button
                            type="button"
                            onClick={fetchWindows}
                            disabled={isLoadingWindows}
                            className="px-3 bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800 transition text-[9px] font-bold uppercase disabled:opacity-50 flex items-center gap-1 shrink-0"
                          >
                            {isLoadingWindows ? '...' : 'YENİLE 🔄'}
                          </button>
                        </div>
                        <p className="text-[9.5px] text-zinc-400 font-sans normal-case leading-relaxed">
                          Yalnızca Windows işletim sisteminde çalışan ve başlığı (Title) olan aktif pencereleri listeler.
                        </p>
                      </div>
                    )}

                    {windowCaptureMode === 'manual' && (
                      <div className="space-y-2">
                        <label className="block text-[8px] uppercase font-bold tracking-wider text-zinc-550 mb-0.5">YAKALANACAK PENCERE BAŞLIĞI (TITLE)</label>
                        <input
                          type="text"
                          value={customWindowTitle}
                          onChange={(e) => setCustomWindowTitle(e.target.value)}
                          placeholder="Örn: GTA V veya VLC Media Player"
                          className="w-full text-xs font-mono bg-black border border-zinc-700 p-2.5 text-blue-400 placeholder-zinc-800 focus:outline-none focus:border-blue-500"
                        />
                        <p className="text-[9.5px] text-zinc-400 font-sans normal-case leading-relaxed">
                          Başlat çubuğunda veya listede görünmeyen, ancak arka planda açık olan uygulamanızın pencere başlığını (Title) buraya tam olarak yazarak FFmpeg'e hedef gösterebilirsiniz.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold tracking-[0.2em] text-zinc-500 mb-1.5">YAYIN BAŞLANGIÇ YÖNTEMİ</label>
                <div className="grid grid-cols-2 bg-black border border-zinc-800 p-1 rounded">
                  <button
                    type="button"
                    onClick={() => setStartTimeType('immediate')}
                    className={`py-2 px-1.5 text-[10px] font-black uppercase tracking-wider transition ${
                      startTimeType === 'immediate'
                        ? 'bg-zinc-900 text-white font-extrabold border border-zinc-700'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    ⚡ Hemen Başlat (OBS Modu)
                  </button>
                  <button
                    type="button"
                    onClick={() => setStartTimeType('scheduled')}
                    className={`py-2 px-1.5 text-[10px] font-black uppercase tracking-wider transition ${
                      startTimeType === 'scheduled'
                        ? 'bg-zinc-900 text-white font-extrabold border border-zinc-700'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    📅 İleride Yayına Al
                  </button>
                </div>
              </div>

              {startTimeType === 'scheduled' && !isCronActive && (
                <div className="bg-amber-950/25 border border-amber-500/50 p-3 rounded text-[11px] leading-relaxed text-amber-500 uppercase font-bold">
                  <div className="flex items-center gap-1.5 mb-1.5 text-amber-400 font-black">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
                    <span>⚠️ BULUT SİNYALİ PASİF! (UYKU MODU TEHLİKESİ)</span>
                  </div>
                  <span>
                    BİLGİSAYARINIZI KAPATTIĞINIZDA YAYININIZIN BULUT SUNUCUSU TARAFINDAN OTOMATİK BAŞLATILMASI İÇİN, SAYFA ALTINDA BULUNAN <strong className="text-white underline font-extrabold">"7/24 KESİNTİSİZ BULUT YAYINI AKTİFLİK PANELİ"</strong> ADIMLARINI (CRON-JOB.ORG) TAMAMLAMANIZ ŞARTTIR. AKSİ TAKDİRDE SUNUCU UYKUYA DALAR VE ZAMANLANAN YAYINLARINIZ BAŞLATILAMAZ!
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-3">
                  <div>
                    {startTimeType === 'immediate' ? (
                      <div className="bg-emerald-950/20 border border-emerald-800/65 p-3.5 h-[106px] flex flex-col justify-center rounded">
                        <div className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                          <span>OBS SİMÜLASYONU AKTİF</span>
                        </div>
                        <p className="text-[9px] text-zinc-400 mt-1 uppercase font-semibold leading-relaxed">
                          Yayın butonuna bastığınız an sinyal doğrudan YouTube'a aktarılacaktır.
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <label className="block text-[10px] uppercase font-bold tracking-[0.2em] text-zinc-500">BAŞLANGIÇ SAATİ</label>
                        <input 
                          type="datetime-local" 
                          value={scheduledDateTime} 
                          onChange={(e) => setScheduledDateTime(e.target.value)} 
                          className="w-full text-xs bg-black border border-zinc-700 p-3 font-semibold text-white focus:outline-none focus:border-[#FF0000]"
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="block text-[10px] uppercase font-bold tracking-[0.2em] text-[#FF0000] flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-[#FF0000]" />
                      BİTİRME SAATİ (OPSİYONEL)
                    </label>
                    <input 
                      type="datetime-local" 
                      value={scheduledEndDateTime} 
                      onChange={(e) => setScheduledEndDateTime(e.target.value)} 
                      className="w-full text-xs bg-black border border-zinc-700 p-3 font-semibold text-white focus:outline-none focus:border-[#FF0000]"
                    />
                    <span className="text-[8px] text-zinc-500 tracking-wide">YAYINIZIN OTOMATİK OLARAK BİTİRİLECEĞİ TARİH / SAAT. PLANI YAPMAK İÇİN KULLANIN.</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 justify-end">
                  <div className="flex items-center gap-2.5 h-[48px] bg-black border border-zinc-700 px-3 rounded">
                    <input 
                      type="checkbox" 
                      id="loop_input" 
                      checked={loopEnabled} 
                      onChange={(e) => setLoopEnabled(e.target.checked)} 
                      className="border-zinc-700 text-[#FF0000] focus:ring-0 w-4 h-4 bg-black cursor-pointer rounded-none"
                    />
                    <label htmlFor="loop_input" className="text-[10px] text-zinc-300 font-bold uppercase tracking-wider cursor-pointer select-none">
                      Sonsuz Döngü (Loop)
                    </label>
                  </div>

                  <div className="flex items-center gap-2.5 h-[48px] bg-black border border-zinc-700 px-3 rounded">
                    <input 
                      type="checkbox" 
                      id="shorts_input" 
                      checked={shortsMode} 
                      onChange={(e) => {
                        setShortsMode(e.target.checked);
                        if (e.target.checked) {
                          setDualStreamEnabled(false);
                        }
                      }} 
                      className="border-zinc-700 text-[#FF0000] focus:ring-0 w-4 h-4 bg-black cursor-pointer rounded-none"
                    />
                    <label htmlFor="shorts_input" className="text-[10px] text-zinc-300 font-bold uppercase tracking-wider cursor-pointer select-none">
                      Sadece Dikey (Shorts) 📱
                    </label>
                  </div>

                  <div className="flex items-center gap-2.5 h-[48px] border border-[#FF0000]/40 bg-zinc-950 px-3 rounded col-span-1">
                    <input 
                      type="checkbox" 
                      id="dual_stream_input" 
                      checked={dualStreamEnabled} 
                      onChange={(e) => {
                        setDualStreamEnabled(e.target.checked);
                        if (e.target.checked) {
                          setShortsMode(false);
                        }
                      }} 
                      className="border-zinc-700 text-[#FF0000] focus:ring-0 w-4 h-4 bg-black cursor-pointer rounded-none"
                    />
                    <label htmlFor="dual_stream_input" className="text-[10px] text-zinc-200 font-bold uppercase tracking-wider cursor-pointer select-none flex flex-col justify-center leading-tight">
                      <span className="text-[#FF0000] flex items-center gap-1">Otomatik Dual Stream ⚡</span>
                      <span className="text-[8px] text-zinc-400 lowercase font-medium">Lİnk/Shorts Akışı için Otomatik Dikey Kırp</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-[10px] uppercase font-bold tracking-[0.2em] text-zinc-500">YOUTUBE YAYIN ANAHTARI (STREAM KEY)</label>
                    <a href="https://studio.youtube.com" target="_blank" rel="noreferrer" className="text-[10px] text-[#FF0000] hover:underline font-bold uppercase tracking-wider flex items-center gap-0.5">
                      YOUTUBE STÜDYO ↗
                    </a>
                  </div>
                  <div id="stream_key_box" className="relative">
                    <input 
                      type={showStreamKey ? "text" : "password"} 
                      value={customStreamKey} 
                      onChange={(e) => setCustomStreamKey(e.target.value)} 
                      placeholder="xxxx-xxxx-xxxx-xxxx-xxxx"
                      className="w-full text-xs bg-black border border-zinc-700 pl-3 pr-10 py-3 font-bold text-[#FF0000] placeholder-zinc-800 focus:outline-none focus:border-[#FF0000] font-mono tracking-widest"
                    />
                    <button 
                      type="button"
                      onClick={() => setShowStreamKey(!showStreamKey)} 
                      className="absolute right-2 top-2 p-1 text-zinc-500 hover:text-white"
                    >
                      {showStreamKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-[0.2em] text-zinc-500 mb-1">PROGRAM PROTOKOLÜ</label>
                  <select
                    value={streamProtocol}
                    onChange={(e) => {
                      const proto = e.target.value as 'rtmp' | 'rtmps';
                      setStreamProtocol(proto);
                      setLocalStorageItemSafe('yt_stream_protocol', proto);
                    }}
                    className="w-full text-xs bg-black border border-zinc-700 px-3 py-3 font-bold text-white focus:outline-none focus:border-[#FF0000] h-[42px] rounded-none cursor-pointer"
                  >
                    <option value="rtmps">RTMPS (Port 443 - Sunucu İçin Önerilen & Güvenli)</option>
                    <option value="rtmp">RTMP (Port 1935 - Engellenebilir)</option>
                  </select>
                </div>
              </div>

              {/* 🛡️ PROXY SUNUCUSU SEÇİMİ (VPN / BAĞIMSIZ COĞRAFİK IP PLANIYLA MULTI-CHANNEL YAYINCILIK) */}
              <div className="bg-[#12110c]/80 border border-amber-500/20 p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <Globe className="w-4 h-4 text-amber-500 animate-pulse" />
                  <span className="text-[10px] font-black uppercase text-amber-500 tracking-wider">🔒 COĞRAFİK IP VE PROXY ENTEGRASYONU (ÇOKLU KANAL VPN GÜVENCESİ)</span>
                </div>
                <p className="text-[10.5px] text-zinc-400 normal-case leading-relaxed font-sans mb-3">
                  Aynı bilgisayardan veya IP adresinden birden fazla (örn. 4 kanal) canlı yayın başlatıldığında YouTube platformu spam filtresi uygulayabilir. 
                  Bu engeli aşmak için buraya her kanal için farklı bir <strong className="text-white">SOCKS5 veya HTTP Proxy proxy tünel adresi</strong> tanımlayarak, yayınınızın IP adresini yurtdışı (ABD, Almanya vb.) olarak yönlendirebilirsiniz.
                </p>
                <div>
                  <input
                    type="text"
                    value={streamProxyUrl}
                    onChange={(e) => setStreamProxyUrl(e.target.value)}
                    placeholder="Örn: socks5://kullanici:sifre@sunucu:port   veya   http://ip:port"
                    className="w-full text-xs font-mono bg-black border border-zinc-800 p-2.5 text-amber-400 placeholder-zinc-800 focus:outline-none focus:border-amber-500"
                  />
                  <div className="flex justify-between mt-1 text-[8.5px] text-zinc-500 font-mono uppercase">
                    <span>* socks5, socks4, http ve https protokolleri desteklenir</span>
                    <span>BOŞ BIRAKILIRSA: DOĞRUDAN SUNUCU IP'Sİ KULLANILIR</span>
                  </div>

                  {/* PROXY BULUCU YARDIMCISI */}
                  <div className="mt-3.5 border-t border-zinc-900/60 pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        setShowFreeProxySelector(!showFreeProxySelector);
                        if (!showFreeProxySelector && freeProxies.length === 0) {
                          loadFreeProxies();
                        }
                      }}
                      className="text-[10px] font-black uppercase text-amber-500 hover:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1.5 transition flex items-center justify-between w-full border border-amber-500/10"
                    >
                      <span className="flex items-center gap-1.5">
                        🎁 ÜCRETSİZ AKTİF PROXY / VPN BUL ({freeProxies.length > 0 ? `${freeProxies.length} Tane Bulundu` : "LİSTELE"})
                      </span>
                      <span>{showFreeProxySelector ? 'KAPAT ▲' : 'BUL / GÖSTER ▼'}</span>
                    </button>

                    {showFreeProxySelector && (
                      <div className="mt-2.5 p-3 bg-black border border-zinc-900 flex flex-col gap-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] uppercase font-bold text-zinc-500 font-sans">
                            Aktif Halka Açık Tüneller (Hızlı Çekim)
                          </span>
                          <button
                            type="button"
                            onClick={loadFreeProxies}
                            disabled={loadingFreeProxies}
                            className="text-[9px] font-black uppercase tracking-wider text-amber-400 hover:underline disabled:opacity-50"
                          >
                            {loadingFreeProxies ? 'GÜNCELLENİYOR...' : '🔄 LİSTEYİ YENİLE'}
                          </button>
                        </div>

                        {/* Filtreleme Tuşları */}
                        <div className="flex gap-1.5 text-[8.5px] font-mono">
                          {(['all', 'socks5', 'socks4', 'http'] as const).map((filter) => (
                            <button
                              key={filter}
                              type="button"
                              onClick={() => setFreeProxyFilter(filter)}
                              className={`px-2 py-0.5 border ${
                                freeProxyFilter === filter
                                  ? 'bg-amber-500 text-black border-amber-500 font-extrabold'
                                  : 'bg-zinc-950 text-zinc-400 border-zinc-900 hover:border-zinc-800'
                              } uppercase`}
                            >
                              {filter === 'all' ? 'HEPSİ' : filter}
                            </button>
                          ))}
                        </div>

                        {loadingFreeProxies ? (
                          <div className="py-8 text-center text-zinc-600 text-xs font-mono uppercase tracking-wider animate-pulse">
                            🔄 SOCKS5 & HTTP Tünelleri Saniyeler İçinde Alınıyor...
                          </div>
                        ) : (
                          <div className="max-h-56 overflow-y-auto divide-y divide-zinc-950 pr-1 select-all font-mono">
                            {freeProxies
                              .filter((p) => freeProxyFilter === 'all' || p.protocol === freeProxyFilter)
                              .slice(0, 45)
                              .map((p, idx) => {
                                const flags: Record<string, string> = { 
                                  DE: '🇩🇪', FR: '🇫🇷', NL: '🇳🇱', US: '🇺🇸', GB: '🇬🇧', 
                                  SG: '🇸🇬', TR: '🇹🇷', FI: '🇫🇮', PL: '🇵🇱', IT: '🇮🇹', 
                                  CH: '🇨🇭', CA: '🇨🇦', SE: '🇸🇪' 
                                };
                                const flag = p.country && flags[p.country] ? flags[p.country] : '🌐';
                                const signalValue = p.signal || 50;
                                const latencyValue = p.latency || 150;
                                
                                let signalColor = 'text-red-505 text-red-500';
                                let signalBg = 'bg-red-950/20';
                                let barBg = 'bg-red-500';
                                if (signalValue >= 80) {
                                  signalColor = 'text-emerald-400 font-bold';
                                  signalBg = 'bg-emerald-950/40';
                                  barBg = 'bg-emerald-500';
                                } else if (signalValue >= 50) {
                                  signalColor = 'text-amber-400 font-bold';
                                  signalBg = 'bg-amber-950/30';
                                  barBg = 'bg-amber-400';
                                }

                                return (
                                  <div key={idx} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[9.5px] border-b border-zinc-950/30 hover:bg-zinc-950/40 px-1.5 transition-colors">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                                        p.protocol === 'socks5' 
                                          ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-900/45' 
                                          : p.protocol === 'socks4'
                                            ? 'bg-[#1E1B4B] text-blue-400 border border-[#312E81]'
                                            : 'bg-amber-950/50 text-amber-500 border border-amber-900/40'
                                      }`}>
                                        {p.protocol}
                                      </span>
                                      <span className="text-zinc-300 font-mono select-all font-bold tracking-wide">{p.ipPort}</span>
                                      
                                      <span className="text-zinc-500 font-sans font-bold flex items-center gap-0.5" title="Lokasyon Ülke">
                                        <span className="text-xs">{flag}</span>
                                        <span className="text-[8.5px] uppercase tracking-tight">{p.country || "PROB"}</span>
                                      </span>
                                    </div>

                                    <div className="flex items-center justify-between sm:justify-end gap-3.5">
                                      {/* Latency / Ping display */}
                                      <div className="flex items-center gap-1 font-mono">
                                        <span className="text-[8.5px] text-zinc-500">PİNG:</span>
                                        <span className={`font-bold ${latencyValue < 120 ? 'text-emerald-400' : latencyValue < 250 ? 'text-amber-400' : 'text-red-400'}`}>
                                          {latencyValue}ms
                                        </span>
                                      </div>

                                      {/* Wireless/Signal Strength Power Meter */}
                                      <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded border border-transparent ${signalBg}`}>
                                        <span className="text-[8px] text-zinc-500 font-sans font-bold">GÜÇ:</span>
                                        <div className="w-8 h-1 bg-zinc-900 rounded-full overflow-hidden flex">
                                          <div className={`h-full ${barBg}`} style={{ width: `${signalValue}%` }} />
                                        </div>
                                        <span className={`font-black tracking-tight text-[8px] ${signalColor}`}>%{signalValue}</span>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() => {
                                          setStreamProxyUrl(p.formatted);
                                        }}
                                        className="px-2 py-1 bg-amber-500 text-black text-[9px] font-black uppercase hover:bg-amber-400 active:scale-95 transition tracking-wider shrink-0"
                                      >
                                        SEÇ / DOLDUR
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            {freeProxies.length === 0 && (
                              <div className="py-6 text-center text-zinc-700 text-[10px] uppercase">
                                Tünel Alınamadı. Yenile tuşuna basarak tekrar çekmeyi deneyebilirsiniz.
                              </div>
                            )}
                          </div>
                        )}
                        <span className="text-[7.5px] uppercase text-zinc-600 font-sans tracking-wide leading-normal border-t border-zinc-900 pt-1.5">
                          ⚠️ Açık paylaşılan ücretsiz proxies sunucular sürekli aktif ve hızı sınırsız olmayabilir. Test ederek çalışan tünelleri kolayca canlı yayına bağlayabilirsiniz!
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 📺 YOUTUBE CANLI YAYIN LİNKİ / VIDEO ID (OPSİYONEL - ANLIK İZLEYİCİ GÖSTERGESİ İÇİN) */}
              <div className="bg-[#0B0D19]/40 border border-blue-900/40 p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <Youtube className="w-4 h-4 text-[#FF0000]" />
                  <span className="text-[10px] font-black uppercase text-zinc-300 tracking-wider">📺 YOUTUBE CANLI YAYIN GÖRÜNTÜLEME URL veya VIDEO ID (OPSİYONEL)</span>
                </div>
                <p className="text-[10.5px] text-zinc-400 normal-case leading-relaxed font-sans mb-3">
                  Açtığınız yayına ait video linkini buraya yerleştirirseniz, sistem canlı yayındaki <strong className="text-white">Anlık İzleyici Sayısını (Viewer Count)</strong> otomatik çekip panelinizde saniyelik olarak gösterecektir.
                </p>
                <input
                  type="text"
                  value={youtubeLiveUrl}
                  onChange={(e) => setYoutubeLiveUrl(e.target.value)}
                  placeholder="Örn: https://www.youtube.com/watch?v=R872vE7N_8U veya doğrudan Video ID"
                  className="w-full text-xs font-mono bg-black border border-zinc-850 p-2.5 text-blue-400 placeholder-zinc-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* 🤖 GEMINI AI YAYIN SOHBET ROBOTU SEÇENEKLERİ */}
              <div className="bg-[#0c140f] border border-emerald-950/60 p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse" />
                  <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider">🤖 GEMINI SOHBET Moderasyon ROBOTU (YAPAY ZEKA)</span>
                </div>
                <p className="text-[10.5px] text-zinc-400 normal-case leading-relaxed font-sans mb-3">
                  Bu yayının YouTube canlı sohbet akışını anlık takip ederek, izleyicilerinizin yazdığı sorulara <strong className="text-white">Gemini Yapay Zeka motoru</strong> ile sizin yerinize otomatik, akıllı ve Türkçe cevaplar yazdırın.
                </p>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex items-center gap-2.5 h-[44px] bg-black border border-zinc-850 px-3 rounded">
                      <input 
                        type="checkbox" 
                        id="gemini_bot_enabled" 
                        checked={geminiBotEnabled} 
                        onChange={(e) => setGeminiBotEnabled(e.target.checked)} 
                        className="border-zinc-700 text-emerald-500 focus:ring-0 w-4 h-4 bg-black cursor-pointer rounded-none"
                      />
                      <label htmlFor="gemini_bot_enabled" className="text-[10px] text-zinc-300 font-bold uppercase tracking-wider cursor-pointer select-none">
                        Sohbet Robotu Aktif
                      </label>
                    </div>

                    <div className="flex items-center gap-2.5 h-[44px] bg-black border border-zinc-850 px-3 rounded">
                      <input 
                        type="checkbox" 
                        id="gemini_bot_tts_enabled" 
                        checked={geminiBotTtsEnabled} 
                        disabled={!geminiBotEnabled}
                        onChange={(e) => setGeminiBotTtsEnabled(e.target.checked)} 
                        className="border-zinc-700 text-emerald-500 focus:ring-0 w-4 h-4 bg-black cursor-pointer rounded-none disabled:opacity-50"
                      />
                      <label htmlFor="gemini_bot_tts_enabled" className={`text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none ${geminiBotEnabled ? 'text-zinc-300' : 'text-zinc-650'}`}>
                        Cevapları Sesli Oku (TTS) 🎙️
                      </label>
                    </div>
                  </div>

                  {geminiBotEnabled && (
                    <div>
                      <label className="block text-[9px] uppercase font-bold tracking-[0.1em] text-zinc-500 mb-1">ROBOTUN YAPAY ZEKA TALİMATI / ROLLERİ (PROMPT)</label>
                      <textarea
                        value={geminiBotPrompt}
                        onChange={(e) => setGeminiBotPrompt(e.target.value)}
                        placeholder="Örn: Soruları samimi yanıtla, kanala abone olmaya davet et..."
                        className="w-full text-xs font-mono bg-black border border-zinc-850 p-2.5 text-emerald-400 placeholder-zinc-800 focus:outline-none focus:border-emerald-500 min-h-[64px]"
                      />
                    </div>
                  )}
                </div>
              </div>

              <button 
                type="submit" 
                className="w-full bg-[#FF0000] hover:bg-[#CC0000] text-white font-black uppercase text-sm italic tracking-widest py-4 transition duration-200 flex items-center justify-center gap-2"
              >
                {startTimeType === 'immediate' ? (
                  <>
                    <Play className="w-4 h-4 fill-current animate-pulse" /> CANLI YAYINI ŞİMDİ BAŞLAT ⚡
                  </>
                ) : (
                  <>
                    <PlusCircle className="w-4 h-4" /> OTOMASYON PROGRAMINA EKLE
                  </>
                )}
              </button>
            </form>
          </div>

          {/* 2. VİDEO EKLE VE YÜKLE CARD */}
          <div className="bg-[#0F0F0F] border-2 border-zinc-800 p-6 flex flex-col gap-4">
            <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
              <Database className="w-5 h-5 text-[#FF0000]" />
              <h2 className="text-lg font-black uppercase italic tracking-tight text-white">Medya Yönetimi</h2>
            </div>

            {/* Sub Tabs: Local Upload vs URL Link */}
            <div className="grid grid-cols-2 bg-black border border-zinc-800 p-1 text-xs font-bold uppercase tracking-wider">
              <span className="py-2 text-center bg-zinc-900 text-white flex items-center justify-center gap-1 cursor-default">
                <Upload className="w-3.5 h-3.5 text-[#FF0000]" /> Dosya Yükle
              </span>
              <span className="py-2 text-center text-zinc-500 flex items-center justify-center gap-1 cursor-default">
                <Link className="w-3.5 h-3.5 text-zinc-700" /> Link ile Enjekte
              </span>
            </div>

            {/* Link Ingestion Form */}
            <form onSubmit={handleAddExternalUrl} className="border-b border-zinc-800 pb-4 mb-2 space-y-3">
              <p className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">Buluta dosya yüklemeden, direkt MP4 url bağlantısı bağlayın:</p>
              <div>
                <input 
                  type="text" 
                  value={extTitle} 
                  onChange={(e) => setExtTitle(e.target.value)} 
                  placeholder="Medya Başlığı (Örn: Canlı Akış Canlandırıcı)" 
                  className="w-full text-xs bg-black border border-zinc-700 p-2.5 text-white placeholder-zinc-800 font-semibold tracking-wide uppercase"
                />
              </div>
              <div className="flex gap-2">
                <input 
                  type="url" 
                  value={extUrl} 
                  onChange={(e) => setExtUrl(e.target.value)} 
                  placeholder="https://commondatastorage.googleapis.com/...mp4" 
                  className="flex-1 text-xs bg-black border border-zinc-700 p-2.5 text-zinc-400 font-mono focus:border-[#FF0000] focus:outline-none"
                />
                <button type="submit" className="bg-white hover:bg-zinc-200 text-black font-black uppercase text-xs px-4 py-2.5 transition shrink-0">
                  Link Ekle
                </button>
              </div>
            </form>

            {/* Real Upload Widget */}
            <form onSubmit={handleUploadVideo} className="space-y-4">
              <div className="space-y-3">
                <p className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">Sunucu yerel diskine video yüklemesi yapın (Max 500MB):</p>
                <div>
                  <input 
                    type="text" 
                    value={uploadTitle} 
                    onChange={(e) => setUploadTitle(e.target.value)} 
                    placeholder="Özel Dosya Başlığı" 
                    className="w-full text-xs bg-black border border-zinc-700 p-2.5 text-white placeholder-zinc-800 font-semibold tracking-wide uppercase"
                  />
                </div>
                <div className="border border-dashed border-zinc-700 hover:border-[#FF0000] bg-black p-5 relative flex flex-col items-center justify-center text-center transition-colors">
                  <input 
                    type="file" 
                    accept="video/*" 
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setUploadFile(e.target.files[0]);
                      }
                    }} 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <Upload className="w-8 h-8 text-zinc-600 mb-2" />
                  {uploadFile ? (
                    <div className="text-xs">
                      <p className="font-extrabold text-white max-w-[200px] truncate">{uploadFile.name}</p>
                      <p className="text-[#FF0000] font-mono mt-0.5">{formatBytes(uploadFile.size)}</p>
                    </div>
                  ) : (
                    <div className="text-xs">
                      <p className="font-bold text-zinc-300 uppercase tracking-wider">Cihazınızdan Video Seçin</p>
                      <p className="text-zinc-600 mt-1 uppercase text-[10px] font-mono">MP4 formatı tavsiye edilir</p>
                    </div>
                  )}
                </div>
              </div>

              <div>
                {uploading ? (
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-mono font-bold text-zinc-400">
                      <span>BULUT DISKE SEVK EDİLİYOR...</span>
                      <span className="text-[#FF0000]">%{uploadProgress}</span>
                    </div>
                    <div className="w-full bg-black h-2 overflow-hidden border border-zinc-700">
                      <div className="bg-[#FF0000] h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                    </div>
                  </div>
                ) : (
                  <button 
                    type="submit" 
                    disabled={!uploadFile}
                    className={`w-full text-xs font-black uppercase tracking-widest py-3 transition duration-200 border-2 ${
                      uploadFile 
                        ? 'bg-zinc-800 hover:bg-zinc-700 text-white border-zinc-700' 
                        : 'bg-black text-zinc-700 border-zinc-900 cursor-not-allowed'
                    }`}
                  >
                    YÜKLEMEYİ BAŞLAT
                  </button>
                )}
              </div>
            </form>
          </div>

        </section>

        {/* RIGHT COLUMN: LIST OF PLAN & DIAGNOSTICS (7 cols) */}
        <section id="master_dashboard" className="lg:col-span-7 flex flex-col gap-6">
          
          {/* 3. YAYIN AKIŞI / PLANLAMA LİSTESİ */}
          <div className="bg-[#0F0F0F] border-2 border-zinc-800 p-6 flex flex-col">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <FileVideo className="w-5 h-5 text-[#FF0000]" />
                <h2 className="text-lg font-black uppercase italic tracking-tight text-white">Yayın Planları ve Akış Programı</h2>
              </div>
              <span className="text-xs bg-black border border-zinc-700 text-zinc-400 px-3 py-1 font-mono uppercase font-bold tracking-widest">
                {filteredSchedules.length} Kayıt
              </span>
            </div>

            {filteredSchedules.length === 0 ? (
              <div className="text-center py-12 bg-black border border-zinc-800">
                <Calendar className="w-12 h-12 mx-auto text-zinc-700 mb-2" />
                <p className="text-xs uppercase font-extrabold tracking-widest text-zinc-400">Henüz yayın takvimi boş</p>
                <p className="text-[11px] text-zinc-600 mt-1 uppercase">Sol taraftaki yayın planlama konsolunu kullanın</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                {filteredSchedules.map(sched => (
                  <div 
                    key={sched.id} 
                    className={`p-4 border transition duration-200 ${
                      sched.status === 'Yayında' 
                        ? 'bg-[#FF0000]/5 border-[#FF0000]/60' 
                        : inspectScheduleId === sched.id
                          ? 'bg-zinc-900 border-white'
                          : 'bg-black border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-black text-white uppercase italic tracking-wide">{sched.title}</h3>
                          {sched.loop && (
                            <span className="text-[9px] bg-[#FF0000]/10 text-[#FF0000] border border-[#FF0000]/30 px-1.5 py-0.5 font-mono uppercase font-black">LOOP (TEKRAR)</span>
                          )}
                          {sched.shortsMode && (
                            <span className="text-[9px] bg-amber-500/10 text-amber-500 border border-amber-500/30 px-1.5 py-0.5 font-mono uppercase font-black">📱 SHORTS (DİKEY)</span>
                          )}
                          {sched.dualStream && (
                            <span className="text-[9px] bg-[#FF0000]/10 text-[#FF0000] border border-[#FF0000]/40 px-1.5 py-0.5 font-mono uppercase font-black animate-pulse flex items-center gap-1">⚡ DUAL STREAM (ÇİFT AKIŞ)</span>
                          )}
                          {sched.proxyUrl && (
                            <span className="text-[9px] bg-amber-500/10 text-amber-500 border border-amber-500/30 px-1.5 py-0.5 font-mono uppercase font-black flex items-center gap-1">
                              <Globe className="w-3 h-3" /> VPN/PROXY AKTİF
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-400 mt-1.5 flex items-center gap-1.5 font-semibold">
                          <span className="text-zinc-500 uppercase tracking-wider text-[9px]">VİDEO:</span>
                          <span className="text-zinc-200 truncate pr-2 max-w-[220px]" title={sched.videoTitle}>{sched.videoTitle}</span>
                        </p>
                        
                        <div className="text-[11px] text-zinc-400 mt-2 flex flex-col gap-1 sm:flex-row sm:gap-4 font-mono">
                          <p className="flex items-center gap-1 text-zinc-400">
                            <span className="text-zinc-600 uppercase tracking-wider text-[9px] font-sans font-bold">BAŞLANGIÇ:</span>
                            <span>
                              {formatDateTimeSafe(sched.scheduledTime)}
                            </span>
                          </p>
                          {sched.scheduledEndTime && (
                            <p className="flex items-center gap-1 text-zinc-400">
                              <span className="text-zinc-600 uppercase tracking-wider text-[9px] font-sans font-bold">BİTİŞ:</span>
                              <span className="text-[#FF0000] font-bold">
                                {formatDateTimeSafe(sched.scheduledEndTime)}
                              </span>
                            </p>
                          )}
                          {sched.proxyUrl && (
                            <p className="flex items-center gap-1 text-amber-500">
                              <span className="text-zinc-600 uppercase tracking-wider text-[9px] font-sans font-bold">VPN/PROXY SOCKS:</span>
                              <span className="underline select-all">{sched.proxyUrl}</span>
                            </p>
                          )}
                          {sched.actualStartTime && (
                            <p className="flex items-center gap-1 text-[#FF0000]">
                              <span className="text-zinc-600 uppercase tracking-wider text-[9px] font-sans font-bold">AKTİFLEŞTİ:</span>
                              <span>
                                {formatTimeSafe(sched.actualStartTime)}
                              </span>
                            </p>
                          )}
                        </div>

                        {sched.status === 'Yayında' && (
                          <div id={`quick-links-${sched.id}`} className="mt-3 pt-2 border-t border-zinc-800/85 flex flex-wrap gap-2 items-center">
                            <span className="text-[9px] uppercase font-black tracking-wider text-zinc-500">CANLI KONTROL:</span>
                            
                            <a 
                              href="https://studio.youtube.com/video/live/dashboard" 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="inline-flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider bg-[#FF0000]/10 text-[#FF0000] hover:bg-[#FF0000]/25 border border-[#FF0000]/20 transition rounded"
                              title="YouTube Yayıncı Paneli (Yayın Anahtarı, Akış Sağlık Durumu)"
                            >
                              <Wifi className="w-3.5 h-3.5 text-[#FF0000]" />
                              <span>Stüdyo Kontrol ↗</span>
                            </a>

                            {/* Live Viewers count indicator */}
                            {viewerCounts[sched.id] !== undefined && (
                              <div className="inline-flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded font-mono" title={viewerCounts[sched.id].isSimulated ? "YouTube API erişimi kısıtlı olduğunda sistem otomatik simüle eder." : "YouTube platformundan canlı olarak çekilen güncel izleyici sayısı."}>
                                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
                                <span>👥 İZLEYİCİ: {viewerCounts[sched.id].count}</span>
                                {viewerCounts[sched.id].isSimulated && (
                                  <span className="text-[8px] text-emerald-600 font-sans tracking-tight lowercase"> (Simüle)</span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col items-start sm:items-end gap-2.5 shrink-0">
                        {getStatusBadge(sched.status)}
                        
                        <div className="flex items-center gap-1.5">
                          {/* Log Viewer Trigger Button */}
                          <button 
                            onClick={() => {
                              setInspectScheduleId(sched.id);
                              setActiveLogs('');
                            }}
                            className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider border flex items-center gap-1 transition ${
                              inspectScheduleId === sched.id
                                ? 'bg-[#FF0000] border-[#FF0000] text-white'
                                : 'bg-black border-zinc-700 text-zinc-300 hover:text-white'
                            }`}
                            title="Yayın Konsolu Logları"
                          >
                            <Terminal className="w-3.5 h-3.5" />
                            <span>Konsol</span>
                          </button>

                          {/* Action Controller */}
                          {sched.status === 'Yayında' ? (
                            <button 
                              onClick={() => handleForceStop(sched.id)}
                              className="px-3 py-1 text-[11px] font-black uppercase tracking-wider bg-[#FF0000] hover:bg-[#CC0000] text-white flex items-center gap-1 transition"
                              title="Yayını Durdur"
                            >
                              <Square className="w-3.5 h-3.5 fill-current" /> DURDUR
                            </button>
                          ) : (
                            <button 
                              onClick={() => handleForceStart(sched.id)}
                              className="px-3 py-1 text-[11px] font-black uppercase tracking-wider bg-white hover:bg-zinc-200 text-black flex items-center gap-1 transition"
                              title="Yayın Başlat"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" /> BAŞLAT
                            </button>
                          )}

                          {/* Delete Item */}
                          {scheduleDeleteConfirmId === sched.id ? (
                            <div className="flex items-center gap-1 border border-zinc-700 bg-black p-0.5">
                              <button 
                                onClick={() => handleDeleteSchedule(sched.id)}
                                className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider bg-[#FF0000] text-white hover:bg-[#CC0000] transition"
                                title="Silmeyi Onayla"
                              >
                                EVET
                              </button>
                              <button 
                                onClick={() => setScheduleDeleteConfirmId(null)}
                                className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition"
                                title="İptal Et"
                              >
                                İPTAL
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <button 
                                onClick={() => startEditingSchedule(sched)}
                                className={`p-1.5 bg-black hover:bg-zinc-900 border transition ${
                                  sched.status === 'Yayında' 
                                    ? 'border-amber-500/50 text-amber-500 hover:text-amber-400 hover:border-amber-400' 
                                    : 'border-zinc-800 text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/40'
                                }`}
                                title={sched.status === 'Yayında' ? "Aktif Yayının Süresini / Bitiş Saatini / Adını Düzenle" : "Planlamayı Düzenle / Yayın Anahtarını Değiştir"}
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => setScheduleDeleteConfirmId(sched.id)}
                                className="p-1.5 bg-black hover:bg-zinc-900 text-zinc-500 hover:text-[#FF0000] border border-zinc-800 hover:border-[#FF0000]/40 transition"
                                title="Planlamayı Kaldır"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {editingScheduleId === sched.id && (
                      <div className="mt-4 pt-4 border-t border-zinc-800 bg-zinc-900/30 p-3.5 rounded border border-zinc-800/80">
                        <h4 className="text-[10px] uppercase font-black tracking-[0.2em] text-emerald-400 mb-3 flex items-center gap-1">
                          <Edit className="w-3.5 h-3.5" /> PLANLAMA BİLGİLERİNİ GÜNCELLE
                        </h4>
                        {sched.status === 'Yayında' && (
                          <div className="mb-3 bg-amber-500/10 border border-amber-500/30 p-2.5 text-[10px] text-amber-400 font-sans leading-normal normal-case font-normal">
                            <strong>⚠️ AKTİF YAYIN DEĞİŞİKLİĞİ:</strong> Bu yayın şu an sunucuda <strong>AKTİF / CANLI YAYINDADIR</strong>. 
                            Bitiş zamanını (Zamanlayıcıyı) ileriye veya geriye alarak yayının otomatik sonlanacağı zamanı canlı olarak güncelleyebilirsiniz.
                          </div>
                        )}
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[9px] uppercase font-bold tracking-wider text-zinc-500 mb-1">Hedef Kanal</label>
                            <select
                              value={editChannelId}
                              onChange={(e) => setEditChannelId(e.target.value as 'kanal1' | 'kanal2' | 'kanal3' | 'kanal4')}
                              className="w-full text-xs bg-black border border-zinc-700 p-2 text-white focus:outline-none focus:border-emerald-500 h-[34px] cursor-pointer"
                            >
                              <option value="kanal1">🎬 1. KANAL</option>
                              <option value="kanal2">🎬 2. KANAL</option>
                              <option value="kanal3">🎬 3. KANAL</option>
                              <option value="kanal4">🎬 4. KANAL</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[9px] uppercase font-bold tracking-wider text-zinc-500 mb-1">Yayın Başlığı</label>
                            <input 
                              type="text" 
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              className="w-full text-xs bg-black border border-zinc-700 p-2 text-white focus:outline-none focus:border-emerald-500 uppercase font-semibold"
                            />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="sm:col-span-2">
                              <label className="block text-[9px] uppercase font-bold tracking-wider text-zinc-500 mb-1">YouTube Canlı Yayın Anahtarı (Stream Key)</label>
                              <input 
                                type="text" 
                                value={editStreamKey}
                                onChange={(e) => setEditStreamKey(e.target.value)}
                                className="w-full text-xs font-mono bg-black border border-zinc-700 p-2 text-white focus:outline-none focus:border-emerald-500"
                                placeholder="live_..."
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] uppercase font-bold tracking-wider text-zinc-500 mb-1">Yayın Protokolü</label>
                              <select
                                value={editStreamProtocol}
                                onChange={(e) => setEditStreamProtocol(e.target.value as 'rtmp' | 'rtmps')}
                                className="w-full text-xs bg-black border border-zinc-700 p-2 text-white focus:outline-none focus:border-emerald-500 h-[34px] rounded-none cursor-pointer"
                              >
                                <option value="rtmps">RTMPS (Port 443 - Önerilen)</option>
                                <option value="rtmp">RTMP (Port 1935 - Engellenebilir)</option>
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[9px] uppercase font-bold tracking-wider text-zinc-500 mb-1">Başlangıç Zamanı</label>
                              <input 
                                type="datetime-local" 
                                value={editScheduledTime}
                                onChange={(e) => setEditScheduledTime(e.target.value)}
                                className="w-full text-xs bg-black border border-zinc-700 p-2 text-white focus:outline-none focus:border-emerald-500 font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] uppercase font-bold tracking-wider text-zinc-500 mb-1">Bitiş Zamanı (Opsiyonel)</label>
                              <input 
                                type="datetime-local" 
                                value={editScheduledEndTime}
                                onChange={(e) => setEditScheduledEndTime(e.target.value)}
                                className="w-full text-xs bg-black border border-zinc-700 p-2 text-white focus:outline-none focus:border-emerald-500 font-mono"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[9px] uppercase font-bold tracking-wider text-amber-500 mb-1">
                              Proxy Sunucu Tüneli (VPN / Yurtdışı Çıkış IP Adresi - Opsiyonel)
                            </label>
                            <input 
                              type="text" 
                              value={editProxyUrl}
                              onChange={(e) => setEditProxyUrl(e.target.value)}
                              placeholder="Örn: socks5://user:pass@ip:port veya http://ip:port"
                              className="w-full text-xs font-mono bg-black border border-zinc-700 p-2 text-amber-400 focus:outline-none focus:border-amber-500 placeholder-zinc-850"
                            />
                            <p className="text-[8px] text-zinc-500 mt-1 uppercase font-mono tracking-wide leading-normal">
                              Bu yayını belirli bir yurtdışı IP adresi üzerinden akıtmak için Proxy (SOCKS5/HTTP) adresini girin. Boş bırakırsanız varsayılan bulut sunucu IP'si kullanılır.
                            </p>

                            {/* PROXY BULUCU YARDIMCISI (EDİT) */}
                            <div className="mt-2.5 border-t border-zinc-800/60 pt-2 text-left">
                              <button
                                type="button"
                                onClick={() => {
                                  setShowFreeProxySelector(!showFreeProxySelector);
                                  if (!showFreeProxySelector && freeProxies.length === 0) {
                                    loadFreeProxies();
                                  }
                                }}
                                className="text-[9px] font-black uppercase text-amber-500 hover:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 px-2.5 py-1.5 transition flex items-center justify-between w-full border border-amber-500/10"
                              >
                                <span className="flex items-center gap-1 font-sans">
                                  🎁 ÜCRETSİZ PROXY SEÇ ({freeProxies.length > 0 ? `${freeProxies.length}` : "LİSTELE"})
                                </span>
                                <span>{showFreeProxySelector ? 'KAPAT ▲' : 'BUL ▼'}</span>
                              </button>

                              {showFreeProxySelector && (
                                <div className="mt-2 p-2.5 bg-black border border-zinc-800 flex flex-col gap-2">
                                  <div className="flex items-center justify-between font-sans text-[8px] uppercase">
                                    <span className="text-zinc-500 font-bold">
                                      Aktif Genel Tüneller
                                    </span>
                                    <button
                                      type="button"
                                      onClick={loadFreeProxies}
                                      disabled={loadingFreeProxies}
                                      className="font-black text-amber-400 hover:underline disabled:opacity-50"
                                    >
                                      {loadingFreeProxies ? 'YENİLENİYOR...' : '🔄 YENİLE'}
                                    </button>
                                  </div>

                                  {loadingFreeProxies ? (
                                    <div className="py-4 text-center text-zinc-650 text-[10px] font-mono uppercase animate-pulse">
                                      🔄 Tüneller Çekiliyor...
                                    </div>
                                  ) : (
                                    <div className="max-h-40 overflow-y-auto divide-y divide-zinc-950 pr-1 select-all font-mono">
                                      {freeProxies
                                        .slice(0, 30)
                                        .map((p, idx) => {
                                          const flags: Record<string, string> = { 
                                            DE: '🇩🇪', FR: '🇫🇷', NL: '🇳🇱', US: '🇺🇸', GB: '🇬🇧', 
                                            SG: '🇸🇬', TR: '🇹🇷', FI: '🇫🇮', PL: '🇵🇱', IT: '🇮🇹', 
                                            CH: '🇨🇭', CA: '🇨🇦', SE: '🇸🇪' 
                                          };
                                          const flag = p.country && flags[p.country] ? flags[p.country] : '🌐';
                                          const signalValue = p.signal || 50;
                                          const latencyValue = p.latency || 150;

                                          let signalColor = 'text-red-400';
                                          if (signalValue >= 80) {
                                            signalColor = 'text-emerald-400';
                                          } else if (signalValue >= 50) {
                                            signalColor = 'text-amber-400';
                                          }

                                          return (
                                            <div key={idx} className="py-2 flex flex-col gap-1.5 border-b border-zinc-950/20 hover:bg-zinc-950/20 px-1 text-[8px]">
                                              <div className="flex items-center justify-between gap-1.5">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                  <span className="px-1 py-0.5 rounded text-[7px] font-black bg-zinc-900 border border-zinc-800 text-amber-500 uppercase">
                                                    {p.protocol}
                                                  </span>
                                                  <span className="text-zinc-300 font-mono font-bold truncate max-w-[120px]">{p.ipPort}</span>
                                                </div>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setEditProxyUrl(p.formatted);
                                                  }}
                                                  className="px-1.5 py-0.5 bg-amber-500 hover:bg-amber-400 text-black text-[7.5px] font-black uppercase transition shrink-0"
                                                >
                                                  SEÇ
                                                </button>
                                              </div>

                                              <div className="flex items-center justify-between text-[7px] text-zinc-500 uppercase">
                                                <span className="flex items-center gap-0.5 font-bold">
                                                  <span>{flag}</span>
                                                  <span>{p.country || "PROB"}</span>
                                                </span>
                                                <div className="flex items-center gap-2">
                                                  <span>PİNG: <strong className={latencyValue < 150 ? "text-emerald-400" : "text-amber-400"}>{latencyValue}ms</strong></span>
                                                  <span>GÜÇ: <strong className={signalColor}>%{signalValue}</strong></span>
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        })}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="mt-3 bg-[#0B0D19]/40 border border-blue-900/40 p-3 rounded">
                            <label className="block text-[9px] uppercase font-bold tracking-wider text-blue-400 mb-1">
                              📺 YouTube Canlı Yayın Görüntüleme URL veya Video ID (Opsiyonel)
                            </label>
                            <input 
                              type="text" 
                              value={editYoutubeLiveUrl}
                              onChange={(e) => setEditYoutubeLiveUrl(e.target.value)}
                              placeholder="Örn: https://www.youtube.com/watch?v=R872vE7N_8U veya Video ID"
                              className="w-full text-xs font-mono bg-black border border-zinc-700 p-2 text-blue-400 focus:outline-none focus:border-blue-500 placeholder-zinc-850"
                            />
                            <p className="text-[8px] text-zinc-500 mt-1 uppercase font-mono tracking-wide leading-normal">
                              Bu yayının anlık izleyici sayısını paneline getirmek için link veya 11 haneli video kodunu girin.
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-4 pt-1 mb-2">
                            <label className="flex items-center gap-2 cursor-pointer text-xs select-none">
                              <input 
                                type="checkbox" 
                                checked={editLoop} 
                                onChange={(e) => setEditLoop(e.target.checked)}
                                className="rounded border-zinc-700 bg-black text-emerald-500 focus:ring-0 focus:ring-offset-0 w-4 h-4"
                              />
                              <span className="text-zinc-300 font-bold tracking-wide uppercase text-[10px]">LOOP (SONSUZ DÖNGÜ)</span>
                            </label>

                            <label className="flex items-center gap-2 cursor-pointer text-xs select-none">
                              <input 
                                type="checkbox" 
                                checked={editShortsMode} 
                                onChange={(e) => setEditShortsMode(e.target.checked)}
                                className="rounded border-zinc-700 bg-black text-amber-500 focus:ring-0 focus:ring-offset-0 w-4 h-4"
                              />
                              <span className="text-zinc-300 font-bold tracking-wide uppercase text-[10px]">📱 SHORTS (DİKEY MOD)</span>
                            </label>

                            <label className="flex items-center gap-2 cursor-pointer text-xs select-none">
                              <input 
                                type="checkbox" 
                                checked={editDualStream} 
                                onChange={(e) => setEditDualStream(e.target.checked)}
                                className="rounded border-zinc-700 bg-black text-red-500 focus:ring-0 focus:ring-offset-0 w-4 h-4"
                              />
                              <span className="text-zinc-300 font-bold tracking-wide uppercase text-[10px]">⚡ DUAL STREAM</span>
                            </label>
                          </div>

                          {/* 🤖 GEMINI AI YAYIN SOHBET ROBOTU SEÇENEKLERİ (EDİT) */}
                          <div className="bg-[#0c140f] border border-emerald-950/60 p-4 rounded text-left">
                            <div className="flex items-center gap-1.5 mb-2">
                              <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse" />
                              <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider">🤖 GEMINI SOHBET MODERASYON ROBOTU (EDİT)</span>
                            </div>
                            <div className="space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="flex items-center gap-2.5 h-[44px] bg-black border border-zinc-805 px-3 rounded">
                                  <input 
                                    type="checkbox" 
                                    id="edit_gemini_bot_enabled" 
                                    checked={editGeminiBotEnabled} 
                                    onChange={(e) => setEditGeminiBotEnabled(e.target.checked)} 
                                    className="border-zinc-700 text-emerald-500 focus:ring-0 w-4 h-4 bg-black cursor-pointer rounded-none"
                                  />
                                  <label htmlFor="edit_gemini_bot_enabled" className="text-[10px] text-zinc-300 font-bold uppercase tracking-wider cursor-pointer select-none">
                                    Sohbet Robotu Aktif
                                  </label>
                                </div>

                                <div className="flex items-center gap-2.5 h-[44px] bg-black border border-zinc-805 px-3 rounded">
                                  <input 
                                    type="checkbox" 
                                    id="edit_gemini_bot_tts_enabled" 
                                    checked={editGeminiBotTtsEnabled} 
                                    disabled={!editGeminiBotEnabled}
                                    onChange={(e) => setEditGeminiBotTtsEnabled(e.target.checked)} 
                                    className="border-zinc-700 text-emerald-500 focus:ring-0 w-4 h-4 bg-black cursor-pointer rounded-none disabled:opacity-50"
                                  />
                                  <label htmlFor="edit_gemini_bot_tts_enabled" className={`text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none ${editGeminiBotEnabled ? 'text-zinc-300' : 'text-zinc-650'}`}>
                                    Cevapları Sesli Oku (TTS) 🎙️
                      </label>
                                </div>
                              </div>

                              {editGeminiBotEnabled && (
                                <div>
                                  <label className="block text-[9px] uppercase font-bold tracking-[0.1em] text-zinc-500 mb-1">ROBOTUN YAPAY ZEKA TALİMATI / ROLLERİ (PROMPT)</label>
                                  <textarea
                                    value={editGeminiBotPrompt}
                                    onChange={(e) => setEditGeminiBotPrompt(e.target.value)}
                                    placeholder="Örn: Soruları samimi yanıtla, kanala abone olmaya davet et..."
                                    className="w-full text-xs font-mono bg-black border border-zinc-805 p-2 text-emerald-400 placeholder-zinc-800 focus:outline-none focus:border-emerald-500 min-h-[64px]"
                                  />
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex gap-2 justify-end pt-2">
                            <button 
                              onClick={() => setEditingScheduleId(null)}
                              className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition flex items-center gap-1"
                            >
                              <X className="w-3.5 h-3.5" /> İptal
                            </button>
                            <button 
                              onClick={() => handleUpdateSchedule(sched.id)}
                              className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white transition flex items-center gap-1"
                            >
                              <Check className="w-3.5 h-3.5" /> Güncelle
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {sched.errorMsg && (
                      <div className="mt-2 text-[10px] font-mono text-red-400 bg-[#FF0000]/5 border border-[#FF0000]/10 p-2">
                        <span><b>HATA:</b> {sched.errorMsg}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>



          {/* 7/24 BULUT KESİNTİSİZ ÇALIŞMA PANELİ */}
          <div className="bg-[#0F0F0F] border-2 border-zinc-800 p-6 flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <RefreshCw className={`w-5 h-5 ${isCronActive ? 'text-emerald-500 animate-spin' : 'text-zinc-600'}`} />
                <h2 className="text-lg font-black uppercase italic tracking-tight text-white">⚙️ 7/24 Kesintisiz Bulut Yayını Aktiflik Paneli</h2>
              </div>
              <span className={`text-[9px] border px-2 py-0.5 font-mono uppercase font-black tracking-widest ${
                isCronActive 
                  ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-400' 
                  : 'bg-amber-950/40 border-amber-500/50 text-amber-400'
              }`}>
                {isCronActive ? 'BİLGiSAYAR KAPALIYKEN ÇALIŞIYOR' : 'UYKU RİSKİ MEVCUT'}
              </span>
            </div>

            <div className="text-[11px] text-zinc-400 uppercase leading-relaxed font-sans">
              <p className="mb-2">
                Sisteminiz bulut ortamlarında, tarayıcınız kapalı olsa dahi bağımsız çalışacak şekilde tasarlanmıştır. Ancak, sistem <strong className="text-zinc-200">bulut sunucusu (Cloud Run)</strong> üzerinde çalıştığından, siteye giren kimse olmadığında sunucu kendini <strong className="text-amber-500">uyku moduna (idle)</strong> alır ve planlanan sonraki yayınların tespiti gecikebilir.
              </p>
              <p className="mb-3">
                Yayınların bilgisayarınız tamamen kapalıyken dahi tam saatinde başlayıp durmasını sağlamak için, <strong className="text-emerald-400">ücretsiz ve çok kolay olan</strong> bir dış ping servisi (örneğin <a href="https://cron-job.org" target="_blank" rel="noreferrer" className="underline text-emerald-500 font-bold hover:text-emerald-400">cron-job.org</a> veya <a href="https://uptimerobot.com" target="_blank" rel="noreferrer" className="underline text-emerald-500 font-bold hover:text-emerald-400">UptimeRobot</a>) kurarak sitemizin cron linkini her dakikada bir tetikletmeniz önerilir.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border border-zinc-800 p-4 bg-zinc-950/60 font-mono text-[10px]">
              <div>
                <span className="text-zinc-500 block uppercase font-bold text-[9px] mb-1">BULUT MOTORU SİNYAL DURUMU:</span>
                {isCronActive ? (
                  <div className="flex items-center gap-1.5 text-emerald-400 font-bold uppercase">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                    <span>7/24 AKTİF (SINYALLER GELİYOR)</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-amber-500 font-bold uppercase">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                    <span>PASİF / UYKU MODU RİSKİ</span>
                  </div>
                )}
                {window.location.hostname.includes('ais-dev-') && (
                  <div className="mt-2 bg-emerald-500/10 border border-emerald-500/30 p-2 text-[9px] text-emerald-400 font-sans normal-case font-normal leading-normal">
                    <strong>ℹ️ ÖNİZLEME MODU AKTİF:</strong> Şu an AI Studio geliştirme ve önizleme panelindesiniz. Altta bulunan cron bağlantısını kullanarak, bilgisayarınız kapalıyken bile buradaki planlanmış yayınlarınızı 7/24 kesintisiz çalışacak şekilde tetikleyebilirsiniz!
                  </div>
                )}
                {status?.lastCronPingTime && (
                  <p className="text-[10px] text-zinc-500 mt-1 uppercase font-normal font-sans">
                    Son Kontrol/Ping Sinyali: {formatTimeSafe(status.lastCronPingTime)} (Turkiye Saati ile)
                  </p>
                )}
              </div>

              <div>
                <span className="text-zinc-500 block uppercase font-bold text-[9px] mb-1">KOPYALANACAK CRON ADRESİ (HTTP GET):</span>
                <div className="flex items-center gap-1 border border-zinc-700 bg-black p-1">
                  <input 
                    type="text" 
                    readOnly 
                    value={getCronUrl()} 
                    className="bg-transparent text-emerald-400 w-full text-[10px] font-mono font-bold outline-none border-none py-0.5 px-1"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(getCronUrl());
                      alert("Güvenli Cron linki panoya kopyalandı! Şimdi cron-job.org sitesine yapıştırabilirsiniz.");
                    }}
                    className="bg-[#FF0000] text-white hover:bg-red-700 px-2 py-1 font-sans font-black uppercase text-[9px] whitespace-nowrap"
                  >
                    Kopyala
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-3 bg-amber-950/25 border-l-2 border-amber-500 p-3 text-[10px] text-zinc-400 leading-relaxed font-sans">
              <strong className="text-amber-400 block mb-1">⚠️ "302 FOUND / REDIRECT" (ÇEREZ DOĞRULAMA) ENGELLERİ VE KESİN ÇÖZÜMÜ:</strong>
              <p className="mb-2 text-zinc-300">
                Sistemimiz korumalı bir sunucuda barındığından, otomatik botların (cron-job.org, uptimerobot) doğrudan adrese erişmesi engellenir. Bu engeli aşmak ve cron-job.org sitesinin başarıyla tetikleme yapmasını sağlamak için tarayıcınızın çerezini cron-job.org'a tanıtmanız gerekir.
              </p>
              <div className="bg-black/40 border border-zinc-800 p-2.5 rounded text-[10px] space-y-1 text-zinc-300">
                <span className="font-extrabold text-amber-400 block uppercase">🍪 ÇEREZİ BULMA VE EKLEME ADIMLARI:</span>
                <ol className="list-decimal list-inside space-y-1 text-zinc-400">
                  <li>Sitemizin önizleme sayfasına gidin (<strong className="text-white">https://ais-pre-...</strong> - şu anki yeriniz).</li>
                  <li>Klavye üzerinden <strong className="text-white">F12</strong> veya <strong className="text-white">Ctrl + Shift + I</strong> tuşlarına basın (veya sayfada boş bir yere sağ tıklayıp <strong className="text-white">İncele / Inspect</strong> seçin).</li>
                  <li>En üst sekmelerden <strong className="text-amber-400 font-bold">Ağ (Network)</strong> sekmesini seçin. (Eğer üst bar sığmadıysa en sağdaki <strong className="text-white">{"»"}</strong> simgesine tıklayıp oradan seçin).</li>
                  <li>Sekme açıkken sayfayı bir kez yenileyin (klavyeden <strong className="text-white">F5</strong> tuşuna basın).</li>
                  <li>Ağ listesinde en yukarıda sitemizin adını (<strong className="text-zinc-200">ais-pre-...</strong> veya /api/status) göreceksiniz. Ona tıklayın.</li>
                  <li>Sağ tarafta açılan detay panelinde <strong className="text-amber-400 font-bold">Üstbilgiler (Headers)</strong> sekmesinde aşağı kaydırın ve <strong className="text-white">İstek Üstbilgileri (Request Headers)</strong> kısmını bulun.</li>
                  <li>Orada bulunan <strong className="text-white">Cookie:</strong> veya <strong className="text-white">cookie:</strong> etiketinin sağındaki tüm değerleri (genellikle <strong className="text-emerald-400">surfaces-cookie= ...</strong> ile başlayan upuzun yazı) tamamen seçip kopyalayın.</li>
                  <li><strong className="text-zinc-200">cron-job.org</strong> sitesine gidin, oluşturduğunuz işin (cronjob) düzenleme ekranını açın.</li>
                  <li>En üstteki <strong className="text-amber-400 font-bold">"ADVANCED" (Gelişmiş)</strong> sekmesine tıklayın. (Şu an aktif olan "COMMON" sekmesinin hemen yanındadır).</li>
                  <li>Aşağıdaki <strong className="text-amber-400 font-bold">"Request Headers" (İsteyici Üstbilgileri)</strong> başlığına tıklayıp <strong className="text-white font-bold">"Add Header" (Üstbilgi Ekle)</strong> deyin:</li>
                  <ul className="list-disc list-inside pl-3 text-zinc-400 mt-1">
                    <li><strong className="text-white">Header Name (Başlık Adı):</strong> <code className="bg-zinc-900 border border-zinc-800 text-amber-500 px-1 font-mono text-[9px] rounded">Cookie</code> yazın.</li>
                    <li><strong className="text-white">Header Value (Başlık Değeri):</strong> Tarayıcıdan kopyaladığınız o upuzun <code className="bg-zinc-900 border border-zinc-800 text-emerald-400 px-1 font-mono text-[9px] rounded">surfaces-cookie=...</code> kodunu yapıştırın.</li>
                  </ul>
                  <li className="mt-1">Kaydedin ve tekrar <strong className="text-emerald-400 font-bold">"Test Run"</strong> yapın. Artık hatasız, yemyeşil, kesintisiz 200 OK olarak çalışacaktır!</li>
                </ol>
              </div>
            </div>

            <div className="border-l-2 border-l-[#FF0000] pl-3 py-1 text-[10px] text-zinc-500 uppercase leading-relaxed font-sans mt-3">
              <strong className="text-zinc-300 block mb-1">Nasıl Kurulur? (1 Dakikada Ücretsiz)</strong>
              <ol className="list-decimal list-inside space-y-1">
                <li><a href="https://cron-job.org" target="_blank" rel="noreferrer" className="underline text-zinc-400 hover:text-white font-bold">cron-job.org</a> adresine girip hızlıca ücretsiz üye olun veya giriş yapın.</li>
                <li>Panelde <span className="text-zinc-300">"Create Cronjob" (Cronjob Oluştur)</span> butonuna tıklayın.</li>
                <li>Başlığa istediğiniz bir isim yazın (örn: <span className="text-zinc-300">YouTube Yayınlayıcı</span>).</li>
                <li>URL (Adres) kısmına yukarıdaki <span className="text-emerald-400 font-bold bg-zinc-950 px-1 border border-zinc-800">kopyaladığınız yeni adresi</span> yapıştırın.</li>
                <li>Sıklık (Execution interval) ayarını <span className="text-zinc-300 font-bold text-zinc-300">"Every 1 minute" (Her dakika)</span> veya <span className="text-zinc-300">"Every 5 minutes" (5 dakikada bir)</span> olarak seçin ve kaydedin.</li>
              </ol>
            </div>
          </div>

          {/* 4. TELEMETRİ / CANLI LOG İNCELEME KONSOLU */}
          <div className="bg-[#0F0F0F] border-2 border-zinc-800 p-6 flex flex-col flex-1">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-[#FF0000]" />
                <h2 className="text-lg font-black uppercase italic tracking-tight text-white">FFmpeg Çıktı ve Telemetri Terminali</h2>
              </div>
              
              {inspectScheduleId && (
                <div className="flex items-center gap-3 text-[10px] font-mono font-bold uppercase tracking-wider">
                  <label className="text-zinc-400 select-none flex items-center gap-1 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={logsAutoScroll} 
                      onChange={(e) => setLogsAutoScroll(e.target.checked)}
                      className="border-zinc-700 text-[#FF0000] w-3 h-3 cursor-pointer rounded-none"
                    />
                    <span>Oto-Kaydır</span>
                  </label>
                  <button 
                    onClick={() => {
                      setInspectScheduleId(null);
                      setActiveLogs('');
                    }}
                    className="text-zinc-500 hover:text-[#FF0000]"
                  >
                    [KAPAT]
                  </button>
                </div>
              )}
            </div>

            {inspectScheduleId ? (() => {
              const inspectedSchedule = schedules.find(s => s.id === inspectScheduleId);
              return (
                <div className="flex-1 flex flex-col min-h-[160px] gap-2.5">
                  <div className="text-[10px] font-mono text-zinc-500 flex items-center justify-between">
                    <span>TELEMETRİ HEDEFİ: <span className="font-mono text-[#FF0000] font-bold">{inspectScheduleId}</span></span>
                    <span>FREKANS: 2.5S GERÇEK ZAMANLI LOG</span>
                  </div>

                  {inspectedSchedule?.status === 'Yayında' && (
                    <div className="flex flex-col gap-2">
                      <div className="bg-zinc-950 border border-zinc-800 p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-l-4 border-l-[#FF0000]">
                        <div>
                          <div className="flex items-center gap-1.5 text-[11px] font-black uppercase text-white tracking-widest">
                            <span className="w-2 h-2 rounded-full bg-[#FF0000] animate-ping"></span>
                            <span>BU YAYIN ŞU AN SUNUCUDA AKTİF!</span>
                          </div>
                          <p className="text-[10px] text-zinc-500 uppercase font-mono mt-1 leading-normal">
                            Yayının iletim durumunu ve sağlığını YouTube üzerinden doğrudan test edin:
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2 shrink-0">
                          <a 
                            href="https://studio.youtube.com/video/live/dashboard" 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-black uppercase tracking-wider bg-[#FF0000] text-white hover:bg-[#CC0000] transition font-mono border border-transparent rounded"
                            title="YouTube Stüdyo Canlı Yayın Kontrol Odası"
                          >
                            <Wifi className="w-4 h-4 animate-pulse" />
                            <span>STÜDYO KONTROL ↗</span>
                          </a>
                        </div>
                      </div>

                      {/* DETAILED ACCESSIBILITY TROUBLESHOOTING GUIDE */}
                      <div className="bg-[#0A0A0A] border border-zinc-800/80 p-3 text-[11px] leading-relaxed select-text rounded">
                        <div className="flex items-center gap-1.5 text-amber-500 font-bold uppercase tracking-wider mb-2 text-[10px]">
                          <AlertCircle className="w-4 h-4 shrink-0 text-amber-500" />
                          <span>YAYINIMI NASIL KONTROL EDERİM?</span>
                        </div>
                        <ul className="list-decimal pl-4 space-y-1.5 text-zinc-400">
                          <li>
                            <strong className="text-white">YouTube Stüdyo Yayını:</strong> Yukarıdaki <strong className="text-red-500">"STÜDYO KONTROL ↗"</strong> butonuna tıklayarak açılan ekranda, yayınınızın YouTube sunucularına ulaşıp ulaşmadığını yeşil durum göstergesiyle anlık olarak izleyebilirsiniz.
                          </li>
                          <li>
                            <strong className="text-white">Sinyal İletim Gecikmesi:</strong> Sunucunun video dosyalarını işleyip YouTube'a aktarması ve YouTube'un yayını oynatıcıda canlandırması <strong className="text-zinc-200 font-mono">10-25 saniye</strong> sürebilir. Bu bekleme süreci tamamen YouTube altyapısından kaynaklıdır.
                          </li>
                          <li>
                            <strong className="text-white">Gizli / Herkese Açık Ayarı:</strong> YouTube tarafında yayınınız "Gizli" veya "Liste Dışı" seçildiyse doğrudan linklerden erişilemez. Herkese açık yapmak için YouTube Stüdyo kontrol paneli içerisinden Yayın Görünürlüğünü <strong className="text-emerald-400 font-bold">"Herkese Açık" (Public)</strong> olarak değiştirebilirsiniz.
                          </li>
                        </ul>
                      </div>
                    </div>
                  )}

                  {/* TAB SELECTORS */}
                  <div className="flex border-b border-zinc-850 mb-2 font-mono">
                    <button
                      onClick={() => setConsoleTab('ffmpeg')}
                      className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition leading-none ${
                        consoleTab === 'ffmpeg'
                          ? 'border-b-2 border-b-red-500 text-white bg-zinc-900/60'
                          : 'text-zinc-500 hover:text-zinc-300 card-tab'
                      }`}
                    >
                      📟 FFmpeg Konsol Logları
                    </button>
                    <button
                      onClick={() => setConsoleTab('gemini_bot')}
                      className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition flex items-center gap-1.5 leading-none ${
                        consoleTab === 'gemini_bot'
                          ? 'border-b-2 border-b-emerald-400 text-emerald-400 bg-zinc-900/60'
                          : 'text-zinc-500 hover:text-zinc-300 card-tab'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" /> 🤖 Gemini AI Bot Logları ({botReplies.length})
                    </button>
                  </div>

                  {consoleTab === 'ffmpeg' ? (
                    <div className="flex-1 bg-black border border-zinc-850 p-4 font-mono text-[11px] leading-relaxed text-zinc-400 overflow-y-auto max-h-[240px] h-full whitespace-pre-wrap select-text border-l-2 border-l-[#FF0000]">
                      {activeLogs || '[BAĞLANTI BEKLENİYOR] Yayın parametreleri yükleniyor, FFmpeg sinyali bekleniyor...'}
                      <div ref={logsEndRef} />
                    </div>
                  ) : (
                    <div className="flex-1 bg-black border border-zinc-850 p-4 overflow-y-auto max-h-[240px] h-full border-l-2 border-l-emerald-500 text-left">
                      <div className="space-y-3">
                        {/* Sandbox Manual Chat Entry */}
                        <div className="bg-zinc-950 p-2.5 border border-zinc-900 flex flex-col gap-2">
                          <span className="text-[9px] font-black uppercase text-emerald-400 tracking-wider flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-emerald-400 animate-pulse" /> Sandbox Manuel Soruları Yapay Zekaya Cevaplat
                          </span>
                          <p className="text-[10px] text-zinc-500 normal-case leading-snug">
                            Yayınınız canlı olmasa ya da YouTube'a bağlı olmasa da bu sandbox'ı kullanarak belirlediğiniz prompta göre Gemini'ın ne cevap üreteceğini anında test edebilirsiniz.
                          </p>
                          <form
                            onSubmit={async (e) => {
                              e.preventDefault();
                              const form = e.currentTarget;
                              const authorInput = form.elements.namedItem('testAuthor') as HTMLInputElement;
                              const messageInput = form.elements.namedItem('testMessage') as HTMLInputElement;
                              const author = authorInput.value.trim();
                              const message = messageInput.value.trim();
                              if (!author || !message) return;
                              
                              authorInput.value = '';
                              messageInput.value = '';
                              
                              try {
                                const response = await fetch(`/api/schedules/${inspectScheduleId}/bot-replies/generate-manual`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    author,
                                    message,
                                    botPersonality: inspectedSchedule?.geminiBotPrompt || ''
                                  })
                                });
                                if (response.ok) {
                                  const rData = await response.json();
                                  if (rData.success && rData.reply) {
                                    setBotReplies(prev => [rData.reply, ...prev]);
                                  }
                                }
                              } catch (err) {
                                console.error('Manuel bot reply error:', err);
                              }
                            }}
                            className="flex flex-col sm:flex-row gap-2 mt-1"
                          >
                            <input 
                              type="text" 
                              name="testAuthor"
                              placeholder="Seyirci Adı (Örn: BurakB)"
                              className="text-[10px] font-mono bg-black border border-zinc-800 p-1.5 text-zinc-300 focus:outline-none focus:border-emerald-500 sm:w-1/3"
                              required
                            />
                            <input 
                              type="text" 
                              name="testMessage"
                              placeholder="Soru veya yorum..."
                              className="text-[10px] font-mono bg-black border border-zinc-800 p-1.5 text-emerald-400 focus:outline-none focus:border-emerald-500 flex-1"
                              required
                            />
                            <button
                              type="submit"
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-bold uppercase tracking-wider shrink-0"
                            >
                              YÜKLE & YANITLA
                            </button>
                          </form>
                        </div>

                        {botReplies.length > 0 ? (
                          <div className="divide-y divide-zinc-900 border border-zinc-900 rounded overflow-hidden">
                            {botReplies.map((reply) => (
                              <div key={reply.id} className="p-3 bg-zinc-950 hover:bg-zinc-950/60 leading-normal flex flex-col gap-1.5">
                                <div className="flex items-center justify-between text-[9px] font-sans text-zinc-500">
                                  <div className="flex items-center gap-1">
                                    <strong className="text-zinc-300 font-mono select-all text-[9.5px]">{reply.author}</strong>
                                    <span>canlı yayında sordu:</span>
                                  </div>
                                  <span>{new Date(reply.timestamp).toLocaleTimeString('tr-TR')}</span>
                                </div>
                                <div className="text-[10.5px] font-mono text-zinc-400 pl-2 border-l-2 border-l-zinc-800">
                                  "{reply.userMessage}"
                                </div>
                                <div className="flex items-start gap-1.5 bg-emerald-950/20 p-2.5 border border-emerald-900/30 text-[11px] leading-relaxed">
                                  <Sparkles className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0 animate-pulse" />
                                  <div className="text-emerald-300 font-sans select-text">
                                    <strong className="text-emerald-400 uppercase tracking-wide text-[9px] font-bold block mb-0.5">Gemini Cevabı:</strong>
                                    {reply.botResponse}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="py-12 border border-dashed border-zinc-800 text-center text-zinc-550 text-[10px] uppercase font-mono tracking-wider">
                            Yayın Robotu Hazır 🤖. YouTube Canlı Sohbetinden veya manuel test girişinden veri bekleniyor...
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })() : (
              <div className="flex-grow flex flex-col items-center justify-center text-center p-8 bg-black border border-zinc-800">
                <Terminal className="w-8 h-8 text-zinc-700 mb-2" />
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-300">BAŞLAMAYA HAZIR</p>
                <p className="text-[10px] text-zinc-500 mt-1 uppercase max-w-sm leading-normal">Aktif FFmpeg log akışını ve sistem parametrelerini incelemek için yukarıdaki listeden bir yayının yanındaki <b>"KONSOL"</b> butonuna basın.</p>
              </div>
            )}
          </div>

          {/* 5. VİDEO KÜTÜPHANESİ LIST IN BOTTOM RIGHT */}
          <div className="bg-[#0F0F0F] border-2 border-zinc-800 p-6 flex flex-col">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-[#FF0000]" />
                <h2 className="text-lg font-black uppercase italic tracking-tight text-white">Oynatılabilir Dosya Kütüphanesi</h2>
              </div>
              <span className="text-xs bg-black border border-zinc-700 text-zinc-400 px-3 py-1 font-mono uppercase font-bold tracking-widest">
                {videos.length} Dosya / Link
              </span>
            </div>

            {videos.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-6 italic font-semibold">KÜTÜPHANEDE DOSYA BULUNMAMAKTADIR.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[200px] overflow-y-auto pr-1">
                {videos.map(v => (
                  <div key={v.id} className="bg-black p-3 border border-zinc-800 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-center gap-2.5">
                      <div className="p-2 bg-zinc-900 border border-zinc-800 text-[#FF0000]">
                        {v.type === 'local' ? <HardDrive className="w-4 h-4" /> : <Link className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold text-zinc-100 uppercase tracking-wide truncate max-w-[155px]" title={v.title}>{v.title}</p>
                        <p className="text-[10px] text-zinc-500 font-mono mt-0.5 flex items-center gap-1.5">
                          <span>{v.type === 'local' ? 'YEREL SUNUCU' : 'UZAK MP4'}</span>
                          {v.size && (
                            <>
                              <span>•</span>
                              <span className="text-[#FF0000] font-black">{formatBytes(v.size)}</span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>

                    {videoDeleteConfirmId === v.id ? (
                      <div className="flex items-center gap-1 shrink-0 border border-zinc-700 bg-zinc-950 p-0.5">
                        <button 
                          onClick={() => handleDeleteVideo(v.id)}
                          className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider bg-[#FF0000] text-white hover:bg-[#CC0000] transition"
                          title="Silmeyi Onayla"
                        >
                          EVET
                        </button>
                        <button 
                          onClick={() => setVideoDeleteConfirmId(null)}
                          className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition"
                          title="İptal Et"
                        >
                          İPTAL
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => setVideoDeleteConfirmId(v.id)}
                        className="p-1.5 text-zinc-600 hover:text-[#FF0000] border border-transparent hover:border-[#FF0000]/10 transition shrink-0"
                        title="Videoyu Kütüphaneden Sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

        </section>

      </main>

      {/* FOOTER SECTION */}
      <footer id="footer" className="border-t border-[#222] py-6 px-6 bg-[#0A0A0A] text-xs text-zinc-500 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-3 font-mono">
          <p>© 2026 TUBEFLOW AUTOMATION. PC-KAPALI BULUT RE-STREAM ENGINE.</p>
          <div className="flex items-center gap-4 text-zinc-600 text-[11px]">
            <span>UPTIME SCORE: {status ? Math.round(status.uptime / 3600) + ' SAAT' : 'HESAPLANIYOR...'}</span>
            <span>•</span>
            <span className="text-[#FF0000] font-black">MEM USAGE: {status ? Math.round(status.memoryUsage / 1024 / 1024) + ' MB' : '...'}</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
