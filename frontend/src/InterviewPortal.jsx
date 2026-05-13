import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Loader2, Mic, MicOff, ChevronRight } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

const SILENCE_DELAY = 2200; // ms of silence before auto-submitting

export default function InterviewPortal({ jdText: propJd }) {
  const jdText = propJd || 'General Interview Assessment';
  const navigate = useNavigate();
  const location = useLocation();

  const [phase, setPhase] = useState('loading'); // loading | interview | result
  const [candidateName, setCandidateName] = useState('Candidate');
  const [questions, setQuestions] = useState([]);
  const [qIndex, setQIndex] = useState(0);
  const [history, setHistory] = useState([]);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [statusMsg, setStatusMsg] = useState('Initializing interview...');
  const [micLevel, setMicLevel] = useState(0);

  const recogRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const finalTranscriptRef = useRef('');
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const listeningRef = useRef(false);
  const historyRef = useRef([]);
  const questionsRef = useRef([]);
  const qIndexRef = useRef(0);

  // Sync refs
  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => { questionsRef.current = questions; }, [questions]);
  useEffect(() => { qIndexRef.current = qIndex; }, [qIndex]);
  useEffect(() => { listeningRef.current = isListening; }, [isListening]);

  // Boot
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const name = params.get('name') || 'Candidate';
    setCandidateName(name);
    bootInterview(name);
    return () => cleanup();
  }, []);

  const cleanup = () => {
    stopRecognition();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (analyserRef.current) analyserRef.current = null;
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop();
    window.speechSynthesis.cancel();
  };

  const bootInterview = async (name) => {
    setStatusMsg('Setting up your interview room...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
      setupAudioViz(stream);
      mediaRecorderRef.current = new MediaRecorder(stream);
      mediaRecorderRef.current.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorderRef.current.start();
    } catch (e) { console.warn('Mic access denied:', e); }

    setupRecognition();
    setStatusMsg('Connecting to AI Interviewer...');
    await fetchNextQuestion(name, []);
  };

  const setupAudioViz = (stream) => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    ctx.createMediaStreamSource(stream).connect(analyser);
    analyserRef.current = analyser;
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      if (!analyserRef.current) return;
      analyser.getByteFrequencyData(buf);
      setMicLevel(buf.reduce((a, b) => a + b, 0) / buf.length);
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const setupRecognition = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = 'en-US';

    r.onresult = (e) => {
      let interim = '';
      let final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      if (final) {
        finalTranscriptRef.current += ' ' + final;
        setLiveTranscript(finalTranscriptRef.current.trim());
        resetSilenceTimer();
      } else if (interim) {
        setLiveTranscript((finalTranscriptRef.current + ' ' + interim).trim());
        resetSilenceTimer();
      }
    };

    r.onerror = (e) => {
      if (e.error === 'no-speech' && listeningRef.current) {
        try { r.start(); } catch (_) {}
      }
    };

    r.onend = () => {
      if (listeningRef.current) { try { r.start(); } catch (_) {} }
    };

    recogRef.current = r;
  };

  const resetSilenceTimer = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      if (listeningRef.current) autoSubmit();
    }, SILENCE_DELAY);
  };

  const autoSubmit = () => {
    const answer = finalTranscriptRef.current.trim();
    if (!answer || isProcessing) return;
    stopListening();
    advanceInterview(answer);
  };

  const stopRecognition = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    try { recogRef.current?.stop(); } catch (_) {}
    listeningRef.current = false;
    setIsListening(false);
  };

  const startListening = () => {
    if (!recogRef.current) return;
    finalTranscriptRef.current = '';
    setLiveTranscript('');
    listeningRef.current = true;
    setIsListening(true);
    try { recogRef.current.start(); } catch (e) {
      if (e.name === 'InvalidStateError') {} else console.warn(e);
    }
  };

  const stopListening = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    listeningRef.current = false;
    setIsListening(false);
    try { recogRef.current?.stop(); } catch (_) {}
  };

  const speak = (text, onDone) => {
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.name.includes('Google UK English Female'))
      || voices.find(v => v.name.includes('Google') && v.lang === 'en-US')
      || voices.find(v => v.lang === 'en-US')
      || voices[0];
    if (preferred) utt.voice = preferred;
    utt.rate = 0.95;
    utt.pitch = 1.05;
    utt.onstart = () => setIsSpeaking(true);
    utt.onend = () => { setIsSpeaking(false); if (onDone) onDone(); };
    utt.onerror = () => { setIsSpeaking(false); if (onDone) onDone(); };
    window.speechSynthesis.speak(utt);
  };

  const fetchNextQuestion = async (name, hist) => {
    setIsProcessing(true);
    setStatusMsg('AI is formulating next question...');
    const fd = new FormData();
    fd.append('jd_text', jdText);
    fd.append('candidate_name', name || candidateName);
    fd.append('matched_skills', '[]');
    fd.append('missing_skills', '[]');
    fd.append('history', JSON.stringify(hist));
    try {
      const res = await fetch('http://localhost:8000/interview/start', { method: 'POST', body: fd });
      const d = await res.json();
      const q = d.question || 'Tell me about yourself.';
      const newQ = [...questionsRef.current, q];
      setQuestions(newQ);
      questionsRef.current = newQ;

      const isDone = q.toLowerCase().includes('concludes our interview') ||
        q.toLowerCase().includes('have a great day') ||
        q.toLowerCase().includes('interview is now complete') ||
        hist.length >= 5;

      setPhase('interview');
      setIsProcessing(false);
      setStatusMsg('');

      speak(q, () => {
        if (isDone) {
          finishInterview(hist.map(h => h.answer), newQ);
        } else {
          startListening();
        }
      });
    } catch (e) {
      console.error(e);
      setIsProcessing(false);
      setStatusMsg('Connection error. Retrying...');
    }
  };

  const advanceInterview = async (answer) => {
    setIsProcessing(true);
    setLiveTranscript('');
    const currentQ = questionsRef.current[qIndexRef.current];
    const newHistory = [...historyRef.current, { question: currentQ, answer }];
    setHistory(newHistory);
    historyRef.current = newHistory;
    const newIdx = qIndexRef.current + 1;
    setQIndex(newIdx);
    qIndexRef.current = newIdx;
    await fetchNextQuestion(candidateName, newHistory);
  };

  const finishInterview = async (answers, allQuestions) => {
    setPhase('loading');
    setStatusMsg('Analyzing your performance...');
    speak("Thank you for your time. I'm now analyzing your responses. Please wait a moment.");
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop();
    const fd = new FormData();
    fd.append('questions', JSON.stringify(allQuestions));
    fd.append('answers', JSON.stringify(answers));
    try {
      const res = await fetch('http://localhost:8000/interview/evaluate', { method: 'POST', body: fd });
      const d = await res.json();
      setResult(d);
      setPhase('result');
    } catch (e) {
      console.error(e);
      setResult({ interview_score: 0, interview_feedback: 'Could not evaluate.', breakdown: {} });
      setPhase('result');
    }
  };

  // ───── RENDER ─────

  if (phase === 'loading') return (
    <div style={{ minHeight: '100vh', background: '#070d1a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.5rem' }}>
      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
        <Loader2 size={56} color="#6366f1" />
      </motion.div>
      <p style={{ color: '#94a3b8', fontSize: '1.1rem', fontWeight: 500 }}>{statusMsg}</p>
    </div>
  );

  if (phase === 'result') return <ResultScreen result={result} name={candidateName} onBack={() => navigate('/')} />;

  const currentQuestion = questions[qIndex] || questions[questions.length - 1] || '';

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #070d1a 0%, #0f172a 50%, #1a1040 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', fontFamily: 'Inter, sans-serif' }}>

      {/* Header */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, padding: '1rem 2rem', background: 'rgba(7,13,26,0.8)', backdropFilter: 'blur(12px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.07)', zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 8px #ef4444', animation: 'pulse 1s infinite' }} />
          <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '0.85rem', letterSpacing: '0.1em' }}>LIVE INTERVIEW</span>
        </div>
        <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Question {Math.min(qIndex + 1, 6)} of 6 • {candidateName}</span>
        <div style={{ width: 120, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 99, overflow: 'hidden' }}>
          <motion.div animate={{ width: `${(Math.min(qIndex + 1, 6) / 6) * 100}%` }} style={{ height: '100%', background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }} />
        </div>
      </div>

      {/* AI Avatar */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem', width: '100%', maxWidth: 800, marginTop: '5rem' }}>
        <div style={{ position: 'relative' }}>
          <motion.div
            animate={isSpeaking ? { scale: [1, 1.04, 1] } : { scale: 1 }}
            transition={{ repeat: Infinity, duration: 1.2 }}
            style={{ width: 160, height: 160, borderRadius: '50%', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', padding: 4, boxShadow: isSpeaking ? '0 0 40px rgba(99,102,241,0.7)' : '0 0 20px rgba(99,102,241,0.3)' }}
          >
            <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', border: '3px solid #0f172a' }}>
              <img src="/avatar.png" alt="AI Interviewer Alex" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.style.background = 'linear-gradient(135deg, #4f46e5, #7c3aed)'; }} />
            </div>
          </motion.div>
          {/* Speaking wave rings */}
          {isSpeaking && [1, 2, 3].map(i => (
            <motion.div key={i} animate={{ scale: [1, 1.5 + i * 0.3], opacity: [0.5, 0] }} transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.3 }}
              style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid #6366f1' }} />
          ))}
          <div style={{ position: 'absolute', bottom: 8, right: 8, background: isSpeaking ? '#22c55e' : '#3b82f6', width: 18, height: 18, borderRadius: '50%', border: '2px solid #0f172a', boxShadow: `0 0 8px ${isSpeaking ? '#22c55e' : '#3b82f6'}` }} />
        </div>
        <p style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {isSpeaking ? '🎙️ Alex is speaking...' : isListening ? '👂 Listening...' : isProcessing ? '🧠 Thinking...' : 'Alex — AI Interviewer'}
        </p>

        {/* Question Bubble */}
        <AnimatePresence mode="wait">
          {currentQuestion && (
            <motion.div key={qIndex} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.4 }}
              style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '1.5rem 2rem', textAlign: 'center', maxWidth: 680 }}>
              <p style={{ color: '#e2e8f0', fontSize: '1.15rem', lineHeight: 1.7, margin: 0 }}>{currentQuestion}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Transcript / Manual Input Box */}
        <div style={{ width: '100%', maxWidth: 680, background: 'rgba(99,102,241,0.06)', border: `1px solid ${isListening ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 16, padding: '0.5rem 1rem', transition: 'border-color 0.3s' }}>
          <textarea
            value={liveTranscript}
            onChange={(e) => {
              setLiveTranscript(e.target.value);
              finalTranscriptRef.current = e.target.value;
            }}
            placeholder={isListening ? 'Listening... Speak your answer (or type here).' : isSpeaking ? 'Listen to the question...' : 'Type your answer here or click Start Speaking...'}
            disabled={isSpeaking}
            style={{ width: '100%', minHeight: 80, background: 'transparent', border: 'none', color: '#c7d2fe', fontSize: '1rem', lineHeight: 1.6, resize: 'none', outline: 'none', fontFamily: 'inherit' }}
          />
        </div>

        {/* Audio Bars */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 40 }}>
          {[...Array(18)].map((_, i) => {
            const h = isListening ? Math.max(4, (micLevel / 255) * 36 + Math.sin(Date.now() / 100 + i) * 4) : isSpeaking ? Math.abs(Math.sin(Date.now() / 200 + i * 0.5)) * 28 + 4 : 4;
            return (
              <motion.div key={i} animate={{ height: h }} transition={{ duration: 0.05 }}
                style={{ width: 4, borderRadius: 99, background: isListening ? `hsl(${220 + i * 3}, 80%, 65%)` : '#4f46e5', opacity: isListening || isSpeaking ? 1 : 0.3 }} />
            );
          })}
        </div>

        {/* Manual controls (backup) */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {!isSpeaking && (
            <button onClick={isListening ? () => { autoSubmit(); } : startListening}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', borderRadius: 99, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem', background: isListening ? '#ef4444' : '#6366f1', color: 'white', boxShadow: isListening ? '0 0 20px rgba(239,68,68,0.4)' : '0 0 20px rgba(99,102,241,0.4)', transition: 'all 0.2s' }}>
              {isListening ? <><MicOff size={16} /> Submit Answer</> : <><Mic size={16} /> Start Speaking</>}
            </button>
          )}
          {liveTranscript && !isListening && !isSpeaking && (
            <button onClick={() => advanceInterview(liveTranscript)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', borderRadius: 99, border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem', background: 'transparent', color: '#94a3b8' }}>
              Submit <ChevronRight size={16} />
            </button>
          )}
        </div>
        <p style={{ color: '#334155', fontSize: '0.75rem' }}>Mic auto-submits after {SILENCE_DELAY / 1000}s of silence</p>
      </div>
    </div>
  );
}

function ScoreRing({ value, label, color }) {
  const r = 36, circ = 2 * Math.PI * r;
  const dash = (value / 100) * circ;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
      <svg width={90} height={90} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={45} cy={45} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={7} />
        <motion.circle cx={45} cy={45} r={r} fill="none" stroke={color} strokeWidth={7}
          strokeLinecap="round" strokeDasharray={circ} initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - dash }} transition={{ duration: 1.5, ease: 'easeOut' }} />
        <text x={45} y={50} textAnchor="middle" fill="white" fontSize={15} fontWeight={800} style={{ transform: 'rotate(90deg)', transformOrigin: '45px 45px' }}>{value}</text>
      </svg>
      <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
    </div>
  );
}

function ResultScreen({ result, name, onBack }) {
  const bd = result?.breakdown || {};
  const metrics = [
    { label: 'Communication', key: 'communication', color: '#6366f1' },
    { label: 'Vocabulary', key: 'vocabulary', color: '#8b5cf6' },
    { label: 'Confidence', key: 'confidence', color: '#06b6d4' },
    { label: 'Domain Knowledge', key: 'domain_knowledge', color: '#10b981' },
  ];
  const overall = result?.interview_score || 0;
  const tier = overall >= 80 ? { label: 'Excellent', color: '#10b981' } : overall >= 60 ? { label: 'Good', color: '#6366f1' } : { label: 'Needs Improvement', color: '#f59e0b' };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #070d1a, #0f172a)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', fontFamily: 'Inter, sans-serif' }}>
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
        style={{ width: '100%', maxWidth: 720, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 28, padding: '3rem', backdropFilter: 'blur(20px)' }}>

        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <CheckCircle2 size={52} color="#10b981" style={{ marginBottom: '1rem' }} />
          <h1 style={{ color: 'white', fontSize: '2.2rem', fontWeight: 900, margin: 0 }}>Interview Complete</h1>
          <p style={{ color: '#64748b', marginTop: '0.5rem' }}>Well done, {name}! Here's your detailed performance report.</p>
        </div>

        {/* Overall Score */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2rem', marginBottom: '2.5rem', padding: '1.5rem', background: 'rgba(99,102,241,0.08)', borderRadius: 20, border: '1px solid rgba(99,102,241,0.2)' }}>
          <div style={{ textAlign: 'center' }}>
            <motion.p initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3, type: 'spring' }}
              style={{ fontSize: '4.5rem', fontWeight: 900, color: 'white', margin: 0, lineHeight: 1 }}>{overall}<span style={{ fontSize: '2rem', color: '#6366f1' }}>%</span></motion.p>
            <p style={{ color: '#64748b', margin: 0, fontSize: '0.85rem', marginTop: '0.25rem' }}>Overall Score</p>
          </div>
          <div style={{ width: 1, height: 60, background: 'rgba(255,255,255,0.1)' }} />
          <div>
            <span style={{ background: `${tier.color}22`, color: tier.color, border: `1px solid ${tier.color}55`, padding: '0.4rem 1rem', borderRadius: 99, fontWeight: 700, fontSize: '0.9rem' }}>{tier.label}</span>
          </div>
        </div>

        {/* 4-Metric Breakdown */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
          {metrics.map(m => <ScoreRing key={m.key} value={bd[m.key] || 0} label={m.label} color={m.color} />)}
        </div>

        {/* Feedback */}
        {result?.interview_feedback && (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '1.5rem', marginBottom: '2rem' }}>
            <p style={{ color: '#94a3b8', margin: 0, lineHeight: 1.7, fontSize: '0.9rem', whiteSpace: 'pre-line' }}>{result.interview_feedback}</p>
          </div>
        )}

        <button onClick={onBack} style={{ width: '100%', padding: '1rem', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 14, background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontWeight: 600, fontSize: '1rem' }}>← Back to Dashboard</button>
      </motion.div>
    </div>
  );
}
