<?php

namespace MdAnisurRahaman\LaravelChatbot;

use Illuminate\Support\ServiceProvider;

class LaravelChatbotServiceProvider extends ServiceProvider
{
    public function register()
    {
        $this->mergeConfigFrom(__DIR__ . '/../config/chatbot.php', 'chatbot');
    }

    public function boot()
    {
        $this->loadRoutesFrom(__DIR__ . '/../routes/api.php');
        $this->loadViewsFrom(__DIR__ . '/../resources/views', 'chatbot');
        $this->loadMigrationsFrom(__DIR__ . '/../database/migrations');

        if ($this->app->runningInConsole()) {
            $this->publishes([
                __DIR__ . '/../config/chatbot.php' => config_path('chatbot.php'),
            ], 'chatbot-config');

            $this->publishes([
                __DIR__ . '/../resources/views' => resource_path('views/vendor/chatbot'),
            ], 'chatbot-views');

            $this->publishes([
                __DIR__ . '/../resources/assets' => public_path('vendor/chatbot'),
            ], 'chatbot-assets');
        }
    }
}
