import React, { useState, useMemo, useEffect } from 'react';
import { Head } from '@inertiajs/react';
import AdminSidebar from '../../components/AdminSidebar';

interface CapstoneProps {
    id: number;
    team_name: string;
    no_of_team_members: number;
    no_of_panel_members: number;
    no_of_proposals: number;
    is_live: boolean;
    created_at: string;
    logo?: string | null;
}

interface TeamMember {
    member_id: string;
    full_name: string;
    designation: string;
}

interface PanelMember {
    member_id: string;
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
    form_data: Record<string, any>;
}

interface EvaluationData {
    no_of_submitted: number;
    forms: EvaluationForm[];
}

interface Proposal {
    id: number;
    title: string;
    defense_eval: EvaluationData;
    team_self_eval: EvaluationData;
    team_oral_eval: EvaluationData;
    gen_documents?: Record<string, any>;
    created_at?: string;
    updated_at?: string;
}

interface CapstoneDetail extends CapstoneProps {
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

interface UserOption {
    id: number;
    full_name: string;
    role: string;
}

interface CapstonesPageProps {
    capstones: CapstoneProps[];
}

export default function Capstones({ capstones }: CapstonesPageProps) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedFilter, setSelectedFilter] = useState<'ALL' | 'LIVE'>('ALL');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);
    const [selectedCapstone, setSelectedCapstone] = useState<CapstoneProps | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [teamName, setTeamName] = useState('');
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [processingStatus, setProcessingStatus] = useState<'idle' | 'processing' | 'success' | 'failure'>('idle');
    const [processingMessage, setProcessingMessage] = useState('');
    const [processingTitle, setProcessingTitle] = useState('');
    const [csrfToken, setCsrfToken] = useState('');
    const [capstoneDetail, setCapstoneDetail] = useState<CapstoneDetail | null>(null);
    const [isLoadingCapstoneDetail, setIsLoadingCapstoneDetail] = useState(false);
    const [showAddMemberForm, setShowAddMemberForm] = useState(false);
    const [addMemberType, setAddMemberType] = useState<'team' | 'panel'>('team');
    const [userSearchQuery, setUserSearchQuery] = useState('');
    const [userSearchResults, setUserSearchResults] = useState<UserOption[]>([]);
    const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
    const [memberDesignation, setMemberDesignation] = useState('');
    const [isAddingMember, setIsAddingMember] = useState(false);
    const [isSearchingUsers, setIsSearchingUsers] = useState(false);
    const [isUserSearchFocused, setIsUserSearchFocused] = useState(false);
    const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
    const [editingDesignation, setEditingDesignation] = useState('');
    const [isEditingCapstone, setIsEditingCapstone] = useState(false);
    const [editingTeamName, setEditingTeamName] = useState('');
    const [editingIsLive, setEditingIsLive] = useState(false);
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreviewUrl, setLogoPreviewUrl] = useState('');
    const [isSavingCapstone, setIsSavingCapstone] = useState(false);
    const [showCreateProposalModal, setShowCreateProposalModal] = useState(false);
    const [proposalTitle, setProposalTitle] = useState('');
    const [isCreatingProposal, setIsCreatingProposal] = useState(false);
    const [isViewProposalModalOpen, setIsViewProposalModalOpen] = useState(false);
    const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
    const [isEditingProposalTitle, setIsEditingProposalTitle] = useState(false);
    const [editingProposalTitle, setEditingProposalTitle] = useState('');
    const [showMaxMembersModal, setShowMaxMembersModal] = useState(false);
    const [maxMembersModalContext, setMaxMembersModalContext] = useState<'proposal' | 'member'>('proposal');
    const [maxMembersModalMemberType, setMaxMembersModalMemberType] = useState<'team' | 'panel'>('team');

    useEffect(() => {
        if (typeof document !== 'undefined') {
            setCsrfToken(document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? '');
        }
    }, []);

    useEffect(() => {
        if (capstoneDetail) {
            console.log('[DEBUG STATE] capstoneDetail state updated:', capstoneDetail);
            console.log('[DEBUG STATE] capstoneDetail.proposals:', capstoneDetail.proposals);
            if (capstoneDetail.proposals?.proposals?.length > 0) {
                console.log('[DEBUG STATE] First proposal in state:', capstoneDetail.proposals.proposals[0]);
                console.log('[DEBUG STATE] First proposal defense_eval in state:', capstoneDetail.proposals.proposals[0].defense_eval);
            }
        }
    }, [capstoneDetail]);

    const getCsrfToken = () => {
        if (typeof document !== 'undefined') {
            return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? csrfToken;
        }
        return csrfToken;
    };

    const filteredCapstones = useMemo(() => {
        return capstones.filter((capstone) => {
            const matchesSearch = searchQuery.trim() === '' ||
                capstone.team_name.toLowerCase().includes(searchQuery.trim().toLowerCase());
            const matchesFilter = selectedFilter === 'ALL' ||
                (selectedFilter === 'LIVE' && capstone.is_live);

            return matchesSearch && matchesFilter;
        });
    }, [capstones, searchQuery, selectedFilter]);

    const itemsPerPage = 3;
    const totalPages = Math.max(1, Math.ceil(filteredCapstones.length / itemsPerPage));
    const paginatedCapstones = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredCapstones.slice(start, start + itemsPerPage);
    }, [filteredCapstones, currentPage]);

    const openCreateModal = () => {
        setIsCreateModalOpen(true);
    };

    const closeCreateModal = () => {
        setIsCreateModalOpen(false);
        resetCreateModal();
    };

    const resetCreateModal = () => {
        setTeamName('');
        setFormErrors({});
        setProcessingStatus('idle');
    };

    const handleCreateCapstone = async () => {
        setFormErrors({});
        setIsSubmitting(true);
        setProcessingStatus('processing');
        setProcessingTitle('Creating Capstone');
        setProcessingMessage('Creating capstone project...');

        try {
            const response = await fetch('/admin/capstones/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': getCsrfToken(),
                },
                body: JSON.stringify({
                    team_name: teamName,
                    panel_members: {
                        no_members: '0',
                        list: []
                    },
                    proposals: {
                        proposals: []
                    },
                    team_list: {
                        no_members: '0',
                        list: []
                    },
                    is_live: 0
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                setProcessingStatus('failure');
                setProcessingMessage(data?.message || 'Failed to create capstone.');
                setTimeout(() => {
                    setProcessingStatus('idle');
                    setFormErrors(data?.errors || { team_name: data?.message || 'Unable to create capstone.' });
                }, 2000);
                return;
            }

            setProcessingStatus('success');
            setProcessingMessage('Capstone created successfully!');
            setTimeout(() => {
                setProcessingStatus('idle');
                setIsCreateModalOpen(false);
                resetCreateModal();
                window.location.reload();
            }, 2000);
        } catch (error) {
            setProcessingStatus('failure');
            setProcessingMessage('Unable to create capstone at this time.');
            setTimeout(() => {
                setProcessingStatus('idle');
                setFormErrors({ team_name: 'Unable to create capstone at this time.' });
            }, 2000);
        } finally {
            setIsSubmitting(false);
        }
    };

    const openViewModal = async (capstone: CapstoneProps) => {
        setSelectedCapstone(capstone);
        setIsViewModalOpen(true);
        setIsLoadingCapstoneDetail(true);
        
        try {
            console.log('[DEBUG Frontend] Fetching capstone details for ID:', capstone.id);
            const response = await fetch(`/admin/capstones/${capstone.id}`);
            if (response.ok) {
                const data = await response.json();
                console.log('[DEBUG Frontend] Received capstone data:', data);
                console.log('[DEBUG Frontend] Proposals:', data.proposals);
                if (data.proposals?.proposals?.length > 0) {
                    console.log('[DEBUG Frontend] First proposal full object:', JSON.stringify(data.proposals.proposals[0], null, 2));
                    console.log('[DEBUG Frontend] First proposal defense_eval:', data.proposals.proposals[0].defense_eval);
                    console.log('[DEBUG Frontend] First proposal has defense_eval?', 'defense_eval' in data.proposals.proposals[0]);
                    console.log('[DEBUG Frontend] First proposal keys:', Object.keys(data.proposals.proposals[0]));
                }
                setCapstoneDetail(data);
                console.log('[DEBUG Frontend] setCapstoneDetail called with:', data);
            } else {
                console.error('Failed to fetch capstone details', response.status);
            }
        } catch (error) {
            console.error('Error fetching capstone details:', error);
        } finally {
            setIsLoadingCapstoneDetail(false);
        }
    };

    const closeViewModal = () => {
        setSelectedCapstone(null);
        setIsViewModalOpen(false);
        setCapstoneDetail(null);
        setShowAddMemberForm(false);
        setUserSearchQuery('');
        setUserSearchResults([]);
        setSelectedUser(null);
        setMemberDesignation('');
        setIsEditingCapstone(false);
        setEditingTeamName('');
        setEditingIsLive(false);
        setLogoFile(null);
        setLogoPreviewUrl('');
        setShowCreateProposalModal(false);
        setProposalTitle('');
        setIsViewProposalModalOpen(false);
        setSelectedProposal(null);
        setIsEditingProposalTitle(false);
        setEditingProposalTitle('');
        setShowMaxMembersModal(false);
        setMaxMembersModalContext('proposal');
        setMaxMembersModalMemberType('team');
    };

    const handleSearchUsers = async (query: string) => {
        setUserSearchQuery(query);
        // Clear selected user if query no longer matches their full name
        if (selectedUser && query !== selectedUser.full_name) {
            setSelectedUser(null);
        }
        // Show results if query is long enough OR if field is focused with empty query
        if (query.trim().length < 2 && !isUserSearchFocused) {
            setUserSearchResults([]);
            setIsSearchingUsers(false);
            return;
        }

        setIsSearchingUsers(true);
        try {
            // Filter by role based on member type
            const roleFilter = addMemberType === 'team' ? 'Student' : 'Panel';
            const response = await fetch(`/admin/users/search?q=${encodeURIComponent(query)}&role=${roleFilter}`);
            if (response.ok) {
                const data = await response.json();
                // Filter out users already added to the list
                if (capstoneDetail) {
                    const existingMemberIds = (addMemberType === 'team' ? capstoneDetail.team_list.list : capstoneDetail.panel_members.list)
                        .map(m => m.member_id);
                    const filtered = data.filter((user: UserOption) => !existingMemberIds.includes(user.id.toString()));
                    setUserSearchResults(filtered);
                } else {
                    setUserSearchResults(data);
                }
            }
        } catch (error) {
            console.error('Error searching users:', error);
        } finally {
            setIsSearchingUsers(false);
        }
    };

    const handleAddMember = async () => {
        if (!selectedUser || !memberDesignation.trim() || !capstoneDetail) {
            return;
        }

        const updatedMembers = addMemberType === 'team' ? { ...capstoneDetail.team_list } : { ...capstoneDetail.panel_members };
        
        // Check if user already exists
        const existingIndex = updatedMembers.list.findIndex(m => m.member_id === selectedUser.id.toString());
        
        // Apply member limits
        const maxTeamMembers = 8;
        const maxPanelMembers = 6;
        const currentCount = updatedMembers.list.length;
        const maxAllowed = addMemberType === 'team' ? maxTeamMembers : maxPanelMembers;
        
        // If adding new member and already at limit, show modal instead of alert
        if (existingIndex < 0 && currentCount >= maxAllowed) {
            setMaxMembersModalContext('member');
            setMaxMembersModalMemberType(addMemberType);
            setShowMaxMembersModal(true);
            return;
        }

        setIsAddingMember(true);
        try {
            if (existingIndex >= 0) {
                updatedMembers.list[existingIndex].designation = memberDesignation;
            } else {
                updatedMembers.list.push({
                    member_id: selectedUser.id.toString(),
                    full_name: selectedUser.full_name,
                    designation: memberDesignation,
                });
            }
            updatedMembers.no_members = updatedMembers.list.length.toString();

            const response = await fetch(`/admin/capstones/${capstoneDetail.id}/update-members`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': getCsrfToken(),
                },
                body: JSON.stringify({
                    type: addMemberType,
                    members: updatedMembers,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                setCapstoneDetail(data);
                setShowAddMemberForm(false);
                setUserSearchQuery('');
                setUserSearchResults([]);
                setSelectedUser(null);
                setMemberDesignation('');
            }
        } catch (error) {
            console.error('Error adding member:', error);
        } finally {
            setIsAddingMember(false);
        }
    };

    const handleRemoveMember = async (memberId: string) => {
        if (!capstoneDetail) return;

        try {
            // Try to find in team list
            let memberType: 'team' | 'panel' = 'team';
            const isInTeam = capstoneDetail.team_list.list.some(m => m.member_id === memberId);
            const isInPanel = capstoneDetail.panel_members.list.some(m => m.member_id === memberId);

            if (!isInTeam && !isInPanel) {
                console.error('Member not found in either list');
                return;
            }

            memberType = isInTeam ? 'team' : 'panel';
            const updatedMembers = memberType === 'team' ? { ...capstoneDetail.team_list } : { ...capstoneDetail.panel_members };
            
            updatedMembers.list = updatedMembers.list.filter(m => m.member_id !== memberId);
            updatedMembers.no_members = updatedMembers.list.length.toString();

            const response = await fetch(`/admin/capstones/${capstoneDetail.id}/update-members`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': getCsrfToken(),
                },
                body: JSON.stringify({
                    type: memberType,
                    members: updatedMembers,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                setCapstoneDetail(data);
            }
        } catch (error) {
            console.error('Error removing member:', error);
        }
    };

    const handleEditMember = (member: TeamMember | PanelMember) => {
        setEditingMemberId(member.member_id);
        setEditingDesignation(member.designation);
    };

    const handleSaveEditMember = async () => {
        if (!editingMemberId || !editingDesignation.trim() || !capstoneDetail) {
            return;
        }

        try {
            // Determine which list the member is in
            let memberType: 'team' | 'panel' = 'team';
            const isInTeam = capstoneDetail.team_list.list.some(m => m.member_id === editingMemberId);
            const isInPanel = capstoneDetail.panel_members.list.some(m => m.member_id === editingMemberId);

            if (!isInTeam && !isInPanel) {
                console.error('Member not found in either list');
                return;
            }

            memberType = isInTeam ? 'team' : 'panel';
            const updatedMembers = memberType === 'team' ? { ...capstoneDetail.team_list } : { ...capstoneDetail.panel_members };
            
            // Update the designation
            const memberIndex = updatedMembers.list.findIndex(m => m.member_id === editingMemberId);
            if (memberIndex >= 0) {
                updatedMembers.list[memberIndex].designation = editingDesignation;
            }

            const response = await fetch(`/admin/capstones/${capstoneDetail.id}/update-members`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': getCsrfToken(),
                },
                body: JSON.stringify({
                    type: memberType,
                    members: updatedMembers,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                setCapstoneDetail(data);
                setEditingMemberId(null);
                setEditingDesignation('');
            }
        } catch (error) {
            console.error('Error updating member:', error);
        }
    };

    const handleCancelEditMember = () => {
        setEditingMemberId(null);
        setEditingDesignation('');
    };

    const handleEditCapstone = () => {
        if (capstoneDetail) {
            setIsEditingCapstone(true);
            setEditingTeamName(capstoneDetail.team_name);
            setEditingIsLive(capstoneDetail.is_live);
            setLogoFile(null);
            setLogoPreviewUrl(capstoneDetail.logo ?? '');
        }
    };

    const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] ?? null;
        setLogoFile(file);
        if (file) {
            setLogoPreviewUrl(URL.createObjectURL(file));
        } else {
            setLogoPreviewUrl(capstoneDetail?.logo ?? '');
        }
    };

    const handleSaveCapstonDetails = async () => {
        if (!editingTeamName.trim() || !capstoneDetail) {
            return;
        }

        setIsSavingCapstone(true);
        try {
            const headers: Record<string, string> = {
                'X-CSRF-TOKEN': getCsrfToken(),
            };

            let body: BodyInit;
            if (logoFile) {
                const formData = new FormData();
                formData.append('team_name', editingTeamName);
                formData.append('is_live', editingIsLive ? '1' : '0');
                formData.append('logo_image', logoFile);
                body = formData;
            } else {
                headers['Content-Type'] = 'application/json';
                body = JSON.stringify({
                    team_name: editingTeamName,
                    is_live: editingIsLive ? 1 : 0,
                });
            }

            const response = await fetch(`/admin/capstones/${capstoneDetail.id}/update-details`, {
                method: 'POST',
                headers,
                body,
            });

            if (response.ok) {
                const updatedCapstone = await response.json();
                setCapstoneDetail(updatedCapstone.capstone);
                if (selectedCapstone) {
                    setSelectedCapstone({
                        ...selectedCapstone,
                        team_name: editingTeamName,
                        is_live: editingIsLive,
                        logo: updatedCapstone.capstone.logo ?? null,
                    });
                }
                setIsEditingCapstone(false);
                setLogoFile(null);
                setLogoPreviewUrl(updatedCapstone.capstone.logo ?? '');
                setProcessingStatus('success');
                setProcessingMessage('Capstone details updated successfully!');
                setTimeout(() => setProcessingStatus('idle'), 2000);
            } else if (response.status === 422) {
                const errorData = await response.json();
                setProcessingStatus('failure');
                setProcessingMessage(errorData.error || 'Cannot set capstone as live. Minimum 4 team members required.');
                setEditingIsLive(false);
                setTimeout(() => setProcessingStatus('idle'), 2000);
            } else {
                setProcessingStatus('failure');
                setProcessingMessage('Failed to update capstone details.');
                setTimeout(() => setProcessingStatus('idle'), 2000);
            }
        } catch (error) {
            console.error('Error updating capstone details:', error);
            setProcessingStatus('failure');
            setProcessingMessage('Error updating capstone details.');
            setTimeout(() => setProcessingStatus('idle'), 2000);
        } finally {
            setIsSavingCapstone(false);
        }
    };

    const handleRemoveLogo = async () => {
        if (!capstoneDetail) return;

        setIsSavingCapstone(true);
        try {
            const response = await fetch(`/admin/capstones/${capstoneDetail.id}/update-details`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': getCsrfToken(),
                },
                body: JSON.stringify({
                    team_name: capstoneDetail.team_name,
                    is_live: capstoneDetail.is_live ? 1 : 0,
                    logo: null,
                }),
            });

            if (response.ok) {
                const updatedCapstone = await response.json();
                setCapstoneDetail(updatedCapstone.capstone);
                if (selectedCapstone) {
                    setSelectedCapstone({ ...selectedCapstone, logo: null });
                }
                setLogoFile(null);
                setLogoPreviewUrl('');
            }
        } catch (error) {
            console.error('Error removing logo:', error);
        } finally {
            setIsSavingCapstone(false);
        }
    };

    const handleCancelEditCapstone = () => {
        setIsEditingCapstone(false);
        setEditingTeamName('');
        setEditingIsLive(false);
        setLogoFile(null);
        setLogoPreviewUrl('');
    };

    const hasMinimumMembers = () => {
        if (!capstoneDetail) return false;
        const teamCount = capstoneDetail.team_list.list.length;
        const panelCount = capstoneDetail.panel_members.list.length;
        return teamCount >= 4 && panelCount >= 5;
    };

    const handleOpenCreateProposalModal = () => {
        if (!capstoneDetail) return;

        // Check if at maximum members
        const teamCount = capstoneDetail.team_list.list.length;
        const panelCount = capstoneDetail.panel_members.list.length;

        if (teamCount >= 8 && panelCount >= 6) {
            setMaxMembersModalContext('proposal');
            setShowMaxMembersModal(true);
            return;
        }

        setShowCreateProposalModal(true);
        setProposalTitle('');
    };

    const handleCreateProposal = async () => {
        if (!proposalTitle.trim() || !capstoneDetail) {
            return;
        }

        setIsCreatingProposal(true);
        try {
            const response = await fetch(`/admin/capstones/${capstoneDetail.id}/create-proposal`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': getCsrfToken(),
                },
                body: JSON.stringify({
                    title: proposalTitle,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                setCapstoneDetail(data);
                setShowCreateProposalModal(false);
                setProposalTitle('');
                setProcessingStatus('success');
                setProcessingMessage('Proposal created successfully!');
                setTimeout(() => setProcessingStatus('idle'), 2000);
            } else {
                setProcessingStatus('failure');
                setProcessingMessage('Failed to create proposal.');
                setTimeout(() => setProcessingStatus('idle'), 2000);
            }
        } catch (error) {
            console.error('Error creating proposal:', error);
            setProcessingStatus('failure');
            setProcessingMessage('Error creating proposal.');
            setTimeout(() => setProcessingStatus('idle'), 2000);
        } finally {
            setIsCreatingProposal(false);
        }
    };

    const handleCancelCreateProposal = () => {
        setShowCreateProposalModal(false);
        setProposalTitle('');
    };

    const calculateTotalSubmitted = (proposal: Proposal): number => {
        let total = 0;
        
        // Helper function to parse evaluation data (could be string or object)
        const parseEvaluation = (evalData: any) => {
            if (!evalData) return null;
            if (typeof evalData === 'string') {
                try {
                    return JSON.parse(evalData);
                } catch (e) {
                    console.error('Failed to parse evaluation:', e);
                    return null;
                }
            }
            return evalData;
        };
        
        // Parse defense evaluation
        const defenseEval = parseEvaluation(proposal.defense_eval);
        if (defenseEval?.forms && Array.isArray(defenseEval.forms)) {
            const defenseCount = defenseEval.forms.filter((f: EvaluationForm) => f.is_submitted).length;
            console.log('[DEBUG calculateTotalSubmitted] Defense submitted count:', defenseCount);
            total += defenseCount;
        } else {
            console.log('[DEBUG calculateTotalSubmitted] No defense_eval or forms');
        }
        
        // Parse team self evaluation
        const selfEval = parseEvaluation(proposal.team_self_eval);
        if (selfEval?.forms && Array.isArray(selfEval.forms)) {
            const selfCount = selfEval.forms.filter((f: EvaluationForm) => f.is_submitted).length;
            console.log('[DEBUG calculateTotalSubmitted] Self eval submitted count:', selfCount);
            total += selfCount;
        } else {
            console.log('[DEBUG calculateTotalSubmitted] No team_self_eval or forms');
        }
        
        // Parse team oral evaluation
        const oralEval = parseEvaluation(proposal.team_oral_eval);
        if (oralEval?.forms && Array.isArray(oralEval.forms)) {
            const oralCount = oralEval.forms.filter((f: EvaluationForm) => f.is_submitted).length;
            console.log('[DEBUG calculateTotalSubmitted] Oral eval submitted count:', oralCount);
            total += oralCount;
        } else {
            console.log('[DEBUG calculateTotalSubmitted] No team_oral_eval or forms');
        }
        
        console.log('[DEBUG calculateTotalSubmitted] Total:', total);
        return total;
    };

    // Helper function to parse evaluation data (string or object)
    const getEvaluationData = (evalData: any): EvaluationData | null => {
        if (!evalData) return null;
        if (typeof evalData === 'string') {
            try {
                return JSON.parse(evalData);
            } catch (e) {
                console.error('Failed to parse evaluation:', e);
                return null;
            }
        }
        return evalData;
    };

    const handleOpenProposalModal = (proposal: Proposal) => {
        console.log('[DEBUG Frontend] Opening proposal modal:', proposal);
        console.log('[DEBUG Frontend] Proposal defense_eval:', proposal.defense_eval);
        console.log('[DEBUG Frontend] Proposal team_self_eval:', proposal.team_self_eval);
        console.log('[DEBUG Frontend] Proposal team_oral_eval:', proposal.team_oral_eval);
        setSelectedProposal(proposal);
        setIsViewProposalModalOpen(true);
    };

    const handleCloseProposalModal = () => {
        setSelectedProposal(null);
        setIsViewProposalModalOpen(false);
    };

    const handleDeleteProposal = async () => {
        if (!selectedProposal || !capstoneDetail) return;

        if (!confirm(`Are you sure you want to delete the proposal "${selectedProposal.title}"? This action cannot be undone.`)) {
            return;
        }

        setProcessingStatus('processing');
        setProcessingTitle('Deleting Proposal');
        setProcessingMessage('Removing proposal from capstone...');

        try {
            const response = await fetch(`/admin/capstones/${capstoneDetail.id}/proposals/${selectedProposal.id}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': getCsrfToken(),
                },
            });

            if (response.ok) {
                const data = await response.json();
                // Update the capstoneDetail with the new proposals list
                if (capstoneDetail) {
                    setCapstoneDetail({
                        ...capstoneDetail,
                        proposals: {
                            proposals: capstoneDetail.proposals.proposals.filter(p => p.id !== selectedProposal.id)
                        }
                    });
                }
                handleCloseProposalModal();
                setProcessingStatus('success');
                setProcessingMessage('Proposal deleted successfully!');
                setTimeout(() => setProcessingStatus('idle'), 2000);
            } else {
                setProcessingStatus('failure');
                setProcessingMessage('Failed to delete proposal.');
                setTimeout(() => setProcessingStatus('idle'), 2000);
            }
        } catch (error) {
            console.error('Error deleting proposal:', error);
            setProcessingStatus('failure');
            setProcessingMessage('Error deleting proposal.');
            setTimeout(() => setProcessingStatus('idle'), 2000);
        }
    };

    const handleEditProposalTitle = () => {
        if (selectedProposal) {
            setIsEditingProposalTitle(true);
            setEditingProposalTitle(selectedProposal.title);
        }
    };

    const handleSaveProposalTitle = async () => {
        if (!selectedProposal || !editingProposalTitle.trim() || !capstoneDetail) return;

        if (editingProposalTitle.trim() === selectedProposal.title) {
            setIsEditingProposalTitle(false);
            return;
        }

        setProcessingStatus('processing');
        setProcessingTitle('Updating Proposal');
        setProcessingMessage('Saving proposal title...');

        try {
            const response = await fetch(`/admin/capstones/${capstoneDetail.id}/proposals/${selectedProposal.id}/update-title`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': getCsrfToken(),
                },
                body: JSON.stringify({
                    title: editingProposalTitle.trim(),
                }),
            });

            if (response.ok) {
                const data = await response.json();
                // Update selected proposal and capstone detail
                const updatedProposal = { ...selectedProposal, title: editingProposalTitle.trim() };
                setSelectedProposal(updatedProposal);
                
                if (capstoneDetail) {
                    const updatedCapstone = {
                        ...capstoneDetail,
                        proposals: {
                            ...capstoneDetail.proposals,
                            proposals: capstoneDetail.proposals.proposals.map(p => 
                                p.id === selectedProposal.id ? updatedProposal : p
                            )
                        }
                    };
                    setCapstoneDetail(updatedCapstone);
                }

                setIsEditingProposalTitle(false);
                setProcessingStatus('success');
                setProcessingMessage('Proposal title updated successfully!');
                setTimeout(() => setProcessingStatus('idle'), 2000);
            } else {
                setProcessingStatus('failure');
                setProcessingMessage('Failed to update proposal title.');
                setTimeout(() => setProcessingStatus('idle'), 2000);
            }
        } catch (error) {
            console.error('Error updating proposal title:', error);
            setProcessingStatus('failure');
            setProcessingMessage('Error updating proposal title.');
            setTimeout(() => setProcessingStatus('idle'), 2000);
        }
    };

    const handleCancelEditProposalTitle = () => {
        setIsEditingProposalTitle(false);
        setEditingProposalTitle('');
    };

    const handleFilterChange = (filter: 'ALL' | 'LIVE') => {
        setSelectedFilter(filter);
        setCurrentPage(1);
    };

    const handleGenerateMembersPDF = async () => {
        if (!capstoneDetail) return;

        try {
            setProcessingStatus('processing');
            setProcessingTitle('Generating PDF');
            setProcessingMessage('Collecting member information...');

            // Collect all member IDs
            const teamMemberIds = capstoneDetail.team_list.list.map(m => m.member_id);
            const panelMemberIds = capstoneDetail.panel_members.list.map(m => m.member_id);
            const allMemberIds = [...teamMemberIds, ...panelMemberIds];

            if (allMemberIds.length === 0) {
                setProcessingStatus('failure');
                setProcessingMessage('No members to include in PDF.');
                setTimeout(() => setProcessingStatus('idle'), 2000);
                return;
            }

            // Fetch user details for all members
            const userDetailsMap = new Map();
            for (const memberId of allMemberIds) {
                try {
                    const response = await fetch(`/admin/users/${memberId}`);
                    if (response.ok) {
                        const userData = await response.json();
                        userDetailsMap.set(memberId, userData);
                    }
                } catch (error) {
                    console.error(`Error fetching user ${memberId}:`, error);
                }
            }

            // Dynamic import of jsPDF
            const { jsPDF: JsPdfClass } = await import('jspdf');
            const pdf = new JsPdfClass();
            let yPosition = 20;
            const pageHeight = pdf.internal.pageSize.getHeight();
            const pageWidth = pdf.internal.pageSize.getWidth();
            const margin = 15;
            const contentWidth = pageWidth - 2 * margin;

            // Title
            pdf.setFontSize(18);
            pdf.setFont('Helvetica', 'bold');
            pdf.text(`Capstone: ${capstoneDetail.team_name}`, margin, yPosition);
            yPosition += 10;

            // Date
            pdf.setFontSize(10);
            pdf.setFont('Helvetica', 'normal');
            pdf.text(`Generated: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, margin, yPosition);
            yPosition += 12;

            // Team Members Section
            pdf.setFontSize(12);
            pdf.setFont('Helvetica', 'bold');
            pdf.text('TEAM MEMBERS', margin, yPosition);
            yPosition += 8;

            pdf.setFontSize(10);
            pdf.setFont('Helvetica', 'normal');

            capstoneDetail.team_list.list.forEach((member, index) => {
                const userData = userDetailsMap.get(member.member_id);

                // Check if we need a new page
                if (yPosition > pageHeight - 40) {
                    pdf.addPage();
                    yPosition = 20;
                }

                // Member info box
                pdf.setDrawColor(200);
                pdf.rect(margin, yPosition - 5, contentWidth, 35);

                pdf.setFont('Helvetica', 'bold');
                pdf.text(`${index + 1}. ${member.full_name}`, margin + 5, yPosition + 2);

                pdf.setFont('Helvetica', 'normal');
                pdf.text(`Member ID: ${member.member_id}`, margin + 5, yPosition + 8);
                pdf.text(`Designation: ${member.designation}`, margin + 5, yPosition + 14);
                pdf.text(`Username: ${userData?.username || 'N/A'}`, margin + 5, yPosition + 20);
                pdf.text(`Password: ${userData?.gen_pass || 'N/A'}`, margin + 5, yPosition + 26);

                yPosition += 40;
            });

            // Panel Members Section
            yPosition += 5;
            if (yPosition > pageHeight - 40) {
                pdf.addPage();
                yPosition = 20;
            }

            pdf.setFontSize(12);
            pdf.setFont('Helvetica', 'bold');
            pdf.text('PANEL MEMBERS', margin, yPosition);
            yPosition += 8;

            pdf.setFontSize(10);
            pdf.setFont('Helvetica', 'normal');

            capstoneDetail.panel_members.list.forEach((member, index) => {
                const userData = userDetailsMap.get(member.member_id);

                // Check if we need a new page
                if (yPosition > pageHeight - 40) {
                    pdf.addPage();
                    yPosition = 20;
                }

                // Member info box
                pdf.setDrawColor(200);
                pdf.rect(margin, yPosition - 5, contentWidth, 35);

                pdf.setFont('Helvetica', 'bold');
                pdf.text(`${index + 1}. ${member.full_name}`, margin + 5, yPosition + 2);

                pdf.setFont('Helvetica', 'normal');
                pdf.text(`Member ID: ${member.member_id}`, margin + 5, yPosition + 8);
                pdf.text(`Designation: ${member.designation}`, margin + 5, yPosition + 14);
                pdf.text(`Username: ${userData?.username || 'N/A'}`, margin + 5, yPosition + 20);
                pdf.text(`Password: ${userData?.gen_pass || 'N/A'}`, margin + 5, yPosition + 26);

                yPosition += 40;
            });

            // Save PDF
            pdf.save(`${capstoneDetail.team_name}_Members_${new Date().getTime()}.pdf`);

            setProcessingStatus('success');
            setProcessingMessage('Members PDF generated and downloaded successfully!');
            setTimeout(() => setProcessingStatus('idle'), 2000);
        } catch (error) {
            console.error('Error generating PDF:', error);
            setProcessingStatus('failure');
            setProcessingMessage('Failed to generate PDF. Please try again.');
            setTimeout(() => setProcessingStatus('idle'), 2000);
        }
    };

    return (
        <>
            <Head title="Capstones Management" />
            <div className="flex min-h-screen bg-[#f0ebe0] text-[#1a1a2e] font-['Source_Sans_3',sans-serif]">
                <AdminSidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} currentPage="capstones" />

                {/* Main Content */}
                <div className="flex-1 w-full lg:ml-64">
                    {/* Mobile header */}
                    <div className="lg:hidden bg-white border-b border-[#d4c9a8] p-4 flex items-center justify-between">
                        <h1 className="font-['Libre_Baskerville',serif] text-lg text-[#16213e] font-bold m-0">
                            Capstone System
                        </h1>
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="p-2 rounded-md text-[#6b6b6b] hover:text-[#0f3460] hover:bg-[#f0ebe0] transition-colors duration-200"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        </button>
                    </div>

                    <div className="p-4 sm:p-6 lg:p-8 pb-12 lg:pb-16">
                        <div className="max-w-7xl mx-auto">
                            <div className="text-center mb-8 lg:mb-10">
                                <div className="font-['Source_Sans_3',sans-serif] font-light text-xs tracking-widest uppercase text-[#c9a84c] mb-2">
                                    CAPSTONE MANAGEMENT
                                </div>
                                <h1 className="font-['Libre_Baskerville',serif] text-xl sm:text-2xl md:text-3xl lg:text-4xl text-[#16213e] leading-tight font-bold m-0">
                                    Manage Capstone Projects
                                </h1>
                                <div className="w-12 sm:w-15 h-0.5 bg-[#c9a84c] mx-auto my-3 lg:my-4"></div>
                            </div>

                            <div className="bg-white rounded-lg border border-[#d4c9a8] p-4 sm:p-6 lg:p-7 mb-4 lg:mb-6 shadow-md">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
                                    <div>
                                        <h2 className="font-['Libre_Baskerville',serif] text-sm font-bold text-[#0f3460] uppercase tracking-wide mb-2">
                                            Capstone Projects
                                        </h2>
                                        <p className="text-[#6b6b6b] leading-relaxed text-sm sm:text-base">
                                            View and manage all capstone projects in the system.
                                        </p>
                                    </div>
                                    <button
                                        onClick={openCreateModal}
                                        className="mt-4 sm:mt-0 inline-flex items-center gap-2 rounded-lg bg-[#c9a84c] px-4 py-2 text-sm font-semibold uppercase text-white transition-all duration-200 hover:bg-[#b38b3d]"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                        Add Capstone
                                    </button>
                                </div>

                                {/* Search and Filters */}
                                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                                    <div className="flex-1">
                                        <input
                                            type="text"
                                            placeholder="Search by team name..."
                                            value={searchQuery}
                                            onChange={(e) => {
                                                setSearchQuery(e.target.value);
                                                setCurrentPage(1);
                                            }}
                                            className="w-full h-10 px-4 border border-[#d4c9a8] rounded-lg bg-[#faf8f2] text-sm text-[#1a1a2e] outline-none transition-all duration-200 focus:border-[#c9a84c] focus:bg-[#fffef8]"
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleFilterChange('ALL')}
                                            className={`px-4 py-2 rounded-lg text-sm font-semibold uppercase transition-all duration-200 ${
                                                selectedFilter === 'ALL'
                                                    ? 'bg-[#c9a84c] text-white'
                                                    : 'bg-[#f0ebe0] text-[#6b6b6b] hover:bg-[#e3d7b9]'
                                            }`}
                                        >
                                            All
                                        </button>
                                        <button
                                            onClick={() => handleFilterChange('LIVE')}
                                            className={`px-4 py-2 rounded-lg text-sm font-semibold uppercase transition-all duration-200 ${
                                                selectedFilter === 'LIVE'
                                                    ? 'bg-[#c9a84c] text-white'
                                                    : 'bg-[#f0ebe0] text-[#6b6b6b] hover:bg-[#e3d7b9]'
                                            }`}
                                        >
                                            Live
                                        </button>
                                    </div>
                                </div>

                                {/* Capstone Cards List */}
                                <div className="space-y-3">
                                    {paginatedCapstones.map((capstone) => (
                                        <div
                                            key={capstone.id}
                                            onClick={() => openViewModal(capstone)}
                                            className="bg-[#faf8f2] border border-[#d4c9a8] rounded-lg p-4 cursor-pointer transition-all duration-200 hover:shadow-lg hover:border-[#c9a84c] hover:bg-[#fffef8]"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-3 mb-2">
                                                    <div className="shrink-0">
                                                        {capstone.logo ? (
                                                            <img
                                                                src={capstone.logo}
                                                                alt={`${capstone.team_name} logo`}
                                                                className="w-16 h-16 rounded-xl object-cover border border-[#d4c9a8]"
                                                            />
                                                        ) : (
                                                            <div className="w-16 h-16 rounded-xl border border-[#d4c9a8] bg-[#f5f5f5] flex items-center justify-center text-[10px] uppercase tracking-widest text-[#6b6b6b]">
                                                                Logo
                                                            </div>
                                                        )}
                                                    </div>
                                                    <h3 className="font-['Libre_Baskerville',serif] text-lg font-bold text-[#16213e] leading-tight">
                                                        {capstone.team_name}
                                                    </h3>
                                                    <div className="flex items-center gap-2">
                                                            <div className={`w-2.5 h-2.5 rounded-full ${capstone.is_live ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
                                                            <span className={`text-xs font-semibold uppercase ${capstone.is_live ? 'text-green-600' : 'text-gray-500'}`}>
                                                                {capstone.is_live ? 'Live' : 'Offline'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <p className="text-xs text-[#6b6b6b] uppercase tracking-wide mb-3">
                                                        CAPSTONE ID: {capstone.id}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-3 gap-3">
                                                <div className="bg-white rounded p-3 border border-[#e3d7b9] text-center">
                                                    <div className="text-xl font-bold text-[#16213e]">{capstone.no_of_team_members}</div>
                                                    <div className="text-xs text-[#6b6b6b] uppercase">Team</div>
                                                </div>
                                                <div className="bg-white rounded p-3 border border-[#e3d7b9] text-center">
                                                    <div className="text-xl font-bold text-[#16213e]">{capstone.no_of_panel_members}</div>
                                                    <div className="text-xs text-[#6b6b6b] uppercase">Panel</div>
                                                </div>
                                                <div className="bg-white rounded px-2 py-3 border border-[#e3d7b9] text-center">
                                                    <div className="text-xl font-bold text-[#16213e]">{capstone.no_of_proposals}</div>
                                                    <div className="text-xs text-[#6b6b6b] uppercase">Proposals</div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {paginatedCapstones.length === 0 && (
                                    <div className="text-center py-12">
                                        <p className="text-[#6b6b6b] text-base">
                                            {filteredCapstones.length === 0 ? 'No capstone projects found.' : 'No capstone projects match your search criteria.'}
                                        </p>
                                    </div>
                                )}

                                {/* Pagination */}
                                {totalPages > 1 && (
                                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <p className="text-sm text-[#6b6b6b]">
                                        Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredCapstones.length)} of {filteredCapstones.length} capstones
                                    </p>

                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                                            disabled={currentPage === 1}
                                            className="px-3 py-1 text-sm border border-[#d4c9a8] rounded bg-white text-[#16213e] hover:bg-[#f0ebe0] disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                                        >
                                            Previous
                                        </button>
                                        <span className="px-3 py-1 text-sm text-[#6b6b6b]">
                                            Page {currentPage} of {totalPages}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                                            disabled={currentPage === totalPages}
                                            className="px-3 py-1 text-sm border border-[#d4c9a8] rounded bg-white text-[#16213e] hover:bg-[#f0ebe0] disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                                        >
                                            Next
                                        </button>
                                    </div>
                                </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Create Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
                    <div className="w-full max-w-md rounded-3xl bg-white shadow-xl overflow-hidden">
                        <div className="flex gap-3 border-b border-[#e3d7b9] p-4 sm:p-5 flex-row items-center justify-between">
                            <div>
                                <h2 className="text-xl font-semibold text-[#16213e]">Add New Capstone</h2>
                                <p className="text-sm text-[#6b6b6b]">Create a new capstone project.</p>
                            </div>
                            <button
                                type="button"
                                onClick={closeCreateModal}
                                className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#f0ebe0] text-[#16213e] transition-colors duration-200 hover:bg-[#c9a84c] hover:text-white"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="p-4 sm:p-6">
                            <div className="grid gap-4">
                                <div>
                                    <label htmlFor="team-name" className="block text-xs font-semibold uppercase tracking-wide text-[#6b6b6b] mb-2">
                                        Team Name
                                    </label>
                                    <input
                                        id="team-name"
                                        type="text"
                                        value={teamName}
                                        onChange={(e) => setTeamName(e.target.value)}
                                        placeholder="Enter team name..."
                                        className="w-full h-12 px-4 border border-[#d4c9a8] rounded-lg bg-[#faf8f2] text-sm text-[#1a1a2e] outline-none transition-all duration-200 focus:border-[#c9a84c] focus:bg-[#fffef8]"
                                    />
                                    {formErrors.team_name && (
                                        <div className="mt-2 rounded-lg bg-[#fdecea] border border-[#f5c6cb] p-2 text-sm text-[#b02a37]">
                                            {formErrors.team_name}
                                        </div>
                                    )}
                                </div>

                                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                                    <button
                                        type="button"
                                        onClick={() => setIsCreateModalOpen(false)}
                                        className="inline-flex items-center justify-center rounded-lg border border-[#d4c9a8] bg-white px-5 py-3 text-sm font-semibold uppercase text-[#16213e] transition-all duration-200 hover:border-[#c9a84c] hover:text-[#16213e]"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleCreateCapstone}
                                        disabled={isSubmitting}
                                        className="inline-flex items-center justify-center rounded-lg bg-[#c9a84c] px-5 py-3 text-sm font-semibold uppercase text-white transition-all duration-200 hover:bg-[#b38b3d] disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        Create Capstone
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* View Modal */}
            {isViewModalOpen && selectedCapstone && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
                    <div className="w-full max-w-4xl max-h-[90vh] rounded-3xl bg-white shadow-xl overflow-hidden flex flex-col">
                        <div className="flex gap-3 border-b border-[#e3d7b9] p-4 sm:p-5 flex-row items-center justify-between shrink-0">
                            <div>
                                <h2 className="text-xl font-semibold text-[#16213e]">Capstone Details</h2>
                                <p className="text-sm text-[#6b6b6b]">Manage capstone proposals and members.</p>
                            </div>
                            <button
                                type="button"
                                onClick={closeViewModal}
                                className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#f0ebe0] text-[#16213e] transition-colors duration-200 hover:bg-[#c9a84c] hover:text-white"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-4 sm:p-6 overflow-y-auto">
                            {isLoadingCapstoneDetail ? (
                                <div className="flex items-center justify-center py-8">
                                    <div className="text-sm text-[#6b6b6b]">Loading capstone details...</div>
                                </div>
                            ) : capstoneDetail ? (
                                <div className="w-full flex flex-col gap-6">
                                    {/* Basic Info */}
                                    <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
                                        <div className="bg-[#faf8f2] rounded-lg p-3 sm:p-4 border border-[#e3d7b9]">
                                            <label className="block text-xs font-semibold uppercase tracking-wide text-[#6b6b6b] mb-1 sm:mb-2">
                                                Capstone ID
                                            </label>
                                            <p className="text-sm sm:text-base text-[#16213e] font-semibold">{selectedCapstone.id}</p>
                                        </div>
                                        <div className="bg-[#faf8f2] rounded-lg p-3 sm:p-4 border border-[#e3d7b9]">
                                            <label className="block text-xs font-semibold uppercase tracking-wide text-[#6b6b6b] mb-1 sm:mb-2">
                                                Team Name
                                            </label>
                                            {isEditingCapstone ? (
                                                <input
                                                    type="text"
                                                    value={editingTeamName}
                                                    onChange={(e) => setEditingTeamName(e.target.value)}
                                                    placeholder="Enter team name..."
                                                    className="w-full h-10 px-3 border border-[#d4c9a8] rounded-lg bg-[#fffef8] text-sm text-[#1a1a2e] outline-none transition-all duration-200 focus:border-[#c9a84c]"
                                                />
                                            ) : (
                                                <p className="text-sm sm:text-base text-[#16213e] font-semibold truncate sm:truncate">{selectedCapstone.team_name}</p>
                                            )}
                                        </div>
                                        <div className="bg-[#faf8f2] rounded-lg p-3 sm:p-4 border border-[#e3d7b9]">
                                            <label className="block text-xs font-semibold uppercase tracking-wide text-[#6b6b6b] mb-1 sm:mb-2">
                                                Status
                                            </label>
                                            {isEditingCapstone ? (
                                                <div className="flex flex-col gap-3">
                                                    <div className="flex items-center gap-3">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const teamCount = capstoneDetail?.team_list?.list?.length ?? 0;
                                                                if (teamCount >= 4) {
                                                                    setEditingIsLive(!editingIsLive);
                                                                }
                                                            }}
                                                            disabled={!capstoneDetail || capstoneDetail.team_list.list.length < 4}
                                                            className={`relative h-6 w-11 rounded-full transition-all duration-200 ${
                                                                editingIsLive ? 'bg-green-500' : 'bg-gray-400'
                                                            } ${!capstoneDetail || capstoneDetail.team_list.list.length < 4 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                        >
                                                            <div
                                                                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform duration-200 ${
                                                                    editingIsLive ? 'translate-x-5' : 'translate-x-0'
                                                                }`}
                                                            ></div>
                                                        </button>
                                                        <span className={`text-sm sm:text-base font-semibold ${
                                                            editingIsLive ? 'text-green-600' : 'text-gray-500'
                                                        }`}>
                                                            {editingIsLive ? 'LIVE' : 'OFFLINE'}
                                                        </span>
                                                    </div>
                                                    {capstoneDetail && capstoneDetail.team_list.list.length < 4 && (
                                                        <p className="text-xs text-orange-600 font-semibold">
                                                            ⚠️ Minimum 4 team members required to go live. Current: {capstoneDetail.team_list.list.length}
                                                        </p>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-3 h-3 rounded-full shrink-0 ${selectedCapstone.is_live ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
                                                    <span className={`text-sm sm:text-base font-semibold ${selectedCapstone.is_live ? 'text-green-600' : 'text-gray-500'}`}>
                                                        {selectedCapstone.is_live ? 'LIVE' : 'OFFLINE'}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="bg-[#faf8f2] rounded-lg p-3 sm:p-4 border border-[#e3d7b9]">
                                            <label className="block text-xs font-semibold uppercase tracking-wide text-[#6b6b6b] mb-1 sm:mb-2">
                                                Logo
                                            </label>
                                            {isEditingCapstone ? (
                                                capstoneDetail?.logo ? (
                                                    <div className="flex flex-col items-start gap-3">
                                                        <img
                                                            src={capstoneDetail.logo}
                                                            alt={`${capstoneDetail.team_name} logo`}
                                                            className="w-22 h-22 max-w-full rounded-xl object-cover border border-[#e3d7b9]"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={handleRemoveLogo}
                                                            className="inline-flex items-center justify-center rounded-lg border border-[#d4c9a8] bg-white px-4 py-2 text-sm font-semibold text-[#16213e] transition-all duration-200 hover:bg-[#f5f5f5]"
                                                        >
                                                            Delete Logo
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-4">
                                                        <div className="rounded-xl border border-[#d4c9a8] bg-white p-4">
                                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                                <div>
                                                                    <p className="text-xs font-semibold uppercase tracking-wide text-[#6b6b6b]">
                                                                        Upload logo image
                                                                    </p>
                                                                    <p className="text-sm text-[#6b6b6b]">
                                                                        Select a file to upload.
                                                                    </p>
                                                                </div>
                                                                <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-[#d4c9a8] bg-[#fffef8] px-4 py-2 text-sm font-semibold text-[#16213e] transition-all duration-200 hover:bg-[#f5f5f5]">
                                                                    {logoFile ? logoFile.name : 'Choose file'}
                                                                    <input
                                                                        type="file"
                                                                        accept="image/*"
                                                                        onChange={handleLogoFileChange}
                                                                        className="hidden"
                                                                    />
                                                                </label>
                                                            </div>

                                                            {logoPreviewUrl ? (
                                                                <div className="mt-4 flex items-center gap-4">
                                                                    <div className="w-24 h-24 overflow-hidden rounded-xl border border-[#e3d7b9] bg-[#faf8f2]">
                                                                        <img
                                                                            src={logoPreviewUrl}
                                                                            alt="Logo preview"
                                                                            className="h-full w-full object-cover"
                                                                        />
                                                                    </div>
                                                                    <div className="flex-1 space-y-2">
                                                                        <p className="text-sm font-semibold text-[#16213e]">Preview</p>
                                                                        <p className="text-xs text-[#6b6b6b]">
                                                                            File upload preview will be saved when you click Save Changes.
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                )
                                            ) : capstoneDetail?.logo ? (
                                                <div className="flex flex-col items-start gap-3">
                                                    <img
                                                        src={capstoneDetail.logo}
                                                        alt={`${capstoneDetail.team_name} logo`}
                                                        className="w-22 h-22 max-w-full rounded-xl object-cover border border-[#e3d7b9]"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={handleRemoveLogo}
                                                        className="inline-flex items-center justify-center rounded-lg border border-[#e3d7b9] bg-[#fffef8] px-4 py-2 text-sm font-semibold text-[#16213e] transition-all duration-200 hover:bg-[#f5f5f5]"
                                                    >
                                                        Remove Logo
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="w-full rounded-xl border border-dashed border-[#c9a84c] bg-[#fffef8] p-4 text-sm text-[#6b6b6b] text-center">
                                                    No logo uploaded yet.
                                                </div>
                                            )}
                                        </div>
                                        <div className="bg-[#faf8f2] rounded-lg p-3 sm:p-4 border border-[#e3d7b9]">
                                            <label className="block text-xs font-semibold uppercase tracking-wide text-[#6b6b6b] mb-1 sm:mb-2">
                                                Created
                                            </label>
                                            <p className="text-sm sm:text-base text-[#16213e] font-semibold">{new Date(selectedCapstone.created_at).toLocaleDateString()}</p>
                                        </div>
                                    </div>

                                    {/* Edit/Save Buttons */}
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                                        {isEditingCapstone ? (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={handleCancelEditCapstone}
                                                    className="inline-flex items-center justify-center rounded-lg border border-[#d4c9a8] bg-white px-4 py-2 sm:px-5 sm:py-3 text-xs sm:text-sm font-semibold uppercase text-[#16213e] transition-all duration-200 hover:border-[#c9a84c] hover:text-[#16213e]"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={handleSaveCapstonDetails}
                                                    disabled={!editingTeamName.trim() || isSavingCapstone}
                                                    className="inline-flex items-center justify-center rounded-lg bg-[#c9a84c] px-4 py-2 sm:px-5 sm:py-3 text-xs sm:text-sm font-semibold uppercase text-white transition-all duration-200 hover:bg-[#b38b3d] disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    Save Changes
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={handleEditCapstone}
                                                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#16213e] px-4 py-2 sm:px-5 sm:py-3 text-xs sm:text-sm font-semibold uppercase text-white transition-all duration-200 hover:bg-[#0f1828]"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                </svg>
                                                Edit Details
                                            </button>
                                        )}
                                    </div>

                                    {/* Team Members */}
                                    <div className="border-t border-[#e3d7b9] pt-6">
                                        <div className="flex flex-row items-center justify-between gap-3 mb-4">
                                            <h3 className="text-lg sm:text-xl font-semibold text-[#16213e]">Team Members</h3>
                                            <button
                                                onClick={() => {
                                                    setAddMemberType('team');
                                                    setShowAddMemberForm(true);
                                                }}
                                                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#c9a84c] px-3 py-2 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold uppercase text-white transition-all duration-200 hover:bg-[#b38b3d]"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                </svg>
                                                <span className="hidden sm:inline">Add Student</span>
                                                <span className="inline sm:hidden">Add</span>
                                            </button>
                                        </div>
                                        <div className="overflow-x-auto rounded-lg border border-[#e3d7b9]">
                                            <table className="w-120 sm:w-auto min-w-full text-left border-collapse">
                                                <thead className="bg-[#f7f3e8]">
                                                    <tr>
                                                        <th className="w-1/15 px-2 sm:px-4 py-2 sm:py-3 text-xs uppercase tracking-wider text-[#6b6b6b]">ID</th>
                                                        <th className="w-3/10 px-2 sm:px-4 py-2 sm:py-3 text-xs uppercase tracking-wider text-[#6b6b6b]">Name</th>
                                                        <th className="w-3/10 px-2 sm:px-4 py-2 sm:py-3 text-xs uppercase tracking-wider text-[#6b6b6b]">Designation</th>
                                                        <th className="w-1/9 px-2 sm:px-4 py-2 sm:py-3 text-xs uppercase tracking-wider text-[#6b6b6b]">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {capstoneDetail.team_list.list.length > 0 ? (
                                                        capstoneDetail.team_list.list.map((member) => (
                                                            <tr key={member.member_id} className="border-t border-[#e3d7b9] odd:bg-[#ffffff] even:bg-[#fbf8f1]">
                                                                <td className="px-2 sm:px-4 py-2 sm:py-2 text-xs sm:text-sm text-[#16213e] whitespace-nowrap sm:whitespace-normal">{member.member_id}</td>
                                                                <td className="px-2 sm:px-4 py-2 sm:py-2 text-xs sm:text-sm text-[#16213e] whitespace-nowrap sm:whitespace-normal">{member.full_name}</td>
                                                                <td className="px-2 sm:px-4 py-2 sm:py-2 text-xs sm:text-sm text-[#16213e] whitespace-nowrap sm:whitespace-normal">{member.designation}</td>
                                                                <td className="px-2 sm:px-4 py-2 sm:py-2 whitespace-nowrap sm:whitespace-normal">
                                                                    <div className="flex flex-row gap-1 sm:gap-2">
                                                                        <button
                                                                            onClick={() => handleEditMember(member)}
                                                                            className="inline-flex items-center justify-center px-2 py-1 sm:px-3 sm:py-2 rounded text-xs sm:text-sm font-semibold uppercase text-blue-600 bg-blue-100 transition-all duration-200 hover:bg-blue-200"
                                                                            title="Edit"
                                                                        >
                                                                            <span className="hidden sm:inline">Edit</span>
                                                                            <span className="inline sm:hidden">✎</span>
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleRemoveMember(member.member_id)}
                                                                            className="inline-flex items-center justify-center px-2 py-1 sm:px-3 sm:py-2 rounded text-xs sm:text-sm font-semibold uppercase text-red-600 bg-red-100 transition-all duration-200 hover:bg-red-200"
                                                                            title="Delete"
                                                                        >
                                                                            <span className="hidden sm:inline">Delete</span>
                                                                            <span className="inline sm:hidden">✕</span>
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ))
                                                    ) : (
                                                        <tr>
                                                            <td colSpan={4} className="px-4 py-8 text-center text-xs sm:text-sm text-[#6b6b6b]">
                                                                No team members added yet.
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Panel Members */}
                                    <div className="border-t border-[#e3d7b9] pt-6">
                                        <div className="flex flex-row items-center justify-between gap-3 mb-4">
                                            <h3 className="text-lg sm:text-xl font-semibold text-[#16213e]">Panel Members</h3>
                                            <button
                                                onClick={() => {
                                                    setAddMemberType('panel');
                                                    setShowAddMemberForm(true);
                                                }}
                                                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#c9a84c] px-3 py-2 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold uppercase text-white transition-all duration-200 hover:bg-[#b38b3d]"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                </svg>
                                                <span className="hidden sm:inline">Add Panel</span>
                                                <span className="inline sm:hidden">Add</span>
                                            </button>
                                        </div>
                                        <div className="overflow-x-auto rounded-lg border border-[#e3d7b9]">
                                            <table className="w-120 sm:w-auto min-w-full text-left border-collapse">
                                                <thead className="bg-[#f7f3e8]">
                                                    <tr>
                                                        <th className="w-1/15 px-2 sm:px-4 py-2 sm:py-3 text-xs uppercase tracking-wider text-[#6b6b6b]">ID</th>
                                                        <th className="w-3/10 px-2 sm:px-4 py-2 sm:py-3 text-xs uppercase tracking-wider text-[#6b6b6b]">Name</th>
                                                        <th className="w-3/10 px-2 sm:px-4 py-2 sm:py-3 text-xs uppercase tracking-wider text-[#6b6b6b]">Designation</th>
                                                        <th className="w-1/9 px-2 sm:px-4 py-2 sm:py-3 text-xs uppercase tracking-wider text-[#6b6b6b]">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {capstoneDetail.panel_members.list.length > 0 ? (
                                                        capstoneDetail.panel_members.list.map((member) => (
                                                            <tr key={member.member_id} className="border-t border-[#e3d7b9] odd:bg-[#ffffff] even:bg-[#fbf8f1]">
                                                                <td className="px-2 sm:px-4 py-2 sm:py-2 text-xs sm:text-sm text-[#16213e] whitespace-nowrap">{member.member_id}</td>
                                                                <td className="px-2 sm:px-4 py-2 sm:py-2 text-xs sm:text-sm text-[#16213e] whitespace-nowrap">{member.full_name}</td>
                                                                <td className="px-2 sm:px-4 py-2 sm:py-2 text-xs sm:text-sm text-[#16213e]">{member.designation}</td>
                                                                <td className="px-2 sm:px-4 py-2 sm:py-2 whitespace-nowrap">
                                                                    <div className="flex flex-row gap-1 sm:gap-2">
                                                                        <button
                                                                            onClick={() => handleEditMember(member)}
                                                                            className="inline-flex items-center justify-center px-2 py-1 sm:px-3 sm:py-2 rounded text-xs sm:text-sm font-semibold uppercase text-blue-600 bg-blue-100 transition-all duration-200 hover:bg-blue-200"
                                                                            title="Edit"
                                                                        >
                                                                            <span className="hidden sm:inline">Edit</span>
                                                                            <span className="inline sm:hidden">✎</span>
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleRemoveMember(member.member_id)}
                                                                            className="inline-flex items-center justify-center px-2 py-1 sm:px-3 sm:py-2 rounded text-xs sm:text-sm font-semibold uppercase text-red-600 bg-red-100 transition-all duration-200 hover:bg-red-200"
                                                                            title="Delete"
                                                                        >
                                                                            <span className="hidden sm:inline">Delete</span>
                                                                            <span className="inline sm:hidden">✕</span>
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ))
                                                    ) : (
                                                        <tr>
                                                            <td colSpan={4} className="px-4 py-8 text-center text-xs sm:text-sm text-[#6b6b6b]">
                                                                No panel members added yet.
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Proposals */}
                                    <div className="border-t border-[#e3d7b9] pt-6">
                                        <div className="flex flex-row items-center justify-between gap-3 mb-4">
                                            <h3 className="text-lg sm:text-xl font-semibold text-[#16213e]">Proposals</h3>
                                            {hasMinimumMembers() ? (
                                                <button
                                                    onClick={handleOpenCreateProposalModal}
                                                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#c9a84c] px-3 py-2 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold uppercase text-white transition-all duration-200 hover:bg-[#b38b3d]"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                    </svg>
                                                    <span className="hidden sm:inline">Create Proposal</span>
                                                    <span className="inline sm:hidden">Add</span>
                                                </button>
                                            ) : null}
                                        </div>

                                        {!hasMinimumMembers() && (
                                            <div className="bg-[#fef3cd] border border-[#ffc107] rounded-lg p-4 mb-4">
                                                <p className="text-sm text-[#856404]">
                                                    ⚠️ Minimum requirements: At least <strong>4 Team Members</strong> and <strong>5 Panel Members</strong> are required to create proposals.
                                                </p>
                                                <p className="text-xs text-[#856404] mt-2">
                                                    Current: {capstoneDetail?.team_list.list.length || 0} Team Members, {capstoneDetail?.panel_members.list.length || 0} Panel Members
                                                </p>
                                            </div>
                                        )}

                                        {capstoneDetail?.proposals?.proposals && capstoneDetail.proposals.proposals.length > 0 ? (
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                {capstoneDetail.proposals.proposals.map((proposal: Proposal) => {
                                                    console.log('[DEBUG GRID] Processing proposal:', proposal.id, proposal.title, 'defense_eval:', proposal.defense_eval ? 'HAS DATA' : 'MISSING', 'keys:', Object.keys(proposal));
                                                    const totalSubmitted = calculateTotalSubmitted(proposal);
                                                    return (
                                                        <button
                                                            key={proposal.id}
                                                            onClick={() => {
                                                                console.log('[DEBUG CLICK] Proposal being passed to modal:', proposal);
                                                                console.log('[DEBUG CLICK] Proposal evaluation fields:', {
                                                                    defense_eval: proposal.defense_eval,
                                                                    team_self_eval: proposal.team_self_eval,
                                                                    team_oral_eval: proposal.team_oral_eval,
                                                                });
                                                                handleOpenProposalModal(proposal);
                                                            }}
                                                            className="bg-[#faf8f2] hover:bg-[#f5f0e0] rounded-lg border-2 border-[#e3d7b9] p-6 text-left transition-all duration-200 hover:border-[#c9a84c]"
                                                        >
                                                            <h4 className="text-lg font-semibold text-[#16213e] mb-3 line-clamp-2">{proposal.title}</h4>
                                                            <div className="space-y-2">
                                                                <div className="flex justify-between items-center">
                                                                    <span className="text-xs font-semibold uppercase text-[#6b6b6b]">Proposal ID:</span>
                                                                    <span className="text-sm font-bold text-[#0f3460]">#{proposal.id}</span>
                                                                </div>
                                                                <div className="flex justify-between items-center pt-2 border-t border-[#d4c9a8]">
                                                                    <span className="text-xs font-semibold uppercase text-[#6b6b6b]">Submitted:</span>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="inline-block px-3 py-1 rounded-full bg-[#0f3460] text-white text-sm font-bold">{totalSubmitted}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="bg-[#faf8f2] rounded-lg border border-[#e3d7b9] p-6 text-center">
                                                <p className="text-[#6b6b6b] text-sm">{hasMinimumMembers() ? 'No proposals created yet. Click "Create Proposal" to get started.' : 'No proposals available yet.'}</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Functions */}
                                    <div className="border-t border-[#e3d7b9] pt-6">
                                        <h3 className="text-lg sm:text-xl font-semibold text-[#16213e] mb-4">Functions</h3>
                                        <div className="flex flex-col sm:flex-row gap-3">
                                            <button
                                                onClick={handleGenerateMembersPDF}
                                                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#16213e] px-4 py-3 text-xs sm:text-sm font-semibold uppercase text-white transition-all duration-200 hover:bg-[#0f1828]"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                                </svg>
                                                Generate Members PDF
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-8">
                                    <p className="text-[#6b6b6b]">Unable to load capstone details.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Add Member Form Modal */}
            {showAddMemberForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
                    <div className="w-full max-w-md rounded-3xl bg-white shadow-xl overflow-hidden">
                        <div className="flex gap-3 border-b border-[#e3d7b9] p-4 sm:p-5 flex-row items-center justify-between">
                            <div>
                                <h2 className="text-xl font-semibold text-[#16213e]">
                                    Add {addMemberType === 'team' ? 'Team Member' : 'Panel Member'}
                                </h2>
                                <p className="text-sm text-[#6b6b6b]">Search and add a user to this capstone.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowAddMemberForm(false)}
                                className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#f0ebe0] text-[#16213e] transition-colors duration-200 hover:bg-[#c9a84c] hover:text-white"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="p-4 sm:p-6">
                            <div className="grid gap-4">
                                <div className="relative">
                                    <label htmlFor="user-search" className="block text-xs font-semibold uppercase tracking-wide text-[#6b6b6b] mb-2">
                                        Search User
                                    </label>
                                    <input
                                        id="user-search"
                                        type="text"
                                        value={userSearchQuery}
                                        onChange={(e) => handleSearchUsers(e.target.value)}
                                        onFocus={() => {
                                            setIsUserSearchFocused(true);
                                            handleSearchUsers(userSearchQuery);
                                        }}
                                        onBlur={() => {
                                            setTimeout(() => setIsUserSearchFocused(false), 150);
                                        }}
                                        autoComplete="off"
                                        placeholder="Type user full name..."
                                        className="w-full h-12 px-4 border border-[#d4c9a8] rounded-lg bg-[#faf8f2] text-sm text-[#1a1a2e] outline-none transition-all duration-200 focus:border-[#c9a84c] focus:bg-[#fffef8]"
                                    />
                                    
                                    {isSearchingUsers && (
                                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#d4c9a8] rounded-lg shadow-lg z-10">
                                            <div className="px-4 py-4 text-center">
                                                <div className="flex items-center justify-center">
                                                    <div className="relative h-6 w-6">
                                                        <div className="absolute inset-0 rounded-full border-2 border-[#e3d7b9]"></div>
                                                        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#c9a84c] animate-spin"></div>
                                                    </div>
                                                </div>
                                                <p className="mt-2 text-sm text-[#6b6b6b]">Searching users...</p>
                                            </div>
                                        </div>
                                    )}

                                    {!isSearchingUsers && (isUserSearchFocused || userSearchQuery.trim().length >= 2) && userSearchResults.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-[#d4c9a8] rounded-lg shadow-lg z-10">
                                            {userSearchResults.map((user) => (
                                                <button
                                                    key={user.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedUser(user);
                                                        setUserSearchQuery(user.full_name);
                                                        setUserSearchResults([]);
                                                    }}
                                                    className={`w-full text-left px-4 py-2.5 border-b border-[#e3d7b9] last:border-b-0 transition-all ${
                                                        selectedUser?.id === user.id
                                                            ? 'bg-[#c9a84c] text-white'
                                                            : 'bg-white text-[#16213e] hover:bg-[#f0ebe0]'
                                                    }`}
                                                >
                                                    <div className="text-sm font-semibold">{user.full_name}</div>
                                                    <div className="text-xs opacity-75">{user.role}</div>
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {!isSearchingUsers && userSearchQuery.trim().length >= 2 && userSearchResults.length === 0 && !selectedUser && (
                                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#d4c9a8] rounded-lg shadow-lg z-10">
                                            <div className="px-4 py-4 text-center">
                                                <p className="text-sm text-[#6b6b6b]">No users found.</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label htmlFor="designation" className="block text-xs font-semibold uppercase tracking-wide text-[#6b6b6b] mb-2">
                                        Designation {addMemberType === 'team' ? '(e.g., PROJECT MANAGER)' : '(e.g., Panel Chair)'}
                                    </label>
                                    <input
                                        id="designation"
                                        type="text"
                                        value={memberDesignation}
                                        onChange={(e) => setMemberDesignation(e.target.value)}
                                        autoComplete="off"
                                        placeholder="Enter designation..."
                                        className="w-full h-12 px-4 border border-[#d4c9a8] rounded-lg bg-[#faf8f2] text-sm text-[#1a1a2e] outline-none transition-all duration-200 focus:border-[#c9a84c] focus:bg-[#fffef8]"
                                    />
                                </div>

                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowAddMemberForm(false);
                                            setUserSearchQuery('');
                                            setUserSearchResults([]);
                                            setSelectedUser(null);
                                            setMemberDesignation('');
                                        }}
                                        className="inline-flex items-center justify-center rounded-lg border border-[#d4c9a8] bg-white px-5 py-3 text-sm font-semibold uppercase text-[#16213e] transition-all duration-200 hover:border-[#c9a84c] hover:text-[#16213e]"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleAddMember}
                                        disabled={!selectedUser || !memberDesignation.trim() || isAddingMember}
                                        className="inline-flex items-center justify-center rounded-lg bg-[#c9a84c] px-5 py-3 text-sm font-semibold uppercase text-white transition-all duration-200 hover:bg-[#b38b3d] disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        Add Member
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Member Modal */}
            {editingMemberId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
                    <div className="w-full max-w-md rounded-3xl bg-white shadow-xl overflow-hidden">
                        <div className="flex gap-3 border-b border-[#e3d7b9] p-4 sm:p-5 flex-row items-center justify-between">
                            <div>
                                <h2 className="text-xl font-semibold text-[#16213e]">Edit Member</h2>
                                <p className="text-sm text-[#6b6b6b]">Update member designation.</p>
                            </div>
                            <button
                                type="button"
                                onClick={handleCancelEditMember}
                                className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#f0ebe0] text-[#16213e] transition-colors duration-200 hover:bg-[#c9a84c] hover:text-white"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="p-4 sm:p-6">
                            <div className="grid gap-4">
                                <div>
                                    <label htmlFor="edit-designation" className="block text-xs font-semibold uppercase tracking-wide text-[#6b6b6b] mb-2">
                                        Designation
                                    </label>
                                    <input
                                        id="edit-designation"
                                        type="text"
                                        value={editingDesignation}
                                        onChange={(e) => setEditingDesignation(e.target.value)}
                                        placeholder="Enter designation..."
                                        className="w-full h-12 px-4 border border-[#d4c9a8] rounded-lg bg-[#faf8f2] text-sm text-[#1a1a2e] outline-none transition-all duration-200 focus:border-[#c9a84c] focus:bg-[#fffef8]"
                                    />
                                </div>

                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                                    <button
                                        type="button"
                                        onClick={handleCancelEditMember}
                                        className="inline-flex items-center justify-center rounded-lg border border-[#d4c9a8] bg-white px-5 py-3 text-sm font-semibold uppercase text-[#16213e] transition-all duration-200 hover:border-[#c9a84c] hover:text-[#16213e]"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSaveEditMember}
                                        disabled={!editingDesignation.trim()}
                                        className="inline-flex items-center justify-center rounded-lg bg-[#c9a84c] px-5 py-3 text-sm font-semibold uppercase text-white transition-all duration-200 hover:bg-[#b38b3d] disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        Save Changes
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Create Proposal Modal */}
            {showCreateProposalModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
                    <div className="w-full max-w-md rounded-3xl bg-white shadow-xl overflow-hidden">
                        <div className="flex gap-3 border-b border-[#e3d7b9] p-4 sm:p-5 flex-row items-center justify-between">
                            <div>
                                <h2 className="text-xl font-semibold text-[#16213e]">Create Proposal</h2>
                                <p className="text-sm text-[#6b6b6b]">Add a new proposal to this capstone.</p>
                            </div>
                            <button
                                type="button"
                                onClick={handleCancelCreateProposal}
                                className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#f0ebe0] text-[#16213e] transition-colors duration-200 hover:bg-[#c9a84c] hover:text-white"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="p-4 sm:p-6">
                            <div className="grid gap-4">
                                <div>
                                    <label htmlFor="proposal-title" className="block text-xs font-semibold uppercase tracking-wide text-[#6b6b6b] mb-2">
                                        Proposal Title
                                    </label>
                                    <input
                                        id="proposal-title"
                                        type="text"
                                        value={proposalTitle}
                                        onChange={(e) => setProposalTitle(e.target.value)}
                                        placeholder="Enter proposal title..."
                                        autoComplete="off"
                                        className="w-full h-12 px-4 border border-[#d4c9a8] rounded-lg bg-[#faf8f2] text-sm text-[#1a1a2e] outline-none transition-all duration-200 focus:border-[#c9a84c] focus:bg-[#fffef8]"
                                    />
                                </div>

                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                                    <button
                                        type="button"
                                        onClick={handleCancelCreateProposal}
                                        className="inline-flex items-center justify-center rounded-lg border border-[#d4c9a8] bg-white px-5 py-3 text-sm font-semibold uppercase text-[#16213e] transition-all duration-200 hover:border-[#c9a84c] hover:text-[#16213e]"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleCreateProposal}
                                        disabled={!proposalTitle.trim() || isCreatingProposal}
                                        className="inline-flex items-center justify-center rounded-lg bg-[#c9a84c] px-5 py-3 text-sm font-semibold uppercase text-white transition-all duration-200 hover:bg-[#b38b3d] disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        Create Proposal
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Proposal View Modal */}
            {isViewProposalModalOpen && selectedProposal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
                    <div className="w-full max-w-4xl max-h-[90vh] rounded-3xl bg-white shadow-xl overflow-hidden flex flex-col">
                        <div className="flex gap-3 border-b border-[#e3d7b9] p-4 sm:p-5 flex-row items-center justify-between shrink-0">
                            <h2 className="text-lg sm:text-xl font-semibold text-[#16213e]">Proposal Details</h2>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleDeleteProposal}
                                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                                    title="Delete Proposal"
                                >
                                    🗑️
                                </button>
                                <button
                                    onClick={handleCloseProposalModal}
                                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#f0f0f0] text-[#6b6b6b] hover:bg-[#e0e0e0] transition-colors"
                                    title="Close"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        <div className="p-4 sm:p-6 overflow-y-auto">
                            {/* Proposal Header */}
                            <div className="mb-6">
                                {isEditingProposalTitle ? (
                                    <div className="flex gap-2 mb-4">
                                        <input
                                            type="text"
                                            value={editingProposalTitle}
                                            onChange={(e) => setEditingProposalTitle(e.target.value)}
                                            className="flex-1 px-4 py-2 border-2 border-[#c9a84c] rounded-lg font-semibold text-lg focus:outline-none focus:border-[#b38b3d] text-black"
                                            placeholder="Enter proposal title"
                                            autoFocus
                                        />
                                        <button
                                            onClick={handleSaveProposalTitle}
                                            disabled={!editingProposalTitle.trim() || editingProposalTitle.trim() === selectedProposal.title}
                                            className="px-4 py-2 bg-green-500 text-white rounded-lg font-semibold hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            Save
                                        </button>
                                        <button
                                            onClick={handleCancelEditProposalTitle}
                                            className="px-4 py-2 bg-[#6b6b6b] text-white rounded-lg font-semibold hover:bg-[#505050] transition-colors"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex gap-3 items-start mb-4">
                                        <h3 className="text-2xl font-bold text-[#16213e]">{selectedProposal.title}</h3>
                                        <button
                                            onClick={handleEditProposalTitle}
                                            className="mt-1 px-3 py-1 bg-[#c9a84c] text-white rounded-lg text-sm font-semibold hover:bg-[#b38b3d] transition-colors"
                                        >
                                            Edit
                                        </button>
                                    </div>
                                )}
                                <div className="flex gap-4 flex-wrap">
                                    <div>
                                        <p className="text-xs font-semibold uppercase text-[#6b6b6b]">Proposal ID</p>
                                        <p className="text-lg font-bold text-[#0f3460]">#{selectedProposal.id}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold uppercase text-[#6b6b6b]">Total Submitted</p>
                                        <p className="text-lg font-bold text-[#0f3460]">{calculateTotalSubmitted(selectedProposal)}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Evaluation Types */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                {/* Defense Evaluation */}
                                <div className="border-2 border-[#e3d7b9] rounded-lg p-4">
                                    <h4 className="text-base font-semibold text-[#16213e] mb-3">Proposal Defense Evaluation</h4>
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-[#6b6b6b]">Total Submitted:</span>
                                            <span className="font-bold text-[#0f3460]">{getEvaluationData(selectedProposal.defense_eval)?.forms?.filter((f: EvaluationForm) => f.is_submitted).length || 0}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-[#6b6b6b]">Total Forms:</span>
                                            <span className="font-bold text-[#0f3460]">{getEvaluationData(selectedProposal.defense_eval)?.forms?.length || 0}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Team Self Evaluation */}
                                <div className="border-2 border-[#e3d7b9] rounded-lg p-4">
                                    <h4 className="text-base font-semibold text-[#16213e] mb-3">Peer & Self Evaluation</h4>
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-[#6b6b6b]">Total Submitted:</span>
                                            <span className="font-bold text-[#0f3460]">{getEvaluationData(selectedProposal.team_self_eval)?.forms?.filter((f: EvaluationForm) => f.is_submitted).length || 0}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-[#6b6b6b]">Total Forms:</span>
                                            <span className="font-bold text-[#0f3460]">{getEvaluationData(selectedProposal.team_self_eval)?.forms?.length || 0}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Oral Presentation Evaluation */}
                                <div className="border-2 border-[#e3d7b9] rounded-lg p-4">
                                    <h4 className="text-base font-semibold text-[#16213e] mb-3">Oral Presentation Evaluation</h4>
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-[#6b6b6b]">Total Submitted:</span>
                                            <span className="font-bold text-[#0f3460]">{getEvaluationData(selectedProposal.team_oral_eval)?.forms?.filter((f: EvaluationForm) => f.is_submitted).length || 0}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-[#6b6b6b]">Total Forms:</span>
                                            <span className="font-bold text-[#0f3460]">{getEvaluationData(selectedProposal.team_oral_eval)?.forms?.length || 0}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Form Submissions Details */}
                            <div className="space-y-6">
                                {/* Defense Submissions */}
                                {(() => {
                                    const defenseEval = getEvaluationData(selectedProposal.defense_eval);
                                    return defenseEval?.forms && defenseEval.forms.length > 0 && (
                                        <div>
                                            <h4 className="text-lg font-semibold text-[#16213e] mb-3 pb-2 border-b border-[#e3d7b9]">Proposal Defense Submissions</h4>
                                            <div className="space-y-2">
                                                {defenseEval.forms.map((form, idx) => (
                                                <div key={idx} className="flex items-center justify-between p-3 bg-[#faf8f2] rounded-lg border border-[#e3d7b9]">
                                                    <div>
                                                        <p className="font-semibold text-[#16213e]">{form.full_name}</p>
                                                        <p className="text-xs text-[#6b6b6b]">{form.designation}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {form.is_submitted ? (
                                                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
                                                                ✓ Submitted
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-yellow-100 text-yellow-700 text-xs font-semibold">
                                                                ⋯ Pending
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    );
                                })()}

                                {/* Team Self Eval Submissions */}
                                {(() => {
                                    const selfEval = getEvaluationData(selectedProposal.team_self_eval);
                                    return selfEval?.forms && selfEval.forms.length > 0 && (
                                        <div>
                                            <h4 className="text-lg font-semibold text-[#16213e] mb-3 pb-2 border-b border-[#e3d7b9]">Peer & Self Evaluation Submissions</h4>
                                            <div className="space-y-2">
                                                {selfEval.forms.map((form, idx) => (
                                                <div key={idx} className="flex items-center justify-between p-3 bg-[#faf8f2] rounded-lg border border-[#e3d7b9]">
                                                    <div>
                                                        <p className="font-semibold text-[#16213e]">{form.full_name}</p>
                                                        <p className="text-xs text-[#6b6b6b]">{form.designation}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {form.is_submitted ? (
                                                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
                                                                ✓ Submitted
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-yellow-100 text-yellow-700 text-xs font-semibold">
                                                                ⋯ Pending
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    );
                                })()}

                                {/* Oral Presentation Submissions */}
                                {(() => {
                                    const oralEval = getEvaluationData(selectedProposal.team_oral_eval);
                                    return oralEval?.forms && oralEval.forms.length > 0 && (
                                        <div>
                                            <h4 className="text-lg font-semibold text-[#16213e] mb-3 pb-2 border-b border-[#e3d7b9]">Oral Presentation Submissions</h4>
                                            <div className="space-y-2">
                                                {oralEval.forms.map((form, idx) => (
                                                <div key={idx} className="flex items-center justify-between p-3 bg-[#faf8f2] rounded-lg border border-[#e3d7b9]">
                                                    <div>
                                                        <p className="font-semibold text-[#16213e]">{form.full_name}</p>
                                                        <p className="text-xs text-[#6b6b6b]">{form.designation}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {form.is_submitted ? (
                                                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
                                                                ✓ Submitted
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-yellow-100 text-yellow-700 text-xs font-semibold">
                                                                ⋯ Pending
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Max Members Modal */}
            {showMaxMembersModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
                    <div className="w-full max-w-md rounded-3xl bg-white shadow-xl overflow-hidden">
                        <div className="flex gap-3 border-b border-[#e3d7b9] p-4 sm:p-5 flex-row items-center justify-between shrink-0">
                            <h2 className="text-lg sm:text-xl font-semibold text-[#16213e]">
                                {maxMembersModalContext === 'proposal' 
                                    ? 'Maximum Members Reached' 
                                    : `Cannot Add ${maxMembersModalMemberType === 'team' ? 'Team' : 'Panel'} Member`}
                            </h2>
                            <button
                                onClick={() => setShowMaxMembersModal(false)}
                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#f0f0f0] text-[#6b6b6b] hover:bg-[#e0e0e0] transition-colors"
                                title="Close"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-4 sm:p-6">
                            <p className="text-base text-[#6b6b6b] mb-6">
                                {maxMembersModalContext === 'proposal' ? (
                                    <>You have reached the maximum number of team members (8) and panel members (6). 
                                    You cannot create new proposals until you reduce the member count or delete existing proposals.</>
                                ) : (
                                    <>You have reached the maximum of {maxMembersModalMemberType === 'team' ? '8 team members' : '6 panel members'}. 
                                    Please remove a member before adding a new one.</>
                                )}
                            </p>

                            <div className="flex gap-3 justify-end">
                                <button
                                    type="button"
                                    onClick={() => setShowMaxMembersModal(false)}
                                    className="inline-flex items-center justify-center rounded-lg bg-[#6b6b6b] px-5 py-3 text-sm font-semibold uppercase text-white transition-all duration-200 hover:bg-[#505050]"
                                >
                                    Understood
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {processingStatus !== 'idle' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
                    <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
                        <div className="flex flex-col items-center text-center">
                            {processingStatus === 'processing' && (
                                <>
                                    <div className="mb-4 flex items-center justify-center">
                                        <div className="relative h-16 w-16">
                                            <div className="absolute inset-0 rounded-full border-4 border-[#e3d7b9]"></div>
                                            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#c9a84c] animate-spin"></div>
                                        </div>
                                    </div>
                                    <h3 className="text-lg font-semibold text-[#16213e]">{processingTitle}</h3>
                                    <p className="mt-2 text-sm text-[#6b6b6b]">{processingMessage}</p>
                                </>
                            )}

                            {processingStatus === 'success' && (
                                <>
                                    <div className="mb-4 flex items-center justify-center">
                                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                                            <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                        </div>
                                    </div>
                                    <h3 className="text-lg font-semibold text-[#16213e]">Success</h3>
                                    <p className="mt-2 text-sm text-[#6b6b6b]">{processingMessage}</p>
                                </>
                            )}

                            {processingStatus === 'failure' && (
                                <>
                                    <div className="mb-4 flex items-center justify-center">
                                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                                            <svg className="h-8 w-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </div>
                                    </div>
                                    <h3 className="text-lg font-semibold text-[#16213e]">Error</h3>
                                    <p className="mt-2 text-sm text-[#6b6b6b]">{processingMessage}</p>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}