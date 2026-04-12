<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class PdfMonkeyService
{
    private string $apiUrl;
    private string $secretKey;

    public function __construct()
    {
        $this->apiUrl = env('PDFMONKEY_API_URL', 'https://api.pdfmonkey.io/api/v1');
        $this->secretKey = env('PDFMONKEY_SECRET_KEY');

        if (!$this->secretKey) {
            throw new \Exception('PDFMONKEY_SECRET_KEY is not configured in .env');
        }
    }

    /**
     * Generate PDF from HTML content
     *
     * @param string $html The HTML content to convert to PDF
     * @param array $options Additional options (paper_size, margins, etc.)
     * @return ?string Base64 encoded PDF content or null on failure
     */
    public function generatePdfFromHtml(string $html, array $options = []): ?string
    {
        try {
            Log::info('[PDFMonkey] Generating PDF from HTML...');

            $payload = array_merge([
                'document_html' => $html,
                'document_format' => 'pdf',
                'status' => 'rendered',
                'meta' => [
                    'name' => $options['filename'] ?? 'document',
                ],
            ], $options);

            // Log the API key (first 10 chars only for security)
            $keyPreview = substr($this->secretKey, 0, 10) . '...';
            Log::info('[PDFMonkey] Using API key: ' . $keyPreview);
            Log::info('[PDFMonkey] API endpoint: ' . $this->apiUrl);

            $response = Http::withHeaders([
                'Authorization' => 'Bearer ' . $this->secretKey,
                'Content-Type' => 'application/json',
            ])->timeout(30)->post("{$this->apiUrl}/documents", [
                'document' => $payload,
            ]);

            Log::info('[PDFMonkey] API Response Status: ' . $response->status());

            if ($response->successful()) {
                $data = $response->json();
                Log::info('[PDFMonkey] Document created', ['id' => $data['document']['id'] ?? null]);

                // Poll for completion (PDFMonkey generates async)
                return $this->waitForPdfCompletion($data['document']['id']);
            } else {
                Log::error('[PDFMonkey] API error', [
                    'status' => $response->status(),
                    'body' => $response->body(),
                    'headers' => $response->headers(),
                ]);
                return null;
            }
        } catch (\Exception $e) {
            Log::error('[PDFMonkey] Exception: ' . $e->getMessage());
            Log::error('[PDFMonkey] Exception trace: ' . $e->getTraceAsString());
            return null;
        }
    }

    /**
     * Poll PDFMonkey for PDF completion and download
     *
     * @param string $documentId The document ID from PDFMonkey
     * @return ?string Base64 encoded PDF or null on failure
     */
    private function waitForPdfCompletion(string $documentId, int $maxAttempts = 30): ?string
    {
        Log::info('[PDFMonkey] Polling for document completion, max attempts: ' . $maxAttempts);
        $attempt = 0;

        while ($attempt < $maxAttempts) {
            try {
                $response = Http::withHeaders([
                    'Authorization' => 'Bearer ' . $this->secretKey,
                ])->timeout(30)->get("{$this->apiUrl}/documents/{$documentId}");

                Log::info('[PDFMonkey] Poll attempt ' . ($attempt + 1) . ' - Status: ' . $response->status());

                if ($response->successful()) {
                    $data = $response->json();
                    $status = $data['document']['status'] ?? null;

                    Log::info('[PDFMonkey] Document status: ' . $status, ['document_id' => $documentId]);

                    if ($status === 'rendered') {
                        $downloadUrl = $data['document']['download_url'] ?? null;
                        if ($downloadUrl) {
                            Log::info('[PDFMonkey] Attempting to download PDF from: ' . $downloadUrl);
                            $pdfResponse = Http::timeout(30)->get($downloadUrl);
                            if ($pdfResponse->successful()) {
                                Log::info('[PDFMonkey] PDF downloaded successfully');
                                return base64_encode($pdfResponse->body());
                            } else {
                                Log::error('[PDFMonkey] Failed to download PDF', [
                                    'status' => $pdfResponse->status(),
                                    'url' => $downloadUrl,
                                ]);
                            }
                        } else {
                            Log::error('[PDFMonkey] No download_url in response', $data['document']);
                        }
                    } elseif ($status === 'error') {
                        Log::error('[PDFMonkey] Document rendering failed', $data['document']);
                        return null;
                    }
                } else {
                    Log::error('[PDFMonkey] Poll request failed', [
                        'status' => $response->status(),
                        'body' => $response->body(),
                    ]);
                }

                // Wait before retrying
                usleep(500000); // 0.5 seconds
                $attempt++;
            } catch (\Exception $e) {
                Log::error('[PDFMonkey] Polling error: ' . $e->getMessage());
                Log::error('[PDFMonkey] Polling error trace: ' . $e->getTraceAsString());
                return null;
            }
        }

        Log::error('[PDFMonkey] Timeout waiting for PDF completion after ' . $maxAttempts . ' attempts');
        return null;
    }

    /**
     * Save PDF to file
     *
     * @param string $base64Pdf Base64 encoded PDF
     * @param string $filePath File path to save to
     * @return bool Success status
     */
    public function savePdfToFile(string $base64Pdf, string $filePath): bool
    {
        try {
            $pdfContent = base64_decode($base64Pdf);
            file_put_contents($filePath, $pdfContent);
            Log::info('[PDFMonkey] PDF saved to file', ['path' => $filePath]);
            return true;
        } catch (\Exception $e) {
            Log::error('[PDFMonkey] Failed to save PDF: ' . $e->getMessage());
            return false;
        }
    }
}
