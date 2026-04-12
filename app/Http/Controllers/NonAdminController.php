<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Inertia\Inertia;
use App\Models\Capstone;
use App\Models\Proposal;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Spatie\Browsershot\Browsershot;

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
            $defenseEval['forms'][$formIndex]['form_data']['comments'] = $validated['comments'] ?? $defenseEval['forms'][$formIndex]['form_data']['comments'] ?? '';

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
     * Generate PDFs for all submitted forms and create a zip file
     */
    public function generatePdfZip(Request $request, $capstone_id)
    {
        // Increase execution time for PDF generation (Browsershot can take time)
        set_time_limit(600); // 10 minutes
        
        Log::info('[PDF Generation] Starting PDF generation for capstone: ' . $capstone_id);
        
        try {
            $capstone = Capstone::find($capstone_id);
            if (!$capstone) {
                Log::error('[PDF Generation] Capstone not found: ' . $capstone_id);
                return response()->json(['error' => 'Capstone not found'], 404);
            }
            
            Log::info('[PDF Generation] Found capstone: ' . $capstone->team_name);

            $proposals = Proposal::where('capstone_id', $capstone_id)->get();
            Log::info('[PDF Generation] Found ' . $proposals->count() . ' proposals');
            
            $tempDir = storage_path('pdf_temp/' . uniqid());
            Log::info('[PDF Generation] Creating temp directory: ' . $tempDir);
            @mkdir($tempDir, 0755, true);

            if (!is_dir($tempDir)) {
                Log::error('[PDF Generation] Failed to create temp directory: ' . $tempDir);
                return response()->json(['error' => 'Failed to create temporary directory'], 500);
            }

            $pdfCount = 0;
            $errorCount = 0;
            $htmlTemplateMap = [
                'Proposal Defense Evaluation' => 'eval_docuement_render/defense_eval',
                'Peer & Self Evaluation' => 'eval_docuement_render/team_self_eval',
                'Oral Presentation Evaluation' => 'eval_docuement_render/team_oral_eval',
            ];

            // First pass: count total documents that will be generated
            $totalDocuments = 0;
            foreach ($proposals as $proposal) {
                if ($proposal->defense_eval) {
                    $defenseEval = is_string($proposal->defense_eval) ? json_decode($proposal->defense_eval, true) : $proposal->defense_eval;
                    if (isset($defenseEval['forms'])) {
                        $totalDocuments += count(array_filter($defenseEval['forms'], fn($f) => $f['is_submitted'] ?? false));
                    }
                }
                if ($proposal->team_self_eval) {
                    $selfEval = is_string($proposal->team_self_eval) ? json_decode($proposal->team_self_eval, true) : $proposal->team_self_eval;
                    if (isset($selfEval['forms'])) {
                        $totalDocuments += count(array_filter($selfEval['forms'], fn($f) => $f['is_submitted'] ?? false));
                    }
                }
                if ($proposal->team_oral_eval) {
                    $oralEval = is_string($proposal->team_oral_eval) ? json_decode($proposal->team_oral_eval, true) : $proposal->team_oral_eval;
                    if (isset($oralEval['forms'])) {
                        $totalDocuments += count(array_filter($oralEval['forms'], fn($f) => $f['is_submitted'] ?? false));
                    }
                }
            }

            Log::info('[PDF Generation] Total documents to generate: ' . $totalDocuments);
            
            // Clear any existing progress cache before starting
            $cacheKey = "pdf_progress_{$capstone_id}";
            cache()->forget($cacheKey);
            Log::info('[PDF Generation] Cleared existing progress cache for capstone: ' . $capstone_id);
            
            $this->initializeProgressTracking($capstone_id, $totalDocuments, $proposals);

            foreach ($proposals as $proposalIndex => $proposal) {
                $proposalNumber = $proposalIndex + 1;
                Log::info('[PDF Generation] Processing Proposal ' . $proposalNumber);

                // Process Defense Evaluation
                if ($proposal->defense_eval) {
                    Log::info('[PDF Generation] Proposal ' . $proposalNumber . ' has defense_eval data');
                    $defenseEval = is_string($proposal->defense_eval) ? json_decode($proposal->defense_eval, true) : $proposal->defense_eval;
                    if (isset($defenseEval['forms']) && is_array($defenseEval['forms'])) {
                        Log::info('[PDF Generation] Proposal ' . $proposalNumber . ' defense_eval has ' . count($defenseEval['forms']) . ' forms');
                        foreach ($defenseEval['forms'] as $formIndex => $form) {
                            if ($form['is_submitted'] ?? false) {
                                $fullName = $form['full_name'] ?? 'Unknown';
                                Log::info('[PDF Generation] Generating PDF for Proposal ' . $proposalNumber . ' defense form ' . $formIndex);
                                $docName = "Proposal Defense - Proposal {$proposalNumber} ({$fullName})";
                                Log::info('[PDF Generation] About to call updateProgressTracking for: ' . $docName);
                                $this->updateProgressTracking($capstone_id, $docName, 'generating');
                                try {
                                    $this->generatePdfFromForm(
                                        $proposal,
                                        $form,
                                        'defense_eval',
                                        $tempDir,
                                        $proposalNumber,
                                        $formIndex,
                                        $pdfCount,
                                        'Proposal_Defense'
                                    );
                                    $this->updateProgressTracking($capstone_id, $docName, 'complete');
                                    
                                    // Add delay between documents to allow EventSource to poll and see updates
                                    usleep(1000000); // 1 second delay between documents for real-time visibility
                                    $pdfCount++;
                                } catch (\Exception $e) {
                                    $this->updateProgressTracking($capstone_id, $docName, 'error');
                                    $errorCount++;
                                    Log::error('[PDF Generation] Error generating defense PDF: ' . $e->getMessage());
                                }
                            }
                        }
                    }
                } else {
                    Log::info('[PDF Generation] Proposal ' . $proposalNumber . ' has no defense_eval data');
                }

                // Process Peer & Self Evaluation
                if ($proposal->team_self_eval) {
                    Log::info('[PDF Generation] Proposal ' . $proposalNumber . ' has team_self_eval data');
                    $selfEval = is_string($proposal->team_self_eval) ? json_decode($proposal->team_self_eval, true) : $proposal->team_self_eval;
                    if (isset($selfEval['forms']) && is_array($selfEval['forms'])) {
                        Log::info('[PDF Generation] Proposal ' . $proposalNumber . ' team_self_eval has ' . count($selfEval['forms']) . ' forms');
                        foreach ($selfEval['forms'] as $formIndex => $form) {
                            if ($form['is_submitted'] ?? false) {
                                $fullName = $form['full_name'] ?? 'Unknown';
                                Log::info('[PDF Generation] Generating PDF for Proposal ' . $proposalNumber . ' self-eval form ' . $formIndex);
                                $docName = "Peer & Self Evaluation - Proposal {$proposalNumber} ({$fullName})";
                                Log::info('[PDF Generation] About to call updateProgressTracking for: ' . $docName);
                                $this->updateProgressTracking($capstone_id, $docName, 'generating');
                                try {
                                    $this->generatePdfFromForm(
                                        $proposal,
                                        $form,
                                        'team_self_eval',
                                        $tempDir,
                                        $proposalNumber,
                                        $formIndex,
                                        $pdfCount,
                                        'Peer_and_Self_Evaluation'
                                    );
                                    $this->updateProgressTracking($capstone_id, $docName, 'complete');
                                    
                                    // Add delay between documents to allow EventSource to poll and see updates
                                    usleep(1000000); // 1 second delay between documents for real-time visibility
                                    $pdfCount++;
                                } catch (\Exception $e) {
                                    $this->updateProgressTracking($capstone_id, $docName, 'error');
                                    $errorCount++;
                                    Log::error('[PDF Generation] Error generating self-eval PDF: ' . $e->getMessage());
                                }
                            }
                        }
                    }
                } else {
                    Log::info('[PDF Generation] Proposal ' . $proposalNumber . ' has no team_self_eval data');
                }

                // Process Oral Presentation Evaluation
                if ($proposal->team_oral_eval) {
                    Log::info('[PDF Generation] Proposal ' . $proposalNumber . ' has team_oral_eval data');
                    $oralEval = is_string($proposal->team_oral_eval) ? json_decode($proposal->team_oral_eval, true) : $proposal->team_oral_eval;
                    if (isset($oralEval['forms']) && is_array($oralEval['forms'])) {
                        Log::info('[PDF Generation] Proposal ' . $proposalNumber . ' team_oral_eval has ' . count($oralEval['forms']) . ' forms');
                        foreach ($oralEval['forms'] as $formIndex => $form) {
                            if ($form['is_submitted'] ?? false) {
                                $fullName = $form['full_name'] ?? 'Unknown';
                                Log::info('[PDF Generation] Generating PDF for Proposal ' . $proposalNumber . ' oral form ' . $formIndex);
                                $docName = "Oral Presentation - Proposal {$proposalNumber} ({$fullName})";
                                Log::info('[PDF Generation] About to call updateProgressTracking for: ' . $docName);
                                $this->updateProgressTracking($capstone_id, $docName, 'generating');
                                try {
                                    $this->generatePdfFromForm(
                                        $proposal,
                                        $form,
                                        'team_oral_eval',
                                        $tempDir,
                                        $proposalNumber,
                                        $formIndex,
                                        $pdfCount,
                                        'Oral_Presentation_Evaluation'
                                    );
                                    $this->updateProgressTracking($capstone_id, $docName, 'complete');
                                    
                                    // Add delay between documents to allow EventSource to poll and see updates
                                    usleep(1000000); // 1 second delay between documents for real-time visibility
                                    $pdfCount++;
                                } catch (\Exception $e) {
                                    $this->updateProgressTracking($capstone_id, $docName, 'error');
                                    $errorCount++;
                                    Log::error('[PDF Generation] Error generating oral PDF: ' . $e->getMessage());
                                }
                            }
                        }
                    }
                } else {
                    Log::info('[PDF Generation] Proposal ' . $proposalNumber . ' has no team_oral_eval data');
                }
            }

            Log::info('[PDF Generation] Generated ' . $pdfCount . ' PDFs with ' . $errorCount . ' errors');

            if ($pdfCount === 0 && $errorCount === 0) {
                Log::warning('[PDF Generation] No submitted forms found');
                return response()->json(['error' => 'No submitted forms found for this capstone'], 404);
            }

            // Create zip file
            $zipPath = storage_path('pdf_temp/evaluations.zip');
            Log::info('[PDF Generation] Creating zip file at: ' . $zipPath);
            
            $zip = new \ZipArchive();
            if ($zip->open($zipPath, \ZipArchive::CREATE | \ZipArchive::OVERWRITE) !== TRUE) {
                Log::error('[PDF Generation] Failed to open zip file: ' . $zipPath);
                return response()->json(['error' => 'Failed to create zip file'], 500);
            }

            // Recursively add all PDF files with their folder structure
            $fileCount = $this->addFilesToZip($zip, $tempDir, $tempDir);
            Log::info('[PDF Generation] Found and added ' . $fileCount . ' PDF files to zip');
            
            $zip->close();
            Log::info('[PDF Generation] Zip file created successfully');

            // Check if zip file exists and has content
            if (!file_exists($zipPath) || filesize($zipPath) === 0) {
                Log::error('[PDF Generation] Zip file is empty or missing: ' . $zipPath);
                return response()->json(['error' => 'Failed to create valid zip file'], 500);
            }

            Log::info('[PDF Generation] Zip file size: ' . filesize($zipPath) . ' bytes');

            // Mark progress as complete
            $this->completeProgressTracking($capstone_id);

            // Download zip and cleanup
            $response = response()->download($zipPath)->deleteFileAfterSend(true);

            // Cleanup temp directory recursively
            $this->deleteDirectory($tempDir);
            
            Log::info('[PDF Generation] Cleaned up temp directory');
            Log::info('[PDF Generation] PDF generation completed successfully');

            return $response;
        } catch (\Exception $e) {
            Log::error('[PDF Generation] Exception: ' . $e->getMessage() . ' | Stack: ' . $e->getTraceAsString());
            return response()->json(['error' => 'Error generating PDFs: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Build HTML replacements for substituting form data into template
     * Maps defense_eval form data into placeholders
     */
    private function buildFormDataReplacements($form, $evalType, $proposal)
    {
        $replacements = [];
        
        // Convert time to 00:00 am/pm format if needed
        $timeValue = $form['time'] ?? '';
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
            }
        }
        
        // Basic form information: underline with 2 spaces before/after value, then 2 more spaces without underline
        $replacements['[EVALUATOR_NAME]'] = '<u>  ' . ($form['full_name'] ?? 'N/A') . '  </u>  ';
        $replacements['[REVIEWER_NAME]'] = '<u>  ' . ($form['full_name'] ?? 'N/A') . '  </u>  ';
        $replacements['[EVAL_TIME]'] = '<u>  ' . $timeValue . '  </u>  ';
        $replacements['[EVAL_DATE]'] = '<u>  ' . ($form['date'] ?? '') . '  </u>  ';
        $replacements['[DESIGNATION]'] = $form['form_data']['designation'] ?? '';
        $replacements['[PROJECT_TITLE]'] = '<u>  ' . ($proposal->title ?? '') . '  </u>  ';

        // Handle different evaluation types
        if ($evalType === 'team_oral_eval') {
            // Oral evaluation with team members
            $teamMembers = $form['form_data']['teamMembers'] ?? [];
            $scores = $form['form_data']['scores'] ?? [];
            
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
                
                // Only create page if there are members for it
                if ($startMemberIdx >= count($teamMembers)) break;
                
                $pageReplacementSet = $replacements; // Start with base replacements
                $pageMemberTotals = [];
                
                // Set team member names and roles for this page
                for ($i = $startMemberIdx; $i < $endMemberIdx; $i++) {
                    $memberIndex = $i + 1;
                    $columnIdx = $i - $startMemberIdx;
                    $member = $teamMembers[$i];
                    $pageReplacementSet['[TEAM_MEMBER_NAME_' . ($columnIdx + 1) . ']'] = $member['full_name'] ?? '';
                    $pageReplacementSet['[TEAM_MEMBER_ROLE_' . ($columnIdx + 1) . ']'] = $member['designation'] ?? '';
                    // Add member number placeholder for correct numbering across pages
                    $pageReplacementSet['[MEMBER_NUM_' . ($columnIdx + 1) . ']'] = (string)$memberIndex;
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
                }
                
                $pageReplacements[] = $pageReplacementSet;
            }
            
            // Calculate overall group average (average of all individual member totals)
            $groupAverage = count($allMemberTotals) > 0 ? round(array_sum($allMemberTotals) / count($allMemberTotals), 2) : 0;
            
            // Add group average to all page replacement sets
            foreach ($pageReplacements as &$pageReplacementSet) {
                $pageReplacementSet['[GROUP_AVERAGE]'] = (string)$groupAverage;
            }
            unset($pageReplacementSet);
            
            // Return format: ['pages' => $pageReplacements] for multi-page handling
            $replacements['__PAGES__'] = $pageReplacements;
            
        } elseif ($evalType === 'team_self_eval') {
            // Self evaluation with peer ratings
            $memberRatings = $form['form_data']['memberRatings'] ?? [];
            $ratings = $form['form_data']['ratings'] ?? [];
            
            // Create ordered member indices with reviewer first
            $reviewerId = $form['member_id'];
            $orderedIndices = [];
            $reviewerIndex = null;
            foreach ($memberRatings as $index => $member) {
                if ($member['member_id'] == $reviewerId) {
                    $reviewerIndex = $index;
                    $orderedIndices[] = $index;
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

        return $replacements;
    }

    /**
     * Process CSS styling for PDF rendering
     * Preserves inline styles and embeds external CSS for PDF compatibility
     */


    /**
     * Process images for PDF rendering
     * Validates image URLs, checks if they work, and converts relative paths to absolute
     * Adds comprehensive debugging for image processing
     */
    /**
     * Helper method to generate PDF from form data using Browsershot
     * Browsershot uses Chrome for accurate HTML/CSS/image rendering
     */
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
            // For every 90 characters in the comment, remove one padding paragraph
            // Only remove from the section between "END OF COMMENT TABLE" and "SECOND PAGE FOOTER SECTION"
            $commentLength = strlen($form['form_data']['comments'] ?? '');
            $paragraphsToRemove = (int)floor($commentLength / 90);
            
            if ($paragraphsToRemove > 0) {
                // Extract the section between the two markers
                $startMarker = '<!-- END OF COMMENT TABLE -->';
                $endMarker = '<!-- SECOND PAGE FOOTER SECTION -->';
                
                $startPos = strpos($html, $startMarker);
                $endPos = strpos($html, $endMarker);
                
                if ($startPos !== false && $endPos !== false) {
                    // Get the section between the markers
                    $sectionStart = $startPos + strlen($startMarker);
                    $section = substr($html, $sectionStart, $endPos - $sectionStart);
                    
                    // Pattern to match padding paragraph elements (empty paragraph with just &nbsp;)
                    $paddingPattern = '/<p[^>]*align=center[^>]*>\s*<b[^>]*>\s*<span[^>]*><o:p>&nbsp;<\/o:p><\/span>\s*<\/b>\s*<\/p>/is';
                    
                    // Remove paragraphs from this section only
                    $modifiedSection = $section;
                    for ($i = 0; $i < $paragraphsToRemove; $i++) {
                        $modifiedSection = preg_replace($paddingPattern, '', $modifiedSection, 1, $count);
                        if ($count === 0) break; // Stop if no more matches found
                    }
                    
                    // Replace the section in the HTML
                    $html = substr_replace($html, $modifiedSection, $sectionStart, $endPos - $sectionStart);
                    
                    Log::info('[PDF] Removed ' . $paragraphsToRemove . ' padding paragraphs from footer section (comment length: ' . $commentLength . ' chars)');
                } else {
                    Log::warning('[PDF] Could not find comment table footer markers - skipping padding removal');
                }
            }

            // Process CSS - Browsershot will handle this automatically, but we can add base path
            try {
                Log::info('[PDF-CSS] Processing CSS for Browsershot rendering');
                
                // Add base URL for relative paths
                if (strpos($html, '<head>') !== false) {
                    $baseTag = '<base href="' . public_path() . '">' . "\n";
                    $html = str_replace('<head>', '<head>' . "\n" . $baseTag, $html);
                    Log::info('[PDF-CSS] ✓ Added base tag for relative URL resolution');
                }
                
                // Log CSS link tags found
                if (preg_match_all('/<link[^>]*rel=["\']stylesheet["\'][^>]*href=["\']([^"\']+)["\'][^>]*>/i', $html, $matches)) {
                    Log::info('[PDF-CSS] Found ' . count($matches[1]) . ' CSS link tags - Browsershot will render them');
                }
                
                // Log inline style tags found
                if (preg_match_all('/<style[^>]*>(.+?)<\/style>/is', $html, $matches)) {
                    Log::info('[PDF-CSS] ✓ Found ' . count($matches[0]) . ' inline style blocks - will be rendered');
                }
            } catch (\Exception $e) {
                Log::warning('[PDF-CSS] Warning during CSS processing: ' . $e->getMessage());
            }

            // Process images - Browsershot will handle this automatically
            try {
                Log::info('[PDF-IMG] Processing images for Browsershot rendering');
                
                if (preg_match_all('/<img[^>]*src=["\']([^"\']+)["\'][^>]*>/i', $html, $matches)) {
                    Log::info('[PDF-IMG] Found ' . count($matches[1]) . ' image tags - Browsershot will render them');
                    
                    foreach ($matches[1] as $index => $src) {
                        Log::info('[PDF-IMG] [IMAGE #' . ($index + 1) . '] src: ' . $src);
                    }
                }
            } catch (\Exception $e) {
                Log::warning('[PDF-IMG] Warning during image processing: ' . $e->getMessage());
            }

            // Create subfolder structure: Proposal_X_Title/EvalTypeFolder/
            // Truncate title more aggressively to avoid Windows path length limits (260 char max)
            // Path structure: storage/pdf_temp/{tempId}/Proposal_X_{title}/{evalType}/{filename}
            $proposalTitle = str_replace([' ', '/', '\\', ':', '*', '?', '"', '<', '>', '|'], '_', substr($proposal->title ?? 'Proposal', 0, 30));
            $proposalFolder = $tempDir . '/Proposal_' . $proposalNumber . '_' . $proposalTitle;
            $evalFolder = $proposalFolder . '/' . $evalTypeFolder;
            @mkdir($evalFolder, 0755, true);
            
            // New filename format: Form{index}_{evaluator_name}.pdf
            // Sanitize evaluator name: remove special characters and accents
            $evaluatorName = $form['full_name'] ?? 'Evaluator';
            // Remove accents/diacritics
            $evaluatorName = iconv('UTF-8', 'ASCII//TRANSLIT', $evaluatorName);
            // Replace spaces and invalid characters with underscores
            $evaluatorName = str_replace([' ', '/', '\\', ':', '*', '?', '"', '<', '>', '|', "'"], '_', $evaluatorName);
            // Remove any remaining non-alphanumeric characters except underscore
            $evaluatorName = preg_replace('/[^a-zA-Z0-9_]/', '', $evaluatorName);
            // Limit to 50 characters and remove trailing underscores
            $evaluatorName = rtrim(substr($evaluatorName, 0, 50), '_');
            if (empty($evaluatorName)) {
                $evaluatorName = 'Evaluator';
            }
            
            // Generate filename (single PDF for all pages combined)
            $filename = sprintf('Form_%d_%s.pdf', $formIndex + 1, $evaluatorName);
            
            Log::info('[PDF] Output filename: ' . $filename);
            $pdfPath = $evalFolder . '/' . $filename;
            Log::info('[PDF] PDF path: ' . $pdfPath);

            try {
                Log::info('[PDF] ⏳ Starting Browsershot rendering (using Chrome)...');
                Log::info('[PDF] Node.js path: C:\Program Files\nodejs\node.exe');
                Log::info('[PDF] Chrome path: ' . ($this->getChromePath() ?? 'auto-detected'));
                
                // Use Browsershot to render HTML to PDF
                // Browsershot uses Chrome for accurate rendering
                $browsershot = Browsershot::html($html)
                    ->setNodeBinary('C:\Program Files\nodejs\node.exe')  // Explicit Node.js path
                    ->setChromePath($this->getChromePath())
                    ->format('A4')
                    ->margins(0, 16.51, 0, 16.51)
                    ->noSandbox();  // Important for some server configurations
                
                $browsershot->save($pdfPath);
                
                Log::info('[PDF] ✓ Browsershot rendering completed');

                // Verify PDF was created
                if (!file_exists($pdfPath)) {
                    Log::error('[PDF] PDF file does not exist after rendering: ' . $pdfPath);
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
     * Helper method to find Chrome/Chromium executable
     * Searches common installation paths across Windows, macOS, and Linux
     */
    private function getChromePath()
    {
        Log::info('[PDF] Searching for Chrome/Chromium executable...');
        
        // Windows paths - most likely first
        $windowsPaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files\\Chromium\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Chromium\\Application\\chrome.exe',
            env('CHROME_PATH'),
        ];

        // macOS paths
        $macPaths = [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ];

        // Linux paths
        $linuxPaths = [
            '/usr/bin/google-chrome',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/snap/bin/chromium',
        ];

        $pathsToTry = array_merge($windowsPaths, $macPaths, $linuxPaths);

        foreach ($pathsToTry as $path) {
            if ($path && file_exists($path)) {
                Log::info('[PDF] ✓ Found Chrome at: ' . $path);
                return $path;
            } else {
                if ($path) {
                    Log::debug('[PDF] Chrome not found at: ' . $path);
                }
            }
        }

        Log::warning('[PDF] Chrome not found in standard paths, using auto-detection');
        // If not found, Browsershot will search in PATH
        return null;
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
