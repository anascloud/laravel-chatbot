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

            @set_time_limit(0);
            @ini_set('zlib.output_compression', '0');
            ignore_user_abort(true);

            $apiKey = config('chatbot.groq_api_key');

            if (!$apiKey) {
                $this->sse(['error' => 'Groq API key not configured.']);
                $this->sse('[DONE]');
                return;
            }

            // Let the client know the stream is alive before the upstream call.
            $this->sse(['status' => 'thinking']);

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
                    if (connection_aborted()) {
                        break;
                    }

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

                        if (isset($chunk['error'])) {
                            $msg = is_array($chunk['error'])
                                ? ($chunk['error']['message'] ?? json_encode($chunk['error']))
                                : $chunk['error'];
                            $this->sse(['error' => $msg]);
                            break 2;
                        }

                        $token = data_get($chunk, 'choices.0.delta.content');

                        if ($token !== null && $token !== '') {
                            $this->sse(['token' => $token]);
                        }

                        if (data_get($chunk, 'choices.0.finish_reason') === 'stop') {
                            break 2;
                        }
                    }
                }

            } catch (\GuzzleHttp\Exception\RequestException $e) {
                $message = 'Upstream request failed';
                if ($e->hasResponse()) {
                    $status  = $e->getResponse()->getStatusCode();
                    $body    = (string) $e->getResponse()->getBody();
                    $decoded = json_decode($body, true);
                    $detail  = $decoded['error']['message'] ?? $body;
                    $message = "Groq API returned {$status}: " . mb_substr(trim($detail), 0, 300);
                } else {
                    $message = 'Could not reach the AI provider: ' . $e->getMessage();
                }
                $this->sse(['error' => $message]);
            } catch (\Throwable $e) {
                $this->sse(['error' => 'Server error: ' . $e->getMessage()]);
            }

            $this->sse('[DONE]');

        }, 200, [
            'Content-Type'      => 'text/event-stream; charset=UTF-8',
            'Cache-Control'     => 'no-cache, no-transform',
            'X-Accel-Buffering' => 'no',
            'Connection'        => 'keep-alive',
        ]);
    }

    private function sse($payload): void
    {
        $data = is_string($payload) ? $payload : json_encode($payload);
        echo "data: {$data}\n\n";

        if (ob_get_level() > 0) {
            @ob_flush();
        }
        @flush();
    }
}
