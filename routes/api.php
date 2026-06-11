<?php

use Illuminate\Support\Facades\Route;
use MdAnisurRahaman\LaravelChatbot\Http\Controllers\ChatController;

Route::prefix(config('chatbot.route_prefix', 'api'))->group(function () {
    Route::post('/chat', [ChatController::class, 'chat'])
        ->middleware(['throttle:' . config('chatbot.throttle', '30,1')]);
});
