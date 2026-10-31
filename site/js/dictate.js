const MIC = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>`;

const sessions = new WeakMap();
let activeStop = null;

export function recognitionCtor() {
  return globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;
}

function glue(left, right) {
  if (!left) return right || '';
  if (!right) return left;
  if (/\s$/.test(left) || /^\s/.test(right)) return left + right;
  return `${left} ${right}`;
}

function clip(control, value) {
  const max = control.maxLength;
  if (max > 0 && value.length > max) return value.slice(0, max);
  return value;
}

function caret(control) {
  const value = control.value || '';
  let start = control.selectionStart;
  let end = control.selectionEnd;
  if (document.activeElement !== control || start == null || end == null) {
    start = value.length;
    end = value.length;
  }
  return { prefix: value.slice(0, start), suffix: value.slice(end) };
}

/** A new final that already contains the previous utterance replaces it. */
function extendsPrevious(previous, incoming) {
  if (!previous || !incoming) return false;
  if (incoming === previous) return true;
  if (!incoming.startsWith(previous)) return false;
  const boundary = incoming.charAt(previous.length);
  return boundary === '' || /[\s,.;:!?'")\]]/.test(boundary);
}

function mergePhrase(previous, incoming) {
  const prev = (previous || '').trim();
  const next = (incoming || '').trim();
  if (!next) return prev;
  if (!prev || extendsPrevious(prev, next)) return next;
  if (extendsPrevious(next, prev)) return prev;
  return glue(prev, next);
}

function committedText(finals) {
  let text = '';
  for (const piece of finals) {
    if (piece) text = mergePhrase(text, piece);
  }
  return text;
}

function previewBeyond(committed, interim) {
  const extra = (interim || '').trim();
  if (!extra) return '';
  if (!committed) return extra;
  if (extendsPrevious(committed, extra)) return extra.slice(committed.length).trim();
  if (extendsPrevious(extra, committed) || extra === committed) return '';
  return extra;
}

function writeAt(control, prefix, suffix, spoken) {
  const next = clip(control, glue(glue(prefix, spoken), suffix));
  if (control.value === next) return;
  const caretAt = glue(prefix, spoken).length;
  control.value = next;
  const pos = Math.min(caretAt, next.length);
  try {
    control.setSelectionRange(pos, pos);
  } catch {
    // Some input types refuse a selection range.
  }
  control.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Mic control for one text field. Returns null when this browser has no
 * Speech Recognition API; the field then carries a keyboard-mic tooltip.
 * Calling this again on the same field reuses the same button and recognizer.
 */
export function attachDictation(control) {
  const existing = sessions.get(control);
  if (existing) return existing;

  const Ctor = recognitionCtor();
  if (!Ctor) {
    if (!control.title) control.title = 'Use the microphone on your keyboard.';
    return null;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mic-btn';
  button.dataset.testid = 'dictate';
  button.setAttribute('aria-label', 'Dictate');
  button.setAttribute('aria-pressed', 'false');
  button.innerHTML = MIC;

  const status = document.createElement('p');
  status.className = 'mic-status';
  status.hidden = true;

  let recognition = null;
  let listening = false;
  let prefix = '';
  let suffix = '';
  let finals = [];
  let armed = false;

  const paint = () => {
    button.classList.toggle('is-listening', listening);
    button.setAttribute('aria-pressed', listening ? 'true' : 'false');
  };

  const showStatus = (message) => {
    status.hidden = !message;
    status.textContent = message || '';
    if (message) status.setAttribute('role', 'alert');
    else status.removeAttribute('role');
  };

  const render = (interim) => {
    const committed = committedText(finals);
    const spoken = glue(committed, previewBeyond(committed, interim));
    writeAt(control, prefix, suffix, spoken);
  };

  const applyResult = (event) => {
    if (!listening) return;
    const list = event?.results;
    if (!list) return;
    const start = Number.isInteger(event.resultIndex) ? event.resultIndex : 0;
    let interim = '';
    for (let i = start; i < list.length; i += 1) {
      const result = list[i];
      const transcript = (result?.[0]?.transcript || '').trim();
      if (!transcript) continue;
      if (result.isFinal) {
        finals[i] = mergePhrase(finals[i] || '', transcript);
      } else {
        interim = glue(interim, transcript);
      }
    }
    render(interim);
  };

  const stop = () => {
    listening = false;
    paint();
    if (activeStop === stop) activeStop = null;
    try {
      recognition?.stop();
    } catch {
      // Already stopped.
    }
  };

  const ensureRecognition = () => {
    if (recognition) return recognition;
    recognition = new Ctor();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    // continuous=true on Android Chrome re-sends the whole utterance as a new
    // final. One-shot mode plus the cumulative dedupe below keeps a paragraph once.
    try {
      recognition.continuous = false;
    } catch {
      // Some engines reject the flag.
    }
    recognition.onresult = applyResult;
    recognition.onerror = (event) => {
      listening = false;
      paint();
      if (activeStop === stop) activeStop = null;
      const code = event?.error || '';
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        showStatus('Microphone is blocked. Use the keyboard mic.');
        return;
      }
      if (code === 'aborted' || code === 'no-speech') return;
      showStatus('Couldn’t hear that. Try again.');
    };
    recognition.onend = () => {
      listening = false;
      paint();
      if (activeStop === stop) activeStop = null;
    };
    recognition.onspeechend = () => {
      if (listening) stop();
    };
    return recognition;
  };

  const start = () => {
    showStatus('');
    if (activeStop && activeStop !== stop) activeStop();
    finals = [];
    const engine = ensureRecognition();
    try {
      listening = true;
      activeStop = stop;
      paint();
      engine.start();
    } catch {
      listening = false;
      paint();
      if (activeStop === stop) activeStop = null;
      showStatus('Couldn’t start the microphone.');
    }
  };

  button.addEventListener('pointerdown', () => {
    const spot = caret(control);
    prefix = spot.prefix;
    suffix = spot.suffix;
    armed = true;
  });
  button.addEventListener('click', () => {
    if (!armed) {
      const spot = caret(control);
      prefix = spot.prefix;
      suffix = spot.suffix;
    }
    armed = false;
    if (listening) stop();
    else start();
  });

  const session = { button, status };
  sessions.set(control, session);
  return session;
}
