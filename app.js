const $ = (sel) => document.querySelector(sel);

const el = {
  transcript: $('#transcript'),
  empty: $('#empty'),
  input: $('#caller-input'),
  send: $('#send'),
  mic: $('#mic'),
  voiceToggle: $('#voice-toggle'),
  endCall: $('#end-call'),
  clock: $('#clock'),
  callState: $('#call-state'),
  modeBadge: $('#mode-badge'),
  modeText: $('#mode-text'),
  modelsMini: $('#models-mini'),
  intent: $('#intent'),
  escalate: $('#escalate'),
  analysisModel: $('#analysis-model'),
  sentiment: $('#sentiment'),
  urgency: $('#urgency'),
  orderId: $('#order-id'),
  nextAction: $('#next-action'),
  routing: $('#routing'),
  contextCard: $('#context-card'),
  contextList: $('#context-list'),
  contextQuery: $('#context-query'),
  modal: $('#summary-modal'),
  summaryBody: $('#summary-body'),
  summaryMeta: $('#summary-meta'),
  closeSummary: $('#close-summary'),
  copyNote: $('#copy-note'),
  toast: $('#toast'),
};

const state = {
  history: [],
  analysisLog: [],
  busy: false,
  startedAt: null,
  summary: null,
  mode: 'mock',
};

let listening = false;
let voiceOn = true;

/* ------------------------------- utilities ------------------------------- */

function showToast(message) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    el.toast.hidden = true;
  }, 3200);
}

function prettyIntent(value) {
  if (!value) return '—';
  return String(value).replace(/_/g, ' ');
}

/* --------------------------------- voice --------------------------------- */

function pickVoice() {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  return (
    voices.find((v) => /Google US English|Samantha|Jenny|Aria|Zira/i.test(v.name)) ||
    voices.find((v) => String(v.lang).toLowerCase().startsWith('en')) ||
    null
  );
}

function stopSpeaking() {
  window.speechSynthesis?.cancel?.();
}

function speak(text) {
  if (!voiceOn || !('speechSynthesis' in window) || !text) return;
  stopSpeaking();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickVoice();
  if (voice) utterance.voice = voice;
  utterance.rate = 1.02;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

function setupVoiceInput() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    el.mic.disabled = true;
    el.mic.title = 'Voice input needs Chrome or Edge — type instead';
    return;
  }

  const recognition = new Recognition();
  recognition.lang = 'en-US';
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  let finalText = '';

  recognition.onstart = () => {
    listening = true;
    el.mic.classList.add('listening');
    el.callState.textContent = 'Listening — speak as the caller';
  };

  recognition.onresult = (event) => {
    let interim = '';
    finalText = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += transcript;
      else interim += transcript;
    }
    el.input.value = (finalText || interim).trim();
    autoGrow();
    el.send.disabled = state.busy || !el.input.value.trim();
  };

  recognition.onerror = (event) => {
    const messages = {
      'not-allowed': 'Microphone blocked — allow it in the address bar',
      'no-speech': 'No speech detected, try again',
      'audio-capture': 'No microphone found',
      network: 'Speech recognition service unreachable',
    };
    if (event.error !== 'aborted') showToast(messages[event.error] || `Mic error: ${event.error}`);
  };

  recognition.onend = () => {
    listening = false;
    el.mic.classList.remove('listening');
    const spoken = finalText.trim();
    if (spoken && !state.busy) {
      el.input.value = spoken;
      sendTurn(spoken);
    } else if (!state.busy) {
      el.callState.textContent = state.history.length ? 'In call' : 'Ready · waiting for the caller';
    }
  };

  el.mic.addEventListener('click', () => {
    if (state.busy) return;
    if (listening) {
      recognition.stop();
      return;
    }
    finalText = '';
    stopSpeaking();
    try {
      recognition.start();
    } catch {
      showToast('Microphone is already starting');
    }
  });
}

function setBusy(busy) {
  state.busy = busy;
  el.send.disabled = busy || !el.input.value.trim();
  el.endCall.disabled = busy || state.history.length === 0;
  el.callState.textContent = busy ? 'Aria is listening and thinking…' : state.history.length ? 'In call' : 'Ready · waiting for the caller';
}

function setRow(tier, { active = false, speaking = false, ms = null } = {}) {
  const row = el.routing.querySelector(`li[data-tier="${tier}"]`);
  if (!row) return;
  row.classList.toggle('active', active);
  row.classList.toggle('speaking', speaking);
  if (ms !== null) row.querySelector('.ms').textContent = `${ms}ms`;
}

function resetRows() {
  for (const row of el.routing.querySelectorAll('li')) {
    row.classList.remove('active', 'speaking');
  }
}

/* --------------------------------- health -------------------------------- */

async function loadHealth() {
  try {
    const res = await fetch('/health');
    const health = await res.json();
    state.mode = health.mode;
    const mock = health.mode !== 'live';
    el.modeBadge.classList.add(mock ? 'mock' : 'live');
    el.modeText.textContent = health.mode === 'live' ? 'Token Factory · live' : health.mode === 'mock-forced' ? 'Mock mode · forced' : 'Mock mode · no API key';
    el.modelsMini.innerHTML = '';
    for (const [tier, id] of Object.entries(health.models)) {
      const code = document.createElement('code');
      code.textContent = `${tier}: ${String(id).split('/').pop()}`;
      el.modelsMini.append(code);
      const cell = document.getElementById(`m-${tier}`);
      if (cell) cell.textContent = String(id).split('/').pop();
    }
  } catch {
    el.modeBadge.classList.add('error');
    el.modeText.textContent = 'backend unreachable';
  }
}

/* --------------------------------- clock --------------------------------- */

setInterval(() => {
  if (!state.startedAt) return;
  const seconds = Math.floor((Date.now() - state.startedAt) / 1000);
  el.clock.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}, 1000);

/* ------------------------------- transcript ------------------------------ */

function hideEmpty() {
  if (el.empty && el.empty.isConnected) el.empty.remove();
}

function addTurn(role, text = '') {
  hideEmpty();
  const wrap = document.createElement('div');
  wrap.className = `turn ${role}`;
  const label = document.createElement('div');
  label.className = 'role';
  label.textContent = role === 'caller' ? 'Caller' : 'Aria';
  const body = document.createElement('div');
  body.className = 'text';
  body.textContent = text;
  wrap.append(label, body);
  el.transcript.append(wrap);
  el.transcript.scrollTop = el.transcript.scrollHeight;
  return body;
}

function addThinking() {
  hideEmpty();
  const wrap = document.createElement('div');
  wrap.className = 'turn agent thinking-wrap';
  wrap.innerHTML = '<div class="role">Aria</div><div class="thinking"><i></i><i></i><i></i><span>reading the turn</span></div>';
  el.transcript.append(wrap);
  el.transcript.scrollTop = el.transcript.scrollHeight;
  return wrap;
}

/* -------------------------------- analysis ------------------------------- */

function renderAnalysis(analysis, ms) {
  el.intent.textContent = prettyIntent(analysis.intent);
  el.intent.classList.remove('flash');
  void el.intent.offsetWidth;
  el.intent.classList.add('flash');

  el.escalate.hidden = !analysis.escalate;

  const sentiment = analysis.sentiment || 'calm';
  el.sentiment.textContent = sentiment;
  el.sentiment.style.color =
    sentiment === 'angry' ? 'var(--danger)' : sentiment === 'frustrated' ? 'var(--warn)' : 'var(--text)';

  const urgency = Math.max(1, Math.min(5, Number(analysis.urgency) || 1));
  el.urgency.dataset.level = String(urgency);
  [...el.urgency.children].forEach((bar, index) => bar.classList.toggle('on', index < urgency));

  el.orderId.textContent = analysis.order_id || '—';
  el.nextAction.textContent = analysis.next_action || '—';

  el.analysisModel.textContent = 'nano';
  if (ms) setRow('fast', { active: true, ms });
}

function renderContext(event) {
  el.contextCard.hidden = false;
  el.contextQuery.textContent = event.query;
  el.contextList.innerHTML = '';
  for (const item of event.items) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = item.url || '#';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = item.title;
    const snippet = document.createElement('p');
    snippet.textContent = item.snippet;
    li.append(link, snippet);
    el.contextList.append(li);
  }
}

/* ---------------------------------- turns -------------------------------- */

async function sendTurn(rawText) {
  const text = String(rawText || '').trim();
  if (!text || state.busy) return;

  if (!state.startedAt) state.startedAt = Date.now();

  const historyBefore = state.history.map((m) => ({ ...m }));
  stopSpeaking();
  state.history.push({ role: 'caller', text });
  addTurn('caller', text);

  el.input.value = '';
  autoGrow();
  setBusy(true);
  resetRows();

  const thinking = addThinking();
  let agentBody = null;
  let agentText = '';
  let finalized = false;

  const finish = () => {
    if (finalized) return;
    finalized = true;
    if (agentBody) {
      agentBody.textContent = agentText;
    } else {
      thinking.remove();
    }
    state.history.push({ role: 'agent', text: agentText || '(no reply)' });
    setBusy(false);
    speak(agentText);
    el.input.focus();
  };

  try {
    const res = await fetch('/api/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caller: text, history: historyBefore }),
    });
    if (!res.ok || !res.body) throw new Error(`Server returned ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;

        let event;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }

        if (event.type === 'analysis') {
          renderAnalysis(event.data, event.ms);
          state.analysisLog.push(event.data);
        } else if (event.type === 'context') {
          renderContext(event);
        } else if (event.type === 'speaking') {
          setRow('main', { active: true, speaking: true });
          if (!agentBody) {
            thinking.remove();
            agentBody = addTurn('agent', '');
            agentBody.innerHTML = '<span class="caret"></span>';
          }
        } else if (event.type === 'delta') {
          agentText += event.text;
          if (!agentBody) {
            if (thinking.isConnected) thinking.remove();
            agentBody = addTurn('agent', '');
          }
          agentBody.textContent = agentText;
          el.transcript.scrollTop = el.transcript.scrollHeight;
        } else if (event.type === 'done') {
          setRow('main', { active: true, ms: event.ms });
          setRow('fast', { active: true });
          finish();
        } else if (event.type === 'error') {
          showToast(event.message || 'Model call failed');
          el.modeBadge.classList.add('error');
          el.modeText.textContent = 'model error';
        }
      }
    }
    finish();
  } catch (err) {
    showToast(err.message || 'Something went wrong');
    finish();
  }
}

/* -------------------------------- summary -------------------------------- */

function field(label, value, className = '') {
  const wrap = document.createElement('div');
  wrap.className = `field ${className}`;
  const lab = document.createElement('span');
  lab.className = 'label';
  lab.textContent = label;
  const p = document.createElement('p');
  p.textContent = value || '—';
  wrap.append(lab, p);
  return wrap;
}

function pill(text, tone = '') {
  const span = document.createElement('span');
  span.className = `pill ${tone}`.trim();
  span.textContent = text;
  return span;
}

function renderSummary(summary, meta) {
  const body = el.summaryBody;
  body.innerHTML = '';
  state.summary = summary;

  const head = document.createElement('div');
  head.className = 'field';
  const title = document.createElement('p');
  title.style.fontSize = '17px';
  title.style.fontWeight = '600';
  title.style.color = 'var(--text)';
  title.textContent = summary.headline || 'Call record';
  const sub = document.createElement('p');
  sub.style.color = 'var(--muted)';
  sub.textContent = summary.summary || '';
  head.append(title, sub);

  const pills = document.createElement('div');
  pills.className = 'pill-row';
  pills.append(
    pill(summary.sentiment || 'calm'),
    pill(`shift: ${summary.sentiment_shift || 'flat'}`),
    pill(`risk: ${summary.risk || 'low'}`, summary.risk === 'high' ? 'danger' : summary.risk === 'medium' ? 'warn' : 'ok'),
  );

  const twoCol = document.createElement('div');
  twoCol.className = 'grid-2';
  twoCol.append(field('Issue', summary.issue), field('Resolution', summary.resolution));

  body.append(head, pills, twoCol);

  if (Array.isArray(summary.actions) && summary.actions.length) {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const lab = document.createElement('span');
    lab.className = 'label';
    lab.textContent = 'Actions';
    const list = document.createElement('ul');
    list.className = 'actions';
    for (const action of summary.actions) {
      const li = document.createElement('li');
      const owner = document.createElement('em');
      owner.textContent = action.owner || 'agent';
      const text = document.createElement('span');
      text.textContent = action.action || '';
      li.append(owner, text);
      list.append(li);
    }
    wrap.append(lab, list);
    body.append(wrap);
  }

  if (summary.follow_up) body.append(field('Follow-up', summary.follow_up));

  const note = document.createElement('div');
  note.className = 'field';
  const noteLabel = document.createElement('span');
  noteLabel.className = 'label';
  noteLabel.textContent = 'CRM note';
  const noteText = document.createElement('div');
  noteText.className = 'crm-note';
  noteText.textContent = summary.crm_note || summary.summary || '';
  note.append(noteLabel, noteText);
  body.append(note);

  el.summaryMeta.textContent = `${meta.model} · ${meta.ms}ms · ${meta.turns} turns`;
  el.copyNote.disabled = false;
}

async function endCall() {
  if (state.busy || !state.history.length) return;
  setBusy(true);
  el.modal.hidden = false;
  el.summaryBody.innerHTML = '<div class="loading"><i class="spinner"></i> Ultra is writing the record…</div>';
  el.summaryMeta.textContent = '';
  el.copyNote.disabled = true;

  const t0 = Date.now();
  try {
    const res = await fetch('/api/summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history: state.history, analysis: state.analysisLog }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `Server returned ${res.status}`);
    setRow('deep', { active: true, ms: json.ms });
    renderSummary(json.summary, { model: json.model, ms: json.ms, turns: state.history.length });
    el.callState.textContent = 'Call ended · record ready';
    el.endCall.disabled = true;
  } catch (err) {
    el.summaryBody.innerHTML = '';
    const p = document.createElement('p');
    p.style.color = 'var(--danger)';
    p.style.fontSize = '13.5px';
    p.textContent = `Could not generate the record: ${err.message}`;
    el.summaryBody.append(p);
  } finally {
    setBusy(false);
    el.endCall.disabled = true;
  }
}

/* --------------------------------- events -------------------------------- */

function autoGrow() {
  el.input.style.height = 'auto';
  el.input.style.height = `${Math.min(el.input.scrollHeight, 132)}px`;
}

el.input.addEventListener('input', () => {
  autoGrow();
  el.send.disabled = state.busy || !el.input.value.trim();
});

el.input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendTurn(el.input.value);
  }
});

el.send.addEventListener('click', () => sendTurn(el.input.value));
el.endCall.addEventListener('click', endCall);

el.voiceToggle.addEventListener('click', () => {
  voiceOn = !voiceOn;
  el.voiceToggle.setAttribute('aria-pressed', String(voiceOn));
  if (!voiceOn) stopSpeaking();
  showToast(voiceOn ? 'Aria will speak replies aloud' : 'Voice output muted');
});

document.querySelectorAll('.chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    el.input.value = chip.dataset.line;
    el.input.focus();
    autoGrow();
    el.send.disabled = false;
  });
});

el.closeSummary.addEventListener('click', () => {
  el.modal.hidden = true;
});

el.modal.addEventListener('click', (event) => {
  if (event.target === el.modal) el.modal.hidden = true;
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !el.modal.hidden) el.modal.hidden = true;
});

el.copyNote.addEventListener('click', async () => {
  const note = state.summary?.crm_note || state.summary?.summary || '';
  try {
    await navigator.clipboard.writeText(note);
    showToast('CRM note copied');
  } catch {
    showToast('Copy failed — select the note manually');
  }
});

setupVoiceInput();
if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => pickVoice();
}
loadHealth();
autoGrow();
el.input.focus();
