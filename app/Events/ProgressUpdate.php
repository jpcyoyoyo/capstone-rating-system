<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Support\Facades\Log;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ProgressUpdate implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public $capstoneId;
    public $progress;

    /**
     * Create a new event instance.
     */
    public function __construct($capstoneId, $progress)
    {
        $this->capstoneId = $capstoneId;
        $this->progress = $progress;
        
        Log::info('[ProgressUpdate Event] Created for capstone ' . $capstoneId . ' with progress: ' . ($progress['completed'] ?? 0) . '/' . ($progress['total'] ?? 0) . ' - Status: ' . ($progress['status'] ?? 'unknown'));
    }

    /**
     * Get the channels the event should broadcast on.
     *
     * @return array<int, Channel>
     */
    public function broadcastOn(): array
    {
        return [
            new Channel('pdf-progress.' . $this->capstoneId),
        ];
    }

    /**
     * The event's broadcast name.
     */
    public function broadcastAs(): string
    {
        return 'progress.update';
    }

    /**
     * Get the queue name for broadcasting.
     */
    public function broadcastQueue(): string
    {
        return 'sync'; // Use sync queue for immediate broadcasting
    }
}
