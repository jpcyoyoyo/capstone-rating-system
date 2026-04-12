<?php
require 'vendor/autoload.php';
$app = require_once 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$cacheKey = "pdf_progress_1";
$progress = cache()->get($cacheKey);

echo "Cache key: $cacheKey\n";
if ($progress) {
    echo "Cache data found:\n";
    echo "Total: " . ($progress['total'] ?? 'N/A') . "\n";
    echo "Completed: " . ($progress['completed'] ?? 'N/A') . "\n";
    echo "Status: " . ($progress['status'] ?? 'N/A') . "\n";
    echo "Documents: " . (isset($progress['documents']) ? count($progress['documents']) : 'N/A') . "\n";
    if (isset($progress['documents'])) {
        foreach ($progress['documents'] as $doc) {
            echo "  - " . ($doc['name'] ?? 'N/A') . " (" . ($doc['status'] ?? 'N/A') . ")\n";
        }
    }
} else {
    echo "No cache data found for capstone 1\n";
}