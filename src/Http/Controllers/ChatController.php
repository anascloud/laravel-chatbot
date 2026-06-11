<?php

namespace anascloud\LaravelChatbot\Http\Controllers;

use GuzzleHttp\Client;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Illuminate\Routing\Controller;

class ChatController extends Controller
{
    public function chat(Request $request): StreamedResponse
    {
        $request->validate([
            'message' => ['required', 'string', 'max:1000'],
            'history' => ['nullable', 'array'],
        ]);

        // Build OpenAI-compatible messages array from history
        $messages = collect($request->history ?? [])
            ->map(fn($t) => [
                'role'    => $t['role'] === 'user' ? 'user' : 'assistant',
                'content' => $t['text'],
            ])
            ->push([
                'role'    => 'user',
                'content' => $request->message,
            ])
            ->values()
            ->toArray();

        // Prepend system message
        array_unshift($messages, [
            'role'    => 'system',
            'content' => config('chatbot.system_message'),
        ]);

        return response()->stream(function () use ($messages) {

            $apiKey = config('chatbot.groq_api_key');

            if (!$apiKey) {
                echo "data: " . json_encode(['error' => 'Groq API key not configured']) . "\n\n";
                echo "data: [DONE]\n\n";
                ob_flush(); flush();
                return;
            }

            try {
                $client = new Client();

                $response = $client->post('https://api.groq.com/openai/v1/chat/completions', [
                    'headers' => [
                        'Authorization' => 'Bearer ' . $apiKey,
                        'Content-Type'  => 'application/json',
                    ],
                    'json' => [
                        'model'       => config('chatbot.model'),
                        'messages'    => $messages,
                        'stream'      => true,
                        'temperature' => 0.7,
                        'max_tokens'  => 1024,
                    ],
                    'stream' => true,
                ]);

                $body   = $response->getBody();
                $buffer = '';

                while (!$body->eof()) {
                    $buffer .= $body->read(1024);

                    while (($pos = strpos($buffer, "\n")) !== false) {
                        $line   = substr($buffer, 0, $pos);
                        $buffer = substr($buffer, $pos + 1);
                        $line   = trim($line);

                        if (!str_starts_with($line, 'data: ')) continue;

                        $data = substr($line, 6);
                        if ($data === '[DONE]') break 2;

                        $chunk = json_decode($data, true);
                        if (!$chunk) continue;

                        $token = data_get($chunk, 'choices.0.delta.content');

                        if ($token !== null && $token !== '') {
                            echo "data: " . json_encode(['token' => $token]) . "\n\n";
                            ob_flush();
                            flush();
                        }

                        if (data_get($chunk, 'choices.0.finish_reason') === 'stop') {
                            break 2;
                        }
                    }
                }

            } catch (\Exception $e) {
                echo "data: " . json_encode(['error' => $e->getMessage()]) . "\n\n";
                ob_flush(); flush();
            }

            echo "data: [DONE]\n\n";
            ob_flush();
            flush();

        }, 200, [
            'Content-Type'      => 'text/event-stream',
            'Cache-Control'     => 'no-cache',
            'X-Accel-Buffering' => 'no',
            'Connection'        => 'keep-alive',
        ]);
    }
}
