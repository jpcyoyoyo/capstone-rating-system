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

            $response = Http::withHeaders([
                'Authorization' => 'Bearer ' . $this->secretKey,
                'Content-Type' => 'application/json',
            ])->post("{$this->apiUrl}/documents", [
                'document' => $payload,
            ]);

            if ($response->successful()) {
                $data = $response->json();
                Log::info('[PDFMonkey] Document created', ['id' => $data['document']['id'] ?? null]);

                // Poll for completion (PDFMonkey generates async)
                return $this->waitForPdfCompletion($data['document']['id']);
            } else {
                Log::error('[PDFMonkey] API error', [
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);
                return null;
            }
        } catch (\Exception $e) {
            Log::error('[PDFMonkey] Exception: ' . $e->getMessage());
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
        $attempt = 0;

        while ($attempt < $maxAttempts) {
            try {
                $response = Http::withHeaders([
                    'Authorization' => 'Bearer ' . $this->secretKey,
                ])->get("{$this->apiUrl}/documents/{$documentId}");

                if ($response->successful()) {
                    $data = $response->json();
                    $status = $data['document']['status'] ?? null;

                    Log::info('[PDFMonkey] Document status', ['status' => $status]);

                    if ($status === 'rendered') {
                        $downloadUrl = $data['document']['download_url'] ?? null;
                        if ($downloadUrl) {
                            $pdfResponse = Http::get($downloadUrl);
                            if ($pdfResponse->successful()) {
                                Log::info('[PDFMonkey] PDF downloaded successfully');
                                return base64_encode($pdfResponse->body());
                            }
                        }
                    } elseif ($status === 'error') {
                        Log::error('[PDFMonkey] Document rendering failed', $data['document']);
                        return null;
                    }
                }

                // Wait before retrying
                usleep(500000); // 0.5 seconds
                $attempt++;
            } catch (\Exception $e) {
                Log::error('[PDFMonkey] Polling error: ' . $e->getMessage());
                return null;
            }
        }

        Log::error('[PDFMonkey] Timeout waiting for PDF completion');
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
