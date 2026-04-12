import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Head, Link, router } from '@inertiajs/react';

interface TeamMember {
    member_id: string;
    full_name: string;
    designation: string;
}

interface Proposal {
    id: number;
    title: string;
    team_self_eval?: SelfEvalData;
    defense_eval?: any;
    team_oral_eval?: any;
}

interface MemberRating {
    member_id: number;
    full_name: string;
    designation: string;
}

interface EvaluationForm {
    member_id: number;
    is_submitted: boolean;
    full_name: string;
    designation: string;
    time: string;
    date: string;
    form_data: {
        memberRatings: MemberRating[];
        ratings: Record<string, Record<string, number | string>>;
    };
}

interface SelfEvalData {
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
    proposals: {
        proposals: Proposal[];
    };
}

interface FormData {
    projectTitle: string;
    reviewerName: string;
    designation: string;
    evalTime: string;
    evalDate: string;
}

interface RatingsData {
    [key: string]: {
        [memberIdx: number]: number | string;
    };
}

const RATING_SCALE = [
    { value: 1, label: '1 - Poor', color: '#ff4757' },
    { value: 2, label: '2 - Average', color: '#ffa502' },
    { value: 3, label: '3 - Outstanding', color: '#26de81' },
];

const criteria = [
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

export default function PeerAndSelfEvaluation({ capstone, selfEval }: { capstone: CapstoneData; selfEval: SelfEvalData }) {
    const teamMembers = capstone.team_list.list || [];
    const proposals = capstone.proposals?.proposals || [];
    
    const [selectedReviewerId, setSelectedReviewerId] = useState<number>(0);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [pendingReviewerId, setPendingReviewerId] = useState<number | null>(null);
    const [selectedProposalIdx, setSelectedProposalIdx] = useState<number>(0);
    
    const [formData, setFormData] = useState<FormData>({
        projectTitle: '',
        reviewerName: '',
        designation: '',
        evalTime: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
        evalDate: new Date().toISOString().split('T')[0],
    });

    const [ratings, setRatings] = useState<RatingsData>({});
    const [memberRatings, setMemberRatings] = useState<MemberRating[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleReviewerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newId = parseInt(e.target.value, 10) || 0;
        
        if (newId === 0) {
            setSelectedReviewerId(0);
            return;
        }
        
        // Check if this reviewer has already submitted
        const proposal = proposals[selectedProposalIdx];
        if (proposal && proposal.team_self_eval?.forms) {
            const form = proposal.team_self_eval.forms.find(
                (f: EvaluationForm) => parseInt(String(f.member_id), 10) === newId
            );
            
            if (form?.is_submitted) {
                setPendingReviewerId(newId);
                setShowConfirmModal(true);
                return;
            }
        }
        
        setSelectedReviewerId(newId);
    };
    
    const handleConfirmResubmit = async () => {
        if (!pendingReviewerId) return;
        
        const proposal = proposals[selectedProposalIdx];
        if (!proposal) return;
        
        setShowConfirmModal(false);
        
        try {
            // Unsubmit the form
            await router.post(`/capstone/${capstone.id}/self-evaluation/${proposal.id}/${pendingReviewerId}/toggle-submission`, {
                is_submitted: false,
            }, {
                preserveState: true,
                preserveScroll: true,
            });
            
            setSelectedReviewerId(pendingReviewerId);
            setPendingReviewerId(null);
        } catch (error) {
            console.error('Failed to unsubmit form:', error);
            setPendingReviewerId(null);
        }
    };
    
    const handleDeclineResubmit = () => {
        setShowConfirmModal(false);
        setPendingReviewerId(null);
        setSelectedReviewerId(0);
    };

    // Get members ordered with reviewer first
    const getOrderedMembers = useCallback(() => {
        if (memberRatings.length === 0) return [];
        
        const reviewerIndex = memberRatings.findIndex(m => m.member_id === selectedReviewerId);
        if (reviewerIndex === -1) return memberRatings.map((member, index) => ({ member, originalIndex: index }));
        
        const reviewer = memberRatings[reviewerIndex];
        const others = memberRatings.filter((_, index) => index !== reviewerIndex);
        return [{ member: reviewer, originalIndex: reviewerIndex }, ...others.map((member, index) => ({ member, originalIndex: index < reviewerIndex ? index : index + 1 }))];
    }, [memberRatings, selectedReviewerId]);

    useEffect(() => {
        if (selectedReviewerId === 0) return; // Don't process empty selection
        console.log('[PeerSelfEval] Clearing unsaved changes on reviewer switch');
        setHasUnsavedChanges(false);
        setLastSavedTime(null);
    }, [selectedReviewerId, selectedProposalIdx]);

    useEffect(() => {
        if (selectedReviewerId === 0) {
            // Reset form for empty selection
            setFormData({
                projectTitle: proposals[selectedProposalIdx]?.title || '',
                reviewerName: '',
                designation: '',
                evalTime: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
                evalDate: new Date().toISOString().split('T')[0],
            });
            setRatings({});
            setIsSubmitted(false);
            return;
        }

        if (proposals.length === 0 || teamMembers.length === 0) return;

        const proposal = proposals[selectedProposalIdx];
        if (!proposal) return;

        const currentSelfEval = proposal.team_self_eval?.forms ? proposal.team_self_eval : selfEval;

        // Find the form for this reviewer in the self_eval
        const reviewerForm = currentSelfEval.forms.find(
            (form: EvaluationForm) => parseInt(String(form.member_id), 10) === selectedReviewerId
        );

        if (reviewerForm) {
            const newTime = reviewerForm.time || new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
            const newDate = reviewerForm.date || new Date().toISOString().split('T')[0];
            console.log('Loading reviewer form data:', {
                reviewerId: selectedReviewerId,
                proposalIdx: selectedProposalIdx,
                evalTime: newTime,
                evalDate: newDate,
                savedTime: reviewerForm.time,
                savedDate: reviewerForm.date
            });
            setFormData({
                projectTitle: proposal.title,
                reviewerName: reviewerForm.full_name,
                designation: reviewerForm.designation,
                evalTime: newTime,
                evalDate: newDate,
            });
            setRatings(reviewerForm.form_data.ratings || {});
            setMemberRatings(reviewerForm.form_data.memberRatings || []);
            setIsSubmitted(reviewerForm.is_submitted || false);
            setHasUnsavedChanges(false);
            setLastSavedTime(null);
        }
    }, [selectedReviewerId, selectedProposalIdx, proposals, teamMembers, selfEval]);

    // Clear unsaved changes when switching reviewers/proposals
    useEffect(() => {
        setHasUnsavedChanges(false);
        setLastSavedTime(null);
    }, [selectedReviewerId, selectedProposalIdx]);

    // Auto-save when data changes
    const autoSave = useCallback(async () => {
        if (isSubmitted || !hasUnsavedChanges) return;

        const proposal = proposals[selectedProposalIdx];
        if (!proposal) return;

        setIsSaving(true);
        try {
            await router.post(
                `/capstone/${capstone.id}/self-evaluation/${proposal.id}/${selectedReviewerId}`,
                {
                    ratings,
                    memberRatings: memberRatings.map(m => ({ member_id: m.member_id, full_name: m.full_name, designation: m.designation })),
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
            console.log('[PeerSelfEval] Auto-save successful');
        } catch (error) {
            console.error('[PeerSelfEval] Auto-save failed:', error);
        } finally {
            setIsSaving(false);
        }
    }, [capstone.id, selectedReviewerId, selectedProposalIdx, proposals, ratings, memberRatings, formData.evalTime, formData.evalDate, isSubmitted, hasUnsavedChanges]);

    // Debounced auto-save
    useEffect(() => {
        if (!hasUnsavedChanges || isSubmitted) return;

        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

        saveTimeoutRef.current = setTimeout(() => {
            autoSave();
        }, 2000);

        return () => {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        };
    }, [hasUnsavedChanges, formData, ratings, isSubmitted, autoSave]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, value } = e.target;
        if (id === 'evalTime' || id === 'evalDate') {
            console.log('Time/Date input changed:', { id, value, previous: formData[id as keyof FormData] });
            setFormData((prev) => ({ ...prev, [id]: value }));
            setHasUnsavedChanges(true);
        }
    };

    const handleRatingChange = (criteriaIdx: number, memberIdx: number, value: number | string) => {
        setRatings((prev) => ({
            ...prev,
            [criteriaIdx]: {
                ...(prev[criteriaIdx] || {}),
                [memberIdx]: value,
            },
        }));
        setHasUnsavedChanges(true);
    };

    const calculateMemberTotal = (memberIdx: number) => {
        let sum = 0;
        criteria.forEach((_, idx) => {
            const val = parseInt(String(ratings[idx]?.[memberIdx] || 0), 10);
            if (!isNaN(val)) sum += val;
        });
        return sum;
    };

    const handleSubmit = async () => {
        if (hasUnsavedChanges) {
            await autoSave();
        }

        const proposal = proposals[selectedProposalIdx];
        if (!proposal) return;

        setIsSubmitting(true);
        try {
            await router.post(
                `/capstone/${capstone.id}/self-evaluation/${proposal.id}/${selectedReviewerId}/toggle-submission`,
                { is_submitted: true },
                { preserveState: true, preserveScroll: true }
            );
            setIsSubmitted(true);
            setHasUnsavedChanges(false);
        } catch (error) {
            console.error('[PeerSelfEval] Submission failed:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUnsubmit = async () => {
        const proposal = proposals[selectedProposalIdx];
        if (!proposal) return;

        setIsSubmitting(true);
        try {
            await router.post(
                `/capstone/${capstone.id}/self-evaluation/${proposal.id}/${selectedReviewerId}/toggle-submission`,
                { is_submitted: false },
                { preserveState: true, preserveScroll: true }
            );
            setIsSubmitted(false);
            setHasUnsavedChanges(false);
        } catch (error) {
            console.error('[PeerSelfEval] Unsubmit failed:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleReset = async () => {
        if (confirm('Reset all fields? This cannot be undone.')) {
            setIsSaving(true);
            
            try {
                // Call backend to reset the evaluation form
                const proposal = proposals[selectedProposalIdx];
                if (proposal) {
                    await router.post(`/capstone/${capstone.id}/self-evaluation/${proposal.id}/${selectedReviewerId}/reset`, {}, {
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

    return (
        <>
            <Head title="Peer & Self Evaluation" />

            <div className="min-h-screen" style={{ backgroundColor: '#f0ebe0' }}>
                {/* Header */}
                <div className="bg-linear-to-r mb-8" style={{ backgroundImage: 'linear-gradient(to right, #16213e, #0f3460)' }}>
                    <div className="max-w-5xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
                        <Link
                            href={`/capstone/${capstone.id}`}
                            className="inline-flex items-center mb-4 px-4 py-2 rounded-lg text-white hover:opacity-80 transition-opacity"
                            style={{ backgroundColor: 'rgba(201, 168, 76, 0.2)' }}
                        >
                            ← Back
                        </Link>
                        <h1 className="text-3xl md:text-4xl font-serif font-bold text-white mb-4">
                            Peer & Self Evaluation
                        </h1>
                        
                        {/* Reviewer Dropdown */}
                        <div className="mb-4">
                            <label className="text-sm font-semibold text-gray-200 block mb-2">Select Reviewer</label>
                            <select
                                value={selectedReviewerId}
                                onChange={handleReviewerChange}
                                disabled={isSubmitted || isSubmitting}
                                className="w-full md:w-96 px-4 py-2 rounded-lg text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{ backgroundColor: '#faf8f2' }}
                            >
                                <option value="0">-- Select a Reviewer --</option>
                                {teamMembers.map((member) => (
                                    <option key={member.member_id} value={member.member_id}>
                                        {member.full_name} ({member.designation})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Submission Status */}
                        {isSubmitted && (
                            <div className="inline-block px-4 py-2 rounded-lg text-white font-semibold mb-4" style={{ backgroundColor: '#27ae60' }}>
                                ✓ Submitted
                            </div>
                        )}
                    </div>
                </div>

                {/* Proposal Tabs */}
                {proposals.length > 0 && (
                    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 mb-6">
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
                <div className="max-w-5xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
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

                    {/* Reviewer Info */}
                    <div className="rounded-lg border-2 p-6 mb-6 shadow-md" style={{ borderColor: '#d4c9a8', backgroundColor: '#ffffff' }}>
                        <h2 className="text-xl font-serif font-bold mb-4 pb-4 border-b-2" style={{ color: '#0f3460', borderColor: '#d4c9a8' }}>
                            Reviewer Information
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
                                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#6b6b6b' }}>Reviewer Name (Full Name)</label>
                                <input
                                    type="text"
                                    value={formData.reviewerName}
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
                                    disabled={selectedReviewerId === 0}
                                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                                    style={{ borderColor: '#d4c9a8', backgroundColor: selectedReviewerId === 0 ? '#f0f0f0' : '#faf8f2', color: '#1a1a2e', opacity: selectedReviewerId === 0 ? 0.5 : 1, cursor: selectedReviewerId === 0 ? 'not-allowed' : 'auto' }}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#6b6b6b' }}>Date</label>
                                <input
                                    id="evalDate"
                                    type="date"
                                    value={formData.evalDate}
                                    onChange={handleInputChange}
                                    disabled={selectedReviewerId === 0}
                                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                                    style={{ borderColor: '#d4c9a8', backgroundColor: selectedReviewerId === 0 ? '#f0f0f0' : '#faf8f2', color: '#1a1a2e', opacity: selectedReviewerId === 0 ? 0.5 : 1, cursor: selectedReviewerId === 0 ? 'not-allowed' : 'auto' }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Rating Scale Legend */}
                    <div className="rounded-lg border-2 p-6 mb-6 shadow-md" style={{ borderColor: '#d4c9a8', backgroundColor: '#ffffff' }}>
                        <h2 className="text-xl font-serif font-bold mb-4" style={{ color: '#0f3460' }}>Rating Scale</h2>
                        <div className="flex flex-wrap gap-4">
                            {RATING_SCALE.map((scale) => (
                                <div key={scale.value} className="flex items-center gap-2">
                                    <button
                                        className="w-10 h-10 rounded font-bold text-white"
                                        style={{ backgroundColor: scale.color }}
                                        disabled
                                    >
                                        {scale.value}
                                    </button>
                                    <span style={{ color: '#1a1a2e' }}>{scale.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Evaluation Table */}
                    <div className="rounded-lg border-2 p-6 mb-6 shadow-md" style={{ borderColor: '#d4c9a8', backgroundColor: '#ffffff' }}>
                        <h2 className="text-xl font-serif font-bold mb-4 pb-4 border-b-2" style={{ color: '#0f3460', borderColor: '#d4c9a8' }}>
                            Evaluation Criteria
                        </h2>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr style={{ backgroundColor: '#0f3460' }}>
                                        <th className="text-left text-white p-3 font-semibold" style={{ minWidth: '250px' }}>Criteria</th>
                                        {getOrderedMembers().map(({ member, originalIndex }, idx) => (
                                            <th key={member.member_id} className="text-center text-white p-3 font-semibold" style={{ minWidth: '100px' }}>
                                                <div className="text-xs">{member.full_name}</div>
                                                {idx === 0 && <div className="text-xs" style={{ color: '#ffd700' }}>(You)</div>}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {criteria.map((criterion, criteriaIdx) => (
                                        <tr key={criteriaIdx} style={{ backgroundColor: criteriaIdx % 2 === 0 ? '#faf8f2' : '#ffffff', borderBottom: '1px solid #ece8da' }}>
                                            <td className="p-3" style={{ color: '#1a1a2e' }}>
                                                {criterion}
                                            </td>
                                            {getOrderedMembers().map(({ member, originalIndex }, memberIdx) => (
                                                <td key={member.member_id} className="text-center p-2">
                                                    <div className="flex flex-col gap-1">
                                                        {RATING_SCALE.map((scale) => (
                                                            <button
                                                                key={scale.value}
                                                                onClick={() => handleRatingChange(criteriaIdx, originalIndex, scale.value)}
                                                                disabled={selectedReviewerId === 0 || isSubmitted || isSaving}
                                                                className="w-full px-2 py-1 rounded font-bold text-sm text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                                style={{
                                                                    backgroundColor: ratings[criteriaIdx]?.[originalIndex] === scale.value ? scale.color : '#e0e0e0',
                                                                    opacity: selectedReviewerId === 0 ? 0.3 : (isSubmitted || isSaving ? 0.5 : 1),
                                                                    cursor: selectedReviewerId === 0 || isSubmitted || isSaving ? 'not-allowed' : 'pointer',
                                                                }}
                                                            >
                                                                {scale.value}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                    <tr style={{ backgroundColor: '#f5f0e0', borderTop: '2px solid #c9a84c' }}>
                                        <td className="p-3 font-bold" style={{ color: '#0f3460' }}>Total (Max 30)</td>
                                        {getOrderedMembers().map(({ member, originalIndex }, memberIdx) => (
                                            <td key={member.member_id} className="text-center p-3">
                                                <div className="inline-block px-3 py-1 rounded font-bold text-sm border-2" style={{ borderColor: '#c9a84c', color: '#0f3460', backgroundColor: '#ffffff' }}>
                                                    {calculateMemberTotal(originalIndex)}
                                                </div>
                                            </td>
                                        ))}
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 justify-center mb-8 flex-wrap">
                        <button
                            onClick={handleReset}
                            disabled={isSubmitted || isSaving || Object.keys(ratings).length === 0}
                            className="px-6 py-2 rounded-lg font-semibold uppercase text-sm border-2 transition-all"
                            style={{
                                borderColor: '#0f3460',
                                color: (isSubmitted || isSaving || Object.keys(ratings).length === 0) ? '#999999' : '#0f3460',
                                opacity: (isSubmitted || isSaving || Object.keys(ratings).length === 0) ? 0.5 : 1,
                                cursor: (isSubmitted || isSaving || Object.keys(ratings).length === 0) ? 'not-allowed' : 'pointer',
                            }}
                            onMouseEnter={(e) => {
                                if (!isSubmitted && !isSaving && Object.keys(ratings).length > 0) {
                                    e.currentTarget.style.backgroundColor = '#0f3460';
                                    e.currentTarget.style.color = '#ffffff';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isSubmitted && !isSaving && Object.keys(ratings).length > 0) {
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
                                disabled={isSaving || isSubmitting}
                                className="px-6 py-2 rounded-lg font-semibold uppercase text-sm text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{ backgroundColor: '#27ae60' }}
                                onMouseEnter={(e) => !isSaving && !isSubmitting && (e.currentTarget.style.backgroundColor = '#229954')}
                                onMouseLeave={(e) => !isSaving && !isSubmitting && (e.currentTarget.style.backgroundColor = '#27ae60')}
                            >
                                {isSubmitting ? 'Submitting...' : 'Submit Form'}
                            </button>
                        ) : (
                            <button
                                onClick={handleUnsubmit}
                                disabled={isSaving || isSubmitting}
                                className="px-6 py-2 rounded-lg font-semibold uppercase text-sm text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{ backgroundColor: '#e74c3c' }}
                                onMouseEnter={(e) => !isSaving && !isSubmitting && (e.currentTarget.style.backgroundColor = '#c0392b')}
                                onMouseLeave={(e) => !isSaving && !isSubmitting && (e.currentTarget.style.backgroundColor = '#e74c3c')}
                            >
                                {isSubmitting ? 'Unsubmitting...' : 'Unsubmit Form'}
                            </button>
                        )}
                    </div>
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
                            This reviewer has already submitted the form for this proposal. Do you want to unsubmit it and edit it?
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
