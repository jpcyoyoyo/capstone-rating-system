<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Inertia\Inertia;
use App\Models\Capstone;
use App\Models\Proposal;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use App\Services\RemotePdfService;

class NonAdminController extends Controller
{
    public function listCapstones()
    {
        // Get all capstones that are live (is_live = 1)
        $capstones = Capstone::where('is_live', 1)
            ->select('id', 'team_name', 'team_list', 'panel_members', 'proposals', 'logo', 'created_at')
            ->get()
            ->map(function ($capstone) {
                // Extract counts from JSON structures
                $teamCount = isset($capstone->team_list['no_members']) ? intval($capstone->team_list['no_members']) : 0;
                $panelCount = isset($capstone->panel_members['no_members']) ? intval($capstone->panel_members['no_members']) : 0;
                $proposalCount = isset($capstone->proposals['proposals']) ? count($capstone->proposals['proposals']) : 0;

                return [
                    'id' => $capstone->id,
                    'team_name' => $capstone->team_name,
                    'no_of_team_members' => $teamCount,
                    'no_of_panel_members' => $panelCount,
                    'no_of_proposals' => $proposalCount,
                    'created_at' => $capstone->created_at,
                'logo' => $capstone->logo ?? null,
                ];
            });

        return Inertia::render('NonAdmin/Capstones', [
            'capstones' => $capstones,
        ]);
    }

    public function showCapstone($capstone_id)
    {
        $capstone = Capstone::find($capstone_id);

        if (!$capstone) {
            abort(404, 'Capstone not found');
        }

        // Extract counts from JSON structures
        $teamCount = isset($capstone->team_list['no_members']) ? intval($capstone->team_list['no_members']) : 0;
        $panelCount = isset($capstone->panel_members['no_members']) ? intval($capstone->panel_members['no_members']) : 0;
        $proposalCount = isset($capstone->proposals['proposals']) ? count($capstone->proposals['proposals']) : 0;

        return Inertia::render('NonAdmin/CapstoneDetail', [
            'capstone' => [
                'id' => $capstone->id,
                'team_name' => $capstone->team_name,
                'no_of_team_members' => $teamCount,
                'no_of_panel_members' => $panelCount,
                'no_of_proposals' => $proposalCount,
                'is_live' => $capstone->is_live ?? 0,
                'created_at' => $capstone->created_at,
                'team_list' => $capstone->team_list ?? ['list' => []],
                'panel_members' => $capstone->panel_members ?? ['list' => []],
                'logo' => $capstone->logo ?? null,
            ],
        ]);
    }

    public function showProposal($capstone_id, $proposal_id)
    {
        $capstone = Capstone::find($capstone_id);

        if (!$capstone) {
            abort(404, 'Capstone not found');
        }

        return Inertia::render('NonAdmin/ProposalDetail', [
            'capstone_id' => $capstone_id,
            'proposal_id' => $proposal_id,
        ]);
    }

    public function showForm($capstone_id)
    {
        return Inertia::render('NonAdmin/Form', [
            'capstone_id' => $capstone_id,
        ]);
    }

    public function showProposalDefenseEvaluation($capstone_id)
    {
        $capstone = Capstone::find($capstone_id);

        if (!$capstone) {
            abort(404, 'Capstone not found');
        }

        // Redirect if capstone is not live
        if (!$capstone->is_live) {
            return redirect("/capstone/{$capstone_id}");
        }

        $proposalRecords = Proposal::where('capstone_id', $capstone_id)->get();
        $proposals = $proposalRecords->map(function ($proposal) {
            // Decode JSON fields to ensure they're arrays, not strings
            $defenseEval = $proposal->defense_eval 
                ? (is_string($proposal->defense_eval) ? json_decode($proposal->defense_eval, true) : $proposal->defense_eval)
                : ['no_of_submitted' => 0, 'forms' => []];
            
            return [
                'id' => $proposal->id,
                'title' => $proposal->title,
                'defense_eval' => $defenseEval,
                'team_self_eval' => $proposal->team_self_eval,
                'team_oral_eval' => $proposal->team_oral_eval,
            ];
        })->toArray();

        $proposal = $proposalRecords->first();
        $defenseEval = $proposal && $proposal->defense_eval 
            ? (is_string($proposal->defense_eval) ? json_decode($proposal->defense_eval, true) : $proposal->defense_eval)
            : ['no_of_submitted' => 0, 'forms' => []];

        return Inertia::render('NonAdmin/ProposalDefenseEvaluation', [
            'capstone' => [
                'id' => $capstone->id,
                'team_name' => $capstone->team_name,
                'team_list' => $capstone->team_list ?? ['list' => []],
                'panel_members' => $capstone->panel_members ?? ['list' => []],
                'proposals' => ['proposals' => $proposals],
            ],
            'defenseEval' => $defenseEval,
        ]);
    }

    public function updateProposalDefenseEvaluation(Request $request, $capstone_id, $proposal_id, $evaluator_id)
    {
        $validated = $request->validate([
            'scores' => 'nullable|array',
            'decision' => 'nullable|string',
            'comments' => 'nullable|string',
            'evalTime' => 'nullable|string',
            'evalDate' => 'nullable|string',
        ]);

        try {
            $proposal = Proposal::where('capstone_id', $capstone_id)->where('id', $proposal_id)->first();

            if (!$proposal) {
                return response()->json(['error' => 'Proposal not found.'], 404);
            }

            $defenseEval = $proposal->defense_eval 
                ? (is_string($proposal->defense_eval) ? json_decode($proposal->defense_eval, true) : $proposal->defense_eval)
                : ['no_of_submitted' => 0, 'forms' => []];

            // Find the evaluator's form
            $formIndex = null;
            foreach ($defenseEval['forms'] as $index => $form) {
                if ((int)$form['member_id'] === (int)$evaluator_id) {
                    $formIndex = $index;
                    break;
                }
            }

            if ($formIndex === null) {
                return response()->json(['error' => 'Evaluator form not found.'], 404);
            }

            // Update the form data
            $defenseEval['forms'][$formIndex]['time'] = $validated['evalTime'] ?? $defenseEval['forms'][$formIndex]['time'] ?? '';
            $defenseEval['forms'][$formIndex]['date'] = $validated['evalDate'] ?? $defenseEval['forms'][$formIndex]['date'] ?? '';
            $defenseEval['forms'][$formIndex]['form_data']['scores'] = $validated['scores'] ?? $defenseEval['forms'][$formIndex]['form_data']['scores'] ?? [];
            $defenseEval['forms'][$formIndex]['form_data']['decision'] = $validated['decision'] ?? $defenseEval['forms'][$formIndex]['form_data']['decision'] ?? '';
            // For comments, check the raw request input to allow empty strings - don't fall back to old value if key exists in request
            $defenseEval['forms'][$formIndex]['form_data']['comments'] = $request->has('comments') ? ($request->input('comments') ?? '') : ($defenseEval['forms'][$formIndex]['form_data']['comments'] ?? '');

            // Save back to database
            $proposal->defense_eval = json_encode($defenseEval);
            $proposal->save();

            return redirect()->back()->with('success', 'Evaluation updated successfully.');

        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to update evaluation: ' . $e->getMessage()], 500);
        }
    }

    public function toggleProposalDefenseSubmission(Request $request, $capstone_id, $proposal_id, $evaluator_id)
    {
        $validated = $request->validate([
            'is_submitted' => 'required|boolean',
        ]);

        try {
            $proposal = Proposal::where('capstone_id', $capstone_id)->where('id', $proposal_id)->first();

            if (!$proposal) {
                return response()->json(['error' => 'Proposal not found.'], 404);
            }

            $defenseEval = $proposal->defense_eval 
                ? (is_string($proposal->defense_eval) ? json_decode($proposal->defense_eval, true) : $proposal->defense_eval)
                : ['no_of_submitted' => 0, 'forms' => []];

            // Find the evaluator's form
            $formIndex = null;
            foreach ($defenseEval['forms'] as $index => $form) {
                if ((int)$form['member_id'] === (int)$evaluator_id) {
                    $formIndex = $index;
                    break;
                }
            }

            if ($formIndex === null) {
                return redirect()->back()->with('error', 'Evaluator form not found.');
            }

            // Get the current submission status
            $wasSubmitted = $defenseEval['forms'][$formIndex]['is_submitted'] ?? false;
            $isNowSubmitted = $validated['is_submitted'];

            // Update the form's submission status
            $defenseEval['forms'][$formIndex]['is_submitted'] = $isNowSubmitted;

            // Update the no_of_submitted counter
            if ($isNowSubmitted && !$wasSubmitted) {
                // Marking as submitted - increment
                $defenseEval['no_of_submitted'] = ($defenseEval['no_of_submitted'] ?? 0) + 1;
            } elseif (!$isNowSubmitted && $wasSubmitted) {
                // Unmarking as submitted - decrement
                $defenseEval['no_of_submitted'] = max(0, ($defenseEval['no_of_submitted'] ?? 1) - 1);
            }

            // Save back to database
            $proposal->defense_eval = json_encode($defenseEval);
            $proposal->save();

            return redirect()->back()->with('success', 'Submission status updated successfully.');

        } catch (\Exception $e) {
            return response()->json(['error' => 'Failed to update submission: ' . $e->getMessage()], 500);
        }
    }

    public function resetProposalDefenseEvaluation($capstone_id, $proposal_id, $evaluator_id)
    {
        try {
            $proposal = Proposal::where('capstone_id', $capstone_id)->where('id', $proposal_id)->first();

            if (!$proposal) {
                return response()->json(['error' => 'Proposal not found.'], 404);
            }

            $defenseEval = $proposal->defense_eval 
                ? (is_string($proposal->defense_eval) ? json_decode($proposal->defense_eval, true) : $proposal->defense_eval)
                : ['no_of_submitted' => 0, 'forms' => []];

            // Find and reset the evaluator's form
            foreach ($defenseEval['forms'] as &$form) {
                if ((int)$form['member_id'] === (int)$evaluator_id) {
                    // Check if form was submitted BEFORE resetting
                    $wasSubmitted = $form['is_submitted'] ?? false;
                    
                    // Reset only the form data, keep evaluator info
                    $form['form_data'] = [
                        'scores' => [],
                        'decision' => '',
                        'comments' => '',
                    ];
                    $form['time'] = '';
                    $form['date'] = '';
                    $form['is_submitted'] = false;
                    
                    // Decrement submitted counter if it was submitted before reset
                    if ($wasSubmitted) {
                        $defenseEval['no_of_submitted'] = max(0, ($defenseEval['no_of_submitted'] ?? 1) - 1);
                    }
                    break;
                }
            }

            // Save back to database
            $proposal->defense_eval = json_encode($defenseEval);
            $proposal->save();

            return redirect()->back()->with('success', 'Evaluation form reset successfully.');

        } catch (\Exception $e) {
            return redirect()->back()->with('error', 'Failed to reset evaluation: ' . $e->getMessage());
        }
    }

    public function resetSelfEvaluation($capstone_id, $proposal_id, $reviewer_id)
    {
        try {
            $proposal = Proposal::where('capstone_id', $capstone_id)->where('id', $proposal_id)->first();

            if (!$proposal) {
                return response()->json(['error' => 'Proposal not found.'], 404);
            }

            $selfEval = $proposal->team_self_eval 
                ? (is_string($proposal->team_self_eval) ? json_decode($proposal->team_self_eval, true) : $proposal->team_self_eval)
                : ['no_of_submitted' => 0, 'forms' => []];

            // Find and reset the reviewer's form
            foreach ($selfEval['forms'] as &$form) {
                if ((int)$form['member_id'] === (int)$reviewer_id) {
                    // Check if form was submitted BEFORE resetting
                    $wasSubmitted = $form['is_submitted'] ?? false;
                    
                    // Reset only the form data, keep reviewer info
                    $form['form_data'] = [
                        'ratings' => [],
                        'memberRatings' => $form['form_data']['memberRatings'] ?? [],
                    ];
                    $form['time'] = '';
                    $form['date'] = '';
                    $form['is_submitted'] = false;
                    
                    // Decrement submitted counter if it was submitted before reset
                    if ($wasSubmitted) {
                        $selfEval['no_of_submitted'] = max(0, ($selfEval['no_of_submitted'] ?? 1) - 1);
                    }
                    break;
                }
            }

            // Save back to database
            $proposal->team_self_eval = json_encode($selfEval);
            $proposal->save();

            return redirect()->back()->with('success', 'Evaluation form reset successfully.');

        } catch (\Exception $e) {
            return redirect()->back()->with('error', 'Failed to reset evaluation: ' . $e->getMessage());
        }
    }

    public function resetOralPresentationEvaluation($capstone_id, $proposal_id, $evaluator_id)
    {
        try {
            $proposal = Proposal::where('capstone_id', $capstone_id)->where('id', $proposal_id)->first();

            if (!$proposal) {
                return response()->json(['error' => 'Proposal not found.'], 404);
            }

            $oralEval = $proposal->team_oral_eval 
                ? (is_string($proposal->team_oral_eval) ? json_decode($proposal->team_oral_eval, true) : $proposal->team_oral_eval)
                : ['no_of_submitted' => 0, 'forms' => []];

            // Find and reset the evaluator's form
            foreach ($oralEval['forms'] as &$form) {
                if ((int)$form['member_id'] === (int)$evaluator_id) {
                    // Check if form was submitted BEFORE resetting
                    $wasSubmitted = $form['is_submitted'] ?? false;
                    
                    // Reset only the form data, keep evaluator info
                    $form['form_data'] = [
                        'scores' => [],
                        'teamMembers' => $form['form_data']['teamMembers'] ?? [],
                    ];
                    $form['time'] = '';
                    $form['date'] = '';
                    $form['is_submitted'] = false;
                    
                    // Decrement submitted counter if it was submitted before reset
                    if ($wasSubmitted) {
                        $oralEval['no_of_submitted'] = max(0, ($oralEval['no_of_submitted'] ?? 1) - 1);
                    }
                    break;
                }
            }

            // Save back to database
            $proposal->team_oral_eval = json_encode($oralEval);
            $proposal->save();

            return redirect()->back()->with('success', 'Evaluation form reset successfully.');

        } catch (\Exception $e) {
            return redirect()->back()->with('error', 'Failed to reset evaluation: ' . $e->getMessage());
        }
    }

    public function showPeerSelfEvaluation($capstone_id)
    {
        $capstone = Capstone::find($capstone_id);

        if (!$capstone) {
            abort(404, 'Capstone not found');
        }

        // Redirect if capstone is not live
        if (!$capstone->is_live) {
            return redirect("/capstone/{$capstone_id}");
        }

        $proposalRecords = Proposal::where('capstone_id', $capstone_id)->get();
        $proposals = $proposalRecords->map(function ($proposal) {
            // Decode JSON fields to ensure they're arrays, not strings
            $teamSelfEval = $proposal->team_self_eval 
                ? (is_string($proposal->team_self_eval) ? json_decode($proposal->team_self_eval, true) : $proposal->team_self_eval)
                : ['no_of_submitted' => 0, 'forms' => []];
            
            return [
                'id' => $proposal->id,
                'title' => $proposal->title,
                'defense_eval' => $proposal->defense_eval,
                'team_self_eval' => $teamSelfEval,
                'team_oral_eval' => $proposal->team_oral_eval,
            ];
        })->toArray();

        $proposal = $proposalRecords->first();
        $selfEval = $proposal && $proposal->team_self_eval 
            ? (is_string($proposal->team_self_eval) ? json_decode($proposal->team_self_eval, true) : $proposal->team_self_eval)
            : ['no_of_submitted' => 0, 'forms' => []];

        return Inertia::render('NonAdmin/PeerAndSelfEvaluation', [
            'capstone' => [
                'id' => $capstone->id,
                'team_name' => $capstone->team_name,
                'team_list' => $capstone->team_list ?? ['list' => []],
                'proposals' => ['proposals' => $proposals],
            ],
            'selfEval' => $selfEval,
        ]);
    }

    public function showOralPresentationEvaluation($capstone_id)
    {
        $capstone = Capstone::find($capstone_id);

        if (!$capstone) {
            abort(404, 'Capstone not found');
        }

        // Redirect if capstone is not live
        if (!$capstone->is_live) {
            return redirect("/capstone/{$capstone_id}");
        }

        $proposalRecords = Proposal::where('capstone_id', $capstone_id)->get();
        $proposals = $proposalRecords->map(function ($proposal) {
            // Decode JSON fields to ensure they're arrays, not strings
            $teamOralEval = $proposal->team_oral_eval 
                ? (is_string($proposal->team_oral_eval) ? json_decode($proposal->team_oral_eval, true) : $proposal->team_oral_eval)
                : ['no_of_submitted' => 0, 'forms' => []];
            
            return [
                'id' => $proposal->id,
                'title' => $proposal->title,
                'defense_eval' => $proposal->defense_eval,
                'team_self_eval' => $proposal->team_self_eval,
                'team_oral_eval' => $teamOralEval,
            ];
        })->toArray();

        $proposal = $proposalRecords->first();
        $oralEval = $proposal && $proposal->team_oral_eval 
            ? (is_string($proposal->team_oral_eval) ? json_decode($proposal->team_oral_eval, true) : $proposal->team_oral_eval)
            : ['no_of_submitted' => 0, 'forms' => []];

        return Inertia::render('NonAdmin/OralPresentationEvaluation', [
            'capstone' => [
                'id' => $capstone->id,
                'team_name' => $capstone->team_name,
                'team_list' => $capstone->team_list ?? ['list' => []],
                'panel_members' => $capstone->panel_members ?? ['list' => []],
                'proposals' => ['proposals' => $proposals],
            ],
            'oralEval' => $oralEval,
        ]);
    }

    public function updateOralPresentationEvaluation(Request $request, $capstone_id, $proposal_id, $evaluator_id)
    {
        $validated = $request->validate([
            'scores' => 'nullable|array',
            'evalTime' => 'nullable|string',
            'evalDate' => 'nullable|string',
        ]);

        try {
            $proposal = Proposal::where('capstone_id', $capstone_id)->where('id', $proposal_id)->first();

            if (!$proposal) {
                return redirect()->back()->with('error', 'Proposal not found.');
            }

            $oralEval = $proposal->team_oral_eval 
                ? (is_string($proposal->team_oral_eval) ? json_decode($proposal->team_oral_eval, true) : $proposal->team_oral_eval)
                : ['no_of_submitted' => 0, 'forms' => []];

            // Find the evaluator's form
            $formIndex = null;
            foreach ($oralEval['forms'] as $index => $form) {
                if ((int)$form['member_id'] === (int)$evaluator_id) {
                    $formIndex = $index;
                    break;
                }
            }

            if ($formIndex === null) {
                return redirect()->back()->with('error', 'Evaluator form not found.');
            }
            $oralEval['forms'][$formIndex]['time'] = $validated['evalTime'] ?? $oralEval['forms'][$formIndex]['time'] ?? '';
            $oralEval['forms'][$formIndex]['date'] = $validated['evalDate'] ?? $oralEval['forms'][$formIndex]['date'] ?? '';
            $oralEval['forms'][$formIndex]['form_data']['scores'] = $validated['scores'] ?? $oralEval['forms'][$formIndex]['form_data']['scores'] ?? [];

            // Save back to database
            $proposal->team_oral_eval = json_encode($oralEval);
            $proposal->save();

            return redirect()->back()->with('success', 'Evaluation auto-saved successfully.');

        } catch (\Exception $e) {
            return redirect()->back()->with('error', 'Failed to save evaluation: ' . $e->getMessage());
        }
    }

    public function toggleOralPresentationSubmission(Request $request, $capstone_id, $proposal_id, $evaluator_id)
    {
        $validated = $request->validate([
            'is_submitted' => 'required|boolean',
        ]);

        try {
            $proposal = Proposal::where('capstone_id', $capstone_id)->where('id', $proposal_id)->first();

            if (!$proposal) {
                return redirect()->back()->with('error', 'Proposal not found.');
            }

            $oralEval = $proposal->team_oral_eval 
                ? (is_string($proposal->team_oral_eval) ? json_decode($proposal->team_oral_eval, true) : $proposal->team_oral_eval)
                : ['no_of_submitted' => 0, 'forms' => []];

            // Find the evaluator's form
            $formIndex = null;
            foreach ($oralEval['forms'] as $index => $form) {
                if ((int)$form['member_id'] === (int)$evaluator_id) {
                    $formIndex = $index;
                    break;
                }
            }

            if ($formIndex === null) {
                return redirect()->back()->with('error', 'Evaluator form not found.');
            }

            // Get the current submission status
            $wasSubmitted = $oralEval['forms'][$formIndex]['is_submitted'] ?? false;
            $isNowSubmitted = $validated['is_submitted'];

            // Update the form's submission status
            $oralEval['forms'][$formIndex]['is_submitted'] = $isNowSubmitted;

            // Update the no_of_submitted counter
            if ($isNowSubmitted && !$wasSubmitted) {
                // Marking as submitted - increment
                $oralEval['no_of_submitted'] = ($oralEval['no_of_submitted'] ?? 0) + 1;
            } elseif (!$isNowSubmitted && $wasSubmitted) {
                // Unmarking as submitted - decrement
                $oralEval['no_of_submitted'] = max(0, ($oralEval['no_of_submitted'] ?? 1) - 1);
            }

            // Save back to database
            $proposal->team_oral_eval = json_encode($oralEval);
            $proposal->save();

            return redirect()->back()->with('success', $isNowSubmitted ? 'Form submitted successfully.' : 'Form unsubmitted successfully.');

        } catch (\Exception $e) {
            return redirect()->back()->with('error', 'Failed to update submission: ' . $e->getMessage());
        }
    }

    public function updateSelfEvaluation(Request $request, $capstone_id, $proposal_id, $reviewer_id)
    {
        $validated = $request->validate([
            'ratings' => 'nullable|array',
            'memberRatings' => 'nullable|array',
            'evalTime' => 'nullable|string',
            'evalDate' => 'nullable|string',
        ]);

        try {
            $proposal = Proposal::where('capstone_id', $capstone_id)->where('id', $proposal_id)->first();

            if (!$proposal) {
                return redirect()->back()->with('error', 'Proposal not found.');
            }

            $selfEval = $proposal->team_self_eval 
                ? (is_string($proposal->team_self_eval) ? json_decode($proposal->team_self_eval, true) : $proposal->team_self_eval)
                : ['no_of_submitted' => 0, 'forms' => []];

            // Find the reviewer's form
            $formIndex = null;
            foreach ($selfEval['forms'] as $index => $form) {
                if ((int)$form['member_id'] === (int)$reviewer_id) {
                    $formIndex = $index;
                    break;
                }
            }

            if ($formIndex === null) {
                return redirect()->back()->with('error', 'Reviewer form not found.');
            }

            // Update form data - time and date at form level, ratings in form_data
            $selfEval['forms'][$formIndex]['time'] = $validated['evalTime'] ?? '';
            $selfEval['forms'][$formIndex]['date'] = $validated['evalDate'] ?? '';
            $selfEval['forms'][$formIndex]['form_data']['ratings'] = $validated['ratings'] ?? [];
            $selfEval['forms'][$formIndex]['form_data']['memberRatings'] = $validated['memberRatings'] ?? [];

            // Save back to database
            $proposal->team_self_eval = json_encode($selfEval);
            $proposal->save();

            return redirect()->back()->with('success', 'Self evaluation auto-saved successfully.');

        } catch (\Exception $e) {
            return redirect()->back()->with('error', 'Failed to save self evaluation: ' . $e->getMessage());
        }
    }

    public function toggleSelfEvaluationSubmission(Request $request, $capstone_id, $proposal_id, $reviewer_id)
    {
        $validated = $request->validate([
            'is_submitted' => 'required|boolean',
        ]);

        try {
            $proposal = Proposal::where('capstone_id', $capstone_id)->where('id', $proposal_id)->first();

            if (!$proposal) {
                return redirect()->back()->with('error', 'Proposal not found.');
            }

            $selfEval = $proposal->team_self_eval 
                ? (is_string($proposal->team_self_eval) ? json_decode($proposal->team_self_eval, true) : $proposal->team_self_eval)
                : ['no_of_submitted' => 0, 'forms' => []];

            // Find the reviewer's form
            $formIndex = null;
            foreach ($selfEval['forms'] as $index => $form) {
                if ((int)$form['member_id'] === (int)$reviewer_id) {
                    $formIndex = $index;
                    break;
                }
            }

            if ($formIndex === null) {
                return redirect()->back()->with('error', 'Reviewer form not found.');
            }

            // Get the current submission status
            $wasSubmitted = $selfEval['forms'][$formIndex]['is_submitted'] ?? false;
            $isNowSubmitted = $validated['is_submitted'];

            // Update the submission status
            $selfEval['forms'][$formIndex]['is_submitted'] = $isNowSubmitted;

            // Update no_of_submitted count
            if ($isNowSubmitted && !$wasSubmitted) {
                $selfEval['no_of_submitted'] = ($selfEval['no_of_submitted'] ?? 0) + 1;
            } elseif (!$isNowSubmitted && $wasSubmitted) {
                $selfEval['no_of_submitted'] = max(0, ($selfEval['no_of_submitted'] ?? 1) - 1);
            }

            // Save back to database
            $proposal->team_self_eval = json_encode($selfEval);
            $proposal->save();

            return redirect()->back()->with('success', $isNowSubmitted ? 'Form submitted successfully.' : 'Form unsubmitted successfully.');

        } catch (\Exception $e) {
            return redirect()->back()->with('error', 'Failed to update submission: ' . $e->getMessage());
        }
    }

    /**
     * Get all submitted forms for a capstone
     */
    public function getSubmittedForms($capstone_id)
    {
        try {
            $capstone = Capstone::find($capstone_id);
            if (!$capstone) {
                return response()->json(['error' => 'Capstone not found'], 404);
            }

            $proposals = Proposal::where('capstone_id', $capstone_id)->get();
            $submittedForms = [];

            foreach ($proposals as $proposalIndex => $proposal) {
                $proposalNumber = $proposalIndex + 1;

                // Check Defense Evaluation
                if ($proposal->defense_eval) {
                    $defenseEval = is_string($proposal->defense_eval) ? json_decode($proposal->defense_eval, true) : $proposal->defense_eval;
                    if (isset($defenseEval['forms']) && is_array($defenseEval['forms'])) {
                        foreach ($defenseEval['forms'] as $form) {
                            if ($form['is_submitted'] ?? false) {
                                $submittedForms[] = [
                                    'id' => count($submittedForms),
                                    'proposal_id' => $proposal->id,
                                    'proposal_name' => $proposal->title ?? 'Untitled',
                                    'proposal_number' => $proposalNumber,
                                    'full_name' => $form['full_name'] ?? 'Unknown',
                                    'designation' => $form['designation'] ?? 'N/A',
                                    'form_type' => 'Proposal Defense Evaluation',
                                    'time' => $form['time'] ?? '',
                                    'date' => $form['date'] ?? '',
                                    'is_submitted' => true,
                                ];
                            }
                        }
                    }
                }

                // Check Peer & Self Evaluation
                if ($proposal->team_self_eval) {
                    $selfEval = is_string($proposal->team_self_eval) ? json_decode($proposal->team_self_eval, true) : $proposal->team_self_eval;
                    if (isset($selfEval['forms']) && is_array($selfEval['forms'])) {
                        foreach ($selfEval['forms'] as $form) {
                            if ($form['is_submitted'] ?? false) {
                                $submittedForms[] = [
                                    'id' => count($submittedForms),
                                    'proposal_id' => $proposal->id,
                                    'proposal_name' => $proposal->title ?? 'Untitled',
                                    'proposal_number' => $proposalNumber,
                                    'full_name' => $form['full_name'] ?? 'Unknown',
                                    'designation' => $form['designation'] ?? 'N/A',
                                    'form_type' => 'Peer & Self Evaluation',
                                    'time' => $form['time'] ?? '',
                                    'date' => $form['date'] ?? '',
                                    'is_submitted' => true,
                                ];
                            }
                        }
                    }
                }

                // Check Oral Presentation Evaluation
                if ($proposal->team_oral_eval) {
                    $oralEval = is_string($proposal->team_oral_eval) ? json_decode($proposal->team_oral_eval, true) : $proposal->team_oral_eval;
                    if (isset($oralEval['forms']) && is_array($oralEval['forms'])) {
                        foreach ($oralEval['forms'] as $form) {
                            if ($form['is_submitted'] ?? false) {
                                $submittedForms[] = [
                                    'id' => count($submittedForms),
                                    'proposal_id' => $proposal->id,
                                    'proposal_name' => $proposal->title ?? 'Untitled',
                                    'proposal_number' => $proposalNumber,
                                    'full_name' => $form['full_name'] ?? 'Unknown',
                                    'designation' => $form['designation'] ?? 'N/A',
                                    'form_type' => 'Oral Presentation Evaluation',
                                    'time' => $form['time'] ?? '',
                                    'date' => $form['date'] ?? '',
                                    'is_submitted' => true,
                                ];
                            }
                        }
                    }
                }
            }

            return response()->json($submittedForms);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    /**
     * Generate PDFs for all submitted forms via socket-server batch endpoint
     * Socket-server handles PDF generation with proper file organization and ZIP creation
     */
    public function generatePdfZip(Request $request, $capstone_id)
    {
        // Increase execution time for download processing
        set_time_limit(300); // 5 minutes
        
        Log::info('[PDF Generation] Starting batch PDF generation for capstone: ' . $capstone_id);
        Log::info('[PDF Generation] Using socket-server endpoint: POST /generate-batch-zip');
        
        try {
            $capstone = Capstone::find($capstone_id);
            if (!$capstone) {
                Log::error('[PDF Generation] Capstone not found: ' . $capstone_id);
                return response()->json(['error' => 'Capstone not found'], 404);
            }
            
            Log::info('[PDF Generation] Found capstone: ' . $capstone->team_name);

            $proposals = Proposal::where('capstone_id', $capstone_id)->get();
            Log::info('[PDF Generation] Found ' . $proposals->count() . ' proposals');

            // Collect all submitted forms
            $formsToGenerate = [];

            foreach ($proposals as $proposalIndex => $proposal) {
                $proposalNumber = $proposalIndex + 1;
                Log::info('[PDF Generation] Collecting forms from Proposal ' . $proposalNumber);

                // Defense Evaluation
                if ($proposal->defense_eval) {
                    $defenseEval = is_string($proposal->defense_eval) ? json_decode($proposal->defense_eval, true) : $proposal->defense_eval;
                    if (isset($defenseEval['forms']) && is_array($defenseEval['forms'])) {
                        foreach ($defenseEval['forms'] as $formIndex => $form) {
                            if ($form['is_submitted'] ?? false) {
                                Log::info('[PDF Generation] Queuing Defense form for Proposal ' . $proposalNumber);
                                
                                // Generate HTML from template
                                $html = $this->renderEvaluationTemplate('defense_eval', $form, $proposal);
                                $proposalFolders = substr($proposalNumber . '_' . $proposal->title, 0, 30);
                                $formsToGenerate[] = [
                                    'html' => $html,
                                    'formType' => 'Proposal Defense Evaluation',
                                    'proposalNumber' => str_pad($proposalNumber, 3, '0', STR_PAD_LEFT),
                                    'proposalFolder' => $proposalFolders,
                                    'evaluatorName' => $form['full_name'] ?? 'Unknown',
                                    'formIndex' => $formIndex + 1,
                                ];
                            }
                        }
                    }
                }

                // Peer & Self Evaluation
                if ($proposal->team_self_eval) {
                    $selfEval = is_string($proposal->team_self_eval) ? json_decode($proposal->team_self_eval, true) : $proposal->team_self_eval;
                    if (isset($selfEval['forms']) && is_array($selfEval['forms'])) {
                        foreach ($selfEval['forms'] as $formIndex => $form) {
                            if ($form['is_submitted'] ?? false) {
                                Log::info('[PDF Generation] Queuing Self Evaluation form for Proposal ' . $proposalNumber);
                                
                                // Generate HTML from template
                                $html = $this->renderEvaluationTemplate('team_self_eval', $form, $proposal);
                                $proposalFolders = substr($proposalNumber . '_' . $proposal->title, 0, 30);
                                $formsToGenerate[] = [
                                    'html' => $html,
                                    'formType' => 'Peer & Self Evaluation',
                                    'proposalNumber' => str_pad($proposalNumber, 3, '0', STR_PAD_LEFT),
                                    'proposalFolder' => $proposalFolders,
                                    'evaluatorName' => $form['full_name'] ?? 'Unknown',
                                    'formIndex' => $formIndex + 1,
                                ];
                            }
                        }
                    }
                }

                // Oral Presentation Evaluation
                if ($proposal->team_oral_eval) {
                    $oralEval = is_string($proposal->team_oral_eval) ? json_decode($proposal->team_oral_eval, true) : $proposal->team_oral_eval;
                    if (isset($oralEval['forms']) && is_array($oralEval['forms'])) {
                        foreach ($oralEval['forms'] as $formIndex => $form) {
                            if ($form['is_submitted'] ?? false) {
                                Log::info('[PDF Generation] Queuing Oral Presentation form for Proposal ' . $proposalNumber);
                                
                                // Generate HTML from template
                                $html = $this->renderEvaluationTemplate('team_oral_eval', $form, $proposal);
                                $proposalFolders = substr($proposalNumber . '_' . $proposal->title, 0, 30);
                                $formsToGenerate[] = [
                                    'html' => $html,
                                    'formType' => 'Oral Presentation Evaluation',
                                    'proposalNumber' => str_pad($proposalNumber, 3, '0', STR_PAD_LEFT),
                                    'proposalFolder' => $proposalFolders,
                                    'evaluatorName' => $form['full_name'] ?? 'Unknown',
                                    'formIndex' => $formIndex + 1,
                                ];
                            }
                        }
                    }
                }
            }

            if (empty($formsToGenerate)) {
                Log::warning('[PDF Generation] No submitted forms found to generate');
                return response()->json(['error' => 'No submitted forms found'], 400);
            }

            Log::info('[PDF Generation] Collected ' . count($formsToGenerate) . ' forms to generate');
            Log::info('[PDF Generation] Sending batch request to socket-server...');

            // Send batch request to socket-server
            $socketServerUrl = config('services.socket_server_url') ?? 'http://localhost:6001';
            $response = Http::timeout(600)->post($socketServerUrl . '/generate-batch-zip', [
                'capstoneId' => $capstone->id,
                'teamName' => $capstone->team_name,
                'forms' => $formsToGenerate,
            ]);

            if (!$response->successful()) {
                Log::error('[PDF Generation] Socket-server error: ' . $response->status() . ' - ' . $response->body());
                return response()->json(['error' => 'Failed to generate PDFs: ' . $response->status()], 500);
            }

            $batchResult = $response->json();
            Log::info('[PDF Generation] ✓ Batch generation successful: ' . json_encode($batchResult));

            // Download the ZIP file from socket-server
            if (isset($batchResult['downloadUrl'])) {
                $zipResponse = Http::timeout(60)->get($socketServerUrl . $batchResult['downloadUrl']);
                
                if (!$zipResponse->successful()) {
                    Log::error('[PDF Generation] Failed to download ZIP from socket-server');
                    return response()->json(['error' => 'Failed to download ZIP file'], 500);
                }

                // Return ZIP file as download
                $filename = $batchResult['filename'] ?? 'Evaluations.zip';
                return response($zipResponse->body(), 200, [
                    'Content-Type' => 'application/zip',
                    'Content-Disposition' => 'attachment; filename="' . $filename . '"',
                ]);
            }

            return response()->json($batchResult);

        } catch (\Exception $e) {
            Log::error('[PDF Generation] Error: ' . $e->getMessage());
            return response()->json(['error' => 'PDF generation failed: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Render evaluation template with form data
     * Returns HTML string ready for PDF conversion
     */
    private function renderEvaluationTemplate($evalType, $form, $proposal)
    {
        $templatePath = resource_path("views/eval_docuement_render/{$evalType}.htm");
        
        if (!file_exists($templatePath)) {
            throw new \Exception("Template not found: {$evalType}");
        }

        $html = file_get_contents($templatePath);
        $originalHtmlSize = strlen($html);
        Log::debug('[Template] Loaded template: ' . $evalType . ', size: ' . $originalHtmlSize . ' bytes');
        
        // Build replacements based on evaluation type
        $replacements = $this->buildFormDataReplacements($form, $evalType, $proposal);
        
        $hasMultiPage = isset($replacements['__PAGES__']);
        Log::debug('[Template] Multi-page: ' . ($hasMultiPage ? 'YES' : 'NO') . ', replacements count: ' . count($replacements));

        // Handle multi-page replacements
        if ($hasMultiPage) {
            $pageReplacements = $replacements['__PAGES__'];
            unset($replacements['__PAGES__']);
            
            $pageCount = count($pageReplacements);
            Log::debug('[Template] Page count: ' . $pageCount);

            // Extract body to find where content section is
            $bodyStart = strpos($html, '<body');
            $bodyEnd = strpos($html, '>', $bodyStart);
            $bodyClosePos = strrpos($html, '</body>');
            
            Log::debug('[Template] Body positions - start: ' . ($bodyStart !== false ? $bodyStart : 'NOT_FOUND') . 
                       ', end: ' . ($bodyEnd !== false ? $bodyEnd : 'NOT_FOUND') . 
                       ', close: ' . ($bodyClosePos !== false ? $bodyClosePos : 'NOT_FOUND'));
            
            if ($bodyStart !== false && $bodyEnd !== false && $bodyClosePos !== false) {
                // Extract header (before body), body opening, body content, and footer (after body)
                $header = substr($html, 0, $bodyEnd + 1);
                $footer = substr($html, $bodyClosePos);
                $bodyContent = substr($html, $bodyEnd + 1, $bodyClosePos - $bodyEnd - 1);
                
                Log::debug('[Template] Structure - header size: ' . strlen($header) . 
                           ', body content size: ' . strlen($bodyContent) . 
                           ', footer size: ' . strlen($footer));
                
                // Apply base replacements to body content ONCE (not per-page)
                foreach ($replacements as $placeholder => $value) {
                    $bodyContent = str_replace($placeholder, $value, $bodyContent);
                }
                
                Log::debug('[Template] After base replacements, body size: ' . strlen($bodyContent) . ' bytes');
                
                // Split body by page breaks or MS Word page marks if they exist
                // MS Word uses <w:p><w:pPr><w:pageBreakBefore/></w:pPr></w:p> or <div style='page-break-before:always'>
                $pageBreakPatterns = [
                    '/<w:p[^>]*><w:pPr[^>]*><w:pageBreakBefore[^>]*\/><\/w:pPr><\/w:p>/',
                    '/<div[^>]*style=["\']page-break-before[^"\']*["\'][^>]*>.*?<\/div>/i',
                ];
                
                // Try to split by page breaks
                $pages = [$bodyContent];
                foreach ($pageBreakPatterns as $pattern) {
                    if (preg_match_all($pattern, $bodyContent)) {
                        $pages = preg_split($pattern, $bodyContent);
                        Log::debug('[Template] Split by pattern into ' . count($pages) . ' pages');
                        break;
                    }
                }
                
                // If we couldn't split by page breaks but have multiple replacement pages,
                // OR if we have a multi-page template with only 1 page (e.g., 4 members)
                // we need to apply page-specific replacements
                if (count($pages) === 1 && $pageCount >= 1) {
                    Log::debug('[Template] Applying page-specific replacements (pages: ' . count($pages) . ', pageCount: ' . $pageCount . ')');
                    
                    // For each page, apply ONLY the page-specific replacements
                    $finalPages = [];
                    foreach ($pageReplacements as $pageNum => $pageReps) {
                        $pageHtml = $bodyContent;
                        
                        // Apply ONLY page-specific replacements (not base ones again)
                        foreach ($pageReps as $placeholder => $value) {
                            $pageHtml = str_replace($placeholder, $value, $pageHtml);
                        }
                        
                        $finalPages[] = $pageHtml;
                        Log::debug('[Template] Page ' . $pageNum . ' size: ' . strlen($pageHtml) . ' bytes');
                    }
                    
                    // Join pages directly without page break wrappers
                    $bodyContent = implode('', $finalPages);
                } else if (count($pages) > 1) {
                    // We successfully split by page breaks
                    $finalPages = [];
                    foreach ($pages as $pageIdx => $page) {
                        if (empty(trim($page))) continue;
                        
                        // Apply page-specific replacements
                        if (isset($pageReplacements[$pageIdx])) {
                            foreach ($pageReplacements[$pageIdx] as $placeholder => $value) {
                                $page = str_replace($placeholder, $value, $page);
                            }
                        }
                        
                        $finalPages[] = $page;
                        Log::debug('[Template] Split page ' . $pageIdx . ' size: ' . strlen($page) . ' bytes');
                    }
                    
                    // Join pages directly without page break wrappers
                    $bodyContent = implode('', $finalPages);
                }
                
                // Reconstruct document
                $html = $header . $bodyContent . $footer;
                Log::debug('[Template] Final HTML size: ' . strlen($html) . ' bytes');
            } else {
                // Fallback: apply all replacements to raw HTML
                Log::warning('[Template] Body extraction failed, using fallback');
                foreach ($replacements as $placeholder => $value) {
                    $html = str_replace($placeholder, $value, $html);
                }
                foreach ($pageReplacements as $pageNum => $pageReps) {
                    foreach ($pageReps as $placeholder => $value) {
                        $html = str_replace($placeholder, $value, $html);
                    }
                }
            }
        } else {
            // Single page - apply all replacements
            foreach ($replacements as $placeholder => $value) {
                $html = str_replace($placeholder, $value, $html);
            }
        }

        // No CSS injection - let browser handle page breaks naturally
        
        Log::debug('[Template] Template processing complete: ' . $evalType . ', final size: ' . strlen($html) . ' bytes');
        
        return $html;
    }

    /**
     * Build HTML replacements for substituting form data into template
     * Maps defense_eval form data into placeholders
     */
    private function buildFormDataReplacements($form, $evalType, $proposal)
    {
        Log::debug('[FormData] ========== START buildFormDataReplacements ==========');
        Log::debug('[FormData] Eval Type: ' . $evalType);
        Log::debug('[FormData] Form Keys: ' . implode(', ', array_keys($form)));
        Log::debug('[FormData] Proposal Title: ' . ($proposal->title ?? 'N/A'));
        
        $replacements = [];
        
        // Convert time to 00:00 am/pm format if needed
        $timeValue = $form['time'] ?? '';
        Log::debug('[FormData] Raw time value: "' . $timeValue . '"');
        
        if (!empty($timeValue) && strpos($timeValue, ':') !== false) {
            // Parse and convert to 12-hour format with am/pm
            $timeParts = explode(':', $timeValue);
            if (count($timeParts) >= 2) {
                $hour = (int)$timeParts[0];
                $minute = $timeParts[1];
                $period = $hour >= 12 ? 'pm' : 'am';
                $hour12 = $hour % 12;
                if ($hour12 === 0) $hour12 = 12;
                $timeValue = str_pad($hour12, 2, '0', STR_PAD_LEFT) . ':' . $minute . ' ' . $period;
                Log::debug('[FormData] Converted time: "' . $timeValue . '"');
            }
        }
        
        // Basic form information: underline with 2 spaces before/after value, then 2 more spaces without underline
        $fullName = $form['full_name'] ?? 'N/A';
        $date = $form['date'] ?? '';
        $designation = $form['designation'] ?? '';
        $projectTitle = $proposal->title ?? '';
        
        Log::debug('[FormData] Basic Info - Name: "' . $fullName . '" | Date: "' . $date . '" | Designation: "' . $designation . '"');
        
        $replacements['[EVALUATOR_NAME]'] = '<u>  ' . $fullName . '  </u>  ';
        $replacements['[REVIEWER_NAME]'] = '<u>  ' . $fullName . '  </u>  ';
        $replacements['[EVAL_TIME]'] = '<u>  ' . $timeValue . '  </u>  ';
        $replacements['[EVAL_DATE]'] = '<u>  ' . $date . '  </u>  ';
        $replacements['[DESIGNATION]'] = $designation;
        $replacements['[PROJECT_TITLE]'] = '<u>  ' . $projectTitle . '  </u>  ';
        
        Log::debug('[FormData] Basic replacements set: 6 placeholders');

        // Handle different evaluation types
        if ($evalType === 'team_oral_eval') {
            Log::debug('[FormData] Processing team_oral_eval');
            
            // Oral evaluation with team members
            $teamMembers = $form['form_data']['teamMembers'] ?? [];
            $scores = $form['form_data']['scores'] ?? [];
            
            Log::debug('[FormData] Team Members Count: ' . count($teamMembers));
            Log::debug('[FormData] Team Members: ' . json_encode(array_map(fn($m) => $m['full_name'] ?? 'Unknown', $teamMembers)));
            Log::debug('[FormData] Scores Count: ' . count($scores));
            Log::debug('[FormData] Score Keys: ' . implode(', ', array_keys($scores)));
            
            // Criteria: 7 items (0-6)
            // 7 criteria with different score ranges:
            // 0: Overall organization (1-20)
            // 1: Preparedness (1-15)
            // 2: Visual aids (1-15)
            // 3: Technical content (1-15)
            // 4: Delivery (1-15)
            // 5: Handling questions (1-10)
            // 6: Effective use of time (1-10)
            
            $criteria = [
                ['label' => 'Overall Organization', 'min' => 1, 'max' => 20],
                ['label' => 'Preparedness', 'min' => 1, 'max' => 15],
                ['label' => 'Visual Aids Quality/Effect', 'min' => 1, 'max' => 15],
                ['label' => 'Technical Content', 'min' => 1, 'max' => 15],
                ['label' => 'Delivery', 'min' => 1, 'max' => 15],
                ['label' => 'Handling of Questions', 'min' => 1, 'max' => 10],
                ['label' => 'Effective Use of Time', 'min' => 1, 'max' => 10],
            ];
            
            // Support up to 8 team members across 2 pages (4 per page)
            $pageReplacements = [];
            $allMemberTotals = [];
            
            for ($pageNum = 0; $pageNum < 2; $pageNum++) {
                $startMemberIdx = $pageNum * 4;
                $endMemberIdx = min($startMemberIdx + 4, count($teamMembers));
                
                Log::debug('[FormData] Page ' . ($pageNum + 1) . ': Members ' . $startMemberIdx . ' to ' . ($endMemberIdx - 1));
                
                // Only create page if there are members for it
                if ($startMemberIdx >= count($teamMembers)) break;
                
                $pageReplacementSet = $replacements; // Start with base replacements
                $pageMemberTotals = [];

                // Set team member names and roles for this page
                for ($i = $startMemberIdx; $i < $endMemberIdx; $i++) {
                    $memberIndex = $i + 1;
                    $columnIdx = $i - $startMemberIdx;
                    $member = $teamMembers[$i];
                    $memberName = $member['full_name'] ?? '';
                    $memberDesignation = $member['designation'] ?? '';
                    $pageReplacementSet['[TEAM_MEMBER_NAME_' . ($columnIdx + 1) . ']'] = $memberName;
                    $pageReplacementSet['[TEAM_MEMBER_ROLE_' . ($columnIdx + 1) . ']'] = $memberDesignation;
                    // Add member number placeholder for correct numbering across pages
                    $pageReplacementSet['[MEMBER_NUM_' . ($columnIdx + 1) . ']'] = (string)$memberIndex;
                    Log::debug('[FormData] Member ' . $memberIndex . ' Col ' . ($columnIdx + 1) . ': ' . $memberName);
                }
                
                // Set individual scores for this page
                for ($criteriaIdx = 0; $criteriaIdx < count($criteria); $criteriaIdx++) {
                    for ($i = $startMemberIdx; $i < $endMemberIdx; $i++) {
                        $columnIdx = $i - $startMemberIdx;
                        $scoreKey = "{$criteriaIdx}_{$i}";
                        $scoreValue = $scores[$scoreKey] ?? '';
                        $pageReplacementSet['[SCORE_' . $criteriaIdx . '_' . $columnIdx . ']'] = (string)$scoreValue;
                    }
                }
                
                Log::debug('[FormData] Scores set for page ' . ($pageNum + 1));
                
                // Calculate individual totals for this page
                for ($i = $startMemberIdx; $i < $endMemberIdx; $i++) {
                    $total = 0;
                    for ($criteriaIdx = 0; $criteriaIdx < count($criteria); $criteriaIdx++) {
                        $scoreKey = "{$criteriaIdx}_{$i}";
                        $total += (int)($scores[$scoreKey] ?? 0);
                    }
                    $columnIdx = $i - $startMemberIdx;
                    $pageMemberTotals[] = $total;
                    $pageReplacementSet['[TOTAL_' . $columnIdx . ']'] = (string)$total;
                    $allMemberTotals[] = $total;
                    Log::debug('[FormData] Total for member ' . ($i + 1) . ': ' . $total);
                }
                
                // Clear unused columns on this page (for 5-7 members where page 2 is partial)
                $numMembersOnPage = $endMemberIdx - $startMemberIdx;
                for ($col = $numMembersOnPage; $col < 4; $col++) {
                    $pageReplacementSet['[TEAM_MEMBER_NAME_' . ($col + 1) . ']'] = '';
                    $pageReplacementSet['[TEAM_MEMBER_ROLE_' . ($col + 1) . ']'] = '';
                    $pageReplacementSet['[MEMBER_NUM_' . ($col + 1) . ']'] = '';
                    for ($criteriaIdx = 0; $criteriaIdx < count($criteria); $criteriaIdx++) {
                        $pageReplacementSet['[SCORE_' . $criteriaIdx . '_' . $col . ']'] = '';
                    }
                    $pageReplacementSet['[TOTAL_' . $col . ']'] = '';
                }
                
                Log::debug('[FormData] Cleared ' . (4 - $numMembersOnPage) . ' unused columns on page ' . ($pageNum + 1));
                
                $pageReplacements[] = $pageReplacementSet;
            }
            
            // Calculate overall group average (average of all individual member totals)
            $groupAverage = count($allMemberTotals) > 0 ? round(array_sum($allMemberTotals) / count($allMemberTotals), 2) : 0;
            Log::debug('[FormData] Group Average: ' . $groupAverage);

            
            // Add group average to all page replacement sets
            foreach ($pageReplacements as &$pageReplacementSet) {
                $pageReplacementSet['[GROUP_AVERAGE]'] = (string)$groupAverage;
            }
            unset($pageReplacementSet);
            
            // Return format: ['pages' => $pageReplacements] for multi-page handling
            $replacements['__PAGES__'] = $pageReplacements;
            
        } elseif ($evalType === 'team_self_eval') {
            Log::debug('[FormData] Processing team_self_eval');
            
            // Self evaluation with peer ratings
            $memberRatings = $form['form_data']['memberRatings'] ?? [];
            $ratings = $form['form_data']['ratings'] ?? [];
            
            Log::debug('[FormData] Member Ratings Count: ' . count($memberRatings));
            Log::debug('[FormData] Member Ratings: ' . json_encode(array_map(fn($m) => $m['full_name'] ?? 'Unknown', $memberRatings)));
            Log::debug('[FormData] Ratings Data Keys: ' . implode(', ', array_keys($ratings)));
            
            // Create ordered member indices with reviewer first
            $reviewerId = $form['member_id'];
            Log::debug('[FormData] Reviewer ID: ' . $reviewerId);
            
            $orderedIndices = [];
            $reviewerIndex = null;
            foreach ($memberRatings as $index => $member) {
                if ($member['member_id'] == $reviewerId) {
                    $reviewerIndex = $index;
                    $orderedIndices[] = $index;
                    Log::debug('[FormData] Reviewer found at index: ' . $index);
                    break;
                }
            }
            foreach ($memberRatings as $index => $member) {
                if ($index !== $reviewerIndex) {
                    $orderedIndices[] = $index;
                }
            }
            
            // Criteria: 10 items (0-9)
            $criteria = [
                'Participated actively in the development of the project plan',
                'Assumed responsibility for planning tasks and met the agreed-upon deadlines for completing each task',
                'Attended group meetings and/or participated actively in group email communication',
                'Contributed an equal share of the work to the final project',
                'Contributed quality written work or critical data to the project',
                'Addressed challenges to the group project as they arose',
                'Teamwork & Collaboration',
                'Resourcefulness & Initiative',
                'Communication',
                'Time management',
            ];
            
            // Support up to 8 team members across 2 pages (4 per page)
            $pageReplacements = [];
            $allMemberTotals = [];
            
            for ($pageNum = 0; $pageNum < 2; $pageNum++) {
                $startMemberIdx = $pageNum * 4;
                $endMemberIdx = min($startMemberIdx + 4, count($memberRatings));
                
                // Only create page if there are members for it
                if ($startMemberIdx >= count($memberRatings)) break;
                
                $pageReplacementSet = $replacements; // Start with base replacements
                $pageMemberTotals = [];
                
                // Set team member names for this page
                for ($i = $startMemberIdx; $i < $endMemberIdx; $i++) {
                    $columnIdx = $i - $startMemberIdx;
                    $memberIndex = $orderedIndices[$i];
                    $member = $memberRatings[$memberIndex];
                    $pageReplacementSet['[STUDENT_' . ($columnIdx + 1) . '_NAME]'] = $member['full_name'] ?? '';
                }
                
                // Set individual ratings for this page
                for ($criteriaIdx = 0; $criteriaIdx < count($criteria); $criteriaIdx++) {
                    for ($i = $startMemberIdx; $i < $endMemberIdx; $i++) {
                        $columnIdx = $i - $startMemberIdx;
                        $memberIndex = $orderedIndices[$i];
                        $ratingValue = isset($ratings[$criteriaIdx][$memberIndex]) ? $ratings[$criteriaIdx][$memberIndex] : '';
                        $pageReplacementSet['[STUDENT_' . ($columnIdx + 1) . '_CRITERIA_' . ($criteriaIdx + 1) . ']'] = (string)$ratingValue;
                    }
                }
                
                // Calculate individual totals for this page
                for ($i = $startMemberIdx; $i < $endMemberIdx; $i++) {
                    $total = 0;
                    for ($criteriaIdx = 0; $criteriaIdx < count($criteria); $criteriaIdx++) {
                        $memberIndex = $orderedIndices[$i];
                        $ratingValue = isset($ratings[$criteriaIdx][$memberIndex]) ? (int)$ratings[$criteriaIdx][$memberIndex] : 0;
                        $total += $ratingValue;
                    }
                    $columnIdx = $i - $startMemberIdx;
                    $pageMemberTotals[] = $total;
                    $pageReplacementSet['[STUDENT_' . ($columnIdx + 1) . '_TOTAL]'] = (string)$total;
                    $allMemberTotals[] = $total;
                }
                
                // Clear unused columns on this page
                $numMembersOnPage = $endMemberIdx - $startMemberIdx;
                for ($col = $numMembersOnPage; $col < 4; $col++) {
                    $pageReplacementSet['[STUDENT_' . ($col + 1) . '_NAME]'] = '';
                    for ($criteriaIdx = 0; $criteriaIdx < count($criteria); $criteriaIdx++) {
                        $pageReplacementSet['[STUDENT_' . ($col + 1) . '_CRITERIA_' . ($criteriaIdx + 1) . ']'] = '';
                    }
                    $pageReplacementSet['[STUDENT_' . ($col + 1) . '_TOTAL]'] = '';
                }
                
                $pageReplacements[] = $pageReplacementSet;
            }
            
            // Return format: ['pages' => $pageReplacements] for multi-page handling
            $replacements['__PAGES__'] = $pageReplacements;
            
        } else {
            // Defense Evaluation - original format
            $scores = $form['form_data']['scores'] ?? [];
            $totalScore = 0;
            
            // Scores are keys: A, B1, B2, B3, B4, C, D1, D2, D3, E1, E2, E3, E4
            foreach ($scores as $scoreKey => $scoreValue) {
                // Replace [SCORE_X] with the actual score value
                $replacements['[SCORE_' . strtoupper($scoreKey) . ']'] = (string)$scoreValue;
                $totalScore += (int)$scoreValue;
            }
            
            // Add total score
            $replacements['[TOTAL_RATING]'] = (string)$totalScore;

            // Handle decision (only for defense evaluation)
            if ($evalType === 'defense_eval') {
                $decision = $form['form_data']['decision'] ?? '';
                $replacements['[DECISION]'] = $decision;
                
                // Map decision to checkbox marks (supporting all 5 options)
                // Using &#10003; HTML entity for check mark to ensure proper rendering
                $checkMark = '&#10003;';
                $replacements['[APPROVED_CHECK]'] = ($decision === 'Approved with no revisions') ? $checkMark : '';
                $replacements['[MINOR_REVISIONS_CHECK]'] = ($decision === 'Approved with minor revisions') ? $checkMark : '';
                $replacements['[MAJOR_REVISIONS_CHECK]'] = ($decision === 'Approved with major revisions') ? $checkMark : '';
                $replacements['[DISAPPROVED_CHECK]'] = ($decision === 'Disapproved') ? $checkMark : '';
                $replacements['[REDEFENSE_CHECK]'] = ($decision === 'Re-defense') ? $checkMark : '';
                
                // Handle comments
                $replacements['[COMMENTS]'] = $form['form_data']['comments'] ?? '';
            }
        }

        // Final debug output
        $replacementKeys = array_keys($replacements);
        $hasPages = isset($replacements['__PAGES__']);
        $pageCount = $hasPages ? count($replacements['__PAGES__']) : 0;
        $totalReplacements = count($replacements);
        
        Log::debug('[FormData] Final Replacements - Total Keys: ' . $totalReplacements . ' | Has Pages: ' . ($hasPages ? 'YES (' . $pageCount . ' pages)' : 'NO'));
        Log::debug('[FormData] Replacement Keys: ' . implode(', ', array_filter($replacementKeys, fn($k) => $k !== '__PAGES__')));
        if ($hasPages && $pageCount > 0) {
            Log::debug('[FormData] Page 1 has ' . count($replacements['__PAGES__'][0]) . ' replacements');
        }
        Log::debug('[FormData] ========== END buildFormDataReplacements ==========');

        return $replacements;
    }
    private function generatePdfFromForm($proposal, $form, $evalType, $tempDir, $proposalNumber, $formIndex, $pdfCount, $evalTypeFolder = '')
    {
        try {
            Log::info('[PDF] Starting PDF generation for ' . $evalType . ' form ' . $formIndex . ' of proposal ' . $proposalNumber);
            
            // Load the appropriate HTML template
            $templateMap = [
                'defense_eval' => 'eval_docuement_render/defense_eval',
                'team_self_eval' => 'eval_docuement_render/team_self_eval',
                'team_oral_eval' => 'eval_docuement_render/team_oral_eval',
            ];

            if (!isset($templateMap[$evalType])) {
                Log::error('[PDF] Invalid evaluation type: ' . $evalType);
                throw new \Exception("Invalid evaluation type: $evalType");
            }

            $template = $templateMap[$evalType];
            Log::info('[PDF] Using template: ' . $template);

            // Get template content
            $htmlPath = resource_path("views/{$template}.htm");
            Log::info('[PDF] Template path: ' . $htmlPath);
            Log::info('[PDF] Template exists: ' . (file_exists($htmlPath) ? 'YES' : 'NO'));
            
            if (!file_exists($htmlPath)) {
                Log::error('[PDF] Template not found: ' . $htmlPath);
                throw new \Exception("Template not found: {$htmlPath}");
            }

            $html = file_get_contents($htmlPath);
            Log::info('[PDF] Template loaded, size: ' . strlen($html) . ' bytes');

            if (empty($html)) {
                Log::error('[PDF] Template is empty');
                throw new \Exception('Template file is empty');
            }

            // Inject form data into HTML
            $replacements = $this->buildFormDataReplacements($form, $evalType, $proposal);
            
            // Check if this is a multi-page form (team_oral_eval with 5+ members)
            $pageReplacements = $replacements['__PAGES__'] ?? null;
            unset($replacements['__PAGES__']); // Remove marker
            
            if ($pageReplacements) {
                // Build a single PDF with multiple pages (complete section from header to footer per page)
                Log::info('[PDF] Multi-page form detected, combining ' . count($pageReplacements) . ' pages into single PDF');
                
                // Find the complete page section from HEADER SECTION to END FOOTER SECTION
                $pagePattern = '/<!-- HEADER SECTION -->.*?<!-- END FOOTER SECTION -->/is';
                
                if (preg_match($pagePattern, $html, $matches)) {
                    $pageTemplate = $matches[0];
                    
                    Log::info('[PDF] Found complete page template to duplicate for ' . count($pageReplacements) . ' pages');
                    
                    // Build combined HTML with page breaks
                    $combinedPages = [];
                    foreach ($pageReplacements as $pageNum => $pageReplacementSet) {
                        $pageSectionHtml = $pageTemplate;
                        
                        // Apply page-specific replacements
                        foreach ($pageReplacementSet as $placeholder => $value) {
                            $pageSectionHtml = str_replace($placeholder, (string)$value, $pageSectionHtml);
                        }
                        
                        // Replace any unused placeholders with empty strings
                        $pageSectionHtml = preg_replace('/\[TEAM_MEMBER_NAME_\d+\]/i', '', $pageSectionHtml);
                        $pageSectionHtml = preg_replace('/\[TEAM_MEMBER_ROLE_\d+\]/i', '', $pageSectionHtml);
                        $pageSectionHtml = preg_replace('/\[SCORE_\d+_\d+\]/i', '', $pageSectionHtml);
                        $pageSectionHtml = preg_replace('/\[TOTAL_\d+\]/i', '', $pageSectionHtml);
                        
                        // Add page break before additional pages
                        if ($pageNum > 0) {
                            $combinedPages[] = '<div style="page-break-before: always;"></div>';
                        }
                        $combinedPages[] = $pageSectionHtml;
                        
                        Log::info('[PDF] Page ' . ($pageNum + 1) . ' prepared with header, scores, and footer');
                    }
                    
                    // Replace the original page section with combined pages
                    $html = preg_replace($pagePattern, implode('', $combinedPages), $html);
                    
                    Log::info('[PDF] Combined ' . count($pageReplacements) . ' complete pages into single HTML');
                } else {
                    Log::warning('[PDF] Could not find page section for multi-page duplication, falling back to single page');
                }
                
                // Update progress to generating BEFORE rendering with delay
                $docName = "Oral Presentation - Proposal {$proposalNumber} - Rendering Page 1/2";
                $this->updateProgressTrackingWithDelay($docName, 'generating');
                
                // Generate single PDF with all pages
                $this->convertHtmlToPdf($html, $tempDir, $proposal, $form, $proposalNumber, $formIndex, $evalType, $pdfCount, $evalTypeFolder);
            } else {
                // Single page form - proceed as normal
                Log::info('[PDF] Building replacements for form data: ' . json_encode(array_keys($replacements)));

                foreach ($replacements as $placeholder => $value) {
                    $html = str_replace($placeholder, (string)$value, $html);
                }

                Log::info('[PDF] HTML data injected with ' . count($replacements) . ' replacements');
                
                // Update progress to generating BEFORE rendering with delay
                $docName = match($evalType) {
                    'defense_eval' => "Proposal Defense - Proposal {$proposalNumber} - Rendering",
                    'team_self_eval' => "Peer & Self Evaluation - Proposal {$proposalNumber} - Rendering",
                    'team_oral_eval' => "Oral Presentation - Proposal {$proposalNumber} - Rendering",
                    default => "PDF Rendering"
                };
                $this->updateProgressTrackingWithDelay($docName, 'generating');
                
                // Generate PDF
                $this->convertHtmlToPdf($html, $tempDir, $proposal, $form, $proposalNumber, $formIndex, $evalType, $pdfCount, $evalTypeFolder);
            }

        } catch (\Exception $e) {
            Log::error('[PDF] Exception in generatePdfFromForm: ' . $e->getMessage() . ' | Stack: ' . $e->getTraceAsString());
            throw $e;
        }
    }

    /**
     * Convert HTML to PDF using Browsershot
     * Handles both single-page and multi-page PDF generation
     *
     * @param  string  $html              The HTML content to render
     * @param  string  $tempDir           The temporary directory for PDF output
     * @param  mixed   $proposal          The proposal object/data
     * @param  array   $form              The evaluation form data
     * @param  string  $proposalNumber    The proposal number (e.g., "P001")
     * @param  int     $formIndex         The index of this form (for naming)
     * @param  string  $evalType          The evaluation type (e.g., "OralEval")
     * @param  int     $pdfCount         Counter for PDF generation
     * @param  string  $evalTypeFolder    The evaluation type folder name
     */
    private function convertHtmlToPdf($html, $tempDir, $proposal, $form, $proposalNumber, $formIndex, $evalType, $pdfCount, $evalTypeFolder)
    {
        try {
            // Remove padding paragraphs based on comment length
            $commentLength = strlen($form['form_data']['comments'] ?? '');
            $paragraphsToRemove = (int)floor($commentLength / 90);
            
            if ($paragraphsToRemove > 0) {
                $startMarker = '<!-- END OF COMMENT TABLE -->';
                $endMarker = '<!-- SECOND PAGE FOOTER SECTION -->';
                
                $startPos = strpos($html, $startMarker);
                $endPos = strpos($html, $endMarker);
                
                if ($startPos !== false && $endPos !== false) {
                    $sectionStart = $startPos + strlen($startMarker);
                    $section = substr($html, $sectionStart, $endPos - $sectionStart);
                    
                    $paddingPattern = '/<p[^>]*align=center[^>]*>\s*<b[^>]*>\s*<span[^>]*><o:p>&nbsp;<\/o:p><\/span>\s*<\/b>\s*<\/p>/is';
                    
                    $modifiedSection = $section;
                    for ($i = 0; $i < $paragraphsToRemove; $i++) {
                        $modifiedSection = preg_replace($paddingPattern, '', $modifiedSection, 1, $count);
                        if ($count === 0) break;
                    }
                    
                    $html = substr_replace($html, $modifiedSection, $sectionStart, $endPos - $sectionStart);
                    
                    Log::info('[PDF] Removed ' . $paragraphsToRemove . ' padding paragraphs from footer section (comment length: ' . $commentLength . ' chars)');
                }
            }

            // Process CSS - Add base path for relative URLs
            try {
                Log::info('[PDF-CSS] Processing CSS for Browserless rendering');
                
                if (strpos($html, '<head>') !== false) {
                    $baseTag = '<base href="' . config('app.url') . '">' . "\n";
                    $html = str_replace('<head>', '<head>' . "\n" . $baseTag, $html);
                    Log::info('[PDF-CSS] ✓ Added base tag for relative URL resolution');
                }
                
                if (preg_match_all('/<link[^>]*rel=["\']stylesheet["\'][^>]*href=["\']([^"\']+)["\'][^>]*>/i', $html, $matches)) {
                    Log::info('[PDF-CSS] Found ' . count($matches[1]) . ' CSS link tags - Browserless will process them');
                }
                
                if (preg_match_all('/<style[^>]*>(.+?)<\/style>/is', $html, $matches)) {
                    Log::info('[PDF-CSS] ✓ Found ' . count($matches[0]) . ' inline style blocks');
                }
            } catch (\Exception $e) {
                Log::warning('[PDF-CSS] Warning during CSS processing: ' . $e->getMessage());
            }

            // Process images - ensure absolute URLs for remote rendering
            try {
                Log::info('[PDF-IMG] Processing images for Browserless rendering');
                
                if (preg_match_all('/<img[^>]*src=["\']([^"\']+)["\'][^>]*>/i', $html, $matches)) {
                    Log::info('[PDF-IMG] Found ' . count($matches[1]) . ' image tags - Browserless will process them');
                    
                    foreach ($matches[1] as $index => $src) {
                        Log::info('[PDF-IMG] [IMAGE #' . ($index + 1) . '] src: ' . $src);
                    }
                }
            } catch (\Exception $e) {
                Log::warning('[PDF-IMG] Warning during image processing: ' . $e->getMessage());
            }

            // Create subfolder structure: Proposal_X_Title/EvalTypeFolder/
            $proposalTitle = str_replace([' ', '/', '\\', ':', '*', '?', '"', '<', '>', '|'], '_', substr($proposal->title ?? 'Proposal', 0, 30));
            $proposalFolder = $tempDir . '/Proposal_' . $proposalNumber . '_' . $proposalTitle;
            $evalFolder = $proposalFolder . '/' . $evalTypeFolder;
            @mkdir($evalFolder, 0755, true);
            
            // Generate filename
            $evaluatorName = $form['full_name'] ?? 'Evaluator';
            $evaluatorName = iconv('UTF-8', 'ASCII//TRANSLIT', $evaluatorName);
            $evaluatorName = str_replace([' ', '/', '\\', ':', '*', '?', '"', '<', '>', '|', "'"], '_', $evaluatorName);
            $evaluatorName = preg_replace('/[^a-zA-Z0-9_]/', '', $evaluatorName);
            $evaluatorName = rtrim(substr($evaluatorName, 0, 50), '_');
            if (empty($evaluatorName)) {
                $evaluatorName = 'Evaluator';
            }
            
            $filename = sprintf('Form_%d_%s.pdf', $formIndex + 1, $evaluatorName);
            
            Log::info('[PDF] Output filename: ' . $filename);
            $pdfPath = $evalFolder . '/' . $filename;
            Log::info('[PDF] PDF path: ' . $pdfPath);

            try {
                Log::info('[PDF] ⏳ Starting Browserless rendering via socket server...');
                
                // Use RemotePdfService to render HTML to PDF on socket server
                $pdfService = new RemotePdfService();
                $remoteFilename = $pdfService->generatePdfFromHtml($html, $filename);
                
                if (!$remoteFilename) {
                    throw new \Exception('Socket server failed to generate PDF');
                }
                
                Log::info('[PDF] ✓ PDF generated on socket server: ' . $remoteFilename);
                
                // Download PDF from socket server and save locally
                if (!$pdfService->downloadPdfToStorage($remoteFilename, basename($pdfPath))) {
                    throw new \Exception('Failed to download PDF from socket server');
                }
                
                Log::info('[PDF] ✓ Browserless rendering completed and PDF saved locally');

                // Verify PDF was created
                if (!file_exists($pdfPath)) {
                    Log::error('[PDF] PDF file does not exist after download: ' . $pdfPath);
                    throw new \Exception('PDF file was not created');
                }

                $fileSize = filesize($pdfPath);
                Log::info('[PDF] PDF file verified, size: ' . number_format($fileSize) . ' bytes');

                if ($fileSize === 0) {
                    Log::error('[PDF] PDF file is empty');
                    throw new \Exception('PDF file is empty');
                }

            } catch (\Exception $e) {
                Log::error('[PDF] Failed to render PDF: ' . $e->getMessage());
                Log::error('[PDF] Exception class: ' . get_class($e));
                Log::error('[PDF] Stack trace: ' . $e->getTraceAsString());
                throw new \Exception("Failed to render PDF: " . $e->getMessage());
            }

            Log::info('[PDF] ✓ PDF generation completed successfully: ' . $filename);

        } catch (\Exception $e) {
            Log::error('[PDF] Exception in convertHtmlToPdf: ' . $e->getMessage() . ' | Stack: ' . $e->getTraceAsString());
            throw $e;
        }
    }


    /**
     * Initialize PDF generation progress tracking with all document names
     */
    private function initializeProgressTracking($capstone_id, $totalDocuments, $proposals = [])
    {
        $cacheKey = "pdf_progress_{$capstone_id}";
        
        // Pre-populate all documents with pending status
        $documents = [];
        foreach ($proposals as $proposalIndex => $proposal) {
            $proposalNumber = $proposalIndex + 1;
            
            // Collect all defense evaluation forms
            if ($proposal->defense_eval) {
                $defenseEval = is_string($proposal->defense_eval) ? json_decode($proposal->defense_eval, true) : $proposal->defense_eval;
                if (isset($defenseEval['forms'])) {
                    foreach ($defenseEval['forms'] as $formIndex => $form) {
                        if ($form['is_submitted'] ?? false) {
                            $fullName = $form['full_name'] ?? 'Unknown';
                            $documents[] = [
                                'name' => "Proposal Defense - Proposal {$proposalNumber} ({$fullName})",
                                'status' => 'pending',
                            ];
                        }
                    }
                }
            }
            
            // Collect all self evaluation forms
            if ($proposal->team_self_eval) {
                $selfEval = is_string($proposal->team_self_eval) ? json_decode($proposal->team_self_eval, true) : $proposal->team_self_eval;
                if (isset($selfEval['forms'])) {
                    foreach ($selfEval['forms'] as $formIndex => $form) {
                        if ($form['is_submitted'] ?? false) {
                            $fullName = $form['full_name'] ?? 'Unknown';
                            $documents[] = [
                                'name' => "Peer & Self Evaluation - Proposal {$proposalNumber} ({$fullName})",
                                'status' => 'pending',
                            ];
                        }
                    }
                }
            }
            
            // Collect all oral evaluation forms
            if ($proposal->team_oral_eval) {
                $oralEval = is_string($proposal->team_oral_eval) ? json_decode($proposal->team_oral_eval, true) : $proposal->team_oral_eval;
                if (isset($oralEval['forms'])) {
                    foreach ($oralEval['forms'] as $formIndex => $form) {
                        if ($form['is_submitted'] ?? false) {
                            $fullName = $form['full_name'] ?? 'Unknown';
                            $documents[] = [
                                'name' => "Oral Presentation - Proposal {$proposalNumber} ({$fullName})",
                                'status' => 'pending',
                            ];
                        }
                    }
                }
            }
        }
        
        $progress = [
            'total' => $totalDocuments,
            'completed' => 0,
            'current_file' => '',
            'status' => 'initializing',
            'documents' => $documents,
        ];

        // Force cache put with explicit flush
        cache()->put($cacheKey, $progress, 600);
        
        Log::info('[PDF Progress] ✓ Initialized tracking for ' . $totalDocuments . ' documents with ' . count($documents) . ' entries');
        Log::info('[PDF Progress] Cache data after init: ' . json_encode($progress));
    }

    /**
     * Update PDF generation progress for a specific document
     */
    private function updateProgressTracking($capstone_id, $documentName, $status = 'generating')
    {
        $cacheKey = "pdf_progress_{$capstone_id}";
        $progress = cache()->get($cacheKey, []);

        if (empty($progress)) {
            Log::warning('[PDF Progress] Cache entry not found for capstone: ' . $capstone_id);
            return;
        }

        $oldCompleted = $progress['completed'] ?? 0;
        $oldStatus = $progress['status'] ?? 'unknown';
        
        $progress['current_file'] = $documentName;
        $progress['status'] = 'generating';

        // Initialize documents array if not present
        if (!isset($progress['documents'])) {
            $progress['documents'] = [];
        }

        // Update or add document entry
        $found = false;
        foreach ($progress['documents'] as &$doc) {
            if ($doc['name'] === $documentName) {
                $doc['status'] = $status;
                $found = true;
                break;
            }
        }

        if (!$found) {
            // This shouldn't happen if we pre-populated, but handle it just in case
            $progress['documents'][] = [
                'name' => $documentName,
                'status' => $status,
            ];
            Log::warning('[PDF Progress] Document not found in list, added: ' . $documentName);
        }

        // Recalculate completed count
        $completedCount = count(array_filter($progress['documents'], fn($d) => $d['status'] === 'complete' || $d['status'] === 'error'));
        $progress['completed'] = $completedCount;

        cache()->put($cacheKey, $progress, 600);
        
        if ($status === 'complete') {
            Log::info('[PDF Progress] [COMPLETE] ' . $documentName . ' -> Completed (' . $progress['completed'] . '/' . $progress['total'] . ')');
        } elseif ($status === 'error') {
            Log::warning('[PDF Progress] [ERROR] ' . $documentName . ' -> Error');
        } else {
            Log::debug('[PDF Progress] [GENERATING] ' . $documentName);
        }
        
        // Broadcast progress update via WebSocket
        Log::info('[PDF Progress] Broadcasting progress update: ' . $documentName . ' (' . $progress['completed'] . '/' . $progress['total'] . ')');
        try {
            broadcast(new \App\Events\ProgressUpdate($capstone_id, $progress));
            Log::info('[PDF Progress] Broadcast sent for: ' . $documentName);
        } catch (\Exception $e) {
            Log::error('[PDF Progress] Broadcast failed for: ' . $documentName . ' - Error: ' . $e->getMessage());
        }

        try {
            $socketServerUrl = env('SOCKET_IO_SERVER_URL', 'http://127.0.0.1:6001');
            $payload = [
                'room' => 'pdf-progress.' . $capstone_id,
                'event' => 'progress.update',
                'data' => [
                    'capstoneId' => $capstone_id,
                    'progress' => $progress,
                ],
            ];
            Http::timeout(2)->post($socketServerUrl . '/emit-progress', $payload);
            Log::info('[PDF Progress] Socket.IO update posted for: ' . $documentName);
        } catch (\Exception $e) {
            Log::error('[PDF Progress] Socket.IO post failed for: ' . $documentName . ' - Error: ' . $e->getMessage());
        }
        
        // Add a small delay to allow WebSocket to send updates
        if ($status === 'complete' || $status === 'error') {
            usleep(50000); // 50 milliseconds
        }
    }

    /**
     * Update progress and add artificial delay to simulate rendering progress
     * This prevents PDFs from rendering too fast before progress can be sent to client
     */
    private function updateProgressTrackingWithDelay($documentName, $status = 'generating')
    {
        $cacheKey = "pdf_progress_" . request()->route('capstone_id');
        $progress = cache()->get($cacheKey, []);

        if (empty($progress)) {
            return;
        }

        $progress['current_file'] = $documentName;
        $progress['status'] = $status;

        // Initialize documents array if not present
        if (!isset($progress['documents'])) {
            $progress['documents'] = [];
        }

        // Update document entry
        $found = false;
        foreach ($progress['documents'] as &$doc) {
            if (strpos($doc['name'], explode(' - Rendering', $documentName)[0]) === 0) {
                $doc['status'] = $status;
                $found = true;
                break;
            }
        }

        if (!$found) {
            // Find the main document name (without rendering suffix)
            $mainDocName = explode(' - Rendering', $documentName)[0];
            foreach ($progress['documents'] as &$doc) {
                if ($doc['name'] === $mainDocName) {
                    $doc['status'] = $status;
                    $found = true;
                    break;
                }
            }
        }

        cache()->put($cacheKey, $progress, 600);
        Log::debug('[PDF Progress] Rendering: ' . $documentName . ' (status: ' . $status . ')');
        
        // Add delay to allow EventSource to poll and send the update
        // This artificial delay is crucial to show visible progress to users
        usleep(300000); // 300 milliseconds - gives EventSource time to send update
    }

    /**
     * Mark PDF generation as complete
     */
    private function completeProgressTracking($capstone_id)
    {
        $cacheKey = "pdf_progress_{$capstone_id}";
        $progress = cache()->get($cacheKey, []);
        
        if (!empty($progress)) {
            $progress['status'] = 'complete';
            $progress['completed'] = $progress['total'];
            cache()->put($cacheKey, $progress, 600);
        }

        Log::info('[PDF Progress] Mark ed all documents as complete');
    }

    /**
     * Recursively add files from a directory to a zip archive
     * Maintains the folder structure in the zip file
     * Returns the count of files added
     */
    private function addFilesToZip(&$zip, $dir, $baseDir)
    {
        $fileCount = 0;
        
        if (!is_dir($dir)) {
            return $fileCount;
        }
        
        $files = scandir($dir);
        foreach ($files as $file) {
            if ($file === '.' || $file === '..') {
                continue;
            }
            
            $filePath = $dir . '/' . $file;
            $relativePath = str_replace($baseDir . '/', '', $filePath);
            
            if (is_dir($filePath)) {
                // Recursively add subdirectory
                $fileCount += $this->addFilesToZip($zip, $filePath, $baseDir);
            } else {
                // Add file to zip with relative path maintaining folder structure
                $zip->addFile($filePath, $relativePath);
                Log::info('[PDF Generation] Added to zip: ' . $relativePath);
                $fileCount++;
            }
        }
        
        return $fileCount;
    }

    /**
     * Recursively delete a directory and all its contents
     */
    private function deleteDirectory($dir)
    {
        if (!is_dir($dir)) {
            return;
        }
        
        $files = scandir($dir);
        foreach ($files as $file) {
            if ($file === '.' || $file === '..') {
                continue;
            }
            
            $filePath = $dir . '/' . $file;
            if (is_dir($filePath)) {
                $this->deleteDirectory($filePath);
            } else {
                unlink($filePath);
            }
        }
        
        rmdir($dir);
    }

    /**
     * Get current PDF generation progress
     */
    public function getProgress($capstone_id)
    {
        $cacheKey = "pdf_progress_{$capstone_id}";
        $progress = cache()->get($cacheKey, [
            'total' => 0,
            'completed' => 0,
            'current_file' => '',
            'status' => 'not_started',
            'documents' => []
        ]);

        Log::info('[PDF Progress] Get progress for capstone ' . $capstone_id . ': ' . json_encode($progress));

        return response()->json($progress);
    }

    public function testProgress($capstone_id)
    {
        $cacheKey = "pdf_progress_{$capstone_id}";
        
        // Test setting progress
        $testProgress = [
            'total' => 5,
            'completed' => 2,
            'current_file' => 'Test Document',
            'status' => 'generating',
            'documents' => [
                ['name' => 'Doc1', 'status' => 'complete'],
                ['name' => 'Doc2', 'status' => 'complete'],
                ['name' => 'Doc3', 'status' => 'generating'],
                ['name' => 'Doc4', 'status' => 'pending'],
                ['name' => 'Doc5', 'status' => 'pending'],
            ]
        ];
        
        cache()->put($cacheKey, $testProgress, 600);
        Log::info('[TEST] Set test progress: ' . json_encode($testProgress));
        
        // Test getting progress
        $retrieved = cache()->get($cacheKey);
        Log::info('[TEST] Retrieved progress: ' . json_encode($retrieved));
        
        return response()->json([
            'set' => $testProgress,
            'retrieved' => $retrieved,
            'match' => json_encode($testProgress) === json_encode($retrieved)
        ]);
    }


}

