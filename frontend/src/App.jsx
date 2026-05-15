import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { Upload, Search, Zap, X, Loader2, Mic, MicOff } from 'lucide-react';
import InterviewPortal from './InterviewPortal';

const AIAvatar = ({ isSpeaking }) => (
  <div style={{ position: 'relative', width: 160, height: 160, borderRadius: '50%', background: 'linear-gradient(45deg,#4f46e5,#7c3aed)', padding: 4, boxShadow: isSpeaking ? '0 0 30px rgba(99,102,241,0.7)' : '0 0 15px rgba(99,102,241,0.3)' }}>
    <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', border: '3px solid #0f172a' }}>
      <img src="/avatar.png" alt="AI" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </div>
    {isSpeaking && (
      <div style={{ position: 'absolute', bottom: '-8px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 3 }}>
        {[...Array(5)].map((_, i) => (
          <motion.div key={i} animate={{ height: [6, 18, 6] }} transition={{ repeat: Infinity, duration: 0.5, delay: i * 0.1 }}
            style={{ width: 3, background: 'white', borderRadius: 99 }} />
        ))}
      </div>
    )}
  </div>
);

function Dashboard() {
  const navigate = useNavigate();
  const [jdText, setJdText] = useState('');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null); // candidate obj
  const [questions, setQuestions] = useState([]);
  const [qIdx, setQIdx] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [answer, setAnswer] = useState('');
  const [interviewLoading, setInterviewLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [interviewResult, setInterviewResult] = useState(null);
  const recogRef = useRef(null);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.continuous = true; r.interimResults = true;
    r.onresult = (e) => {
      let t = '';
      for (let i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript;
      setAnswer(t);
    };
    r.onerror = () => setIsListening(false);
    r.onend = () => { if (isListening) try { r.start(); } catch (_) {} };
    recogRef.current = r;
  }, []);

  const speak = (text, cb) => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find(v => v.lang === 'en-US') || voices[0];
    if (v) u.voice = v;
    u.onstart = () => setIsSpeaking(true);
    u.onend = () => { setIsSpeaking(false); if (cb) cb(); };
    window.speechSynthesis.speak(u);
  };

  const toggleMic = () => {
    if (!recogRef.current) return;
    if (!isListening) { try { recogRef.current.start(); setIsListening(true); } catch (_) {} }
    else { try { recogRef.current.stop(); } catch (_) {} setIsListening(false); }
  };

  const handleAnalyze = async () => {
    if (!jdText || files.length === 0) return;
    setLoading(true); setError(null); setResults([]); setScanProgress(0);

    const BATCH_SIZE = 10;
    const totalFiles = files.length;
    let allResults = [];
    let processed = 0;

    for (let i = 0; i < totalFiles; i += BATCH_SIZE) {
      const chunk = files.slice(i, i + BATCH_SIZE);
      const fd = new FormData();
      fd.append('jd_text', jdText);
      chunk.forEach(f => fd.append('files', f));

      try {
        const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        const res = await fetch(`${API_BASE_URL}/analyze`, { method: 'POST', body: fd });
        if (!res.ok) throw new Error('Batch failed');
        const d = await res.json();
        
        allResults = [...allResults, ...d.results].sort((a, b) => b.final_score - a.final_score);
        setResults([...allResults]);
        processed += chunk.length;
        setScanProgress(Math.round((processed / totalFiles) * 100));
      } catch (e) { 
        console.error("Batch error:", e);
        setError(`Failed at resume ${processed + 1}. Continuing...`); 
      }
    }
    setLoading(false);
  };

  const startInterview = async (c) => {
    setModal(c); setInterviewLoading(true); setQuestions([]); setQIdx(0); setAnswers([]); setHistory([]); setInterviewResult(null);
    const fd = new FormData();
    fd.append('jd_text', jdText); fd.append('candidate_name', c.name);
    fd.append('matched_skills', JSON.stringify(c.matched_skills || []));
    fd.append('missing_skills', JSON.stringify(c.missing_skills || []));
    fd.append('resume_text', c.resume_text || ''); fd.append('history', '[]');
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const res = await fetch(`${API_BASE_URL}/interview/start`, { method: 'POST', body: fd });
      const d = await res.json();
      setQuestions([d.question]); speak(d.question);
    } catch (e) { alert(e.message); } finally { setInterviewLoading(false); }
  };

  const submitAnswer = async () => {
    const newAnswers = [...answers, answer];
    const newHistory = [...history, { question: questions[qIdx], answer }];
    setAnswers(newAnswers); setHistory(newHistory); setAnswer('');
    if (isListening) { try { recogRef.current?.stop(); } catch (_) {} setIsListening(false); }

    const isDone = questions[qIdx].toLowerCase().includes('concludes our interview') || newHistory.length >= 5;

    if (isDone) {
      setInterviewLoading(true);
      const fd = new FormData();
      fd.append('questions', JSON.stringify(questions));
      fd.append('answers', JSON.stringify(newAnswers));
      try {
        const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        const res = await fetch(`${API_BASE_URL}/interview/evaluate`, { method: 'POST', body: fd });
        const d = await res.json();
        setInterviewResult(d);
      } catch (e) { alert(e.message); } finally { setInterviewLoading(false); }
      return;
    }

    setInterviewLoading(true);
    const fd = new FormData();
    fd.append('jd_text', jdText); fd.append('candidate_name', modal.name);
    fd.append('matched_skills', JSON.stringify(modal.matched_skills || []));
    fd.append('missing_skills', JSON.stringify(modal.missing_skills || []));
    fd.append('resume_text', modal.resume_text || '');
    fd.append('history', JSON.stringify(newHistory));
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const res = await fetch(`${API_BASE_URL}/interview/start`, { method: 'POST', body: fd });
      const d = await res.json();
      const nq = [...questions, d.question];
      setQuestions(nq); setQIdx(newHistory.length);
      speak(d.question);
    } catch (e) { alert(e.message); } finally { setInterviewLoading(false); }
  };

  const handleInvite = async (c) => {
    const fd = new FormData();
    fd.append('email', c.email || 'candidate@example.com');
    fd.append('candidate_name', c.name);
    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    const res = await fetch(`${API_BASE_URL}/interview/invite`, { method: 'POST', body: fd });
    const d = await res.json();
    alert('Invite link: ' + d.interview_link);
  };

  const scoreColor = (s) => s >= 80 ? '#10b981' : s >= 60 ? '#6366f1' : '#f59e0b';

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#f8fafc,#f1f5f9)', fontFamily: 'Inter,sans-serif' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '3rem 2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <h1 style={{ fontSize: '3rem', fontWeight: 900, background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>AI Hiring Copilot</h1>
          <p style={{ color: '#64748b', marginTop: '0.5rem' }}>Next-generation AI talent acquisition</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.7fr', gap: '1.5rem', marginBottom: '2rem' }}>
          <div style={{ background: 'white', borderRadius: 20, padding: '2rem', boxShadow: '0 4px 24px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#1e293b', marginTop: 0 }}><Search size={18} color="#6366f1" /> Job Description</h3>
            <textarea value={jdText} onChange={e => setJdText(e.target.value)} placeholder="Paste the job description here..." style={{ width: '100%', height: 130, borderRadius: 12, padding: '0.75rem', border: '1px solid #e2e8f0', fontFamily: 'inherit', fontSize: '0.9rem', resize: 'none', boxSizing: 'border-box', marginTop: '0.75rem', outline: 'none' }} />
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#1e293b', marginTop: '1.5rem' }}><Upload size={18} color="#6366f1" /> Upload Resumes</h3>
            <input type="file" multiple accept=".pdf" onChange={e => setFiles(Array.from(e.target.files))} style={{ marginTop: '0.75rem', color: '#64748b' }} />
            <button onClick={handleAnalyze} disabled={loading || !jdText || files.length === 0}
              style={{ width: '100%', marginTop: '1.5rem', padding: '0.9rem', borderRadius: 12, border: 'none', background: loading ? '#e2e8f0' : 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: 'white', fontWeight: 700, fontSize: '1rem', cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite', marginRight: 8 }} />Scanning {scanProgress}%...</> : 'Analyze Candidates'}
            </button>
            {loading && (
              <div style={{ marginTop: '1rem', height: 6, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${scanProgress}%` }} style={{ height: '100%', background: '#6366f1' }} />
              </div>
            )}
          </div>
          <div style={{ background: 'white', borderRadius: 20, padding: '2rem', boxShadow: '0 4px 24px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' }}>
            <Zap size={32} color="#6366f1" />
            <h4 style={{ marginTop: '0.75rem', color: '#1e293b' }}>AI-Powered Ranking</h4>
            <p style={{ color: '#64748b', fontSize: '0.875rem', lineHeight: 1.6 }}>Semantic NLP matching, skill extraction, and qualification scoring — all powered by Gemini AI.</p>
            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {['Semantic Matching', 'Skill Extraction', 'Live AI Interview'].map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b', fontSize: '0.85rem' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />{f}
                </div>
              ))}
            </div>
          </div>
        </div>

        {error && <div style={{ color: '#ef4444', textAlign: 'center', marginBottom: '1rem' }}>{error}</div>}

        <AnimatePresence>
          {results && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <h2 style={{ color: '#1e293b', marginBottom: '1rem' }}>Ranked Candidates ({results.length})</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {results.map((c, i) => (
                  <div key={i} style={{ background: 'white', borderRadius: 16, padding: '1.5rem', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: '0.85rem' }}>{i + 1}</div>
                        <h4 style={{ margin: 0, color: '#1e293b', fontSize: '1.05rem' }}>{c.name}</h4>
                      </div>
                      <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem', marginLeft: 44 }}>{c.explanation}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginLeft: '1rem' }}>
                      <div style={{ textAlign: 'center', padding: '0.5rem 1.2rem', background: `${scoreColor(c.final_score)}18`, borderRadius: 12, border: `1px solid ${scoreColor(c.final_score)}44` }}>
                        <p style={{ margin: 0, fontSize: '1.8rem', fontWeight: 900, color: scoreColor(c.final_score), lineHeight: 1 }}>{c.final_score}%</p>
                        <p style={{ margin: 0, fontSize: '0.7rem', color: '#94a3b8' }}>Match</p>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <button onClick={() => navigate(`/interview?name=${encodeURIComponent(c.name)}`)}
                          style={{ padding: '0.5rem 1rem', borderRadius: 8, border: 'none', background: '#4f46e5', color: 'white', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>Live Interview</button>
                        <button onClick={() => handleInvite(c)}
                          style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', color: '#64748b', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>Email Invite</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* HR Interview Modal */}
      <AnimatePresence>
        {modal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
            <motion.div initial={{ scale: 0.9, y: 30 }} animate={{ scale: 1, y: 0 }}
              style={{ background: '#0f172a', borderRadius: 24, width: '100%', maxWidth: 900, maxHeight: '90vh', overflow: 'auto', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ display: 'flex' }}>
                {/* Left Panel */}
                <div style={{ width: 300, background: '#070d1a', padding: '2.5rem 2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', borderRight: '1px solid rgba(255,255,255,0.07)' }}>
                  <AIAvatar isSpeaking={isSpeaking} />
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ color: '#6366f1', fontWeight: 700, margin: 0, fontSize: '0.85rem' }}>AI INTERVIEWER</p>
                    <p style={{ color: '#94a3b8', margin: '0.25rem 0 0', fontSize: '0.8rem' }}>Alex — Senior Recruiter</p>
                  </div>
                  <button onClick={toggleMic} style={{ padding: '0.75rem 1.5rem', borderRadius: 99, border: 'none', background: isListening ? '#ef4444' : '#4f46e5', color: 'white', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isListening ? <><MicOff size={16} /> Stop</> : <><Mic size={16} /> Speak</>}
                  </button>
                </div>

                {/* Right Panel */}
                <div style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <div>
                      <h3 style={{ color: 'white', margin: 0 }}>HR Interview Panel</h3>
                      <p style={{ color: '#64748b', margin: '0.25rem 0 0', fontSize: '0.85rem' }}>{modal.name}</p>
                    </div>
                    <button onClick={() => { setModal(null); window.speechSynthesis.cancel(); }} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, padding: '0.5rem', cursor: 'pointer', color: 'white' }}><X size={18} /></button>
                  </div>

                  {/* Progress */}
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 99, marginBottom: '2rem', overflow: 'hidden' }}>
                    <motion.div animate={{ width: `${((qIdx + 1) / 6) * 100}%` }} style={{ height: '100%', background: 'linear-gradient(90deg,#6366f1,#8b5cf6)' }} />
                  </div>

                  {!interviewResult ? (
                    <>
                      <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '1.25rem', marginBottom: '1rem', minHeight: 70 }}>
                        <p style={{ color: '#e2e8f0', margin: 0, lineHeight: 1.6, fontSize: '0.95rem' }}>{questions[qIdx] || 'Loading question...'}</p>
                      </div>
                      <textarea value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Type or use mic to answer..."
                        style={{ flex: 1, width: '100%', minHeight: 120, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '1rem', color: 'white', fontFamily: 'inherit', fontSize: '0.9rem', resize: 'none', boxSizing: 'border-box', outline: 'none' }} />
                      <button onClick={submitAnswer} disabled={interviewLoading || !answer.trim()}
                        style={{ marginTop: '1rem', width: '100%', padding: '0.9rem', borderRadius: 12, border: 'none', background: interviewLoading ? '#334155' : '#4f46e5', color: 'white', fontWeight: 700, fontSize: '1rem', cursor: interviewLoading ? 'not-allowed' : 'pointer' }}>
                        {interviewLoading ? 'AI Thinking...' : 'Submit Answer →'}
                      </button>
                    </>
                  ) : (
                    <HRResultView result={interviewResult} onClose={() => setModal(null)} />
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function HRResultView({ result, onClose }) {
  const bd = result?.breakdown || {};
  const metrics = [
    { label: 'Communication', key: 'communication', color: '#6366f1' },
    { label: 'Vocabulary', key: 'vocabulary', color: '#8b5cf6' },
    { label: 'Confidence', key: 'confidence', color: '#06b6d4' },
    { label: 'Domain', key: 'domain_knowledge', color: '#10b981' },
  ];
  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <p style={{ fontSize: '3rem', fontWeight: 900, color: 'white', margin: 0 }}>{result.interview_score || 0}<span style={{ fontSize: '1.5rem', color: '#6366f1' }}>%</span></p>
        <p style={{ color: '#64748b', margin: 0 }}>Overall Score</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {metrics.map(m => (
          <div key={m.key} style={{ textAlign: 'center', background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '1rem', border: `1px solid ${m.color}33` }}>
            <p style={{ fontSize: '1.5rem', fontWeight: 900, color: m.color, margin: 0 }}>{bd[m.key] || 0}</p>
            <p style={{ color: '#64748b', fontSize: '0.7rem', margin: 0, marginTop: 4 }}>{m.label}</p>
          </div>
        ))}
      </div>
      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '1rem', marginBottom: '1.5rem' }}>
        <p style={{ color: '#94a3b8', margin: 0, fontSize: '0.85rem', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{result.interview_feedback}</p>
      </div>
      <button onClick={onClose} style={{ width: '100%', padding: '0.8rem', borderRadius: 12, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontWeight: 600 }}>Close</button>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/interview" element={<InterviewPortal />} />
    </Routes>
  );
}
