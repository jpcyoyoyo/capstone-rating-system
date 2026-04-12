import React, { useState, useEffect, useCallback } from 'react';
import { Head, Link, router } from '@inertiajs/react';

interface PanelMember {
    member_id: string;
    full_name: string;
    designation: string;
}

interface Proposal {
    id: number;
    title: string;
    defense_eval?: DefenseEvalData;
    team_self_eval?: any;
    team_oral_eval?: any;
}

interface EvaluationForm {
    member_id: number;
    is_submitted: boolean;
    full_name: string;
    designation: string;
    time: string;
    date: string;
    form_data: {
        scores: Record<string, number | string>;
        decision: string;
        comments: string;
    };
}

interface DefenseEvalData {
    no_of_submitted: number;
    forms: EvaluationForm[];
}

interface CapstoneData {
    id: number;
    team_name: string;
    panel_members: {
        no_members: string;
        list: PanelMember[];
    };
    proposals: {
        proposals: Proposal[];
    };
}

interface FormData {
    projectTitle: string;
    evaluatorName: string;
    designation: string;
    evalTime: string;
    evalDate: string;
}

interface ScoreData {
    [key: string]: number | string;
}

export default function ProposalDefenseEvaluation({ capstone, defenseEval }: { capstone: CapstoneData; defenseEval: DefenseEvalData }) {
    const panelMembers = capstone.panel_members.list || [];
    const proposals = capstone.proposals?.proposals || [];
    
    const [selectedEvaluatorId, setSelectedEvaluatorId] = useState<number>(0);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [pendingEvaluatorId, setPendingEvaluatorId] = useState<number | null>(null);
    const [selectedProposalIdx, setSelectedProposalIdx] = useState<number>(0);
    
    const [formData, setFormData] = useState<FormData>({
        projectTitle: '',
        evaluatorName: '',
        designation: '',
        evalTime: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
        evalDate: new Date().toISOString().split('T')[0],
    });

    const [scores, setScores] = useState<ScoreData>({});
    const [decision, setDecision] = useState<string>('');
    const [comments, setComments] = useState<string>('');
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
    const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);

    // Auto-save functionality - only save if there are unsaved changes
    const saveEvaluation = useCallback(async () => {
        console.log('[DEBUG] saveEvaluation called', {
            hasUnsavedChanges,
            selectedProposalIdx,
            selectedEvaluatorId,
            scoresKeys: Object.keys(scores),
            proposalsLength: proposals.length,
        });

        if (proposals.length === 0 || panelMembers.length === 0) {
            console.log('[DEBUG] Skipping save: no proposals or panel members');
            return;
        }

        const proposal = proposals[selectedProposalIdx];
        if (!proposal) {
            console.log('[DEBUG] Skipping save: no proposal at index', selectedProposalIdx);
            return;
        }
        
        // Skip if no unsaved changes (prevents stale closures from saving old data)
        if (!hasUnsavedChanges) {
            console.log('[DEBUG] Skipping save: hasUnsavedChanges is false');
            return;
        }

        console.log('[SAVE] Saving to Proposal', proposal.id, 'Evaluator', selectedEvaluatorId, 'with scores:', scores);
        setIsSaving(true);
        console.log('[ANIMATION] isSaving set to TRUE - animation should appear');
        try {
            await router.post(`/capstone/${capstone.id}/defense-evaluation/${proposal.id}/${selectedEvaluatorId}`, {
                scores,
                decision,
                comments,
                evalTime: formData.evalTime,
                evalDate: formData.evalDate,
            }, {
                preserveState: true,
                preserveScroll: true,
            });
            console.log('[SUCCESS] Evaluation saved successfully');
            setLastSavedTime(new Date());
            setHasUnsavedChanges(false);
        } catch (error) {
            console.error('Failed to save evaluation:', error);
        } finally {
            console.log('[ANIMATION] isSaving set to FALSE - animation should disappear');
            setIsSaving(false);
        }
    }, [capstone.id, proposals, selectedProposalIdx, selectedEvaluatorId, scores, decision, comments, formData.evalTime, formData.evalDate, panelMembers.length, hasUnsavedChanges]);

    // Debounced auto-save when data changes
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            saveEvaluation();
        }, 1000); // Save after 1 second of inactivity

        return () => clearTimeout(timeoutId);
    }, [saveEvaluation]);

    // Clear unsaved changes when switching evaluators to prevent auto-save with old data
    useEffect(() => {
        if (selectedEvaluatorId === 0) return; // Don't process empty selection
        console.log('[SWITCH] Proposal/Evaluator changed', {
            selectedProposalIdx,
            selectedEvaluatorId,
            clearingUnsavedChanges: true,
        });
        setHasUnsavedChanges(false);
        setLastSavedTime(null);
    }, [selectedEvaluatorId, selectedProposalIdx]);

    const handleEvaluatorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newId = parseInt(e.target.value, 10) || 0;
        
        if (newId === 0) {
            setSelectedEvaluatorId(0);
            return;
        }
        
        // Check if this evaluator has already submitted
        const proposal = proposals[selectedProposalIdx];
        if (proposal && proposal.defense_eval?.forms) {
            const form = proposal.defense_eval.forms.find(
                (f: EvaluationForm) => parseInt(String(f.member_id), 10) === newId
            );
            
            if (form?.is_submitted) {
                setPendingEvaluatorId(newId);
                setShowConfirmModal(true);
                return;
            }
        }
        
        setSelectedEvaluatorId(newId);
    };
    
    const handleConfirmResubmit = async () => {
        if (!pendingEvaluatorId) return;
        
        const proposal = proposals[selectedProposalIdx];
        if (!proposal) return;
        
        setShowConfirmModal(false);
        setIsSubmitting(true);
        
        try {
            // Unsubmit the form
            await router.post(`/capstone/${capstone.id}/defense-evaluation/${proposal.id}/${pendingEvaluatorId}/toggle-submission`, {
                is_submitted: false,
            }, {
                preserveState: true,
                preserveScroll: true,
            });
            
            setSelectedEvaluatorId(pendingEvaluatorId);
            setPendingEvaluatorId(null);
        } catch (error) {
            console.error('Failed to unsubmit form:', error);
            setPendingEvaluatorId(null);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleDeclineResubmit = () => {
        setShowConfirmModal(false);
        setPendingEvaluatorId(null);
        setSelectedEvaluatorId(0);
    };

    // Load form data when evaluator or proposal changes
    useEffect(() => {
        if (selectedEvaluatorId === 0) {
            // Reset form for empty selection
            setFormData({
                projectTitle: proposals[selectedProposalIdx]?.title || '',
                evaluatorName: '',
                designation: '',
                evalTime: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
                evalDate: new Date().toISOString().split('T')[0],
            });
            setScores({});
            setDecision('');
            setComments('');
            setIsSubmitted(false);
            return;
        }
        
        console.log('[LOAD] Loading form data for Proposal', selectedProposalIdx, 'Evaluator', selectedEvaluatorId);
        
        if (proposals.length === 0 || panelMembers.length === 0) return;

        const proposal = proposals[selectedProposalIdx];
        if (!proposal) return;

        const currentDefenseEval = proposal.defense_eval?.forms ? proposal.defense_eval : defenseEval;

        // Find the form for this evaluator in the defense_eval
        const evaluatorForm = currentDefenseEval.forms.find(
            (form: EvaluationForm) => parseInt(String(form.member_id), 10) === selectedEvaluatorId
        );

        if (evaluatorForm) {
            console.log('[LOAD] Found saved data, loading scores:', evaluatorForm.form_data.scores);
            const newTime = evaluatorForm.time || new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
            const newDate = evaluatorForm.date || new Date().toISOString().split('T')[0];
            setFormData({
                projectTitle: proposal.title,
                evaluatorName: evaluatorForm.full_name,
                designation: evaluatorForm.designation,
                evalTime: newTime,
                evalDate: newDate,
            });
            setScores(evaluatorForm.form_data.scores || {});
            setDecision(evaluatorForm.form_data.decision || '');
            setComments(evaluatorForm.form_data.comments || '');
            setIsSubmitted(evaluatorForm.is_submitted || false);
            setHasUnsavedChanges(false);
            setLastSavedTime(null);
        } else {
            // No saved form data for this evaluator - reset to defaults
            console.log('[LOAD] No saved data found, resetting form to empty state');
            setFormData({
                projectTitle: proposal.title,
                evaluatorName: panelMembers.find(m => parseInt(m.member_id) === selectedEvaluatorId)?.full_name || '',
                designation: panelMembers.find(m => parseInt(m.member_id) === selectedEvaluatorId)?.designation || '',
                evalTime: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
                evalDate: new Date().toISOString().split('T')[0],
            });
            setScores({});
            setDecision('');
            setComments('');
            setIsSubmitted(false);
            setHasUnsavedChanges(false);
            setLastSavedTime(null);
        }
    }, [selectedEvaluatorId, selectedProposalIdx, proposals, panelMembers, defenseEval]);

    const criteria = [
        { type: 'item', id: 'A', label: 'A. TITLE', note: 'Title is relevant/appropriate to the program of study', min: 1, max: 5 },
        { type: 'section', label: 'B. INTRODUCTION' },
        { type: 'item', id: 'B1', label: '1. Project Context', min: 1, max: 5 },
        { type: 'item', id: 'B2', label: '2. Purpose and Description of the Project', min: 1, max: 5 },
        { type: 'item', id: 'B3', label: '3. Objectives of the Project', min: 1, max: 5 },
        { type: 'item', id: 'B4', label: '4. Scope and limitations are well-defined', min: 1, max: 5 },
        { type: 'item', id: 'C', label: 'C. REVIEW OF RELATED LITERATURE', note: 'Included sufficient information on previous studies related to the Capstone Proposal', min: 1, max: 15 },
        { type: 'section', label: 'D. TECHNICAL BACKGROUND', note: 'Methods proposed are realistic and show indications that set objectives are achievable / have been achieved' },
        { type: 'item', id: 'D1', label: '1. The technicality of the project', min: 1, max: 5 },
        { type: 'item', id: 'D2', label: '2. Details of the Technologies to be used', min: 1, max: 5 },
        { type: 'item', id: 'D3', label: '3. Proposed Project Plan', min: 1, max: 10 },
        { type: 'section', label: 'E. ORAL PRESENTATION' },
        { type: 'item', id: 'E1', label: '1. Shows mastery of the topic', min: 1, max: 10 },
        { type: 'item', id: 'E2', label: '2. Able to answer clearly all questions raised by the panel members', min: 1, max: 10 },
        { type: 'item', id: 'E3', label: '3. Presents well all visual aids and other relevant materials', min: 1, max: 10 },
        { type: 'item', id: 'E4', label: '4. Effectively communicates the topic to the audience', min: 1, max: 10 },
    ];

    const decisions = [
        'Approved with no revisions',
        'Approved with minor revisions',
        'Approved with major revisions',
        'Disapproved',
        'Re-defense',
    ];

    const itemCriteria = criteria.filter((c: any) => c.type === 'item');
    const maxTotal = itemCriteria.reduce((sum: number, c: any) => sum + c.max, 0);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, value } = e.target;
        if (id === 'evalTime' || id === 'evalDate') {
            console.log('Time/Date input changed:', { id, value, previous: formData[id as keyof FormData] });
            setFormData((prev) => ({ ...prev, [id]: value }));
            setHasUnsavedChanges(true);
        }
    };

    const handleScoreChange = (id: string, max: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.trim();
        console.log('[INPUT] Score changed for criteria', id, 'to', value, 'on Proposal', selectedProposalIdx, 'Evaluator', selectedEvaluatorId);
        setScores((prev) => ({ ...prev, [id]: value }));
        setHasUnsavedChanges(true);
    };

    const handleDecisionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setDecision(e.target.value);
        setHasUnsavedChanges(true);
    };

    const handleCommentsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setComments(e.target.value);
        setHasUnsavedChanges(true);
    };



    const calculateTotal = () => {
        let sum = 0;
        itemCriteria.forEach((item: any) => {
            const val = parseFloat(String(scores[item.id] || 0));
            if (!isNaN(val)) sum += val;
        });
        return sum;
    };

    const handleReset = async () => {
        if (confirm('Reset all fields? This cannot be undone.')) {
            console.log('[RESET] Clearing all form fields');
            setIsSaving(true);
            
            try {
                // Call backend to reset the evaluation form
                const proposal = proposals[selectedProposalIdx];
                if (proposal) {
                    await router.post(`/capstone/${capstone.id}/defense-evaluation/${proposal.id}/${selectedEvaluatorId}/reset`, {}, {
                        preserveState: false,
                        preserveScroll: true,
                    });
                    console.log('[RESET] Backend reset successful, page will reload with fresh data');
                }
            } catch (error) {
                console.error('[RESET] Backend reset failed:', error);
                setIsSaving(false);
            }
        }
    };

    const isFormValid = () => {
        // Check if all criteria have scores
        const allScoresFilled = itemCriteria.every((item: any) => {
            const score = scores[item.id];
            return score !== undefined && score !== '' && score !== null;
        });

        // Check if all scores don't exceed their max values
        const allScoresValid = itemCriteria.every((item: any) => {
            const score = parseFloat(String(scores[item.id] || 0));
            return !isNaN(score) && score <= item.max;
        });

        // Check if panel decision is selected
        const decisionSelected = decision && decision.trim() !== '';

        return allScoresFilled && allScoresValid && decisionSelected;
    };

    const handleToggleSubmission = async () => {
        if (proposals.length === 0 || panelMembers.length === 0) return;

        const proposal = proposals[selectedProposalIdx];
        if (!proposal) return;

        const newSubmissionStatus = !isSubmitted;
        setIsSubmitting(true);

        try {
            console.log('[SUBMIT] Toggling submission status to:', newSubmissionStatus);
            await router.post(`/capstone/${capstone.id}/defense-evaluation/${proposal.id}/${selectedEvaluatorId}/toggle-submission`, {
                is_submitted: newSubmissionStatus,
            }, {
                preserveState: true,
                preserveScroll: true,
            });
            console.log('[SUBMIT] Submission status toggled successfully');
            setIsSubmitted(newSubmissionStatus);
        } catch (error) {
            console.error('Failed to toggle submission:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            <Head title="Proposal Defense Evaluation" />

            <div className="min-h-screen" style={{ backgroundColor: '#f0ebe0' }}>
                {/* Header */}
                <div className="bg-linear-to-r mb-8" style={{ backgroundImage: 'linear-gradient(to right, #16213e, #0f3460)' }}>
                    <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
                        <Link
                            href={`/capstone/${capstone.id}`}
                            className="inline-flex items-center mb-4 px-4 py-2 rounded-lg text-white hover:opacity-80 transition-opacity"
                            style={{ backgroundColor: 'rgba(201, 168, 76, 0.2)' }}
                        >
                            ← Back
                        </Link>
                        <h1 className="text-3xl md:text-4xl font-serif font-bold text-white mb-4">
                            Proposal Defense Evaluation
                        </h1>
                        
                        {/* Evaluator Dropdown */}
                        <div className="mb-4">
                            <label className="text-sm font-semibold text-gray-200 block mb-2">Select Evaluator</label>
                            <select
                                value={selectedEvaluatorId}
                                onChange={handleEvaluatorChange}
                                className="w-full md:w-96 px-4 py-2 rounded-lg text-gray-800"
                                style={{ backgroundColor: '#faf8f2' }}
                            >
                                <option value="0">-- Select an Evaluator --</option>
                                {panelMembers.map((member) => (
                                    <option key={member.member_id} value={member.member_id}>
                                        {member.full_name} ({member.designation})
                                    </option>
                                ))}
                            </select>
                        </div>
                        
                        {/* Submission Status */}
                        {isSubmitted ? (
                            <div className="inline-block px-4 py-2 rounded-lg text-white font-semibold mb-4" style={{ backgroundColor: '#27ae60' }}>
                                ✓ Submitted
                            </div>
                        ) : null}
                        
                        {/* Auto-save indicator */}
                        {isSaving ? (
                            <div className="mb-4 text-yellow-300 text-sm flex items-center">
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-300 mr-2"></div>
                                Saving...
                            </div>
                        ) : null}
                    </div>
                </div>

                {/* Proposal Tabs */}
                {proposals.length > 0 ? (
                    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mb-6">
                        <div className="flex flex-wrap gap-2 border-b-2" style={{ borderColor: '#d4c9a8' }}>
                            {proposals.map((proposal, idx) => (
                                <button
                                    key={proposal.id}
                                    onClick={() => setSelectedProposalIdx(idx)}
                                    className="px-4 py-3 font-semibold transition-all border-b-4 -mb-0.5"
                                    style={{
                                        borderColor: selectedProposalIdx === idx ? '#c9a84c' : 'transparent',
                                        color: selectedProposalIdx === idx ? '#0f3460' : '#6b6b6b',
                                        backgroundColor: selectedProposalIdx === idx ? '#faf8f2' : 'transparent',
                                    }}
                                >
                                    Proposal {idx + 1}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : null}

                {/* Content */}
                <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
                    {/* Saving Status Indicator */}
                    <div className="mb-6 flex items-center gap-4">
                        {isSaving ? (
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#e74c3c', animation: 'pulse 1.5s infinite' }}></div>
                                <span className="text-sm font-semibold" style={{ color: '#e74c3c' }}>Saving...</span>
                            </div>
                        ) : null}
                        {lastSavedTime && !isSaving ? (
                            <span className="text-xs" style={{ color: '#27ae60' }}>
                                Last saved: {lastSavedTime.toLocaleTimeString()}
                            </span>
                        ) : null}
                        {hasUnsavedChanges && !isSaving ? (
                            <span className="text-xs font-semibold" style={{ color: '#f39c12' }}>Unsaved changes</span>
                        ) : null}
                    </div>

                    {/* Evaluator Info */}
                    <div className="rounded-lg border-2 p-6 mb-6 shadow-md" style={{ borderColor: '#d4c9a8', backgroundColor: '#ffffff' }}>
                        <h2 className="text-xl font-serif font-bold mb-4 pb-4 border-b-2" style={{ color: '#0f3460', borderColor: '#d4c9a8' }}>
                            Evaluator Information
                        </h2>
                        <div className='mb-4'>
                                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#6b6b6b' }}>Research/Capstone Project Title</label>
                                <input
                                    type="text"
                                    value={formData.projectTitle}
                                    readOnly
                                    className="w-full mt-1 px-3 py-2 border rounded-lg text-base font-bold"
                                    style={{ borderColor: '#d4c9a8', backgroundColor: '#f5f5f5', color: '#1a1a2e' }}
                                />
                            </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#6b6b6b' }}>Evaluator Name (Full Name)</label>
                                <input
                                    type="text"
                                    value={formData.evaluatorName}
                                    readOnly
                                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                                    style={{ borderColor: '#d4c9a8', backgroundColor: '#f5f5f5', color: '#1a1a2e' }}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#6b6b6b' }}>Designation</label>
                                <input
                                    type="text"
                                    value={formData.designation}
                                    readOnly
                                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                                    style={{ borderColor: '#d4c9a8', backgroundColor: '#f5f5f5', color: '#1a1a2e' }}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#6b6b6b' }}>Time</label>
                                <input
                                    id="evalTime"
                                    type="time"
                                    value={formData.evalTime}
                                    onChange={handleInputChange}
                                    disabled={selectedEvaluatorId === 0 || isSubmitted}
                                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                                    style={{ borderColor: '#d4c9a8', backgroundColor: selectedEvaluatorId === 0 || isSubmitted ? '#f0f0f0' : '#faf8f2', color: '#1a1a2e', opacity: selectedEvaluatorId === 0 || isSubmitted ? 0.5 : 1, cursor: selectedEvaluatorId === 0 || isSubmitted ? 'not-allowed' : 'auto' }}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#6b6b6b' }}>Date</label>
                                <input
                                    id="evalDate"
                                    type="date"
                                    value={formData.evalDate}
                                    onChange={handleInputChange}
                                    disabled={selectedEvaluatorId === 0 || isSubmitted}
                                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                                    style={{ borderColor: '#d4c9a8', backgroundColor: selectedEvaluatorId === 0 || isSubmitted ? '#f0f0f0' : '#faf8f2', color: '#1a1a2e', opacity: selectedEvaluatorId === 0 || isSubmitted ? 0.5 : 1, cursor: selectedEvaluatorId === 0 || isSubmitted ? 'not-allowed' : 'auto' }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Criteria Scoring */}
                    <div className="rounded-lg border-2 p-6 mb-6 shadow-md" style={{ borderColor: '#d4c9a8', backgroundColor: '#ffffff' }}>
                        <h2 className="text-xl font-serif font-bold mb-4 pb-4 border-b-2" style={{ color: '#0f3460', borderColor: '#d4c9a8' }}>
                            Evaluation Criteria
                        </h2>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr style={{ backgroundColor: '#0f3460' }}>
                                        <th className="text-left text-white p-3 font-semibold" style={{ width: '70%' }}>Criteria</th>
                                        <th className="text-center text-white p-3 font-semibold">Score</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {criteria.map((row: any, idx: number) => {
                                        const isSectionHeader = row.type === 'section' || (row.id && row.id.length === 1);
                                        
                                        return isSectionHeader ? (
                                            <tr key={idx} style={{ backgroundColor: '#eef1f8', borderBottom: '1px solid #d0d8ec' }}>
                                                <td className="p-3 font-bold" style={{ color: '#0f3460' }}>
                                                    <span style={{ color: '#0f3460', fontWeight: '700' }}>{row.label}</span>
                                                    {row.note && <div className="text-xs font-normal italic mt-1" style={{ color: '#6b6b6b' }}>{row.note}</div>}
                                                </td>
                                                {row.type === 'item' && (
                                                    <td className="text-center p-3">
                                                        <input
                                                            type="number"
                                                            min={row.min}
                                                            max={row.max}
                                                            value={scores[row.id] || ''}
                                                            onChange={handleScoreChange(row.id, row.max)}
                                                            disabled={selectedEvaluatorId === 0 || isSubmitted}
                                                            className="w-16 text-center border rounded px-2 py-1 font-bold text-sm"
                                                            style={{
                                                                borderColor: parseFloat(String(scores[row.id] || 0)) > row.max ? '#c0392b' : '#d4c9a8',
                                                                backgroundColor: selectedEvaluatorId === 0 || isSubmitted ? '#f0f0f0' : (parseFloat(String(scores[row.id] || 0)) > row.max ? '#fff5f5' : '#faf8f2'),
                                                                color: parseFloat(String(scores[row.id] || 0)) > row.max ? '#c0392b' : '#0f3460',
                                                                opacity: selectedEvaluatorId === 0 || isSubmitted ? 0.5 : 1,
                                                                cursor: selectedEvaluatorId === 0 || isSubmitted ? 'not-allowed' : 'auto',
                                                            }}
                                                        />
                                                        <div className="text-xs mt-1" style={{ color: '#6b6b6b' }}>Max: {row.max}</div>
                                                    </td>
                                                )}
                                            </tr>
                                        ) : (
                                            <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#faf8f2' : '#ffffff', borderBottom: '1px solid #ece8da' }}>
                                                <td className="p-3">
                                                    <span style={{ color: '#1a1a2e', fontWeight: '500' }}>{row.label}</span>
                                                    {row.note && <div className="text-xs italic mt-1" style={{ color: '#6b6b6b' }}>{row.note}</div>}
                                                </td>
                                                <td className="text-center p-3">
                                                    <input
                                                        type="number"
                                                        min={row.min}
                                                        max={row.max}
                                                        value={scores[row.id] || ''}
                                                        onChange={handleScoreChange(row.id, row.max)}
                                                        disabled={selectedEvaluatorId === 0 || isSubmitted}
                                                        className="w-16 text-center border rounded px-2 py-1 font-bold text-sm"
                                                        style={{
                                                            borderColor: parseFloat(String(scores[row.id] || 0)) > row.max ? '#c0392b' : '#d4c9a8',
                                                            backgroundColor: selectedEvaluatorId === 0 || isSubmitted ? '#f0f0f0' : (parseFloat(String(scores[row.id] || 0)) > row.max ? '#fff5f5' : '#faf8f2'),
                                                            color: parseFloat(String(scores[row.id] || 0)) > row.max ? '#c0392b' : '#0f3460',
                                                            opacity: selectedEvaluatorId === 0 || isSubmitted ? 0.5 : 1,
                                                            cursor: selectedEvaluatorId === 0 || isSubmitted ? 'not-allowed' : 'auto',
                                                        }}
                                                    />
                                                    <div className="text-xs mt-1" style={{ color: '#6b6b6b' }}>Max: {row.max}</div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    <tr style={{ backgroundColor: '#f5f0e0', borderTop: '2px solid #c9a84c' }}>
                                        <td className="p-3 font-bold" style={{ color: '#0f3460' }}>Total Score (Max {maxTotal})</td>
                                        <td className="text-center p-3">
                                            <div className="inline-block px-4 py-2 rounded font-bold text-lg" style={{ backgroundColor: '#0f3460', color: '#ffffff' }}>
                                                {calculateTotal()}
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Panel Decision and Grading */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        {/* Panel Decision */}
                        <div className="rounded-lg border-2 p-6 shadow-md" style={{ borderColor: '#d4c9a8', backgroundColor: '#ffffff' }}>
                            <h2 className="text-xl font-serif font-bold mb-4 pb-4 border-b-2" style={{ color: '#0f3460', borderColor: '#d4c9a8' }}>
                                Panel Decision
                            </h2>
                            <div className="space-y-3">
                                {decisions.map((dec, idx) => (
                                    <label key={idx} className="flex items-center gap-3 p-3 border-2 rounded-lg transition-all" style={{ 
                                        borderColor: decision === dec ? '#0f3460' : '#d4c9a8',
                                        backgroundColor: selectedEvaluatorId === 0 || isSubmitted ? '#f0f0f0' : (decision === dec ? '#f0f4fb' : '#faf8f2'),
                                        cursor: selectedEvaluatorId === 0 || isSubmitted ? 'not-allowed' : 'pointer',
                                        opacity: selectedEvaluatorId === 0 || isSubmitted ? 0.5 : 1,
                                    }}>
                                        <input
                                            type="radio"
                                            name="decision"
                                            value={dec}
                                            checked={decision === dec}
                                            onChange={handleDecisionChange}
                                            disabled={selectedEvaluatorId === 0 || isSubmitted}
                                            className="w-5 h-5"
                                            style={{ cursor: selectedEvaluatorId === 0 || isSubmitted ? 'not-allowed' : 'pointer' }}
                                        />
                                        <span style={{ color: decision === dec ? '#0f3460' : '#1a1a2e', fontWeight: decision === dec ? '700' : '400' }}>
                                            {dec}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Grading Scale */}
                        <div className="rounded-lg border-2 p-6 shadow-md" style={{ borderColor: '#d4c9a8', backgroundColor: '#ffffff' }}>
                            <h2 className="text-xl font-serif font-bold mb-4 pb-4 border-b-2" style={{ color: '#0f3460', borderColor: '#d4c9a8' }}>
                                Grading Scale
                            </h2>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr style={{ backgroundColor: '#0f3460' }}>
                                            <th className="text-left text-white p-3 font-semibold w-1/2">Grade</th>
                                            <th className="text-left text-white p-3 font-semibold w-1/2">Equivalent</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr style={{ backgroundColor: '#faf8f2', borderBottom: '1px solid #ece8da' }}>
                                            <td className="p-3">
                                                <span style={{ color: '#27ae60', fontWeight: '700', fontSize: '1.125rem' }}>P</span>
                                            </td>
                                            <td className="p-3">
                                                <span style={{ color: '#1a1a2e', fontWeight: '500' }}>&ge;75</span>
                                            </td>
                                        </tr>
                                        <tr style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #ece8da' }}>
                                            <td className="p-3">
                                                <span style={{ color: '#c0392b', fontWeight: '700', fontSize: '1.125rem' }}>F</span>
                                            </td>
                                            <td className="p-3">
                                                <span style={{ color: '#1a1a2e', fontWeight: '500' }}>&lt;75</span>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* Comments/Suggestions */}
                    <div className="rounded-lg border-2 p-6 mb-6 shadow-md" style={{ borderColor: '#d4c9a8', backgroundColor: '#ffffff' }}>
                        <h2 className="text-xl font-serif font-bold mb-4 pb-4 border-b-2" style={{ color: '#0f3460', borderColor: '#d4c9a8' }}>
                            Comments / Suggestions
                        </h2>
                        <div>
                            <label className="text-xs font-semibold uppercase tracking-wider block mb-2" style={{ color: '#6b6b6b' }}>
                                Additional Comments or Suggestions for Improvement
                            </label>
                            <textarea
                                value={comments}
                                onChange={handleCommentsChange}
                                placeholder="Enter any comments or suggestions here..."
                                rows={6}
                                disabled={selectedEvaluatorId === 0 || isSubmitted}
                                className="w-full px-3 py-2 border rounded-lg text-sm resize-none"
                                style={{ borderColor: '#d4c9a8', backgroundColor: selectedEvaluatorId === 0 || isSubmitted ? '#f0f0f0' : '#faf8f2', color: '#1a1a2e', opacity: selectedEvaluatorId === 0 || isSubmitted ? 0.5 : 1, cursor: selectedEvaluatorId === 0 || isSubmitted ? 'not-allowed' : 'auto' }}
                            />
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 justify-center mb-8 flex-wrap">
                        <button
                            onClick={handleReset}
                            disabled={isSubmitted || isSaving || (Object.keys(scores).length === 0 && !decision && !comments)}
                            className="px-6 py-2 rounded-lg font-semibold uppercase text-sm border-2 transition-all"
                            style={{ 
                                borderColor: '#0f3460', 
                                color: (isSubmitted || isSaving || (Object.keys(scores).length === 0 && !decision && !comments)) ? '#999999' : '#0f3460',
                                opacity: (isSubmitted || isSaving || (Object.keys(scores).length === 0 && !decision && !comments)) ? 0.5 : 1,
                                cursor: (isSubmitted || isSaving || (Object.keys(scores).length === 0 && !decision && !comments)) ? 'not-allowed' : 'pointer',
                            }}
                            onMouseEnter={(e) => {
                                if (!isSubmitted && !isSaving && (Object.keys(scores).length > 0 || decision || comments)) {
                                    e.currentTarget.style.backgroundColor = '#0f3460';
                                    e.currentTarget.style.color = '#ffffff';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isSubmitted && !isSaving && (Object.keys(scores).length > 0 || decision || comments)) {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                    e.currentTarget.style.color = '#0f3460';
                                }
                            }}
                            title={isSubmitted ? 'Cannot reset submitted form' : 'Clear all form fields'}
                        >
                            Reset
                        </button>
                        <button
                            onClick={handleToggleSubmission}
                            disabled={isSubmitting || !isFormValid()}
                            className="px-6 py-2 rounded-lg font-semibold uppercase text-sm text-white transition-all"
                            style={{ 
                                backgroundColor: '#27ae60',
                                opacity: (isSubmitting || !isFormValid()) ? 0.5 : 1,
                                cursor: (isSubmitting || !isFormValid()) ? 'not-allowed' : 'pointer',
                            }}
                            onMouseEnter={(e) => {
                                if (!isSubmitting && isFormValid()) {
                                    e.currentTarget.style.backgroundColor = '#229954';
                                }
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = '#27ae60';
                            }}
                            title={!isFormValid() ? 'All scores must be filled, within limits, and a decision must be selected' : ''}
                        >
                            {isSubmitting ? 'Updating...' : (isSubmitted ? 'Unsubmit Form' : 'Submit')}
                        </button>

                        
                    </div>

                    {/* Submission Requirements Info */}
                    {!isSubmitted && !isFormValid() && (
                        <div className="rounded-lg border-2 p-4 mb-6" style={{ borderColor: '#ffc107', backgroundColor: '#fffbf0' }}>
                            <p style={{ color: '#856404', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                                ⚠️ Form cannot be submitted yet. Missing requirements:
                            </p>
                            <ul style={{ color: '#856404', fontSize: '0.875rem', marginLeft: '1.5rem', lineHeight: '1.6' }}>
                                {itemCriteria.some((item: any) => !scores[item.id] || scores[item.id] === '') && (
                                    <li>• All evaluation criteria must have a score</li>
                                )}
                                {itemCriteria.some((item: any) => {
                                    const score = parseFloat(String(scores[item.id] || 0));
                                    return !isNaN(score) && score > item.max;
                                }) && (
                                    <li>• Score cannot exceed the maximum allowed value</li>
                                )}
                                {!decision && (
                                    <li>• A panel decision must be selected</li>
                                )}
                            </ul>
                        </div>
                    )}
                </div>

                {/* Auto-save indicator - Bottom Left Corner */}
                {isSaving && (
                    <div className="fixed bottom-6 left-6 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg z-50" style={{ backgroundColor: '#0f3460', color: '#ffffff' }}>
                        <div className="flex items-center justify-center">
                            <div className="animate-spin rounded-full h-5 w-5 border-2 border-yellow-300 border-t-transparent"></div>
                        </div>
                        <span className="text-sm font-semibold">Saving...</span>
                    </div>
                )}
                {isSaving && (console.log('[ANIMATION VISIBLE] isSaving=true, animation should be visible on screen'), null)}
                {!isSaving && (console.log('[ANIMATION HIDDEN] isSaving=false, animation should not be visible'), null)}
            </div>

            {/* Confirmation Modal */}
            {showConfirmModal && (
                <div className="fixed inset-0 bg-black/35 bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
                        <h3 className="text-lg font-bold mb-4" style={{ color: '#0f3460' }}>
                            Resubmit Form?
                        </h3>
                        <p className="text-gray-700 mb-6">
                            This evaluator has already submitted the form for this proposal. Do you want to unsubmit it and edit it?
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={handleDeclineResubmit}
                                className="px-4 py-2 rounded-lg border-2 font-semibold"
                                style={{ borderColor: '#0f3460', color: '#0f3460' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmResubmit}
                                className="px-4 py-2 rounded-lg font-semibold text-white"
                                style={{ backgroundColor: '#c9a84c' }}
                            >
                                Unsubmit & Edit
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
            `}</style>
        </>
    );
}
