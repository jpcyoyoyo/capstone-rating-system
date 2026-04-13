<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class RemotePdfService
{
    private string $socketServerUrl;

    public function __construct()
    {
        $this->socketServerUrl = config('services.socket_server_url') ??
            env('SOCKET_SERVER_URL', 'http://localhost:6001');

        Log::info('[RemotePDF] Initialized with socket server: ' . $this->socketServerUrl);
    }

    /**
     * Generate PDF from HTML using remote Browserless via socket server
     *
     * @param  string  $html              The HTML content to render
     * @param  string  $filename          The desired filename for the PDF
     * @return string|null                The PDF filename if successful, null otherwise
     */
    public function generatePdfFromHtml(string $html, string $filename): ?string
    {
        try {
            Log::info('[RemotePDF] Generating PDF: ' . $filename);

            $endpoint = $this->socketServerUrl . '/generate-pdf';

            Log::info('[RemotePDF] Sending request to: ' . $endpoint);

            $response = Http::timeout(120)
                ->post($endpoint, [
                    'html' => $html,
                    'filename' => $filename,
                ]);

            if (!$response->successful()) {
                Log::error('[RemotePDF] API error', [
                    'status' => $response->status(),
                    'body' => $response->body(),
                    'headers' => $response->headers(),
                ]);
                return null;
            }

            $data = $response->json();

            if ($data['status'] === 'ok' && isset($data['filename'])) {
                Log::info('[RemotePDF] ✓ PDF generated successfully: ' . $data['filename'], [
                    'size' => $data['size'] ?? 'unknown',
                    'path' => $data['path'] ?? 'unknown',
                ]);

                return $data['filename'];
            }

            Log::error('[RemotePDF] Unexpected response', [
                'response' => $data,
            ]);

            return null;
        } catch (\Exception $e) {
            Log::error('[RemotePDF] Exception: ' . $e->getMessage(), [
                'trace' => $e->getTraceAsString(),
            ]);
            return null;
        }
    }

    /**
     * Download PDF from socket server and save to local storage
     *
     * @param  string  $pdfFilename       The filename of the PDF on socket server
     * @param  string  $localPath         The local path to save the PDF (relative to storage)
     * @return bool                       True if successful, false otherwise
     */
    public function downloadPdfToStorage(string $pdfFilename, string $localPath): bool
    {
        try {
            Log::info('[RemotePDF] Downloading PDF from socket server', [
                'file' => $pdfFilename,
                'local_path' => $localPath,
            ]);

            $downloadUrl = $this->socketServerUrl . '/storage/pdfs/' . urlencode($pdfFilename);

            $response = Http::timeout(60)->get($downloadUrl);

            if (!$response->successful()) {
                Log::error('[RemotePDF] Failed to download PDF', [
                    'status' => $response->status(),
                    'url' => $downloadUrl,
                ]);
                return false;
            }

            Storage::disk('public')->put($localPath, $response->body());

            Log::info('[RemotePDF] ✓ PDF saved to local storage', [
                'local_path' => $localPath,
                'size' => strlen($response->body()),
            ]);

            return true;
        } catch (\Exception $e) {
            Log::error('[RemotePDF] Failed to download and save PDF: ' . $e->getMessage(), [
                'trace' => $e->getTraceAsString(),
            ]);
            return false;
        }
    }

    /**
     * Generate PDF and get the file path in one operation
     *
     * @param  string  $html              The HTML content to render
     * @param  string  $filename          The desired filename for the PDF
     * @param  string  $storagePath       The local storage path to save to
     * @return string|null                The full public path if successful, null otherwise
     */
    public function generateAndSavePdf(string $html, string $filename, string $storagePath): ?string
    {
        Log::info('[RemotePDF] Generate and save PDF', [
            'filename' => $filename,
            'storage_path' => $storagePath,
        ]);

        // Generate PDF on socket server
        $remoteFilename = $this->generatePdfFromHtml($html, $filename);

        if (!$remoteFilename) {
            Log::error('[RemotePDF] Failed to generate PDF on socket server');
            return null;
        }

        // Download to local storage
        if (!$this->downloadPdfToStorage($remoteFilename, $storagePath)) {
            Log::error('[RemotePDF] Failed to download PDF to local storage');
            return null;
        }

        // Return public path
        $publicPath = asset('storage/' . $storagePath);

        Log::info('[RemotePDF] ✓ PDF ready at: ' . $publicPath);

        return $publicPath;
    }

    /**
     * Test connection to socket server
     *
     * @return bool  True if socket server is reachable, false otherwise
     */
    public function testConnection(): bool
    {
        try {
            Log::info('[RemotePDF] Testing connection to: ' . $this->socketServerUrl);

            // Try to generate a simple PDF
            $testHtml = '<html><body><p>Test PDF</p></body></html>';
            $result = $this->generatePdfFromHtml($testHtml, 'test_' . uniqid() . '.pdf');

            if ($result) {
                Log::info('[RemotePDF] ✓ Connection test successful');
                return true;
            }

            Log::warning('[RemotePDF] Connection test returned null');
            return false;
        } catch (\Exception $e) {
            Log::error('[RemotePDF] Connection test failed: ' . $e->getMessage());
            return false;
        }
    }
}
