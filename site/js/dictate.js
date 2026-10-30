const MIC = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>`;

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

function writeAt(control, prefix, suffix, spoken) {
  const next = clip(control, glue(glue(prefix, spoken), suffix));
  const caretAt = glue(glue(prefix, spoken), '').length;
  control.value = next;
  const pos = Math.min(caretAt, next.length);
  try {
    control.setSelectionRange(pos, pos);
  } catch {
    // Some input types refuse a selection range.
  }
  control.dispatchEvent(new Event('input', { bubbles: true }));
}

function transcriptFrom(event) {
  let text = '';
  const list = event?.results;
  if (!list) return '';
  for (let i = 0; i < list.length; i += 1) {
    const piece = list[i]?.[0]?.transcript || '';
    text = glue(text, piece.trim());
  }
  return text.trim();
}

/**
 * Mic control for one text field. Returns null when this browser has no
 * Speech Recognition API; the field then carries a keyboard-mic tooltip.
 */
export function attachDictation(control) {
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

  const start = () => {
    showStatus('');
    if (activeStop && activeStop !== stop) activeStop();
    if (!recognition) {
      recognition = new Ctor();
      recognition.lang = 'en-US';
      recognition.interimResults = true;
      try {
        recognition.continuous = true;
      } catch {
        // Some engines reject continuous.
      }
      recognition.onresult = (event) => {
        if (!listening) return;
        const spoken = transcriptFrom(event);
        if (!spoken) return;
        writeAt(control, prefix, suffix, spoken);
      };
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
    }
    try {
      listening = true;
      activeStop = stop;
      paint();
      recognition.start();
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

  return { button, status };
}
