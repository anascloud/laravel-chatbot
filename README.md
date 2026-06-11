# Laravel Chatbot

An AI-powered chatbot for Laravel using the Groq API.

## Installation

You can install the package via composer:

```bash
composer require md-anisur-rahaman/laravel-chatbot
```

## Configuration

Publish the configuration file:

```bash
php artisan vendor:publish --tag="chatbot-config"
```

Add your Groq API key to your `.env` file:

```env
GROQ_API_KEY=your_groq_api_key_here
```

## Usage

### Frontend Widget

The package provides a ready-to-use frontend widget. You can include it in your layout file:

```blade
{{-- In your layout file (e.g., app.blade.php) --}}
@include('chatbot::chat-widget')

{{-- Include the assets --}}
<link rel="stylesheet" href="{{ asset('vendor/chatbot/css/chat-widget.css') }}">
<script src="{{ asset('vendor/chatbot/js/chat-widget.js') }}" defer></script>
```

Make sure you have FontAwesome included for the icons.

### Customization

You can customize the system message, model, and other settings in the `config/chatbot.php` file.

## License

The MIT License (MIT). Please see [License File](LICENSE.md) for more information.
