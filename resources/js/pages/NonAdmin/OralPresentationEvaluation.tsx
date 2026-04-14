import React, { useState, useEffect, useRef } from 'react';
import { Head, Link, router } from '@inertiajs/react';

interface PanelMember {
    member_id: string;
    full_name: string;
    designation: string;
}

interface TeamMember {
    member_id: string;
    full_name: string;
    designation: string;
}

interface Proposal {
    id: number;
    title: string;
    team_oral_eval?: OralEvalData;
    defense_eval?: any;
    team_self_eval?: any;
}

interface EvaluationForm {
    member_id: number;
    is_submitted: boolean;
    full_name: string;
    designation: string;
    time: string;
    date: string;
    form_data: {
        teamMembers: Array<{ member_id: number; full_name: string; designation: string }>;
        scores: Record<string, number | string>;
    };
}

interface OralEvalData {
    no_of_submitted: number;
    forms: EvaluationForm[];
}

interface CapstoneData {
    id: number;
    team_name: string;
    team_list: {
        no_members: string;
        list: TeamMember[];
    };
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

interface ScoresData {
    [key: string]: number | string;
}

export default function OralPresentationEvaluation({ capstone, oralEval }: { capstone: CapstoneData; oralEval: OralEvalData }) {
    const panelMembers = capstone.panel_members.list || [];
    const teamMembers = capstone.team_list.list || [];
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

    const [scores, setScores] = useState<ScoresData>({});
    
    // Auto-save state
    const [isSaving, setIsSaving] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [savingError, setSavingError] = useState<string | null>(null);
    const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [requiredFieldsWarning, setRequiredFieldsWarning] = useState<string[]>([]);
    
    // Refs for debouncing and cleanup
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pageLeaveWarningRef = useRef(false);

    const handleEvaluatorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newId = parseInt(e.target.value, 10) || 0;
        
        if (newId === 0) {
            setSelectedEvaluatorId(0);
            return;
        }
        
        // Check if this evaluator has already submitted
        const proposal = proposals[selectedProposalIdx];
        if (proposal && proposal.team_oral_eval?.forms) {
            const form = proposal.team_oral_eval.forms.find(
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
        
        try {
            // Unsubmit the form
            await router.post(`/capstone/${capstone.id}/oral-evaluation/${proposal.id}/${pendingEvaluatorId}/toggle-submission`, {
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
        }
    };
    
    const handleDeclineResubmit = () => {
        setShowConfirmModal(false);
        setPendingEvaluatorId(null);
        setSelectedEvaluatorId(0);
    };

    useEffect(() => {
        if (selectedEvaluatorId === 0) return; // Don't process empty selection
        console.log('[OralEval] Clearing unsaved changes on evaluator switch');
        setHasUnsavedChanges(false);
        setLastSavedTime(null);
    }, [selectedEvaluatorId, selectedProposalIdx]);

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
            setIsSubmitted(false);
            return;
        }

        if (proposals.length === 0 || panelMembers.length === 0) return;

        const proposal = proposals[selectedProposalIdx];
        if (!proposal) return;

        const currentOralEval = proposal.team_oral_eval?.forms ? proposal.team_oral_eval : oralEval;

        // Find the form for this evaluator in the oral_eval
        const evaluatorForm = currentOralEval.forms.find(
            (form: EvaluationForm) => parseInt(String(form.member_id), 10) === selectedEvaluatorId
        );

        if (evaluatorForm) {
            const newTime = evaluatorForm.time || new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
            const newDate = evaluatorForm.date || new Date().toISOString().split('T')[0];
            console.log('[OralEval] Loading form for:', {
                evaluatorId: selectedEvaluatorId,
                proposalIdx: selectedProposalIdx,
                proposalId: proposal.id,
            });
            console.log('[OralEval] Form loaded:', {
                evalTime: newTime,
                evalDate: newDate,
                scoresCount: Object.keys(evaluatorForm.form_data.scores || {}).length,
                isSubmitted: evaluatorForm.is_submitted,
            });
            setFormData({
                projectTitle: proposal.title,
                evaluatorName: evaluatorForm.full_name,
                designation: evaluatorForm.designation,
                evalTime: newTime,
                evalDate: newDate,
            });
            setScores(evaluatorForm.form_data.scores || {});
            setIsSubmitted(evaluatorForm.is_submitted || false);
            setHasUnsavedChanges(false);
            setSavingError(null);
            setRequiredFieldsWarning([]);
        }
    }, [selectedEvaluatorId, selectedProposalIdx, proposals, panelMembers, oralEval]);

    // Auto-save when form data changes (with debounce) - only if there are unsaved changes
    useEffect(() => {
        if (!hasUnsavedChanges || isSubmitted) return;

        // Clear any pending save
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

        // Set up debounced save
        saveTimeoutRef.current = setTimeout(() => {
            autoSave();
        }, 2000);

        return () => {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        };
    }, [hasUnsavedChanges, formData, scores, isSubmitted]);

    // Auto-save function
    const autoSave = async () => {
        if (isSubmitted || !hasUnsavedChanges) return;

        const proposal = proposals[selectedProposalIdx];
        if (!proposal) return;

        setIsSaving(true);
        setSavingError(null);

        try {
            console.log('[OralEval] Auto-saving:', {
                proposalId: proposal.id,
                evaluatorId: selectedEvaluatorId,
                scoresCount: Object.keys(scores).length,
            });

            await router.post(
                `/capstone/${capstone.id}/oral-evaluation/${proposal.id}/${selectedEvaluatorId}`,
                {
                    scores: scores,
                    evalTime: formData.evalTime,
                    evalDate: formData.evalDate,
                },
                {
                    preserveState: true,
                    preserveScroll: true,
                }
            );

            setLastSavedTime(new Date());
            setHasUnsavedChanges(false);
            console.log('[OralEval] Auto-save successful');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            setSavingError(errorMessage);
            console.log('[OralEval] Auto-save failed:', errorMessage);
        } finally {
            setIsSaving(false);
        }
    };

    // Clear unsaved changes when switching evaluators/proposals to prevent auto-save with old data
    useEffect(() => {
        console.log('[OralEval] Switching evaluator/proposal, clearing unsaved changes');
        setHasUnsavedChanges(false);
    }, [selectedEvaluatorId, selectedProposalIdx]);

    // Validation function for submit button
    const validateRequiredFields = (): boolean => {
        const warnings: string[] = [];

        if (!formData.evalTime) warnings.push('Evaluation time is required');
        if (!formData.evalDate) warnings.push('Evaluation date is required');

        // Check if all score fields are filled for all team members
        let allScoresFilled = true;
        for (let c = 0; c < criteria.length; c++) {
            for (let m = 0; m < teamMembers.length; m++) {
                const key = `${c}_${m}`;
                if (!scores[key] || scores[key] === '') {
                    allScoresFilled = false;
                    break;
                }
            }
            if (!allScoresFilled) break;
        }

        if (!allScoresFilled) warnings.push('All score fields must be filled');

        setRequiredFieldsWarning(warnings);
        return warnings.length === 0;
    };

    // Pure validation check for render (no state updates)
    const isFormValid = (): boolean => {
        if (!formData.evalTime || !formData.evalDate) return false;

        // Check if all score fields are filled for all team members
        for (let c = 0; c < criteria.length; c++) {
            for (let m = 0; m < teamMembers.length; m++) {
                const key = `${c}_${m}`;
                if (!scores[key] || scores[key] === '') {
                    return false;
                }
            }
        }

        return true;
    };

    // Submit form
    const handleSubmit = async () => {
        console.log('[OralEval] Submit button clicked');

        if (!validateRequiredFields()) {
            return;
        }

        // First, auto-save any unsaved changes
        if (hasUnsavedChanges) {
            await autoSave();
        }

        const proposal = proposals[selectedProposalIdx];
        if (!proposal) return;

        setIsSaving(true);
        setSavingError(null);

        try {
            console.log('[OralEval] Submit button clicked');
            await router.post(
                `/capstone/${capstone.id}/oral-evaluation/${proposal.id}/${selectedEvaluatorId}/toggle-submission`,
                {
                    is_submitted: true,
                },
                {
                    preserveState: true,
                    preserveScroll: true,
                }
            );
            console.log('[OralEval] Form submitted successfully');
            setIsSubmitted(true);
            setHasUnsavedChanges(false);
            setSavingError(null);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            setSavingError(errorMessage);
            console.log('[OralEval] Submission failed:', errorMessage);
        } finally {
            setIsSaving(false);
        }
    };

    // Unsubmit form
    const handleUnsubmit = async () => {
        const proposal = proposals[selectedProposalIdx];
        if (!proposal) return;

        setIsSaving(true);
        setSavingError(null);

        try {
            await router.post(
                `/capstone/${capstone.id}/oral-evaluation/${proposal.id}/${selectedEvaluatorId}/toggle-submission`,
                {
                    is_submitted: false,
                },
                {
                    preserveState: true,
                    preserveScroll: true,
                }
            );
            console.log('[OralEval] Form unsubmitted');
            setIsSubmitted(false);
            setHasUnsavedChanges(false);
            setSavingError(null);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            setSavingError(errorMessage);
            console.log('[OralEval] Unsubmit failed:', errorMessage);
        } finally {
            setIsSaving(false);
        }
    };

    const criteria = [
        { label: 'Overall Organization', min: 1, max: 20 },
        { label: 'Preparedness', min: 1, max: 15 },
        { label: 'Visual Aids Quality / Effect', min: 1, max: 15 },
        { label: 'Technical Content', min: 1, max: 15 },
        { label: 'Delivery', min: 1, max: 15 },
        { label: 'Handling of Questions', min: 1, max: 10 },
        { label: 'Effective Use of Time', min: 1, max: 10 },
    ];

    const maxTotal = criteria.reduce((sum, c) => sum + c.max, 0);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, value } = e.target;
        if (id === 'evalTime' || id === 'evalDate') {
            console.log('[OralEval] Time/Date changed:', { id, value });
            setFormData((prev) => ({ ...prev, [id]: value }));
            setHasUnsavedChanges(true);
        }
    };

    const handleScoreChange = (criteriaIdx: number, memberIdx: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.trim();
        const key = `${criteriaIdx}_${memberIdx}`;
        setScores((prev) => ({ ...prev, [key]: value }));
        console.log('[OralEval] Score changed:', { key, value });
        setHasUnsavedChanges(true);
    };

    const calculateMemberTotal = (memberIdx: number) => {
        let sum = 0;
        criteria.forEach((_, idx) => {
            const val = parseFloat(String(scores[`${idx}_${memberIdx}`] || 0));
            if (!isNaN(val)) sum += val;
        });
        return sum;
    };

    const calculateGroupAverage = () => {
        const totals: number[] = [];
        for (let m = 0; m < teamMembers.length; m++) {
            const total = calculateMemberTotal(m);
            if (total > 0) totals.push(total);
        }
        if (totals.length === 0) return 0;
        const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
        return avg % 1 === 0 ? avg : parseFloat(avg.toFixed(2));
    };

    const handleReset = async () => {
        if (confirm('Reset all fields? This cannot be undone.')) {
            setIsSaving(true);
            
            try {
                // Call backend to reset the evaluation form
                const proposal = proposals[selectedProposalIdx];
                if (proposal) {
                    await router.post(`/capstone/${capstone.id}/oral-evaluation/${proposal.id}/${selectedEvaluatorId}/reset`, {}, {
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

    // Page unload protection
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasUnsavedChanges && !isSubmitted) {
                console.log('[OralEval] Unsaved changes detected');
                e.preventDefault();
                e.returnValue = '';
                pageLeaveWarningRef.current = true;
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasUnsavedChanges, isSubmitted]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        };
    }, []);

    return (
        <>
            <Head title="Oral Presentation Evaluation" />

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
                            Oral Presentation Evaluation
                        </h1>
                        
                        {/* Evaluator Dropdown */}
                        <div className="mb-4">
                            <label className="text-sm font-semibold text-gray-200 block mb-2">Select Evaluator</label>
                            <select
                                value={selectedEvaluatorId}
                                onChange={handleEvaluatorChange}
                                disabled={isSubmitted || isSaving}
                                className="w-full md:w-96 px-4 py-2 rounded-lg text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
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
                        {isSubmitted && (
                            <div className="inline-block px-4 py-2 rounded-lg text-white font-semibold" style={{ backgroundColor: '#27ae60' }}>
                                ✓ Submitted
                            </div>
                        )}
                    </div>
                </div>

                {/* Proposal Tabs */}
                {proposals.length > 0 && (
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
                )}

                {/* Content */}
                <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
                    {/* Error Alert */}
                    {savingError && (
                        <div className="mb-6 p-4 rounded-lg border-2 text-white" style={{ backgroundColor: '#c0392b', borderColor: '#a93226' }}>
                            <p className="font-semibold">Error: {savingError}</p>
                        </div>
                    )}

                    {/* Required Fields Warning */}
                    {requiredFieldsWarning.length > 0 && (
                        <div className="mb-6 p-4 rounded-lg border-2" style={{ backgroundColor: '#fff3cd', borderColor: '#f9c74f' }}>
                            <p className="font-semibold mb-2" style={{ color: '#856404' }}>Form Requirements:</p>
                            <ul className="list-disc list-inside" style={{ color: '#856404' }}>
                                {requiredFieldsWarning.map((warning, idx) => (
                                    <li key={idx}>{warning}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Saving Status Indicator */}
                    <div className="mb-6 flex items-center gap-4">
                        {isSaving && (
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#e74c3c', animation: 'pulse 1.5s infinite' }}></div>
                                <span className="text-sm font-semibold" style={{ color: '#e74c3c' }}>Saving...</span>
                            </div>
                        )}
                        {lastSavedTime && !isSaving && (
                            <span className="text-xs" style={{ color: '#27ae60' }}>
                                Last saved: {lastSavedTime.toLocaleTimeString()}
                            </span>
                        )}
                        {hasUnsavedChanges && !isSaving && (
                            <span className="text-xs font-semibold" style={{ color: '#f39c12' }}>Unsaved changes</span>
                        )}
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
                                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#6b6b6b' }}>Time <span style={{ color: '#c0392b' }}>*</span></label>
                                <input
                                    id="evalTime"
                                    type="time"
                                    value={formData.evalTime}
                                    onChange={handleInputChange}
                                    disabled={selectedEvaluatorId === 0 || isSubmitted || isSaving}
                                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                    style={{ borderColor: '#d4c9a8', backgroundColor: (selectedEvaluatorId === 0 || isSubmitted || isSaving) ? '#f0f0f0' : '#faf8f2', color: '#1a1a2e' }}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#6b6b6b' }}>Date <span style={{ color: '#c0392b' }}>*</span></label>
                                <input
                                    id="evalDate"
                                    type="date"
                                    value={formData.evalDate}
                                    onChange={handleInputChange}
                                    disabled={selectedEvaluatorId === 0 || isSubmitted || isSaving}
                                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                    style={{ borderColor: '#d4c9a8', backgroundColor: (selectedEvaluatorId === 0 || isSubmitted || isSaving) ? '#f0f0f0' : '#faf8f2', color: '#1a1a2e' }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Evaluation Criteria Table */}
                    <div className="rounded-lg border-2 p-6 mb-6 shadow-md" style={{ borderColor: '#d4c9a8', backgroundColor: '#ffffff' }}>
                        <h2 className="text-xl font-serif font-bold mb-4 pb-4 border-b-2" style={{ color: '#0f3460', borderColor: '#d4c9a8' }}>
                            Evaluation Criteria — Enter Scores per Member
                        </h2>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr style={{ backgroundColor: '#0f3460' }}>
                                        <th className="text-left text-white p-3 font-semibold" style={{ minWidth: '200px' }}>Criteria</th>
                                        {teamMembers.map((member, idx) => (
                                            <th key={idx} className="text-center text-white p-3 font-semibold" style={{ minWidth: '120px' }}>
                                                {member.full_name}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {criteria.map((criterion, criteriaIdx) => (
                                        <tr key={criteriaIdx} style={{ backgroundColor: criteriaIdx % 2 === 0 ? '#faf8f2' : '#ffffff', borderBottom: '1px solid #ece8da' }}>
                                            <td className="p-3">
                                                <div style={{ color: '#1a1a2e', fontWeight: '500' }}>{criterion.label}</div>
                                                <div className="text-xs mt-1" style={{ color: '#6b6b6b' }}>Max: {criterion.max}</div>
                                            </td>
                                            {teamMembers.map((_, memberIdx) => (
                                                <td key={memberIdx} className="text-center p-3">
                                                    <input
                                                        type="number"
                                                        min={criterion.min}
                                                        max={criterion.max}
                                                        value={scores[`${criteriaIdx}_${memberIdx}`] || ''}
                                                        onChange={handleScoreChange(criteriaIdx, memberIdx)}
                                                        disabled={selectedEvaluatorId === 0 || isSubmitted || isSaving}
                                                        className="w-full text-center border rounded px-2 py-1 font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                                        style={{
                                                            borderColor: parseFloat(String(scores[`${criteriaIdx}_${memberIdx}`] || 0)) > criterion.max ? '#c0392b' : '#d4c9a8',
                                                            backgroundColor: (selectedEvaluatorId === 0 || isSubmitted || isSaving) ? '#f0f0f0' : (parseFloat(String(scores[`${criteriaIdx}_${memberIdx}`] || 0)) > criterion.max ? '#fff5f5' : '#faf8f2'),
                                                            color: parseFloat(String(scores[`${criteriaIdx}_${memberIdx}`] || 0)) > criterion.max ? '#c0392b' : '#0f3460',
                                                        }}
                                                    />
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                    <tr style={{ backgroundColor: '#f5f0e0', borderTop: '2px solid #c9a84c' }}>
                                        <td className="p-3 font-bold" style={{ color: '#0f3460' }}>Member Totals</td>
                                        {teamMembers.map((_, memberIdx) => (
                                            <td key={memberIdx} className="text-center p-3">
                                                <div className="inline-block px-3 py-1 rounded font-bold text-sm border-2" style={{ borderColor: '#0f3460', color: '#0f3460', backgroundColor: '#ffffff' }}>
                                                    {calculateMemberTotal(memberIdx)}
                                                </div>
                                            </td>
                                        ))}
                                    </tr>
                                    <tr style={{ backgroundColor: '#0f3460', borderTop: '2px solid #c9a84c' }}>
                                        <td className="p-3 font-bold text-white">Group Average (Max {maxTotal})</td>
                                        <td colSpan={teamMembers.length} className="text-center p-3">
                                            <div className="inline-block px-4 py-2 rounded font-bold text-lg" style={{ backgroundColor: '#c9a84c', color: '#0f3460' }}>
                                                {calculateGroupAverage()}
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 justify-center mb-8 flex-wrap">
                        <button
                            onClick={handleReset}
                            disabled={isSubmitted || isSaving || Object.keys(scores).length === 0}
                            className="px-6 py-2 rounded-lg font-semibold uppercase text-sm border-2 transition-all"
                            style={{ 
                                borderColor: '#0f3460', 
                                color: (isSubmitted || isSaving || Object.keys(scores).length === 0) ? '#999999' : '#0f3460',
                                opacity: (isSubmitted || isSaving || Object.keys(scores).length === 0) ? 0.5 : 1,
                                cursor: (isSubmitted || isSaving || Object.keys(scores).length === 0) ? 'not-allowed' : 'pointer',
                            }}
                            onMouseEnter={(e) => {
                                if (!isSubmitted && !isSaving && Object.keys(scores).length > 0) {
                                    e.currentTarget.style.backgroundColor = '#0f3460';
                                    e.currentTarget.style.color = '#ffffff';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isSubmitted && !isSaving && Object.keys(scores).length > 0) {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                    e.currentTarget.style.color = '#0f3460';
                                }
                            }}
                            title={isSubmitted ? 'Cannot reset submitted form' : 'Clear all form fields'}
                        >
                            Reset
                        </button>
                        {!isSubmitted ? (
                            <button
                                onClick={handleSubmit}
                                disabled={isSaving || !isFormValid() || hasUnsavedChanges}
                                className="px-6 py-2 rounded-lg font-semibold uppercase text-sm text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{ backgroundColor: '#27ae60' }}
                                onMouseEnter={(e) => {
                                    if (!isSaving && isFormValid() && !hasUnsavedChanges) {
                                        e.currentTarget.style.backgroundColor = '#229954';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!isSaving && isFormValid() && !hasUnsavedChanges) {
                                        e.currentTarget.style.backgroundColor = '#27ae60';
                                    }
                                }}
                                title={
                                    isSaving ? 'Saving form...' :
                                    !isFormValid() ? 'Please fill all required fields and scores' :
                                    hasUnsavedChanges ? 'Please save changes before submitting' :
                                    'Submit form'
                                }
                            >
                                {isSaving ? 'Submitting...' : 'Submit Form'}
                            </button>
                        ) : (
                            <button
                                onClick={handleUnsubmit}
                                disabled={isSaving}
                                className="px-6 py-2 rounded-lg font-semibold uppercase text-sm text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{ backgroundColor: '#e74c3c' }}
                                onMouseEnter={(e) => !isSaving && (e.currentTarget.style.backgroundColor = '#c0392b')}
                                onMouseLeave={(e) => !isSaving && (e.currentTarget.style.backgroundColor = '#e74c3c')}
                            >
                                {isSaving ? 'Unsubmitting...' : 'Unsubmit Form'}
                            </button>
                        )}
                    </div>

                    {/* Submission Requirements Info */}
                    {!isSubmitted && (
                        <div className="rounded-lg border-2 p-4 mb-6" style={{ 
                            borderColor: isFormValid() && !hasUnsavedChanges ? '#27ae60' : '#ffc107', 
                            backgroundColor: isFormValid() && !hasUnsavedChanges ? '#f0fdf4' : '#fffbf0' 
                        }}>
                            {isFormValid() && !hasUnsavedChanges ? (
                                <p style={{ color: '#166534', fontSize: '0.875rem', fontWeight: '500' }}>
                                    ✓ Form is ready for submission
                                </p>
                            ) : (
                                <>
                                    <p style={{ color: '#856404', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                                        ⚠️ Form cannot be submitted yet. {hasUnsavedChanges ? 'Waiting for save. ' : ''}Missing requirements:
                                    </p>
                                    <ul style={{ color: '#856404', fontSize: '0.875rem', marginLeft: '1.5rem', lineHeight: '1.6' }}>
                                        {isSaving && (
                                            <li>• Currently saving changes...</li>
                                        )}
                                        {hasUnsavedChanges && !isSaving && (
                                            <li>• Changes will be auto-saved (waiting {Math.ceil((2000 - (Date.now() % 2000)) / 1000)}s)</li>
                                        )}
                                        {!formData.evalTime && (
                                            <li>• Evaluation time must be filled</li>
                                        )}
                                        {!formData.evalDate && (
                                            <li>• Evaluation date must be filled</li>
                                        )}
                                        {(() => {
                                            let missingCount = 0;
                                            for (let c = 0; c < criteria.length; c++) {
                                                for (let m = 0; m < teamMembers.length; m++) {
                                                    const key = `${c}_${m}`;
                                                    if (!scores[key] || scores[key] === '') {
                                                        missingCount++;
                                                    }
                                                }
                                            }
                                            if (missingCount > 0) {
                                                return <li>• {missingCount} score field{missingCount !== 1 ? 's' : ''} must be filled (all criteria × all members)</li>;
                                            }
                                            return null;
                                        })()}
                                    </ul>
                                </>
                            )}
                        </div>
                    )}
                </div>
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
