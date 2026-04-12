import React, { useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Head, Link } from '@inertiajs/react';

interface TeamMember {
    id?: number;
    full_name: string;
    role: string;
}

interface SubmittedForm {
    id: number;
    proposal_id: number;
    proposal_name: string;
    proposal_number: number;
    full_name: string;
    designation: string;
    form_type: string;
    time: string;
    date: string;
    is_submitted: boolean;
}

interface ProgressItem {
    name: string;
    status: 'pending' | 'generating' | 'complete' | 'error';
    proposal_name?: string;
    full_name?: string;
}

interface Capstone {
    id: number;
    team_name: string;
    no_of_team_members: number;
    no_of_panel_members: number;
    no_of_proposals: number;
    is_live: number | boolean;
    created_at: string;
    logo?: string | null;
    team_list?: {
        list: TeamMember[];
    };
    panel_members?: {
        list: TeamMember[];
    };
}

interface Props {
    capstone: Capstone;
}

export default function CapstoneDetail({ capstone }: Props) {
    const [showModal, setShowModal] = useState(false);
    const [submittedForms, setSubmittedForms] = useState<SubmittedForm[]>([]);
    const [isLoadingForms, setIsLoadingForms] = useState(false);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const [pdfStatus, setPdfStatus] = useState('');
    const [showProgressModal, setShowProgressModal] = useState(false);
    const [progressList, setProgressList] = useState<ProgressItem[]>([]);
    const [socket, setSocket] = useState<Socket | null>(null);
    const [showNoFormsModal, setShowNoFormsModal] = useState(false);
    const [isCancelled, setIsCancelled] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);

    const socketServerUrl = import.meta.env.VITE_SOCKET_SERVER_URL || 'http://127.0.0.1:6001';

    const initializeSocket = (): Socket => {
        if (socket) {
            if (socket.connected) {
                socket.emit('join', `pdf-progress.${capstone.id}`);
            }
            return socket;
        }

        const newSocket = io(socketServerUrl, {
            transports: ['websocket', 'polling'],
        });

        newSocket.on('connect', () => {
            console.log('[PDF Socket] Connected as', newSocket.id);
            newSocket.emit('join', `pdf-progress.${capstone.id}`);
        });

        newSocket.on('disconnect', (reason) => {
            console.log('[PDF Socket] Disconnected:', reason);
        });

        newSocket.on('connect_error', (error) => {
            console.error('[PDF Socket] Connect error:', error);
        });

        newSocket.onAny((event, ...args) => {
            console.log('[PDF Socket] Received event:', event, args);
        });

        newSocket.on('progress.update', (payload: any) => {
            console.log('[PDF Socket] Raw progress.update payload:', payload);

            if (!payload) {
                console.warn('[PDF Socket] Received empty progress payload');
                return;
            }

            const payloadCapstoneId = String(payload.capstoneId);
            const currentCapstoneId = String(capstone.id);
            if (payloadCapstoneId !== currentCapstoneId) {
                console.warn('[PDF Socket] Payload capstone ID mismatch:', payloadCapstoneId, 'expected', currentCapstoneId);
                return;
            }

            if (payload.progress?.documents && Array.isArray(payload.progress.documents)) {
                console.log('[PDF Socket] Progress update accepted for capstone:', currentCapstoneId);
                setProgressList(payload.progress.documents);
            } else {
                console.warn('[PDF Socket] Progress payload missing documents array:', payload.progress);
            }
        });

        setSocket(newSocket);
        return newSocket;
    };

    const disconnectSocket = () => {
        if (socket) {
            socket.disconnect();
            setSocket(null);
        }
    };


    const fetchSubmittedForms = async () => {
        setIsLoadingForms(true);
        try {
            const response = await fetch(`/api/capstone/${capstone.id}/submitted-forms`);
            if (response.ok) {
                const data = await response.json();
                setSubmittedForms(data);
            } else {
                console.error('Failed to fetch submitted forms');
            }
        } catch (error) {
            console.error('Error fetching submitted forms:', error);
        } finally {
            setIsLoadingForms(false);
        }
    };

    const handleOpenModal = () => {
        fetchSubmittedForms();
        setShowModal(true);
    };

    const handleGenerateAndDownloadPDFs = async () => {
        // Fetch forms first to check if any are submitted
        setIsLoadingForms(true);
        let submittedFormsData: SubmittedForm[] = [];

        try {
            const response = await fetch(`/api/capstone/${capstone.id}/submitted-forms`);
            if (response.ok) {
                const data = await response.json();
                setSubmittedForms(data);
                submittedFormsData = data;
                
                // Check if there are any submitted forms
                if (!data || data.length === 0) {
                    setShowNoFormsModal(true);
                    setIsLoadingForms(false);
                    return;
                }
            } else {
                setShowNoFormsModal(true);
                setIsLoadingForms(false);
                return;
            }
        } catch (error) {
            console.error('Error fetching submitted forms:', error);
            setShowNoFormsModal(true);
            setIsLoadingForms(false);
            return;
        } finally {
            setIsLoadingForms(false);
        }
        
        // If we reach here, there are submitted forms, proceed with PDF generation
        setIsGeneratingPDF(true);
        setShowProgressModal(true);
        setIsCancelled(false);
        abortControllerRef.current = new AbortController();
        console.log('[PDF Generation] Starting PDF generation for capstone:', capstone.id);

        try {
            const socketClient = initializeSocket();
            const initialProgressList: ProgressItem[] = submittedFormsData.map((form: any) => {
                let prefix = '';
                if (form.form_type === 'Proposal Defense Evaluation') {
                    prefix = 'Proposal Defense';
                } else if (form.form_type === 'Peer & Self Evaluation') {
                    prefix = 'Peer & Self Evaluation';
                } else if (form.form_type === 'Oral Presentation Evaluation') {
                    prefix = 'Oral Presentation';
                }
                const docName = `${prefix} - Proposal ${form.proposal_number} (${form.full_name})`;
                return {
                    name: docName,
                    proposal_name: form.proposal_name,
                    full_name: form.full_name,
                    status: 'pending' as const,
                };
            });

            setProgressList(initialProgressList);

            const csrfToken = (document.querySelector('meta[name="csrf-token"]') as any)?.content;
            console.log('[PDF Generation] CSRF Token:', csrfToken ? 'Present' : 'Missing');
            
            // Start PDF generation first
            const url = `/api/capstone/${capstone.id}/generate-pdf-zip`;
            console.log('[PDF Generation] Requesting URL:', url);
            const postStartTime = Date.now();

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken || '',
                },
                signal: abortControllerRef.current?.signal,
            });

            console.log(`[PDF Generation] POST request completed in ${Date.now() - postStartTime}ms`);

            if (isCancelled) {
                console.log('[PDF Generation] Generation was cancelled');
                return;
            }

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[PDF Generation] ✗ Error response:', errorText);
                throw new Error('PDF generation failed');
            }

            // Start listening for socket.io progress updates
            console.log('[PDF Generation] Starting socket.io progress listener');
            console.log('[PDF Generation] Socket connected?', socketClient.connected, 'id:', socketClient.id);
            
            if (socketClient.connected) {
                socketClient.emit('join', `pdf-progress.${capstone.id}`);
                console.log('[PDF Generation] Emitted join for room pdf-progress.' + capstone.id);
            } else {
                console.warn('[PDF Generation] Socket is not connected yet; join will be sent on connect event');
            }

            const postEndTime = Date.now();
            const postDuration = postEndTime - postStartTime;
            
            console.log('[PDF Generation] ✓ POST request completed');
            console.log('[PDF Generation] Total time elapsed:', `${postDuration}ms`);
            console.log('[PDF Generation] Response status:', response.status);
            console.log('[PDF Generation] Response headers:', {
                contentType: response.headers.get('content-type'),
                contentLength: response.headers.get('content-length'),
            });

            if (response.ok) {
                // Wait for socket updates during generation
                const blob = await response.blob();
                console.log('[PDF Generation] Blob size:', blob.size, 'bytes');
                
                if (blob.size === 0) {
                    throw new Error('Generated zip file is empty');
                }

                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                const filename = `${capstone.team_name}_evaluations_${new Date().toISOString().split('T')[0]}.zip`;
                link.download = filename;
                console.log('[PDF Generation] Downloading file:', filename);
                
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
                
                console.log('[PDF Generation] ✓ Download successful');
                
                // Mark all as complete
                setProgressList((prev) =>
                    prev.map((item) => ({ ...item, status: 'complete' as const }))
                );
                setIsGeneratingPDF(false);
                disconnectSocket();
            } else {
                const errorText = await response.text();
                console.error('[PDF Generation] ✗ Error response:', errorText);
                
                disconnectSocket();

                let errorMessage = 'Failed to generate PDFs';
                try {
                    const errorJson = JSON.parse(errorText);
                    errorMessage = errorJson.error || errorMessage;
                } catch {
                    errorMessage = errorText || errorMessage;
                }
                
                setProgressList((prev) =>
                    prev.map((item) => ({ ...item, status: 'error' as const }))
                );
                console.error('[PDF Generation] HTTP Error:', response.status, response.statusText);
            }
        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.log('[PDF Generation] Request was aborted by user');
                return;
            }

            const errorMessage = error?.message || 'Unknown error occurred';
            console.error('[PDF Generation] ✗ Exception caught:', {
                message: error?.message,
                stack: error?.stack,
                error: error,
            });
            
            disconnectSocket();

            setProgressList((prev) =>
                prev.map((item) => ({ ...item, status: 'error' as const }))
            );
        } finally {
            setIsGeneratingPDF(false);
            abortControllerRef.current = null;
        }
    };
    const handleCancelPDFGeneration = () => {
        setIsCancelled(true);
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        disconnectSocket();
        
        // Reset states
        setIsGeneratingPDF(false);
        setShowProgressModal(false);
        setProgressList([]);
        
        console.log('[PDF Generation] PDF generation cancelled by user');
    };

    const handleClosePDFModal = () => {
        disconnectSocket();
        
        // Reset states
        setShowProgressModal(false);
        setIsGeneratingPDF(false);
        setProgressList([]);
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    };

    const isLive = Boolean(capstone.is_live);
    const teamMembers = capstone.team_list?.list || [];
    const panelMembers = capstone.panel_members?.list || [];

    const evaluationForms = [
        {
            id: 'proposal-defense',
            title: 'Proposal Defense Evaluation',
            subtitle: 'Evaluation of Capstone / Research Proposal',
            description: 'Evaluate the project proposal, research methodology, and defense presentation.',
            icon: '📋',
            route: `/capstone/${capstone.id}/defense-evaluation`,
        },
        {
            id: 'peer-self',
            title: 'Peer & Self Evaluation',
            subtitle: 'Capstone Research Peer & Self Evaluation',
            description: 'Assess team collaboration, individual contributions, and peer feedback.',
            icon: '👥',
            route: `/capstone/${capstone.id}/peer-evaluation`,
        },
        {
            id: 'oral-presentation',
            title: 'Oral Presentation Evaluation',
            subtitle: 'Research / Capstone Oral Presentation',
            description: 'Evaluate presentation skills, clarity, and response to questions.',
            icon: '🎤',
            route: `/capstone/${capstone.id}/oral-evaluation`,
        },
    ];

    return (
        <>
            <Head title={`${capstone.team_name} - Capstone Evaluation`} />
            
            <div className="min-h-screen" style={{ backgroundColor: '#f0ebe0' }}>
                {/* Header with Back Button */}
                <div className="bg-linear-to-r" style={{ backgroundImage: 'linear-gradient(to right, #16213e, #0f3460)' }}>
                    <div className="max-w-6xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
                        <Link
                            href="/capstone"
                            className="inline-flex items-center mb-6 px-4 py-2 rounded-lg text-white hover:opacity-80 transition-opacity"
                            style={{ backgroundColor: 'rgba(201, 168, 76, 0.2)' }}
                        >
                            ← Back to Capstones
                        </Link>
                        
                        <div className='flex flex-row gap-8 items-center'>
                            {capstone.logo ? (
                            <img
                                src={capstone.logo}
                                alt={`${capstone.team_name} logo`}
                                className="w-36 h-36 rounded-2xl object-cover border border-white/30"
                            />
                        ) : (
                            <div className="w-36 h-36 rounded-2xl border border-white/30 bg-white/10 flex items-center justify-center text-[11px] uppercase tracking-widest text-white/80">
                                Logo
                            </div>
                        )}
                        <div>
                            <h1 className="text-2xl sm:text-3xl md:text-5xl font-serif font-bold text-white">
                            {capstone.team_name}
                        </h1>
                        <p className="text-gray-200 mt-2">
                            {isLive ? 'Complete the evaluation forms below' : 'This capstone evaluation is not currently active'}
                        </p>
                        </div>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="max-w-6xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
                    {/* Not Live Warning Banner */}
                    {!isLive && (
                        <div 
                            className="mb-8 rounded-lg border-2 p-6 flex items-start gap-4"
                            style={{ 
                                borderColor: '#c0392b',
                                backgroundColor: '#fff5f5',
                            }}
                        >
                            <div className="text-3xl">⚠️</div>
                            <div>
                                <h3 
                                    className="text-lg font-bold mb-2"
                                    style={{ color: '#c0392b' }}
                                >
                                    Capstone Evaluation Not Active
                                </h3>
                                <p 
                                    className="text-sm"
                                    style={{ color: '#6b6b6b' }}
                                >
                                    This capstone evaluation form is currently not live. The evaluation forms below are not available for submission at this time. Please check back later or contact the administrator for more information.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Capstone Details Section */}
                    <div 
                        className="rounded-lg border-2 p-6 mb-12 shadow-md"
                        style={{ 
                            borderColor: '#d4c9a8',
                            backgroundColor: '#ffffff',
                        }}
                    >
                        <h2 
                            className="text-2xl font-serif font-bold mb-6 pb-4 border-b-2"
                            style={{ 
                                color: '#0f3460',
                                borderColor: '#d4c9a8',
                            }}
                        >
                            Project Details
                        </h2>

                        {/* Admin Actions */}
                        <div className="mb-6 flex flex-wrap gap-3">
                            <button
                                onClick={handleOpenModal}
                                className="px-6 py-2 rounded-lg text-white font-semibold hover:opacity-90 transition-opacity cursor-pointer"
                                style={{ backgroundColor: '#0f3460' }}
                            >
                                📋 View Submitted Forms
                            </button>
                            <button
                                onClick={handleGenerateAndDownloadPDFs}
                                disabled={isGeneratingPDF || isLoadingForms}
                                className="px-6 py-2 rounded-lg text-white font-semibold hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{ backgroundColor: '#c9a84c' }}
                            >
                                {isLoadingForms ? 'Checking forms...' : isGeneratingPDF ? 'Generating...' : '📥 Download Evaluations as ZIP'}
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {/* Team Name */}
                            <div>
                                <p 
                                    className="text-xs font-semibold uppercase tracking-widest mb-2"
                                    style={{ color: '#6b6b6b' }}
                                >
                                    Team Name
                                </p>
                                <p 
                                    className="text-lg font-bold"
                                    style={{ color: '#0f3460' }}
                                >
                                    {capstone.team_name}
                                </p>
                            </div>

                            {/* Team Members */}
                            <div>
                                <p 
                                    className="text-xs font-semibold uppercase tracking-widest mb-2"
                                    style={{ color: '#6b6b6b' }}
                                >
                                    Team Members
                                </p>
                                <p 
                                    className="text-lg font-bold"
                                    style={{ color: '#0f3460' }}
                                >
                                    {capstone.no_of_team_members}
                                </p>
                            </div>

                            {/* Panel Members */}
                            <div>
                                <p 
                                    className="text-xs font-semibold uppercase tracking-widest mb-2"
                                    style={{ color: '#6b6b6b' }}
                                >
                                    Panel Members
                                </p>
                                <p 
                                    className="text-lg font-bold"
                                    style={{ color: '#0f3460' }}
                                >
                                    {capstone.no_of_panel_members}
                                </p>
                            </div>

                            {/* Proposals */}
                            <div>
                                <p 
                                    className="text-xs font-semibold uppercase tracking-widest mb-2"
                                    style={{ color: '#6b6b6b' }}
                                >
                                    Proposals
                                </p>
                                <p 
                                    className="text-lg font-bold"
                                    style={{ color: '#c9a84c' }}
                                >
                                    {capstone.no_of_proposals}
                                </p>
                            </div>
                        </div>

                        <div 
                            className="pt-6 mt-6 border-t-2"
                            style={{ borderColor: '#d4c9a8' }}
                        >
                            <p 
                                className="text-sm"
                                style={{ color: '#6b6b6b' }}
                            >
                                Created on {formatDate(capstone.created_at)}
                            </p>
                        </div>
                    </div>

                    {/* Evaluation Forms Section - Only show if live */}
                    {isLive && (
                        <div className="mb-12">
                            <h2 
                                className="text-2xl font-serif font-bold mb-8"
                                style={{ color: '#0f3460' }}
                            >
                                Evaluation Forms
                            </h2>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {evaluationForms.map((form: any) => (
                                    <Link
                                        key={form.id}
                                        href={form.route}
                                        className="group text-left rounded-lg border-2 overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:scale-105 h-full block"
                                        style={{ 
                                            borderColor: '#0f3460',
                                            backgroundColor: '#ffffff',
                                        }}
                                    >
                                        {/* Form Header */}
                                        <div 
                                            className="px-6 py-6 border-b-2"
                                            style={{ 
                                                backgroundColor: '#0f3460',
                                                borderColor: '#0f3460',
                                            }}
                                        >
                                            <div className="text-4xl mb-3">{form.icon}</div>
                                            <h3 className="text-xl font-bold text-white group-hover:text-yellow-100 transition-colors duration-300">
                                                {form.title}
                                            </h3>
                                            <p className="text-sm text-gray-200 mt-1">
                                                {form.subtitle}
                                            </p>
                                        </div>

                                        {/* Form Content */}
                                        <div className="px-6 py-5">
                                            <p 
                                                className="text-sm leading-relaxed"
                                                style={{ color: '#6b6b6b' }}
                                            >
                                                {form.description}
                                            </p>
                                        </div>

                                        {/* Form Footer */}
                                        <div 
                                            className="px-6 py-4 border-t-2"
                                            style={{ 
                                                backgroundColor: '#f5f0e0',
                                                borderColor: '#d4c9a8',
                                            }}
                                        >
                                            <span 
                                                className="text-sm font-semibold uppercase tracking-widest group-hover:text-base transition-all duration-300"
                                                style={{ color: '#0f3460' }}
                                            >
                                                Open Form →
                                            </span>
                                        </div>
                                    </Link>
                                ))}
                            </div>

                            {/* Instructions */}
                            <div 
                                className="mt-12 rounded-lg border-2 p-6"
                                style={{ 
                                    borderColor: '#c9a84c',
                                    backgroundColor: '#fffdf5',
                                }}
                            >
                                <h3 
                                    className="text-lg font-bold mb-3"
                                    style={{ color: '#0f3460' }}
                                >
                                    💡 Instructions
                                </h3>
                                <ul className="space-y-2" style={{ color: '#6b6b6b' }}>
                                    <li>• Click on any form above to begin the evaluation process</li>
                                    <li>• Complete all required fields marked with an asterisk (*)</li>
                                    <li>• Follow the rating scales provided for each criterion</li>
                                    <li>• Submit your evaluation when complete</li>
                                </ul>
                            </div>
                        </div>
                    )}

                    {/* Team Members Section */}
                    <div 
                        className="rounded-lg border-2 p-6 mb-12 shadow-md"
                        style={{ 
                            borderColor: '#d4c9a8',
                            backgroundColor: '#ffffff',
                        }}
                    >
                        <h2 
                            className="text-2xl font-serif font-bold mb-6 pb-4 border-b-2"
                            style={{ 
                                color: '#0f3460',
                                borderColor: '#d4c9a8',
                            }}
                        >
                            Team Members ({teamMembers.length})
                        </h2>

                        {teamMembers.length === 0 ? (
                            <p 
                                className="text-center py-6"
                                style={{ color: '#6b6b6b' }}
                            >
                                No team members assigned
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {teamMembers.map((member, index) => (
                                    <div
                                        key={index}
                                        className="flex items-center justify-between rounded-lg border p-4"
                                        style={{ 
                                            borderColor: '#d4c9a8',
                                            backgroundColor: '#faf8f2',
                                        }}
                                    >
                                        <p 
                                            className="font-bold text-sm"
                                            style={{ color: '#0f3460' }}
                                        >
                                            {member.full_name}
                                        </p>
                                        <p 
                                            className="text-xs uppercase tracking-widest px-3 py-1 rounded-full"
                                            style={{ 
                                                color: '#ffffff',
                                                backgroundColor: '#c9a84c',
                                            }}
                                        >
                                            {member.role}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Panel Members Section */}
                    <div 
                        className="rounded-lg border-2 p-6 shadow-md"
                        style={{ 
                            borderColor: '#d4c9a8',
                            backgroundColor: '#ffffff',
                        }}
                    >
                        <h2 
                            className="text-2xl font-serif font-bold mb-6 pb-4 border-b-2"
                            style={{ 
                                color: '#0f3460',
                                borderColor: '#d4c9a8',
                            }}
                        >
                            Panel Members ({panelMembers.length})
                        </h2>

                        {panelMembers.length === 0 ? (
                            <p 
                                className="text-center py-6"
                                style={{ color: '#6b6b6b' }}
                            >
                                No panel members assigned
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {panelMembers.map((member, index) => (
                                    <div
                                        key={index}
                                        className="flex items-center justify-between rounded-lg border p-4"
                                        style={{ 
                                            borderColor: '#d4c9a8',
                                            backgroundColor: '#faf8f2',
                                        }}
                                    >
                                        <p 
                                            className="font-bold text-sm"
                                            style={{ color: '#0f3460' }}
                                        >
                                            {member.full_name}
                                        </p>
                                        <p 
                                            className="text-xs uppercase tracking-widest px-3 py-1 rounded-full"
                                            style={{ 
                                                color: '#ffffff',
                                                backgroundColor: '#c9a84c',
                                            }}
                                        >
                                            {member.role}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Progress Modal for PDF Generation */}
            {showProgressModal && (
                <div className="fixed inset-0 bg-black/35 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg max-w-2xl w-full shadow-2xl" style={{ backgroundColor: '#ffffff' }}>
                        {/* Modal Header */}
                        <div className="p-6 border-b-2" style={{ borderColor: '#d4c9a8', backgroundColor: '#0f3460' }}>
                            <h2 className="text-2xl font-bold text-white">📄 Generating PDF Documents</h2>
                            <p className="text-gray-200 text-sm mt-2">Rendering {progressList.length} evaluation form{progressList.length !== 1 ? 's' : ''}</p>
                        </div>

                        {/* Modal Content */}
                        <div className="p-6">
                        {/* Progress Bar */}
                            <div className="mb-6">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="font-semibold" style={{ color: '#0f3460' }}>
                                        Progress: {progressList.filter(item => item.status === 'complete' || item.status === 'error').length} / {progressList.length}
                                    </p>
                                    <p className="text-sm font-bold" style={{ color: '#c9a84c' }}>
                                        {progressList.length > 0 ? Math.round((progressList.filter(item => item.status === 'complete' || item.status === 'error').length / progressList.length) * 100) : 0}%
                                    </p>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden" style={{ backgroundColor: '#e0e0e0' }}>
                                    <div
                                        className="h-full transition-all duration-300"
                                        style={{
                                            width: `${progressList.length > 0 ? (progressList.filter(item => item.status === 'complete' || item.status === 'error').length / progressList.length) * 100 : 0}%`,
                                            backgroundColor: '#c9a84c',
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Document List */}
                            <div className="space-y-2 max-h-96 overflow-y-auto">
                                {progressList.map((item, index) => (
                                    <div
                                        key={index}
                                        className="flex items-center justify-between p-3 rounded-lg border"
                                        style={{
                                            borderColor: item.status === 'error' ? '#e74c3c' : '#d4c9a8',
                                            backgroundColor:
                                                item.status === 'complete' ? '#f0fdf4' :
                                                item.status === 'error' ? '#fef2f2' :
                                                item.status === 'generating' ? '#fef9e7' : '#faf8f2',
                                        }}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <p 
                                                className="text-sm font-semibold"
                                                style={{
                                                    color: item.status === 'error' ? '#c0392b' : '#0f3460',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }}
                                                title={item.name}
                                            >
                                                {item.name}
                                            </p>
                                        </div>
                                        <div className="ml-2 shrink-0">
                                            {item.status === 'pending' && (
                                                <span className="text-xs px-2 py-1 rounded" style={{ color: '#6b6b6b', backgroundColor: '#e0e0e0' }}>
                                                    ⏳ Pending
                                                </span>
                                            )}
                                            {item.status === 'generating' && (
                                                <span className="text-xs px-2 py-1 rounded animate-pulse" style={{ color: '#f39c12', backgroundColor: '#fef5e7' }}>
                                                    ⚙️ Generating
                                                </span>
                                            )}
                                            {item.status === 'complete' && (
                                                <span className="text-xs px-2 py-1 rounded" style={{ color: '#27ae60', backgroundColor: '#d5f4e6' }}>
                                                    ✓ Complete
                                                </span>
                                            )}
                                            {item.status === 'error' && (
                                                <span className="text-xs px-2 py-1 rounded" style={{ color: '#ffffff', backgroundColor: '#e74c3c' }}>
                                                    ✗ Error
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Status Message */}
                            <div className="mt-6 pt-4 border-t" style={{ borderColor: '#d4c9a8' }}>
                                <div className="text-center mb-4">
                                    {progressList.length > 0 && progressList.every(item => item.status === 'complete' || item.status === 'error') ? (
                                        <p className="text-sm font-semibold" style={{ color: '#27ae60' }}>
                                            ✓ All documents rendered successfully! Downloading...
                                        </p>
                                    ) : (
                                        <p className="text-sm" style={{ color: '#6b6b6b' }}>
                                            Please wait while your documents are being generated...
                                        </p>
                                    )}
                                </div>

                                {/* Action Buttons */}
                                <div className="flex gap-3 justify-end">
                                    {isGeneratingPDF && (
                                        <button
                                            onClick={handleCancelPDFGeneration}
                                            className="px-6 py-2 rounded-lg font-semibold hover:opacity-90 transition-opacity cursor-pointer"
                                            style={{ 
                                                backgroundColor: '#e74c3c',
                                                color: '#ffffff',
                                            }}
                                        >
                                            Cancel
                                        </button>
                                    )}
                                    
                                    {!isGeneratingPDF && progressList.length > 0 && progressList.every(item => item.status === 'complete' || item.status === 'error') && (
                                        <button
                                            onClick={handleClosePDFModal}
                                            className="px-6 py-2 rounded-lg font-semibold hover:opacity-90 transition-opacity cursor-pointer"
                                            style={{ 
                                                backgroundColor: '#27ae60',
                                                color: '#ffffff',
                                            }}
                                        >
                                            Done
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal for Submitted Forms */}
            {showModal && (
                <div className="fixed inset-0 bg-black/35 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto" style={{ backgroundColor: '#ffffff' }}>
                        {/* Modal Header */}
                        <div className="sticky top-0 p-6 border-b-2" style={{ borderColor: '#d4c9a8', backgroundColor: '#0f3460' }}>
                            <div className="flex items-center justify-between">
                                <h2 className="text-2xl font-bold text-white">📋 Submitted Evaluation Forms</h2>
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="text-white text-2xl hover:opacity-75"
                                >
                                    ✕
                                </button>
                            </div>
                            <p className="text-gray-200 text-sm mt-2">Capstone: {capstone.team_name}</p>
                        </div>

                        {/* Modal Content */}
                        <div className="p-6">
                            {isLoadingForms ? (
                                <div className="text-center py-8" style={{ color: '#0f3460' }}>
                                    <p className="text-lg font-semibold">Loading submitted forms...</p>
                                </div>
                            ) : submittedForms.length === 0 ? (
                                <div className="text-center py-8" style={{ color: '#6b6b6b' }}>
                                    <p className="text-lg">No submitted forms found for this capstone.</p>
                                </div>
                            ) : (
                                <div>
                                    <p className="text-sm font-semibold mb-4" style={{ color: '#0f3460' }}>
                                        Total Submitted Forms: <span style={{ color: '#c9a84c' }}>{submittedForms.length}</span>
                                    </p>
                                    <div className="space-y-8">
                                        {Object.entries(
                                            submittedForms.reduce((acc, form) => {
                                                if (!acc[form.proposal_id]) {
                                                    acc[form.proposal_id] = [];
                                                }
                                                acc[form.proposal_id].push(form);
                                                return acc;
                                            }, {} as Record<number, SubmittedForm[]>)
                                        )
                                        .sort((a, b) => {
                                            const proposalNumA = a[1][0]?.proposal_number || 0;
                                            const proposalNumB = b[1][0]?.proposal_number || 0;
                                            return proposalNumA - proposalNumB;
                                        })
                                        .map(([proposalId, proposals]) => (
                                            <div key={proposalId}>
                                                {/* Proposal Header */}
                                                <div 
                                                    className="mb-4 p-4 rounded-lg border-2"
                                                    style={{
                                                        borderColor: '#c9a84c',
                                                        backgroundColor: '#fffdf5',
                                                    }}
                                                >
                                                    <p className="font-bold text-lg" style={{ color: '#0f3460' }}>
                                                        📌 Proposal {proposals[0]?.proposal_number}: {proposals[0]?.proposal_name}
                                                    </p>
                                                </div>

                                                {/* Group by form type */}
                                                <div className="space-y-4 pl-4 border-l-4" style={{ borderColor: '#d4c9a8' }}>
                                                    {Object.entries(
                                                        proposals.reduce((acc, form) => {
                                                            if (!acc[form.form_type]) {
                                                                acc[form.form_type] = [];
                                                            }
                                                            acc[form.form_type].push(form);
                                                            return acc;
                                                        }, {} as Record<string, SubmittedForm[]>)
                                                    ).map(([formType, forms]) => (
                                                        <div key={formType}>
                                                            {/* Form Type Subheader */}
                                                            <div 
                                                                className="mb-2 p-3 rounded-lg border"
                                                                style={{
                                                                    borderColor: '#c9a84c',
                                                                    backgroundColor: '#fef9e7',
                                                                }}
                                                            >
                                                                {formType === 'Proposal Defense Evaluation' && (
                                                                    <p className="font-semibold text-base" style={{ color: '#0f3460' }}>
                                                                        📋 {formType}
                                                                    </p>
                                                                )}

                                                                {formType === 'Peer & Self Evaluation' && (
                                                                    <p className="font-semibold text-base" style={{ color: '#0f3460' }}>
                                                                        👥 {formType}
                                                                    </p>
                                                                )}

                                                                {formType === 'Oral Presentation Evaluation' && (
                                                                    <p className="font-semibold text-base" style={{ color: '#0f3460' }}>
                                                                        🎤 {formType}
                                                                    </p>
                                                                )}
                                                                
                                                            </div>

                                                            {/* Forms under this type */}
                                                            <div className="space-y-2 mb-4">
                                                                {forms.map((form, index) => (
                                                                    <div
                                                                        key={`${formType}-${index}`}
                                                                        className="rounded-lg border p-4"
                                                                        style={{ 
                                                                            borderColor: '#d4c9a8',
                                                                            backgroundColor: '#faf8f2',
                                                                        }}
                                                                    >
                                                                        <div className="flex items-start justify-between mb-2">
                                                                            <div>
                                                                                <p className="font-bold" style={{ color: '#0f3460' }}>
                                                                                    {form.full_name}
                                                                                </p>
                                                                                <p className="text-xs" style={{ color: '#6b6b6b' }}>
                                                                                    {form.designation}
                                                                                </p>
                                                                            </div>
                                                                            <div className="text-xs px-2 py-1 rounded-full text-white" style={{ backgroundColor: '#27ae60' }}>
                                                                                ✓ Submitted
                                                                            </div>
                                                                        </div>
                                                                        <div className="mt-3 pt-3 border-t" style={{ borderColor: '#e0e0e0' }}>
                                                                            <div className="grid grid-cols-2 gap-3 text-xs">
                                                                                <div>
                                                                                    <p style={{ color: '#6b6b6b' }} className="font-semibold">
                                                                                        🕐 Time
                                                                                    </p>
                                                                                    <p style={{ color: '#1a1a2e' }}>
                                                                                        {form.time || 'Not recorded'}
                                                                                    </p>
                                                                                </div>
                                                                                <div>
                                                                                    <p style={{ color: '#6b6b6b' }} className="font-semibold">
                                                                                        📅 Date
                                                                                    </p>
                                                                                    <p style={{ color: '#1a1a2e' }}>
                                                                                        {form.date || 'Not recorded'}
                                                                                    </p>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="sticky bottom-0 p-6 border-t-2 flex justify-end gap-3 bg-white">
                            <button
                                onClick={() => setShowModal(false)}
                                className="px-6 py-2 rounded-lg font-semibold hover:opacity-90 transition-opacity cursor-pointer"
                                style={{ 
                                    backgroundColor: '#d4c9a8',
                                    color: '#0f3460',
                                }}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal for No Forms Submitted */}
            {showNoFormsModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                    <div className="w-full max-w-md rounded-3xl bg-white shadow-xl overflow-hidden">
                        <div className="flex gap-3 border-b border-[#e3d7b9] p-4 sm:p-5 flex-row items-center justify-between shrink-0">
                            <h2 className="text-lg sm:text-xl font-semibold text-[#16213e]">No Forms Submitted</h2>
                            <button
                                onClick={() => setShowNoFormsModal(false)}
                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#f0f0f0] text-[#6b6b6b] hover:bg-[#e0e0e0] transition-colors"
                                title="Close"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-4 sm:p-6">
                            <p className="text-base text-[#6b6b6b] mb-6">
                                No evaluation forms have been submitted for this capstone. PDF generation requires at least one submitted form. 
                                Please ensure that all required evaluations are completed and submitted before attempting to generate PDFs.
                            </p>

                            <div className="flex gap-3 justify-end">
                                <button
                                    type="button"
                                    onClick={() => setShowNoFormsModal(false)}
                                    className="inline-flex items-center justify-center rounded-lg bg-[#6b6b6b] px-5 py-3 text-sm font-semibold uppercase text-white transition-all duration-200 hover:bg-[#505050]"
                                >
                                    Understood
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
