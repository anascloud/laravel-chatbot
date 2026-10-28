<?php

return [
    'groq_api_key' => env('GROQ_API_KEY'),
    'model' => env('CHATBOT_MODEL', 'openai/gpt-oss-120b'),
    'system_message' => env('CHATBOT_SYSTEM_MESSAGE', 'You are a helpful assistant. Be concise and professional.'),
    'route_prefix' => 'api',
    'throttle' => '30,1',
];
