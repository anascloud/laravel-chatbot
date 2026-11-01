const chatHistory = [];
const CHAT_ENDPOINT = window.CHAT_ENDPOINT || '/api/chat';
const FIRST_TOKEN_TIMEOUT = 30000;
const TOTAL_TIMEOUT = 120000;

function chatToggle() {
    document.getElementById('chat-box').classList.toggle('chat-hidden');
}

function chatQuickSend(msg) {
    const input = document.getElementById('chat-input');
    input.value = msg;
    chatSend();
    const suggestions = document.getElementById('chat-suggestions');
    if (suggestions) suggestions.style.display = 'none';
}

class ChatError extends Error {}

async function chatSend() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    if (!message) return;
    input.value = '';

    const suggestions = document.getElementById('chat-suggestions');
    if (suggestions) suggestions.style.display = 'none';

    appendMsg('user', message);

    const botEl = appendMsg('bot', '', true);
    const state = {
        message,
        raw: '',
        full: '',
        receivedToken: false,
        errored: false,
        done: false,
    };

    showTyping(botEl, 'Thinking');

    const controller = new AbortController();
    let timedOut = false;
    let firstTokenTimer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, FIRST_TOKEN_TIMEOUT);
    const totalTimer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, TOTAL_TIMEOUT);

    const csrfMeta = document.querySelector('meta[name="csrf-token"]');

    try {
        const res = await fetch(CHAT_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream',
                ...(csrfMeta ? { 'X-CSRF-TOKEN': csrfMeta.content } : {}),
            },
            body: JSON.stringify({ message, history: chatHistory }),
            signal: controller.signal,
        });

        console.log("res", res);

        if (!res.ok) {
            const detail = await readErrorBody(res);

            // Log the exact server error to the browser console for debugging
            console.error("Raw Server Response:", detail);

            throw new ChatError(
                `HTTP ${res.status} ${res.statusText || ''}`.trim() +
                (detail ? `: ${detail}` : '')
            );
        }

        if (!res.body) {
            throw new ChatError('This browser does not support streaming responses.');
        }

        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (!contentType.includes('text/event-stream')) {
            const text = await res.text();
            throw new ChatError(
                `Unexpected response (${contentType || 'unknown type'}): ${truncate(text, 300)}`
            );
        }

        await consumeStream(res.body, botEl, state, () => {
            clearTimeout(firstTokenTimer);
        });
    } catch (err) {
        if (err && err.name === 'AbortError') {
            if (timedOut) {
                renderError(botEl, state, state.receivedToken
                    ? 'The response took too long and was stopped. Please try again.'
                    : 'No response from the assistant within 30 seconds. Please try again.');
            } else {
                renderError(botEl, state, 'The request was cancelled.');
            }
        } else if (err instanceof ChatError) {
            renderError(botEl, state, err.message);
        } else if (err instanceof TypeError) {
            renderError(botEl, state, 'Network error: could not reach the server. Check your connection and try again.');
        } else {
            renderError(botEl, state, 'Unexpected error: ' + (err && err.message ? err.message : String(err)));
        }
    } finally {
        clearTimeout(firstTokenTimer);
        clearTimeout(totalTimer);
    }
}

async function consumeStream(body, botEl, state, onFirstToken) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            buffer = buffer.replace(/\r\n?/g, '\n');

            let sep;
            while ((sep = buffer.indexOf('\n\n')) !== -1) {
                const rawEvent = buffer.slice(0, sep);
                buffer = buffer.slice(sep + 2);
                processEvent(rawEvent, botEl, state, onFirstToken);
            }
        }

        buffer += decoder.decode();
        if (buffer.trim()) {
            processEvent(buffer, botEl, state, onFirstToken);
        }
    } catch (err) {
        if (err && err.name === 'AbortError') throw err;
        throw new ChatError('The connection dropped while receiving the response.');
    } finally {
        try { reader.releaseLock(); } catch (e) { /* ignore */ }
    }

    finalize(botEl, state);
}

function processEvent(rawEvent, botEl, state, onFirstToken) {
    const dataLines = rawEvent
        .split('\n')
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).replace(/^ /, ''));

    if (!dataLines.length) return;

    const payload = dataLines.join('\n').trim();
    if (!payload) return;
    if (payload === '[DONE]') {
        state.done = true;
        return;
    }

    let parsed;
    try {
        parsed = JSON.parse(payload);
    } catch (e) {
        return;
    }

    if (parsed.error) {
        const msg = typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error);

        // 🔴 THIS WILL PRINT THE EXACT BACKEND ERROR IN THE CONSOLE
        console.error("🔴 EXACT BACKEND ERROR:", msg);

        renderError(botEl, state, msg);
        return;
    }

    if (parsed.status) {
        showTyping(botEl, 'Thinking');
        return;
    }

    const token = parsed.token ??
        (parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content);

    if (typeof token === 'string' && token.length) {
        state.raw += token;
        const visible = stripTrace(state.raw);

        if (!visible) return;

        if (!state.receivedToken) {
            state.receivedToken = true;
            botEl.classList.remove('bubble-typing');
            botEl.innerHTML = '';
            if (typeof onFirstToken === 'function') onFirstToken();
        }
        state.full = visible;
        renderInto(botEl, visible, true);
        scrollChat();
    }
}

const renderQueue = new WeakMap();

function renderInto(el, text, streaming) {
    const pending = renderQueue.get(el);
    if (pending && pending.frame) {
        pending.text = text;
        pending.streaming = streaming;
        return;
    }

    const job = { text, streaming, frame: null };
    renderQueue.set(el, job);
    job.frame = requestAnimationFrame(() => {
        job.frame = null;
        el.innerHTML = renderMarkdown(job.text) + (job.streaming ? '<span class="md-cursor"></span>' : '');
    });
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function inlineMarkdown(text) {
    let out = escapeHtml(text);
    const codes = [];

    out = out.replace(/`([^`]+)`/g, (m, code) => {
        codes.push(code);
        return `\u0000${codes.length - 1}\u0000`;
    });

    out = out.replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    out = out.replace(/(^|[^\w])_([^_\n]+)_/g, '$1<em>$2</em>');
    out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    return out.replace(/\u0000(\d+)\u0000/g, (m, index) => `<code>${codes[+index]}</code>`);
}

function splitTableRow(row) {
    let value = row.trim();
    if (value.startsWith('|')) value = value.slice(1);
    if (value.endsWith('|')) value = value.slice(0, -1);
    return value.split('|').map((cell) => cell.trim());
}

function parseTable(lines, start) {
    const header = splitTableRow(lines[start]);
    const alignRow = splitTableRow(lines[start + 1]);
    const aligns = alignRow.map((cell) => {
        const left = cell.startsWith(':');
        const right = cell.endsWith(':');
        if (left && right) return 'center';
        if (right) return 'right';
        return 'left';
    });

    let index = start + 2;
    const rows = [];
    while (index < lines.length && lines[index].trim() && lines[index].includes('|')) {
        rows.push(splitTableRow(lines[index]));
        index++;
    }

    let html = '<div class="md-table-wrap"><table class="md-table"><thead><tr>';
    header.forEach((cell, i) => {
        html += `<th style="text-align:${aligns[i] || 'left'}">${inlineMarkdown(cell)}</th>`;
    });
    html += '</tr></thead><tbody>';
    rows.forEach((row) => {
        html += '<tr>';
        header.forEach((cell, i) => {
            html += `<td style="text-align:${aligns[i] || 'left'}">${inlineMarkdown(row[i] || '')}</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table></div>';

    return { html, next: index };
}

function isTableSeparator(line) {
    return /\|/.test(line) && /^[\s|:-]+$/.test(line) && line.includes('-');
}

function renderMarkdown(source) {
    const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
    let html = '';
    let index = 0;
    let paragraph = [];

    const flushParagraph = () => {
        if (!paragraph.length) return;
        html += `<p>${inlineMarkdown(paragraph.join(' '))}</p>`;
        paragraph = [];
    };

    while (index < lines.length) {
        const line = lines[index];
        const trimmed = line.trim();

        if (!trimmed) {
            flushParagraph();
            index++;
            continue;
        }

        if (/^```/.test(trimmed)) {
            flushParagraph();
            const language = trimmed.slice(3).trim();
            const code = [];
            index++;
            while (index < lines.length && !/^```/.test(lines[index].trim())) {
                code.push(lines[index]);
                index++;
            }
            index++;
            html += `<pre class="md-code"${language ? ` data-lang="${escapeHtml(language)}"` : ''}><code>${escapeHtml(code.join('\n'))}</code></pre>`;
            continue;
        }

        const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
        if (heading) {
            flushParagraph();
            const level = Math.min(heading[1].length + 2, 6);
            html += `<h${level} class="md-h">${inlineMarkdown(heading[2])}</h${level}>`;
            index++;
            continue;
        }

        if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
            flushParagraph();
            html += '<hr class="md-hr">';
            index++;
            continue;
        }

        if (trimmed.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1].trim())) {
            flushParagraph();
            const table = parseTable(lines, index);
            html += table.html;
            index = table.next;
            continue;
        }

        if (/^>\s?/.test(trimmed)) {
            flushParagraph();
            const quote = [];
            while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
                quote.push(lines[index].trim().replace(/^>\s?/, ''));
                index++;
            }
            html += `<blockquote class="md-quote">${renderMarkdown(quote.join('\n'))}</blockquote>`;
            continue;
        }

        if (/^[-*+]\s+/.test(trimmed)) {
            flushParagraph();
            const items = [];
            while (index < lines.length && /^[-*+]\s+/.test(lines[index].trim())) {
                items.push(lines[index].trim().replace(/^[-*+]\s+/, ''));
                index++;
            }
            html += `<ul class="md-list">${items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join('')}</ul>`;
            continue;
        }

        if (/^\d+[.)]\s+/.test(trimmed)) {
            flushParagraph();
            const items = [];
            while (index < lines.length && /^\d+[.)]\s+/.test(lines[index].trim())) {
                items.push(lines[index].trim().replace(/^\d+[.)]\s+/, ''));
                index++;
            }
            html += `<ol class="md-list">${items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join('')}</ol>`;
            continue;
        }

        paragraph.push(trimmed);
        index++;
    }

    flushParagraph();
    return html;
}

function stripTrace(text) {
    return String(text || '')
        .replace(/\[TRACE\b[^\]]*\]?/gi, '')
        .replace(/^\s*\[[^\]]*$/, '')
        .replace(/^\s+/, '');
}

function finalize(botEl, state) {
    if (state.errored) return;

    botEl.classList.remove('bubble-typing');

    if (!state.full) {
        renderError(botEl, state, 'The assistant returned an empty response. Please try again.');
        return;
    }

    renderInto(botEl, state.full, false);
    scrollChat();

    chatHistory.push({ role: 'user', text: state.message });
    chatHistory.push({ role: 'assistant', text: state.full });
    if (chatHistory.length > 20) chatHistory.splice(0, 2);
}

function showTyping(botEl, label) {
    botEl.classList.add('bubble-typing');
    botEl.innerHTML =
        `<span class="typing-label">${label || 'Thinking'}</span>` +
        `<span class="typing-dots"><span></span><span></span><span></span></span>`;
    scrollChat();
}

function renderError(botEl, state, message) {
    state.errored = true;
    botEl.classList.remove('bubble-typing');
    botEl.classList.add('bubble-error');

    botEl.innerHTML = '⚠ ' + escapeHtml(message);
    scrollChat();
}

async function readErrorBody(res) {
    try {
        const text = await res.text();
        if (!text) return '';
        try {
            const json = JSON.parse(text);
            if (json.message) return truncate(json.message, 300);
            if (json.error) {
                return truncate(typeof json.error === 'string' ? json.error : JSON.stringify(json.error), 300);
            }
        } catch (e) { /* not JSON */ }
        return truncate(text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(), 300);
    } catch (e) {
        return '';
    }
}

function truncate(text, max) {
    const value = String(text || '');
    return value.length > max ? value.slice(0, max) + '…' : value;
}

function appendMsg(type, text, returnEl = false) {
    const msgs = document.getElementById('chat-messages');

    if (type === 'user') {
        const wrap = document.createElement('div');
        wrap.className = 'msg-user';
        const bubble = document.createElement('div');
        bubble.className = 'bubble-user';
        bubble.textContent = text;
        wrap.appendChild(bubble);
        msgs.appendChild(wrap);
        scrollChat();
        return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'msg-bot';
    wrap.innerHTML = `<div class="bot-avatar"><i class="fas fa-user"></i></div>
                      <div class="bubble-bot"></div>`;
    msgs.appendChild(wrap);
    scrollChat();

    const bubble = wrap.querySelector('.bubble-bot');
    bubble.textContent = text;
    return returnEl ? bubble : null;
}

function scrollChat() {
    const msgs = document.getElementById('chat-messages');
    msgs.scrollTop = msgs.scrollHeight;
}
