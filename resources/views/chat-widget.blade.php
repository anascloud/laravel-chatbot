{{-- resources/views/chat-widget.blade.php --}}
<div id="chat-launcher" onclick="chatToggle()">
    <i class="fas fa-headset" id="chat-icon"></i>
</div>

<div id="chat-box" class="chat-hidden">
    <div class="chat-header">
        <div class="chat-avatar"><i class="fas fa-user"></i></div>
        <div>
            <p class="chat-title">AI Assistant</p>
            <p class="chat-status">● Online</p>
        </div>
        <button class="chat-close" onclick="chatToggle()">
            <i class="fas fa-chevron-down"></i>
        </button>
    </div>

    <div id="chat-messages" class="chat-body">
        <div class="msg-bot">
            <div class="bot-avatar"><i class="fas fa-user"></i></div>
            <div class="bubble-bot">Hi! How can I help you today?</div>
        </div>
    </div>

    <div class="chat-suggestions" id="chat-suggestions">
        <button class="suggestion-btn" onclick="chatQuickSend('Top Universities in Australia')">Top Universities</button>
        <button class="suggestion-btn" onclick="chatQuickSend('Popular Visas in Australia')">Popular Visas</button>
        <button class="suggestion-btn" onclick="chatQuickSend('How to Apply as an International Student')">How to Apply</button>
        <button class="suggestion-btn" onclick="chatQuickSend('Popular Courses and Future Career')">Popular Courses</button>
        <button class="suggestion-btn" onclick="chatQuickSend('PR Pathway Courses')">PR Pathway</button>
        <button class="suggestion-btn" onclick="chatQuickSend('Scholarships and Funding Options')">Scholarships</button>
    </div>

    <div class="chat-footer">
        <input id="chat-input" type="text" placeholder="Type a message…"
               onkeydown="if(event.key==='Enter') chatSend()"/>
        <button onclick="chatSend()"><i class="fas fa-paper-plane"></i></button>
    </div>
</div>
