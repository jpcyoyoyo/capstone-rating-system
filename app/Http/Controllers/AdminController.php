<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;
use App\Models\User;
use App\Models\Capstone;
use App\Models\Proposal;
use GuzzleHttp\Client;

class AdminController extends Controller
{
    public function dashboard()
    {
        return Inertia::render('Admin/Dashboard');
    }

    public function users(Request $request)
    {
        $users = User::query()
            ->where('role', '!=', 'Admin')
            ->orderBy('created_at', 'desc')
            ->get(['id', 'full_name', 'role']);

        return Inertia::render('Admin/Users', [
            'users' => $users,
        ]);
    }

    public function getUser($id)
    {
        $user = User::find($id);

        if (!$user) {
            return response()->json(['error' => 'User not found.'], 404);
        }

        return response()->json([
            'id' => $user->id,
            'full_name' => $user->full_name,
            'username' => $user->username,
            'gen_pass' => $user->gen_pass,
            'role' => $user->role,
            'created_at' => $user->created_at->format('M d, Y h:i A'),
        ]);
    }

    public function createUser(Request $request)
    {
        $validated = $request->validate([
            'first_name' => 'required|string|max:255',
            'middle_initial' => 'nullable|string|max:10',
            'last_name' => 'required|string|max:255',
            'role' => 'required|in:Student,Panel',
        ]);

        $firstName = trim($validated['first_name']);
        $middleInitial = trim($validated['middle_initial'] ?? '');
        $lastName = trim($validated['last_name']);
        if (strlen($middleInitial) > 1) {
            $middleInitial = mb_strtoupper(mb_substr($middleInitial, 0, 1));
        }

        $fullName = trim($firstName . ($middleInitial !== '' ? ' ' . $middleInitial . '.' : '') . ' ' . $lastName);
        $duplicateExists = User::whereRaw('LOWER(full_name) = ?', [mb_strtolower($fullName)])->exists();

        if ($duplicateExists) {
            return response()->json(['errors' => ['full_name' => 'A user with this full name already exists.']], 409);
        }

        try {
            $user = new User();
            $user->full_name = $fullName;
            $user->role = $validated['role'];
            $user->gen_pass = '';
            $user->hash_pass = '';
            $user->save();

            $usernamePrefix = preg_replace('/[^a-z0-9]/', '', Str::lower($firstName));
            $user->username = $usernamePrefix . str_pad($user->id, 5, '0', STR_PAD_LEFT);
            $generatedPassword = Str::random(8);
            $user->gen_pass = $generatedPassword;
            $user->hash_pass = Hash::make($generatedPassword);
            $user->save();
        } catch (\Exception $e) {
            Log::error('User creation failed: ' . $e->getMessage());
            return response()->json(['errors' => ['full_name' => 'Failed to create user. Please try again.']], 500);
        }

        return response()->json([
            'createdUser' => [
                'id' => $user->id,
                'full_name' => $user->full_name,
                'role' => $user->role,
            ],
            'message' => 'User created successfully.',
        ]);
    }

    public function previewStudentUpload(Request $request)
    {
        try {
            $request->validate([
                'student_file' => 'required|file|mimes:csv,xlsx,xls,txt',
            ]);

            $file = $request->file('student_file');
            
            try {
                $rows = $this->parseSpreadsheetRows($file);
            } catch (\Exception $e) {
                Log::error('File parsing error: ' . $e->getMessage());
                return response()->json(['errors' => ['student_file' => 'Unable to parse the uploaded file. Ensure it is a valid CSV or Excel document.']], 422);
            }

            if (count($rows) === 0) {
                return response()->json(['errors' => ['student_file' => 'Uploaded file contains no rows.']], 422);
            }

            $headers = array_shift($rows);
            Log::info('Raw headers:', ['headers' => $headers, 'count' => count($headers)]);
            
            $columns = [];
            $requiredColumnIndexes = ['first_name' => null, 'last_name' => null, 'middle_initial' => null];

            foreach ($headers as $index => $headerValue) {
                $header = trim((string) $headerValue);
                if ($header === '') {
                    continue;
                }
                
                $lowerHeader = mb_strtolower($header);
                Log::info("Processing header [$index]: original='{$header}', lower='{$lowerHeader}'");

                // Check for first name
                if (stripos($lowerHeader, 'first') !== false && (stripos($lowerHeader, 'name') !== false || stripos($lowerHeader, 'name') === false && strlen($lowerHeader) <= 10)) {
                    $requiredColumnIndexes['first_name'] = $index;
                    Log::info("✓ Matched FIRST NAME at index $index: '$header'");
                    continue;
                }

                // Check for last/surname
                if (stripos($lowerHeader, 'surname') !== false || stripos($lowerHeader, 'last') !== false) {
                    $requiredColumnIndexes['last_name'] = $index;
                    Log::info("✓ Matched LAST NAME at index $index: '$header'");
                    continue;
                }

                // Check for middle name
                if (stripos($lowerHeader, 'middle') !== false) {
                    $requiredColumnIndexes['middle_initial'] = $index;
                    Log::info("✓ Matched MIDDLE at index $index: '$header'");
                    continue;
                }

                // Skip ID columns
                if (stripos($lowerHeader, '#') !== false || stripos($lowerHeader, 'id') !== false || stripos($lowerHeader, 'no') !== false || stripos($lowerHeader, 'studentno') !== false) {
                    Log::info("⊘ Skipping ID/No column at index $index: '$header'");
                    continue;
                }

                // Track other columns for filtering
                $columnKey = preg_replace('/[^a-z0-9]+/', '_', $lowerHeader);
                if ($columnKey === '') {
                    $columnKey = 'extra_' . $index;
                }
                if (isset($columns[$columnKey])) {
                    $columnKey .= '_' . $index;
                }
                $columns[$columnKey] = [
                    'index' => $index,
                    'label' => $header,
                ];
            }
            
            Log::info('Detection results:', ['first_name' => $requiredColumnIndexes['first_name'], 'last_name' => $requiredColumnIndexes['last_name']]);

            if (!isset($requiredColumnIndexes['first_name']) || !isset($requiredColumnIndexes['last_name'])) {
                Log::warning('Missing required columns. First name: ' . ($requiredColumnIndexes['first_name'] ?? 'NOT FOUND') . ', Last name: ' . ($requiredColumnIndexes['last_name'] ?? 'NOT FOUND'));
                return response()->json(['errors' => ['student_file' => 'The file must contain "First Name" and "Last Name" (or "Surname") columns. Headers found: ' . implode(', ', $headers)]], 422);
            }

            $previewRows = [];
            $filterColumns = [];

            foreach ($columns as $columnKey => $columnMeta) {
                $filterColumns[$columnKey] = [
                    'label' => $columnMeta['label'],
                    'options' => [],
                ];
            }

            $existingFullNames = User::query()
                ->where('role', '!=', 'Admin')
                ->pluck('full_name')
                ->map(fn ($name) => mb_strtolower($name))
                ->toArray();

            foreach ($rows as $rowIndex => $row) {
                $firstName = trim($row[$requiredColumnIndexes['first_name']] ?? '');
                $lastName = trim($row[$requiredColumnIndexes['last_name']] ?? '');
                $middle = isset($requiredColumnIndexes['middle_initial']) ? trim($row[$requiredColumnIndexes['middle_initial']] ?? '') : '';
                if ($middle !== '' && mb_strlen($middle) > 1) {
                    $middle = mb_substr($middle, 0, 1);
                }
                $fullName = trim($firstName . ($middle !== '' ? ' ' . $middle . '.' : '') . ' ' . $lastName);

                $extra = [];
                foreach ($columns as $columnKey => $columnMeta) {
                    $value = trim($row[$columnMeta['index']] ?? '');
                    $extra[$columnKey] = $value;
                    if ($value !== '' && !in_array($value, $filterColumns[$columnKey]['options'], true)) {
                        $filterColumns[$columnKey]['options'][] = $value;
                    }
                }

                foreach ($filterColumns as &$filterColumn) {
                    sort($filterColumn['options']);
                }
                unset($filterColumn);

                $previewRows[] = [
                    'first_name' => $firstName,
                    'last_name' => $lastName,
                    'middle_initial' => $middle,
                    'full_name' => $fullName,
                    'ignored' => in_array(mb_strtolower($fullName), $existingFullNames, true),
                    'extra' => $extra,
                ];
            }

            return response()->json([
                'previewRows' => $previewRows,
                'filterColumns' => array_map(function($key, $column) {
                    return array_merge(['key' => $key], $column);
                }, array_keys($filterColumns), $filterColumns),
            ]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            Log::error('Validation error: ' . json_encode($e->errors()));
            return response()->json(['errors' => $e->errors()], 422);
        } catch (\Exception $e) {
            Log::error('Upload preview error: ' . $e->getMessage());
            return response()->json(['errors' => ['student_file' => 'An error occurred while processing the file: ' . $e->getMessage()]], 500);
        }
    }

    public function massCreateUsers(Request $request)
    {
        $request->validate([
            'rows' => 'required|array',
            'rows.*.first_name' => 'required|string|max:255',
            'rows.*.last_name' => 'required|string|max:255',
            'rows.*.middle_initial' => 'nullable|string|max:10',
        ]);

        $createdUsers = [];
        $successCount = 0;
        $failedCount = 0;

        foreach ($request->input('rows') as $row) {
            $firstName = trim($row['first_name']);
            $lastName = trim($row['last_name']);
            $middleInitial = trim($row['middle_initial'] ?? '');
            if ($middleInitial !== '' && mb_strlen($middleInitial) > 1) {
                $middleInitial = mb_substr($middleInitial, 0, 1);
            }

            if ($firstName === '' || $lastName === '') {
                $failedCount++;
                continue;
            }

            $fullName = trim($firstName . ($middleInitial !== '' ? ' ' . $middleInitial . '.' : '') . ' ' . $lastName);
            $duplicateExists = User::whereRaw('LOWER(full_name) = ?', [mb_strtolower($fullName)])->exists();

            if ($duplicateExists) {
                $failedCount++;
                continue;
            }

            $user = new User();
            $user->full_name = $fullName;
            $user->role = 'Student';
            $user->gen_pass = '';
            $user->hash_pass = '';
            $user->save();

            $usernamePrefix = preg_replace('/[^a-z0-9]/', '', Str::lower($firstName));
            $user->username = $usernamePrefix . str_pad($user->id, 5, '0', STR_PAD_LEFT);
            $generatedPassword = Str::random(8);
            $user->gen_pass = $generatedPassword;
            $user->hash_pass = Hash::make($generatedPassword);
            $user->save();

            $createdUsers[] = [
                'id' => $user->id,
                'full_name' => $user->full_name,
                'role' => $user->role,
            ];
            $successCount++;
        }

        return response()->json([
            'success' => $successCount,
            'failed' => $failedCount,
            'createdUsers' => $createdUsers,
        ]);
    }

    private function parseSpreadsheetRows(UploadedFile $file): array
    {
        $extension = mb_strtolower($file->getClientOriginalExtension());

        if ($extension === 'csv' || $extension === 'txt') {
            return $this->parseCsvRows($file);
        }

        if ($extension === 'xlsx') {
            return $this->parseXlsxRows($file);
        }

        return [];
    }

    private function parseCsvRows(UploadedFile $file): array
    {
        $rows = [];
        if (($handle = fopen($file->getRealPath(), 'r')) === false) {
            return [];
        }

        while (($data = fgetcsv($handle)) !== false) {
            $rows[] = array_map('trim', $data);
        }

        fclose($handle);
        return $rows;
    }

    private function parseXlsxRows(UploadedFile $file): array
    {
        $archive = new \ZipArchive();
        if ($archive->open($file->getRealPath()) !== true) {
            return [];
        }

        $sharedStrings = [];
        if (($index = $archive->locateName('xl/sharedStrings.xml')) !== false) {
            $rawStrings = $archive->getFromIndex($index);
            $xmlStrings = new \SimpleXMLElement($rawStrings);
            foreach ($xmlStrings->si as $si) {
                if (isset($si->t)) {
                    $sharedStrings[] = (string) $si->t;
                } else {
                    $text = '';
                    foreach ($si->children() as $child) {
                        if (isset($child->t)) {
                            $text .= (string) $child->t;
                        }
                    }
                    $sharedStrings[] = $text;
                }
            }
        }

        $sheetXml = $archive->getFromName('xl/worksheets/sheet1.xml');
        if (!$sheetXml) {
            return [];
        }

        $sheet = new \SimpleXMLElement($sheetXml);
        $rows = [];

        foreach ($sheet->sheetData->row as $row) {
            $rowCells = [];
            $maxIndex = -1;

            foreach ($row->c as $cell) {
                $cellRef = (string) $cell['r'];
                $columnLetters = preg_replace('/[0-9]/', '', $cellRef);
                $columnIndex = $this->convertColumnLetterToIndex($columnLetters);
                $value = '';

                if (isset($cell->v)) {
                    $value = (string) $cell->v;
                    if ((string) $cell['t'] === 's' && isset($sharedStrings[(int) $value])) {
                        $value = $sharedStrings[(int) $value];
                    }
                }

                $rowCells[$columnIndex] = trim($value);
                $maxIndex = max($maxIndex, $columnIndex);
            }

            $rowData = [];
            for ($i = 0; $i <= $maxIndex; $i++) {
                $rowData[] = $rowCells[$i] ?? '';
            }

            $rows[] = $rowData;
        }

        return $rows;
    }

    private function convertColumnLetterToIndex(string $letters): int
    {
        $letters = strtoupper($letters);
        $index = 0;

        for ($i = 0; $i < strlen($letters); $i++) {
            $index = $index * 26 + (ord($letters[$i]) - 64);
        }

        return $index - 1;
    }

    public function capstones()
    {
        $capstones = Capstone::query()
            ->orderBy('created_at', 'desc')
            ->get()
            ->map(function ($capstone) {
                $panelMembers = $capstone->panel_members ?? ['no_members' => 0, 'list' => []];
                $teamList = $capstone->team_list ?? ['no_members' => 0, 'list' => []];
                $proposals = $capstone->proposals ?? ['proposals' => []];

                return [
                    'id' => $capstone->id,
                    'team_name' => $capstone->team_name,
                    'no_of_team_members' => $teamList['no_members'] ?? 0,
                    'no_of_panel_members' => $panelMembers['no_members'] ?? 0,
                    'no_of_proposals' => count($proposals['proposals'] ?? []),
                    'is_live' => $capstone->is_live,
                    'created_at' => $capstone->created_at,
                    'logo' => $capstone->logo ?? null,
                ];
            });

        return Inertia::render('Admin/Capstones', [
            'capstones' => $capstones,
        ]);
    }

    public function createCapstone(Request $request)
    {
        $validated = $request->validate([
            'team_name' => 'required|string|max:255',
        ]);

        $teamName = trim($validated['team_name']);

        // Check for duplicate team names
        $duplicateExists = Capstone::whereRaw('LOWER(team_name) = ?', [mb_strtolower($teamName)])->exists();

        if ($duplicateExists) {
            return response()->json(['errors' => ['team_name' => 'A capstone with this team name already exists.']], 409);
        }

        try {
            $capstone = new Capstone();
            $capstone->team_name = $teamName;
            $capstone->panel_members = [
                'no_members' => '0',
                'list' => [],
            ];
            $capstone->proposals = [
                'proposals' => [],
            ];
            $capstone->team_list = [
                'no_members' => '0',
                'list' => [],
            ];
            $capstone->is_live = 0;
            $capstone->save();

            return response()->json([
                'message' => 'Capstone created successfully.',
                'capstone' => [
                    'id' => $capstone->id,
                    'team_name' => $capstone->team_name,
                    'no_of_team_members' => 0,
                    'no_of_panel_members' => 0,
                    'no_of_proposals' => 0,
                    'is_live' => $capstone->is_live,
                ],
            ], 201);
        } catch (\Exception $e) {
            Log::error('Capstone creation failed: ' . $e->getMessage());
            return response()->json(['errors' => ['team_name' => 'Failed to create capstone. Please try again.']], 500);
        }
    }

    public function searchUsers(Request $request)
    {
        $query = $request->input('q', '');
        $roleFilter = $request->input('role', null);

        if (strlen(trim($query)) < 2) {
            return response()->json([]);
        }

        try {
            $userQuery = User::where('role', '!=', 'Admin')
                ->where('full_name', 'LIKE', '%' . $query . '%');
            
            if ($roleFilter) {
                $userQuery->where('role', $roleFilter);
            }
            
            $users = $userQuery->limit(10)->get(['id', 'full_name', 'role']);

            return response()->json($users);
        } catch (\Exception $e) {
            Log::error('User search failed: ' . $e->getMessage());
            return response()->json(['error' => 'Search failed.'], 500);
        }
    }

    /**
     * Parse and decode evaluation JSON strings in proposals
     */
    private function parseProposalsData($proposalsData)
    {
        Log::info('[DEBUG] parseProposalsData called', ['input' => gettype($proposalsData)]);
        
        if (!is_array($proposalsData)) {
            Log::warning('[DEBUG] proposalsData is not array', ['type' => gettype($proposalsData)]);
            return $proposalsData;
        }

        if (isset($proposalsData['proposals']) && is_array($proposalsData['proposals'])) {
            Log::info('[DEBUG] Found proposals array', ['count' => count($proposalsData['proposals'])]);
            
            foreach ($proposalsData['proposals'] as &$proposal) {
                Log::info('[DEBUG] Processing proposal', ['id' => $proposal['id'] ?? 'unknown', 'has_defense' => isset($proposal['defense_eval'])]);
                
                // Decode evaluation JSON strings if they are strings
                if (isset($proposal['defense_eval'])) {
                    Log::info('[DEBUG] defense_eval type', ['type' => gettype($proposal['defense_eval']), 'is_string' => is_string($proposal['defense_eval'])]);
                    if (is_string($proposal['defense_eval'])) {
                        $decoded = json_decode($proposal['defense_eval'], true);
                        Log::info('[DEBUG] Decoded defense_eval', ['decoded_type' => gettype($decoded), 'decoded' => $decoded]);
                        $proposal['defense_eval'] = $decoded;
                    }
                }
                if (isset($proposal['team_self_eval'])) {
                    Log::info('[DEBUG] team_self_eval type', ['type' => gettype($proposal['team_self_eval']), 'is_string' => is_string($proposal['team_self_eval'])]);
                    if (is_string($proposal['team_self_eval'])) {
                        $decoded = json_decode($proposal['team_self_eval'], true);
                        Log::info('[DEBUG] Decoded team_self_eval', ['decoded_type' => gettype($decoded)]);
                        $proposal['team_self_eval'] = $decoded;
                    }
                }
                if (isset($proposal['team_oral_eval'])) {
                    Log::info('[DEBUG] team_oral_eval type', ['type' => gettype($proposal['team_oral_eval']), 'is_string' => is_string($proposal['team_oral_eval'])]);
                    if (is_string($proposal['team_oral_eval'])) {
                        $decoded = json_decode($proposal['team_oral_eval'], true);
                        Log::info('[DEBUG] Decoded team_oral_eval', ['decoded_type' => gettype($decoded)]);
                        $proposal['team_oral_eval'] = $decoded;
                    }
                }
            }
        } else {
            Log::warning('[DEBUG] No proposals array found');
        }
        return $proposalsData;
    }

    public function getCapstoneDetail($id)
    {
        try {
            Log::info('[DEBUG] getCapstoneDetail called', ['capstone_id' => $id]);
            
            $capstone = Capstone::find($id);

            if (!$capstone) {
                Log::warning('[DEBUG] Capstone not found', ['id' => $id]);
                return response()->json(['error' => 'Capstone not found.'], 404);
            }

            Log::info('[DEBUG] Capstone found', ['team_name' => $capstone->team_name]);
            
            // Fetch proposals from the Proposal model (database records, not JSON)
            $proposalRecords = Proposal::where('capstone_id', $id)->get();
            Log::info('[DEBUG] Fetched proposal records', ['count' => $proposalRecords->count()]);
            
            // Convert proposals to array with parsed evaluation data
            $proposalsArray = [];
            foreach ($proposalRecords as $proposal) {
                Log::info('[DEBUG] Processing proposal from DB', ['id' => $proposal->id, 'title' => $proposal->title]);
                Log::info('[DEBUG] Defense eval type', ['type' => gettype($proposal->defense_eval)]);
                Log::info('[DEBUG] Defense eval content (first 200 chars)', ['content' => substr(json_encode($proposal->defense_eval), 0, 200)]);
                
                $proposalsArray[] = [
                    'id' => $proposal->id,
                    'title' => $proposal->title,
                    'defense_eval' => $proposal->defense_eval, // Already parsed by Eloquent casting
                    'team_self_eval' => $proposal->team_self_eval,
                    'team_oral_eval' => $proposal->team_oral_eval,
                    'gen_documents' => $proposal->gen_documents,
                    'created_at' => $proposal->created_at,
                    'updated_at' => $proposal->updated_at,
                ];
            }

            $proposalsData = ['proposals' => $proposalsArray];
            
            Log::info('[DEBUG] After fetch from Proposal model', [
                'proposals_count' => count($proposalsArray),
                'first_proposal_has_defense' => isset($proposalsArray[0]) ? isset($proposalsArray[0]['defense_eval']) : false,
            ]);

            $response = [
                'id' => $capstone->id,
                'team_name' => $capstone->team_name,
                'no_of_team_members' => $capstone->no_of_team_members ?? 0,
                'no_of_panel_members' => $capstone->no_of_panel_members ?? 0,
                'no_of_proposals' => $capstone->no_of_proposals ?? 0,
                'is_live' => $capstone->is_live,
                'created_at' => $capstone->created_at,
                'team_list' => $capstone->team_list ?? ['no_members' => '0', 'list' => []],
                'panel_members' => $capstone->panel_members ?? ['no_members' => '0', 'list' => []],
                'proposals' => $proposalsData,
                'logo' => $capstone->logo ?? null,
            ];

            Log::info('[DEBUG] Returning response', ['has_proposals' => isset($response['proposals']), 'proposals_count' => count($response['proposals']['proposals'] ?? [])]);
            
            return response()->json($response);
        } catch (\Exception $e) {
            Log::error('Failed to get capstone detail: ' . $e->getMessage() . ' | Trace: ' . $e->getTraceAsString());
            return response()->json(['error' => 'Failed to retrieve capstone details.'], 500);
        }
    }

    public function updateCapstoneMembers(Request $request, $id)
    {
        $validated = $request->validate([
            'type' => 'required|in:team,panel',
            'members' => 'required|array',
        ]);

        try {
            $capstone = Capstone::find($id);

            if (!$capstone) {
                return response()->json(['error' => 'Capstone not found.'], 404);
            }

            // Update members based on type
            if ($validated['type'] === 'team') {
                $capstone->team_list = $validated['members'];
                
                // If team members changed, update all proposal evaluation forms
                $teamMembers = $validated['members']['list'] ?? [];
                $this->updateProposalEvaluationForms($capstone, $teamMembers);
            } else {
                $capstone->panel_members = $validated['members'];
                
                // If panel members changed, update all proposal evaluation forms
                $panelMembers = $validated['members']['list'] ?? [];
                $this->updateProposalPanelForms($capstone, $panelMembers);
            }

            // Force offline if team members < 4
            $teamList = $capstone->team_list ?? ['list' => []];
            $teamCount = count($teamList['list'] ?? []);
            if ($teamCount < 4) {
                $capstone->is_live = 0;
            }

            $capstone->save();

            // Parse proposals and decode evaluation JSON strings
            $proposalsData = $this->parseProposalsData($capstone->proposals ?? ['proposals' => []]);

            return response()->json([
                'id' => $capstone->id,
                'team_name' => $capstone->team_name,
                'no_of_team_members' => $capstone->no_of_team_members ?? 0,
                'no_of_panel_members' => $capstone->no_of_panel_members ?? 0,
                'no_of_proposals' => $capstone->no_of_proposals ?? 0,
                'is_live' => $capstone->is_live,
                'created_at' => $capstone->created_at,
                'team_list' => $capstone->team_list ?? ['no_members' => '0', 'list' => []],
                'panel_members' => $capstone->panel_members ?? ['no_members' => '0', 'list' => []],
                'proposals' => $proposalsData,
            ]);
        } catch (\Exception $e) {
            Log::error('Failed to update capstone members: ' . $e->getMessage());
            return response()->json(['error' => 'Failed to update members. Please try again.'], 500);
        }
    }

    /**
     * Update evaluation forms when team members are added or removed
     */
    private function updateProposalEvaluationForms($capstone, $teamMembers)
    {
        Log::info('[DEBUG] Updating proposal evaluation forms for team member change');
        
        $proposals = Proposal::where('capstone_id', $capstone->id)->get();
        
        foreach ($proposals as $proposal) {
            $updated = false;
            
            // Get list of current team member IDs
            $currentMemberIds = array_map(function($member) {
                return intval($member['member_id']);
            }, $teamMembers);

            // Update team_self_eval (forms FOR each team member)
            if ($proposal->team_self_eval) {
                $selfEval = is_array($proposal->team_self_eval) ? $proposal->team_self_eval : json_decode($proposal->team_self_eval, true);
                
                if (isset($selfEval['forms']) && is_array($selfEval['forms'])) {
                    // Remove forms for members no longer in team
                    $selfEval['forms'] = array_filter($selfEval['forms'], function($form) use ($currentMemberIds) {
                        return in_array(intval($form['member_id']), $currentMemberIds);
                    });
                    $selfEval['forms'] = array_values($selfEval['forms']); // Re-index array
                    
                    // Update memberRatings in remaining forms and reset submission
                    foreach ($selfEval['forms'] as &$form) {
                        if (isset($form['form_data']['memberRatings'])) {
                            // Update memberRatings to match current team members
                            $form['form_data']['memberRatings'] = array_map(function($member) {
                                return [
                                    'member_id' => intval($member['member_id']),
                                    'full_name' => $member['full_name'],
                                    'designation' => $member['designation'],
                                ];
                            }, $teamMembers);
                        }
                        // Reset submission status
                        $form['is_submitted'] = false;
                        $updated = true;
                    }
                    unset($form);
                    
                    // Add forms for newly added members (members in $teamMembers but not already in forms)
                    $existingFormMemberIds = array_map(function($form) {
                        return intval($form['member_id']);
                    }, $selfEval['forms']);
                    
                    foreach ($teamMembers as $member) {
                        $memberId = intval($member['member_id']);
                        if (!in_array($memberId, $existingFormMemberIds)) {
                            // Create new form for this member
                            $newForm = [
                                'member_id' => $memberId,
                                'is_submitted' => false,
                                'full_name' => $member['full_name'],
                                'designation' => $member['designation'],
                                'time' => '',
                                'date' => '',
                                'form_data' => [
                                    'memberRatings' => array_map(function($m) {
                                        return [
                                            'member_id' => intval($m['member_id']),
                                            'full_name' => $m['full_name'],
                                            'designation' => $m['designation'],
                                        ];
                                    }, $teamMembers),
                                    'ratings' => [],
                                ],
                            ];
                            $selfEval['forms'][] = $newForm;
                            $updated = true;
                        }
                    }
                    
                    // Reset no_of_submitted
                    $selfEval['no_of_submitted'] = 0;
                    $proposal->team_self_eval = $selfEval;
                }
            }

            // Update team_oral_eval (forms FOR each panel member, but contains team members data)
            if ($proposal->team_oral_eval) {
                $oralEval = is_array($proposal->team_oral_eval) ? $proposal->team_oral_eval : json_decode($proposal->team_oral_eval, true);
                
                if (isset($oralEval['forms']) && is_array($oralEval['forms'])) {
                    // Update teamMembers in all forms (panel members' forms that contain team members)
                    foreach ($oralEval['forms'] as &$form) {
                        if (isset($form['form_data']['teamMembers'])) {
                            // Update teamMembers to match current team members
                            $form['form_data']['teamMembers'] = array_map(function($member) {
                                return [
                                    'member_id' => intval($member['member_id']),
                                    'full_name' => $member['full_name'],
                                    'designation' => $member['designation'],
                                ];
                            }, $teamMembers);
                        }
                        // Reset submission status
                        $form['is_submitted'] = false;
                        $updated = true;
                    }
                    unset($form);
                    
                    // Reset no_of_submitted
                    $oralEval['no_of_submitted'] = 0;
                    $proposal->team_oral_eval = $oralEval;
                }
            }

            if ($updated) {
                $proposal->save();
                Log::info('[DEBUG] Updated proposal evaluation forms', ['proposal_id' => $proposal->id]);
            }
        }
    }

    /**
     * Update evaluation forms when panel members are added or removed
     */
    private function updateProposalPanelForms($capstone, $panelMembers)
    {
        Log::info('[DEBUG] Updating proposal evaluation forms for panel member change');
        
        $proposals = Proposal::where('capstone_id', $capstone->id)->get();
        
        foreach ($proposals as $proposal) {
            $updated = false;
            
            // Get list of current panel member IDs
            $currentPanelMemberIds = array_map(function($member) {
                return intval($member['member_id']);
            }, $panelMembers);

            // Update team_oral_eval (forms FOR each panel member)
            if ($proposal->team_oral_eval) {
                $oralEval = is_array($proposal->team_oral_eval) ? $proposal->team_oral_eval : json_decode($proposal->team_oral_eval, true);
                
                if (isset($oralEval['forms']) && is_array($oralEval['forms'])) {
                    // Remove forms for panel members no longer in list
                    $oralEval['forms'] = array_filter($oralEval['forms'], function($form) use ($currentPanelMemberIds) {
                        return in_array(intval($form['member_id']), $currentPanelMemberIds);
                    });
                    $oralEval['forms'] = array_values($oralEval['forms']); // Re-index array
                    
                    // Reset submission on remaining forms
                    foreach ($oralEval['forms'] as &$form) {
                        $form['is_submitted'] = false;
                        $updated = true;
                    }
                    unset($form);
                    
                    // Add forms for newly added panel members
                    $existingFormPanelMemberIds = array_map(function($form) {
                        return intval($form['member_id']);
                    }, $oralEval['forms']);
                    
                    foreach ($panelMembers as $member) {
                        $memberId = intval($member['member_id']);
                        if (!in_array($memberId, $existingFormPanelMemberIds)) {
                            // Get current team members for teamMembers field
                            $teamList = $capstone->team_list ?? ['list' => []];
                            $teamMembers = $teamList['list'] ?? [];
                            
                            // Create new form for this panel member
                            $newForm = [
                                'member_id' => $memberId,
                                'is_submitted' => false,
                                'full_name' => $member['full_name'],
                                'designation' => $member['designation'],
                                'time' => '',
                                'date' => '',
                                'form_data' => [
                                    'teamMembers' => array_map(function($m) {
                                        return [
                                            'member_id' => intval($m['member_id']),
                                            'full_name' => $m['full_name'],
                                            'designation' => $m['designation'],
                                        ];
                                    }, $teamMembers),
                                    'scores' => [],
                                ],
                            ];
                            $oralEval['forms'][] = $newForm;
                            $updated = true;
                        }
                    }
                    
                    // Reset no_of_submitted
                    $oralEval['no_of_submitted'] = 0;
                    $proposal->team_oral_eval = $oralEval;
                }
            }

            // Update defense_eval (forms FOR each panel member)
            if ($proposal->defense_eval) {
                $defenseEval = is_array($proposal->defense_eval) ? $proposal->defense_eval : json_decode($proposal->defense_eval, true);
                
                if (isset($defenseEval['forms']) && is_array($defenseEval['forms'])) {
                    // Remove forms for panel members no longer in list
                    $defenseEval['forms'] = array_filter($defenseEval['forms'], function($form) use ($currentPanelMemberIds) {
                        return in_array(intval($form['member_id']), $currentPanelMemberIds);
                    });
                    $defenseEval['forms'] = array_values($defenseEval['forms']); // Re-index array
                    
                    // Reset submission on remaining forms
                    foreach ($defenseEval['forms'] as &$form) {
                        $form['is_submitted'] = false;
                        $updated = true;
                    }
                    unset($form);
                    
                    // Add forms for newly added panel members
                    $existingFormPanelMemberIds = array_map(function($form) {
                        return intval($form['member_id']);
                    }, $defenseEval['forms']);
                    
                    foreach ($panelMembers as $member) {
                        $memberId = intval($member['member_id']);
                        if (!in_array($memberId, $existingFormPanelMemberIds)) {
                            // Create new form for this panel member
                            $newForm = [
                                'member_id' => $memberId,
                                'is_submitted' => false,
                                'full_name' => $member['full_name'],
                                'designation' => $member['designation'],
                                'time' => '',
                                'date' => '',
                                'form_data' => [
                                    'scores' => [],
                                    'decision' => '',
                                    'comments' => '',
                                ],
                            ];
                            $defenseEval['forms'][] = $newForm;
                            $updated = true;
                        }
                    }
                    
                    // Reset no_of_submitted
                    $defenseEval['no_of_submitted'] = 0;
                    $proposal->defense_eval = $defenseEval;
                }
            }

            if ($updated) {
                $proposal->save();
                Log::info('[DEBUG] Updated proposal panel forms', ['proposal_id' => $proposal->id]);
            }
        }
    }

    public function updateCapstoneDetails(Request $request, $id)
    {
        $validated = $request->validate([
            'team_name' => 'required|string|max:255',
            'is_live' => 'required|boolean',
            'logo' => 'nullable|string|max:1024',
            'logo_image' => 'nullable|image|mimes:jpeg,png,jpg,gif,svg,webp|max:2048',
        ]);

        try {
            $capstone = Capstone::find($id);

            if (!$capstone) {
                return response()->json(['error' => 'Capstone not found.'], 404);
            }

            // Check if trying to set is_live to true with insufficient team members
            if ($validated['is_live']) {
                $teamList = $capstone->team_list ?? ['list' => []];
                $teamCount = count($teamList['list'] ?? []);
                
                if ($teamCount < 4) {
                    return response()->json([
                        'error' => 'Cannot set capstone as live. Minimum 4 team members required.',
                        'teamCount' => $teamCount,
                    ], 422);
                }
            }

            $capstone->team_name = $validated['team_name'];
            $capstone->is_live = $validated['is_live'];

            if ($request->hasFile('logo_image')) {
                // Upload to Vercel Blob
                $client = new Client();
                $file = $request->file('logo_image');
                
                $response = $client->post('https://blob.vercel-storage.com', [
                    'headers' => [
                        'Authorization' => 'Bearer ' . env('VERCEL_BLOB_TOKEN'),
                        'Content-Type' => $file->getMimeType(),
                    ],
                    'body' => fopen($file->getRealPath(), 'r'),
                ]);

                $blobData = json_decode($response->getBody(), true);
                $capstone->logo = $blobData['url']; // Store the blob URL
            }

            $capstone->save();

            // Parse proposals and decode evaluation JSON strings
            $proposalsData = $this->parseProposalsData($capstone->proposals ?? ['proposals' => []]);

            return response()->json([
                'capstone' => [
                    'id' => $capstone->id,
                    'team_name' => $capstone->team_name,
                    'no_of_team_members' => $capstone->no_of_team_members ?? 0,
                    'no_of_panel_members' => $capstone->no_of_panel_members ?? 0,
                    'no_of_proposals' => $capstone->no_of_proposals ?? 0,
                    'is_live' => $capstone->is_live,
                    'created_at' => $capstone->created_at,
                    'team_list' => $capstone->team_list ?? ['no_members' => '0', 'list' => []],
                    'panel_members' => $capstone->panel_members ?? ['no_members' => '0', 'list' => []],
                    'proposals' => $proposalsData,
                    'logo' => $capstone->logo ?? null,
                ]
            ]);
        } catch (\Exception $e) {
            Log::error('Failed to update capstone details: ' . $e->getMessage());
            return response()->json(['error' => 'Failed to update capstone details. Please try again.'], 500);
        }
    }

    public function createProposal(Request $request, $id)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
        ]);

        try {
            $capstone = Capstone::find($id);

            if (!$capstone) {
                return response()->json(['error' => 'Capstone not found.'], 404);
            }

            // Check minimum member requirements
            $teamList = $capstone->team_list ?? [];
            $panelList = $capstone->panel_members ?? [];
            $teamMembers = is_array($teamList) ? ($teamList['list'] ?? []) : [];
            $panelMembers = is_array($panelList) ? ($panelList['list'] ?? []) : [];

            if (count($teamMembers) < 4 || count($panelMembers) < 5) {
                return response()->json([
                    'error' => 'Minimum requirements not met. At least 4 Team Members and 5 Panel Members are required.',
                    'team_count' => count($teamMembers),
                    'panel_count' => count($panelMembers),
                ], 422);
            }

            // Initialize defense_eval forms (one form per panel member)
            $defenseEvalForms = [];
            foreach ($panelMembers as $panelMember) {
                $defenseEvalForms[] = [
                    'member_id' => (int)$panelMember['member_id'],
                    'is_submitted' => false,
                    'full_name' => $panelMember['full_name'],
                    'designation' => $panelMember['designation'],
                    'time' => '',
                    'date' => '',
                    'form_data' => [
                        'scores' => [],
                        'decision' => '',
                        'comments' => '',
                    ]
                ];
            }

            // Initialize team_self_eval forms (one form per team member)
            $teamSelfEvalForms = [];
            foreach ($teamMembers as $teamMember) {
                // Build the member ratings for all team members
                $memberRatings = [];
                foreach ($teamMembers as $ratingMember) {
                    $memberRatings[] = [
                        'member_id' => (int)$ratingMember['member_id'],
                        'full_name' => $ratingMember['full_name'],
                        'designation' => $ratingMember['designation'],
                    ];
                }

                $teamSelfEvalForms[] = [
                    'member_id' => (int)$teamMember['member_id'],
                    'is_submitted' => false,
                    'full_name' => $teamMember['full_name'],
                    'designation' => $teamMember['designation'],
                    'time' => '',
                    'date' => '',
                    'form_data' => [
                        'memberRatings' => $memberRatings,
                        'ratings' => [], // { "criteriaIdx": { "memberIdx": rating } }
                    ]
                ];
            }

            // Initialize team_oral_eval forms (one form per panel member)
            $teamOralEvalForms = [];
            foreach ($panelMembers as $panelMember) {
                // Build the team members list for oral evaluation
                $teamMembersData = [];
                foreach ($teamMembers as $teamMember) {
                    $teamMembersData[] = [
                        'member_id' => (int)$teamMember['member_id'],
                        'full_name' => $teamMember['full_name'],
                        'designation' => $teamMember['designation'],
                    ];
                }

                $teamOralEvalForms[] = [
                    'member_id' => (int)$panelMember['member_id'],
                    'is_submitted' => false,
                    'full_name' => $panelMember['full_name'],
                    'designation' => $panelMember['designation'],
                    'time' => '',
                    'date' => '',
                    'form_data' => [
                        'teamMembers' => $teamMembersData,
                        'scores' => [], // { "criteriaIdx_memberIdx": score }
                    ]
                ];
            }

            // Create the proposal in the proposals table
            $proposal = Proposal::create([
                'capstone_id' => $id,
                'title' => $validated['title'],
                'defense_eval' => json_encode([
                    'no_of_submitted' => 0,
                    'forms' => $defenseEvalForms,
                ]),
                'team_self_eval' => json_encode([
                    'no_of_submitted' => 0,
                    'forms' => $teamSelfEvalForms,
                ]),
                'team_oral_eval' => json_encode([
                    'no_of_submitted' => 0,
                    'forms' => $teamOralEvalForms,
                ]),
                'gen_documents' => json_encode([]),
            ]);

            // Update capstone's proposals JSON with the new proposal
            $currentProposals = $capstone->proposals ?? ['proposals' => []];
            if (!is_array($currentProposals)) {
                $currentProposals = ['proposals' => []];
            }

            // Ensure proposals array exists
            if (!isset($currentProposals['proposals'])) {
                $currentProposals['proposals'] = [];
            }

            // Add the new proposal
            $currentProposals['proposals'][] = [
                'id' => $proposal->id,
                'title' => $proposal->title,
            ];

            // Update the capstone with new proposals
            $capstone->proposals = $currentProposals;
            $capstone->save();

            // Refresh to get updated data
            $capstone->refresh();

            // Extract counts from JSON structures for response
            $teamCount = isset($capstone->team_list['no_members']) ? intval($capstone->team_list['no_members']) : count($teamMembers);
            $panelCount = isset($capstone->panel_members['no_members']) ? intval($capstone->panel_members['no_members']) : count($panelMembers);
            $proposalCount = isset($capstone->proposals['proposals']) ? count($capstone->proposals['proposals']) : 0;

            // Parse proposals and decode evaluation JSON strings
            $proposalsData = $this->parseProposalsData($capstone->proposals ?? ['proposals' => []]);

            return response()->json([
                'id' => $capstone->id,
                'team_name' => $capstone->team_name,
                'no_of_team_members' => $teamCount,
                'no_of_panel_members' => $panelCount,
                'no_of_proposals' => $proposalCount,
                'is_live' => $capstone->is_live,
                'created_at' => $capstone->created_at,
                'team_list' => $capstone->team_list ?? ['no_members' => '0', 'list' => []],
                'panel_members' => $capstone->panel_members ?? ['no_members' => '0', 'list' => []],
                'proposals' => $proposalsData,
            ]);
        } catch (\Exception $e) {
            Log::error('Failed to create proposal: ' . $e->getMessage() . ' | Trace: ' . $e->getTraceAsString());
            return response()->json(['error' => 'Failed to create proposal. Please try again.'], 500);
        }
    }

    public function deleteProposal($id, $proposalId)
    {
        try {
            $capstone = Capstone::find($id);

            if (!$capstone) {
                return response()->json(['error' => 'Capstone not found.'], 404);
            }

            $proposal = Proposal::find($proposalId);

            if (!$proposal) {
                return response()->json(['error' => 'Proposal not found.'], 404);
            }

            // Verify the proposal belongs to this capstone
            if ($proposal->capstone_id != $id) {
                return response()->json(['error' => 'Proposal does not belong to this capstone.'], 403);
            }

            // Delete the proposal from the database
            $proposal->delete();

            // Update capstone's proposals JSON to remove this proposal
            $currentProposals = $capstone->proposals ?? ['proposals' => []];
            if (!is_array($currentProposals)) {
                $currentProposals = ['proposals' => []];
            }

            // Filter out the deleted proposal
            if (isset($currentProposals['proposals'])) {
                $currentProposals['proposals'] = array_filter(
                    $currentProposals['proposals'],
                    function ($p) use ($proposalId) {
                        return $p['id'] != $proposalId;
                    }
                );
                // Re-index the array
                $currentProposals['proposals'] = array_values($currentProposals['proposals']);
            }

            // Update the capstone
            $capstone->proposals = $currentProposals;
            $capstone->save();

            // Refresh to get updated data
            $capstone->refresh();

            // Extract counts from JSON structures for response
            $teamList = $capstone->team_list ?? [];
            $panelList = $capstone->panel_members ?? [];
            $teamMembers = is_array($teamList) ? ($teamList['list'] ?? []) : [];
            $panelMembers = is_array($panelList) ? ($panelList['list'] ?? []) : [];
            $teamCount = isset($capstone->team_list['no_members']) ? intval($capstone->team_list['no_members']) : count($teamMembers);
            $panelCount = isset($capstone->panel_members['no_members']) ? intval($capstone->panel_members['no_members']) : count($panelMembers);
            $proposalCount = isset($capstone->proposals['proposals']) ? count($capstone->proposals['proposals']) : 0;

            // Parse proposals and decode evaluation JSON strings
            $proposalsData = $this->parseProposalsData($capstone->proposals ?? ['proposals' => []]);

            return response()->json([
                'id' => $capstone->id,
                'team_name' => $capstone->team_name,
                'no_of_team_members' => $teamCount,
                'no_of_panel_members' => $panelCount,
                'no_of_proposals' => $proposalCount,
                'is_live' => $capstone->is_live,
                'created_at' => $capstone->created_at,
                'team_list' => $capstone->team_list ?? ['no_members' => '0', 'list' => []],
                'panel_members' => $capstone->panel_members ?? ['no_members' => '0', 'list' => []],
                'proposals' => $proposalsData,
            ]);
        } catch (\Exception $e) {
            Log::error('Failed to delete proposal: ' . $e->getMessage() . ' | Trace: ' . $e->getTraceAsString());
            return response()->json(['error' => 'Failed to delete proposal. Please try again.'], 500);
        }
    }

    public function updateProposalTitle($id, $proposalId, Request $request)
    {
        try {
            $capstone = Capstone::find($id);

            if (!$capstone) {
                return response()->json(['error' => 'Capstone not found.'], 404);
            }

            $proposal = Proposal::find($proposalId);

            if (!$proposal) {
                return response()->json(['error' => 'Proposal not found.'], 404);
            }

            // Verify the proposal belongs to this capstone
            if ($proposal->capstone_id != $id) {
                return response()->json(['error' => 'Proposal does not belong to this capstone.'], 403);
            }

            // Validate the new title
            $request->validate([
                'title' => 'required|string|max:255',
            ]);

            $newTitle = $request->input('title');

            // Update the proposal title
            $proposal->title = $newTitle;
            $proposal->save();

            // Update capstone's proposals JSON to reflect the new title
            $currentProposals = $capstone->proposals ?? ['proposals' => []];
            if (!is_array($currentProposals)) {
                $currentProposals = json_decode($currentProposals, true);
            }

            if (isset($currentProposals['proposals'])) {
                foreach ($currentProposals['proposals'] as &$p) {
                    if ($p['id'] == $proposalId) {
                        $p['title'] = $newTitle;
                        break;
                    }
                }
            }

            $capstone->proposals = $currentProposals;
            $capstone->save();

            // Refresh to get updated data
            $capstone->refresh();

            // Extract counts from JSON structures for response
            $teamList = $capstone->team_list ?? [];
            $panelList = $capstone->panel_members ?? [];
            $teamMembers = is_array($teamList) ? ($teamList['list'] ?? []) : [];
            $panelMembers = is_array($panelList) ? ($panelList['list'] ?? []) : [];
            $teamCount = isset($capstone->team_list['no_members']) ? intval($capstone->team_list['no_members']) : count($teamMembers);
            $panelCount = isset($capstone->panel_members['no_members']) ? intval($capstone->panel_members['no_members']) : count($panelMembers);
            $proposalCount = isset($capstone->proposals['proposals']) ? count($capstone->proposals['proposals']) : 0;

            // Parse proposals and decode evaluation JSON strings
            $proposalsData = $this->parseProposalsData($capstone->proposals ?? ['proposals' => []]);

            return response()->json([
                'id' => $capstone->id,
                'team_name' => $capstone->team_name,
                'no_of_team_members' => $teamCount,
                'no_of_panel_members' => $panelCount,
                'no_of_proposals' => $proposalCount,
                'is_live' => $capstone->is_live,
                'created_at' => $capstone->created_at,
                'team_list' => $capstone->team_list ?? ['no_members' => '0', 'list' => []],
                'panel_members' => $capstone->panel_members ?? ['no_members' => '0', 'list' => []],
                'proposals' => $proposalsData,
            ]);
        } catch (\Exception $e) {
            Log::error('Failed to update proposal title: ' . $e->getMessage() . ' | Trace: ' . $e->getTraceAsString());
            return response()->json(['error' => 'Failed to update proposal title. Please try again.'], 500);
        }
    }

    public function logout(Request $request)
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();
        return redirect('/admin/login');
    }
}
