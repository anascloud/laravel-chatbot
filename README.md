# Laravel Chatbot

Drop-in AI chat widget and Customer Support, powered by Laravel and free Groq API.

## Installation

```bash
composer require anascloud/laravel-chatbot
```

## Setup

**1. Publish config and assets:**
```bash
php artisan vendor:publish --tag="chatbot-config"
php artisan vendor:publish --tag="chatbot-assets"
```

**2. Add your API key to `.env`:**
```env
GROQ_API_KEY=your_groq_api_key_here
```

**3. Add the widget before your closing `</body>` tag:**
```blade
@include('chatbot::chat-widget')

<link rel="stylesheet" href="{{ asset('vendor/chatbot/css/chat-widget.css') }}">
<script src="{{ asset('vendor/chatbot/js/chat-widget.js') }}" defer></script>
```

> FontAwesome must be loaded for icons to render.

## Customization

Adjust the model, system message, and other options in `config/chatbot.php`.

## License

MIT — see [LICENSE.md](LICENSE.md)
