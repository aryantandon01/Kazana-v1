'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import { useAuth } from '@/context/AuthContext';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Alert from '@/components/Alert';
import Loading from '@/components/Loading';
import PageHeader from '@/components/PageHeader';
import Toast from '@/components/Toast';

const QUICK_ACTIONS = [
  { action: 'general_review', label: 'General Review' },
  { action: 'ats_review', label: 'ATS Check' },
  { action: 'rewrite_bullets', label: 'Improve Bullets' },
  { action: 'rewrite_summary', label: 'Rewrite Summary' },
];

export default function ResumeCopilot() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [session, setSession] = useState(null);
  const [resume, setResume] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [quality, setQuality] = useState(null);
  const [messages, setMessages] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [pendingSuggestions, setPendingSuggestions] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showJobPicker, setShowJobPicker] = useState(false);
  const [jobQuery, setJobQuery] = useState('');
  const [jobResults, setJobResults] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [showParsed, setShowParsed] = useState(false);
  const messagesEndRef = useRef(null);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiFetch(`/api/resumes/${id}/copilot`);
      setSession(data.session);
      setResume(data.resume);
      setParsed(data.parsed);
      setQuality(data.quality);
      setMessages(data.session?.messages || []);
      setPendingSuggestions(data.pending_suggestions || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!user) {
      router.replace('/login');
      return;
    }
    loadInitial();
  }, [user, router, loadInitial]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingSuggestions]);

  const handleSend = async (messageText, action = 'general_review', jobId = null) => {
    if (!messageText.trim()) return;
    setSending(true);
    setError(null);
    try {
      const { data } = await apiFetch(`/api/resumes/${id}/copilot`, {
        method: 'POST',
        body: JSON.stringify({ message: messageText, action, jobId }),
      });
      setMessages(data.session?.messages || []);
      setSuggestions(data.suggestions || []);
      setPendingSuggestions((prev) => [...(data.suggestions || []), ...prev]);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const handleQuickAction = (action) => {
    const label = QUICK_ACTIONS.find((q) => q.action === action)?.label || action;
    handleSend(`Please run: ${label}`, action);
  };

  const handleJobSearch = async (q) => {
    setJobQuery(q);
    if (!q.trim()) {
      setJobResults([]);
      return;
    }
    try {
      const params = new URLSearchParams({ q, limit: '8' });
      const { data } = await apiFetch(`/api/jobs?${params.toString()}`);
      setJobResults(data || []);
    } catch {
      setJobResults([]);
    }
  };

  const handleOptimizeForJob = async (job) => {
    setShowJobPicker(false);
    setJobQuery('');
    setJobResults([]);
    await handleSend(`Optimize for: ${job.company_name} — ${job.title}`, 'optimize_for_job', job.id);
  };

  const handleSuggestionAction = async (suggestion, status, editedText = null) => {
    try {
      const body = { status };
      if (status === 'edited' && editedText != null) body.editedText = editedText;
      const { data } = await apiFetch(`/api/resumes/${id}/copilot/suggestions/${suggestion.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      setPendingSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
      setToast({ message: `Suggestion ${status}`, variant: status === 'accepted' ? 'success' : status === 'rejected' ? 'info' : 'success' });
      if (data.parsed) setParsed(data.parsed);
    } catch (err) {
      setToast({ message: err.message, variant: 'error' });
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const { data } = await apiFetch(`/api/resumes/${id}/copilot/export`, {
        method: 'POST',
        body: JSON.stringify({ template: 'clean' }),
      });
      setToast({ message: 'Export generated', variant: 'success' });
      window.open(data.downloadUrl, '_blank');
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  };

  if (loading || !user) return <Loading message="Loading Resume Copilot..." />;

  return (
    <div className="container" style={{ paddingTop: 'var(--spacing-xl)', paddingBottom: 'var(--spacing-xl)', maxWidth: 'var(--container-md)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)' }}>
        <div>
          <button type="button" onClick={() => router.push('/resume-manager')} style={backLinkStyle}>
            ← Back to My Resumes
          </button>
          <h1 style={{ margin: 'var(--spacing-xs) 0 0' }}>Resume Copilot ✨</h1>
          <p style={{ margin: 'var(--spacing-xs) 0 0', fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>
            {resume?.name || 'Resume'} — an AI resume coach, not a builder.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
          <Button variant="ghost" onClick={() => setShowParsed((v) => !v)}>
            {showParsed ? 'Hide resume' : 'View parsed resume'}
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export'}
          </Button>
        </div>
      </div>

      {error && <Alert variant="error" style={{ marginBottom: 'var(--spacing-lg)' }}>{error}</Alert>}

      {/* Parsed resume panel — the structured source of truth */}
      {showParsed && parsed && <ParsedResumePanel parsed={parsed} />}

      {/* Chat container */}
      <Card style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: '520px' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--spacing-xl)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
          {/* Initial analysis card (proactive) */}
          {quality && (
            <div style={aiBubbleStyle}>
              <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: 'var(--line-height-normal)' }}>
                Overall quality: <strong>{Math.round(quality.overallScore * 100)}%</strong> · ATS:{' '}
                <strong>{Math.round((quality.dimensionScores?.ats_compatibility || 0) * 100)}%</strong>
              </p>
              {quality.strengths?.length > 0 && (
                <div style={{ marginTop: 'var(--spacing-sm)' }}>
                  <strong style={{ fontSize: 'var(--font-size-sm)' }}>Strengths:</strong>
                  <ul style={{ margin: 'var(--spacing-xs) 0 0 var(--spacing-lg)', fontSize: 'var(--font-size-sm)' }}>
                    {quality.strengths.slice(0, 3).map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              )}
              {quality.weaknesses?.length > 0 && (
                <div style={{ marginTop: 'var(--spacing-sm)' }}>
                  <strong style={{ fontSize: 'var(--font-size-sm)' }}>Improve:</strong>
                  <ul style={{ margin: 'var(--spacing-xs) 0 0 var(--spacing-lg)', fontSize: 'var(--font-size-sm)' }}>
                    {quality.weaknesses.slice(0, 3).map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Chat messages */}
          {messages.map((msg, idx) => (
            <div key={idx} style={msg.role === 'user' ? userBubbleStyle : aiBubbleStyle}>
              {typeof msg.content === 'string' ? (
                <p style={{ margin: 0, fontSize: 'var(--font-size-base)', lineHeight: 'var(--line-height-normal)' }}>{msg.content}</p>
              ) : (
                <div style={{ fontSize: 'var(--font-size-base)' }}>
                  <p style={{ margin: 0, lineHeight: 'var(--line-height-normal)' }}>{msg.content?.summary || ''}</p>
                  {msg.content?.strongest && (
                    <p style={{ margin: 'var(--spacing-sm) 0 0', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                      Strongest: {msg.content.strongest}
                    </p>
                  )}
                  {msg.content?.opportunity && (
                    <p style={{ margin: 'var(--spacing-xs) 0 0', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                      Biggest opportunity: {msg.content.opportunity}
                    </p>
                  )}
                  {msg.content?.suggestedNext && (
                    <p style={{ margin: 'var(--spacing-sm) 0 0', fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>
                      {msg.content.suggestedNext}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Pending suggestions */}
        {pendingSuggestions.length > 0 && (
          <div style={{ padding: 'var(--spacing-lg)', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
            <h3 style={{ fontSize: 'var(--font-size-base)', margin: 0, marginBottom: 'var(--spacing-md)' }}>
              Suggestions ({pendingSuggestions.length})
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
              {pendingSuggestions.map((s) => (
                <SuggestionCard key={s.id} suggestion={s} onAction={handleSuggestionAction} />
              ))}
            </div>
          </div>
        )}

        {/* Quick actions */}
        {!showJobPicker && (
          <div style={{ padding: 'var(--spacing-md) var(--spacing-xl)', borderTop: '1px solid var(--border-color)', display: 'flex', gap: 'var(--spacing-sm)', flexWrap: 'wrap' }}>
            {QUICK_ACTIONS.map((q) => (
              <Button key={q.action} variant="outline" size="sm" onClick={() => handleQuickAction(q.action)} disabled={sending}>
                {q.label}
              </Button>
            ))}
            <Button variant="outline" size="sm" onClick={() => setShowJobPicker(true)} disabled={sending}>
              Optimize for a job
            </Button>
          </div>
        )}

        {/* Job picker */}
        {showJobPicker && (
          <div style={{ padding: 'var(--spacing-md) var(--spacing-xl)', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
            <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--spacing-xs)' }}>Search jobs</label>
            <input
              type="search"
              value={jobQuery}
              onChange={(e) => handleJobSearch(e.target.value)}
              placeholder="Type a job title or company…"
              style={inputStyle}
            />
            {jobResults.length > 0 && (
              <div style={{ marginTop: 'var(--spacing-sm)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
                {jobResults.map((job) => (
                  <button key={job.id} type="button" onClick={() => handleOptimizeForJob(job)} style={jobResultStyle}>
                    {job.company_name} — {job.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Input */}
        <div style={{ padding: 'var(--spacing-md) var(--spacing-xl)', borderTop: '1px solid var(--border-color)', display: 'flex', gap: 'var(--spacing-sm)' }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (input.trim() && !sending) {
                  handleSend(input);
                  setInput('');
                }
              }
            }}
            placeholder="Ask anything about your resume…"
            style={inputStyle}
            disabled={sending}
          />
          <Button onClick={() => { handleSend(input); setInput(''); }} disabled={sending || !input.trim()}>
            {sending ? 'Thinking…' : 'Send'}
          </Button>
        </div>
      </Card>

      {toast && (
        <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} />
      )}
    </div>
  );
}

function ParsedResumePanel({ parsed }) {
  const experience = Array.isArray(parsed.experience) ? parsed.experience : [];
  const education = Array.isArray(parsed.education) ? parsed.education : [];
  const skills = Array.isArray(parsed.skills) ? parsed.skills : [];
  const projects = Array.isArray(parsed.projects) ? parsed.projects : [];
  const certifications = Array.isArray(parsed.certifications) ? parsed.certifications : [];
  const links = Array.isArray(parsed.links) ? parsed.links : [];

  return (
    <Card style={{ padding: 'var(--spacing-xl)', marginBottom: 'var(--spacing-lg)' }}>
      <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--spacing-md)' }}>
        Parsed resume data
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginLeft: 'var(--spacing-sm)', fontWeight: 'var(--font-weight-normal)' }}>
          (source of truth — original PDF untouched)
        </span>
      </h2>

      {parsed.name && <p style={{ fontWeight: 'var(--font-weight-bold)', fontSize: 'var(--font-size-md)', margin: '0 0 var(--spacing-xs)' }}>{parsed.name}</p>}
      {parsed.headline && <p style={{ color: 'var(--text-secondary)', margin: '0 0 var(--spacing-md)', fontSize: 'var(--font-size-sm)' }}>{parsed.headline}</p>}
      {parsed.summary && (
        <p style={{ color: 'var(--text-secondary)', lineHeight: 'var(--line-height-normal)', marginBottom: 'var(--spacing-md)', fontSize: 'var(--font-size-sm)' }}>
          {parsed.summary}
        </p>
      )}

      {experience.length > 0 && (
        <div style={{ marginBottom: 'var(--spacing-lg)' }}>
          <h3 style={{ fontSize: 'var(--font-size-base)', marginBottom: 'var(--spacing-sm)' }}>Experience</h3>
          {experience.map((exp, i) => (
            <div key={i} style={{ marginBottom: 'var(--spacing-md)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--spacing-sm)' }}>
                <strong style={{ fontSize: 'var(--font-size-sm)' }}>
                  {exp.title || ''}{exp.company ? ' - ' + exp.company : ''}
                </strong>
                {exp.date_range && <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>{exp.date_range}</span>}
              </div>
              {(exp.bullets || []).length > 0 && (
                <ul style={{ margin: 'var(--spacing-xs) 0 0 var(--spacing-lg)', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                  {exp.bullets.map((b, j) => <li key={j}>{b}</li>)}
                </ul>
              )}
              {(exp.technologies || []).length > 0 && (
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', margin: 'var(--spacing-xs) 0 0' }}>
                  {exp.technologies.join(' | ')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {projects.length > 0 && (
        <div style={{ marginBottom: 'var(--spacing-lg)' }}>
          <h3 style={{ fontSize: 'var(--font-size-base)', marginBottom: 'var(--spacing-sm)' }}>Projects</h3>
          {projects.map((p, i) => (
            <div key={i} style={{ marginBottom: 'var(--spacing-sm)' }}>
              <strong style={{ fontSize: 'var(--font-size-sm)' }}>{p.name}</strong>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', margin: 'var(--spacing-2xs) 0 0' }}>{p.description}</p>
            </div>
          ))}
        </div>
      )}

      {education.length > 0 && (
        <div style={{ marginBottom: 'var(--spacing-lg)' }}>
          <h3 style={{ fontSize: 'var(--font-size-base)', marginBottom: 'var(--spacing-sm)' }}>Education</h3>
          {education.map((ed, i) => (
            <p key={i} style={{ fontSize: 'var(--font-size-sm)', margin: '0 0 var(--spacing-xs)' }}>
              {[ed.degree, ed.school, ed.graduation_year].filter(Boolean).join(' - ')}
            </p>
          ))}
        </div>
      )}

      {skills.length > 0 && (
        <div style={{ marginBottom: 'var(--spacing-lg)' }}>
          <h3 style={{ fontSize: 'var(--font-size-base)', marginBottom: 'var(--spacing-sm)' }}>Skills</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-xs)' }}>
            {skills.map((s, i) => (
              <span key={i} style={skillChipStyle}>{s}</span>
            ))}
          </div>
        </div>
      )}

      {certifications.length > 0 && (
        <div style={{ marginBottom: 'var(--spacing-md)' }}>
          <h3 style={{ fontSize: 'var(--font-size-base)', marginBottom: 'var(--spacing-sm)' }}>Certifications</h3>
          <ul style={{ margin: 0, paddingLeft: 'var(--spacing-lg)', fontSize: 'var(--font-size-sm)' }}>
            {certifications.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      )}

      {links.length > 0 && (
        <div>
          <h3 style={{ fontSize: 'var(--font-size-base)', marginBottom: 'var(--spacing-sm)' }}>Links</h3>
          <ul style={{ margin: 0, paddingLeft: 'var(--spacing-lg)', fontSize: 'var(--font-size-sm)' }}>
            {links.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </div>
      )}
    </Card>
  );
}

const skillChipStyle = {
  fontSize: 'var(--font-size-xs)',
  padding: '4px 10px',
  borderRadius: 'var(--border-radius-full)',
  backgroundColor: 'var(--color-primary-muted)',
  color: 'var(--color-primary)',
};

function SuggestionCard({ suggestion, onAction }) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(suggestion.suggested_text || '');

  const impact = suggestion.estimated_impact || {};

  return (
    <Card style={{ padding: 'var(--spacing-md)', backgroundColor: 'var(--bg-primary)' }}>
      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginBottom: 'var(--spacing-xs)' }}>
        {suggestion.field_path}
      </div>

      {!editing ? (
        <>
          <div style={{ marginBottom: 'var(--spacing-xs)' }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>Current:</span>
            <p style={{ margin: 'var(--spacing-2xs) 0 0', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
              {suggestion.current_text || '(no text)'}
            </p>
          </div>
          <div>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)' }}>Suggested:</span>
            <p style={{ margin: 'var(--spacing-2xs) 0 0', fontSize: 'var(--font-size-sm)' }}>
              {suggestion.suggested_text || '(no text)'}
            </p>
          </div>
          {suggestion.rationale && (
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', margin: 'var(--spacing-sm) 0 0' }}>
              {suggestion.rationale}
            </p>
          )}
          {(impact.ats_compatibility != null || impact.match_relevance != null) && (
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', margin: 'var(--spacing-xs) 0 0' }}>
              Impact: ATS {impact.ats_compatibility != null ? `+${impact.ats_compatibility}%` : '—'} · Match {impact.match_relevance != null ? `+${impact.match_relevance}%` : '—'}
            </p>
          )}
          <div style={{ display: 'flex', gap: 'var(--spacing-sm)', marginTop: 'var(--spacing-md)' }}>
            <Button size="sm" variant="primary" onClick={() => onAction(suggestion, 'accepted')}>
              Accept
            </Button>
            <Button size="sm" variant="outline" onClick={() => onAction(suggestion, 'rejected')}>
              Reject
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Edit
            </Button>
          </div>
        </>
      ) : (
        <>
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={3}
            style={textareaStyle}
          />
          <div style={{ display: 'flex', gap: 'var(--spacing-sm)', marginTop: 'var(--spacing-sm)' }}>
            <Button size="sm" onClick={() => onAction(suggestion, 'edited', editText)}>
              Apply edit
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

const inputStyle = {
  flex: 1,
  minWidth: '100px',
  padding: '10px 14px',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--border-radius-sm)',
  fontSize: 'var(--font-size-base)',
  fontFamily: 'var(--font-family)',
};

const textareaStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: 'var(--spacing-sm) var(--spacing-md)',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--border-radius-sm)',
  fontSize: 'var(--font-size-sm)',
  fontFamily: 'var(--font-family)',
  resize: 'vertical',
};

const backLinkStyle = {
  background: 'none',
  border: 'none',
  color: 'var(--color-primary)',
  cursor: 'pointer',
  fontSize: 'var(--font-size-sm)',
  padding: 0,
  fontFamily: 'var(--font-family)',
};

const aiBubbleStyle = {
  alignSelf: 'flex-start',
  maxWidth: '85%',
  backgroundColor: 'var(--bg-secondary)',
  borderRadius: 'var(--border-radius-lg)',
  borderBottomLeftRadius: 'var(--border-radius-sm)',
  padding: 'var(--spacing-md) var(--spacing-lg)',
};

const userBubbleStyle = {
  alignSelf: 'flex-end',
  maxWidth: '85%',
  backgroundColor: 'var(--color-primary)',
  color: 'var(--text-inverse)',
  borderRadius: 'var(--border-radius-lg)',
  borderBottomRightRadius: 'var(--border-radius-sm)',
  padding: 'var(--spacing-md) var(--spacing-lg)',
};

const jobResultStyle = {
  textAlign: 'left',
  width: '100%',
  padding: '8px 12px',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--border-radius-sm)',
  backgroundColor: 'var(--bg-primary)',
  cursor: 'pointer',
  fontSize: 'var(--font-size-sm)',
  fontFamily: 'var(--font-family)',
};