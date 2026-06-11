const chatHistory = [];

function chatToggle() {
    document.getElementById('chat-box').classList.toggle('chat-hidden');
}

function chatQuickSend(msg) {
    const input = document.getElementById('chat-input');
    input.value = msg;
    chatSend();
    // Hide suggestions once a conversation starts
    const suggestions = document.getElementById('chat-suggestions');
    if (suggestions) suggestions.style.display = 'none';
}

function chatSend() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    if (!message) return;
    input.value = '';

    // Hide suggestions if they are still visible
    const suggestions = document.getElementById('chat-suggestions');
    if (suggestions) suggestions.style.display = 'none';

    appendMsg('user', message);

    const botEl = appendMsg('bot', '▌', true);

    fetch('/api/chat', {
        method: 'POST',
        headers: {
            'Content-Type':  'application/json',
            'X-CSRF-TOKEN':  document.querySelector('meta[name="csrf-token"]').content,
            'Accept':        'text/event-stream',
        },
        body: JSON.stringify({ message, history: chatHistory }),
    }).then(res => {
        if (!res.ok) {
            botEl.textContent = 'Error: Server returned ' + res.status;
            return;
        }

        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let full = '';

        function read() {
            reader.read().then(({ done, value }) => {
                if (done) {
                    botEl.textContent = full; // remove trailing cursor
                    // Push to history once complete
                    chatHistory.push({ role: 'user',      text: message });
                    chatHistory.push({ role: 'assistant', text: full    }); // ← 'assistant' for Groq/OpenAI
                    if (chatHistory.length > 20) chatHistory.splice(0, 2);
                    return;
                }

                const chunk = decoder.decode(value, { stream: true });

                // SSE can have multiple data: blocks in one chunk, separated by \n\n
                const lines = chunk.split('\n');
                for (let line of lines) {
                    line = line.trim();
                    if (!line.startsWith('data: ')) continue;

                    const data = line.slice(6).trim();
                    if (!data || data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);

                        if (parsed.error) {
                            botEl.textContent = 'Error: ' + parsed.error;
                            continue;
                        }

                        // Support both our wrapped format and raw OpenAI/Groq format
                        const token = parsed.token || (parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content);
                        
                        if (token) {
                            full += token;
                            botEl.textContent = full + '▌';
                            scrollChat();
                        }
                    } catch (e) {
                        // Skip invalid JSON or partial chunks
                    }
                }

                read();
            });
        }

        read();

    }).catch(() => {
        botEl.textContent = 'Sorry, something went wrong.';
    });
}

function appendMsg(type, text, returnEl = false) {
    const msgs = document.getElementById('chat-messages');

    if (type === 'user') {
        msgs.innerHTML += `<div class="msg-user"><div class="bubble-user">${text}</div></div>`;
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