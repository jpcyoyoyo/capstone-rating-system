import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Head, usePage } from '@inertiajs/react';
import AdminSidebar from '../../components/AdminSidebar';

interface UserProps {
    id: number;
    full_name: string;
    role: string;
}

interface UserDetails extends UserProps {
    username: string;
    gen_pass: string;
    created_at: string;
}

interface PreviewColumn {
    key: string;
    label: string;
    options: string[];
}

interface PreviewRow {
    first_name: string;
    last_name: string;
    middle_initial: string;
    full_name: string;
    ignored: boolean;
    extra: Record<string, string>;
}

interface MassActionResult {
    success: number;
    failed: number;
}

export default function Users() {
    const { props } = usePage<{ users: UserProps[] }>();
    const [usersList, setUsersList] = useState<UserProps[]>(props.users ?? []);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedRole, setSelectedRole] = useState<'All' | 'Student' | 'Panel'>('All');
    const [currentPage, setCurrentPage] = useState(1);
    const [showViewModal, setShowViewModal] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [activeUserId, setActiveUserId] = useState<number | null>(null);
    const [activeTab, setActiveTab] = useState<'Student' | 'Panel'>('Student');
    const [formValues, setFormValues] = useState({ first_name: '', middle_initial: '', last_name: '' });
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
    const [previewColumns, setPreviewColumns] = useState<PreviewColumn[]>([]);
    const [previewFilters, setPreviewFilters] = useState<Record<string, string>>({});
    const [uploadErrors, setUploadErrors] = useState('');
    const [previewIgnoredCount, setPreviewIgnoredCount] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    const [showMassConfirm, setShowMassConfirm] = useState(false);
    const [massResult, setMassResult] = useState<MassActionResult | null>(null);
    const [successMessage, setSuccessMessage] = useState('');
    const [showMessageModal, setShowMessageModal] = useState(false);
    const [csrfToken, setCsrfToken] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [processingStatus, setProcessingStatus] = useState<'idle' | 'processing' | 'success' | 'failure'>('idle');
    const [processingMessage, setProcessingMessage] = useState('');
    const [processingTitle, setProcessingTitle] = useState('');
    const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
    const [isLoadingUserDetails, setIsLoadingUserDetails] = useState(false);

    useEffect(() => {
        if (typeof document !== 'undefined') {
            setCsrfToken(document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? '');
        }
    }, []);

    const getCsrfToken = () => {
        if (typeof document !== 'undefined') {
            return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? csrfToken;
        }
        return csrfToken;
    };

    const filteredUsers = useMemo(() => {
        return usersList.filter((user) => {
            const matchesRole = selectedRole === 'All' || user.role === selectedRole;
            const matchesSearch = searchQuery.trim() === '' || user.full_name.toLowerCase().includes(searchQuery.trim().toLowerCase());
            return matchesRole && matchesSearch;
        });
    }, [usersList, selectedRole, searchQuery]);

    const itemsPerPage = 10;
    const totalPages = Math.max(1, Math.ceil(filteredUsers.length / itemsPerPage));
    const paginatedUsers = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredUsers.slice(start, start + itemsPerPage);
    }, [filteredUsers, currentPage]);

    const previewFilteredRows = useMemo(() => {
        return previewRows.filter((row) => {
            return Object.entries(previewFilters).every(([columnKey, selectedValue]) => {
                if (selectedValue === 'All' || selectedValue === '') {
                    return true;
                }
                return row.extra[columnKey] === selectedValue;
            });
        });
    }, [previewRows, previewFilters]);

    const resetCreateModal = () => {
        setActiveTab('Student');
        setFormValues({ first_name: '', middle_initial: '', last_name: '' });
        setFormErrors({});
        setUploadFile(null);
        setPreviewRows([]);
        setPreviewColumns([]);
        setPreviewFilters({});
        setUploadErrors('');
        setMassResult(null);
        setShowMassConfirm(false);
    };

    const showTemporaryMessage = (message: string) => {
        setSuccessMessage(message);
        setShowMessageModal(true);
        window.setTimeout(() => {
            setShowMessageModal(false);
            setShowAddModal(false);
            resetCreateModal();
        }, 3200);
    };

    const handleRoleFilter = (role: 'All' | 'Student' | 'Panel') => {
        setSelectedRole(role);
        setCurrentPage(1);
    };

    const openViewModal = async (userId: number) => {
        setActiveUserId(userId);
        setShowViewModal(true);
        setIsLoadingUserDetails(true);
        
        try {
            const response = await fetch(`/admin/users/${userId}`);
            if (response.ok) {
                const data = await response.json();
                setUserDetails(data);
            } else {
                console.error('Failed to fetch user details');
            }
        } catch (error) {
            console.error('Error fetching user details:', error);
        } finally {
            setIsLoadingUserDetails(false);
        }
    };

    const closeViewModal = () => {
        setShowViewModal(false);
        setActiveUserId(null);
        setUserDetails(null);
    };

    const handleSimpleCreate = async () => {
        setFormErrors({});
        setIsSubmitting(true);
        setProcessingStatus('processing');
        setProcessingTitle('Creating User');
        setProcessingMessage(`Creating ${activeTab}...`);

        const token = getCsrfToken();
        if (!token) {
            setFormErrors({ full_name: 'CSRF token not found. Please reload the page.' });
            setIsSubmitting(false);
            setProcessingStatus('idle');
            return;
        }

        try {
            const response = await fetch('/admin/users/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': token,
                },
                body: JSON.stringify({
                    first_name: formValues.first_name,
                    middle_initial: formValues.middle_initial,
                    last_name: formValues.last_name,
                    role: activeTab,
                }),
            });

            const text = await response.text();
            let data: any = null;
            try {
                data = JSON.parse(text);
            } catch (_error) {
                data = null;
            }

            if (!response.ok) {
                setProcessingStatus('failure');
                setProcessingMessage(data?.errors?.full_name || data?.message || 'Failed to create user.');
                setTimeout(() => {
                    setProcessingStatus('idle');
                    if (data?.errors) {
                        setFormErrors(data.errors);
                    } else if (response.status === 419) {
                        setFormErrors({ full_name: 'Page expired. Please reload and try again.' });
                    } else {
                        const message = data?.message || text || 'Unable to create user.';
                        setFormErrors({ full_name: message });
                    }
                }, 2000);
                return;
            }

            if (data?.createdUser) {
                setUsersList((current) => [...current, data.createdUser]);
            }
            setProcessingStatus('success');
            setProcessingMessage(`${activeTab} created successfully!`);
            setTimeout(() => {
                setProcessingStatus('idle');
                setShowAddModal(false);
                resetCreateModal();
            }, 2000);
        } catch (error) {
            setProcessingStatus('failure');
            setProcessingMessage('Unable to create user at this time.');
            setTimeout(() => {
                setProcessingStatus('idle');
                setFormErrors({ full_name: 'Unable to create user at this time.' });
            }, 2000);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUploadPreview = async () => {
        if (!uploadFile) {
            setUploadErrors('Please select an Excel or CSV file first.');
            return;
        }

        setUploadErrors('');
        setIsUploading(true);

        try {
            const formData = new FormData();
            formData.append('student_file', uploadFile);

            const response = await fetch('/admin/users/upload-preview', {
                method: 'POST',
                headers: {
                    'X-CSRF-TOKEN': getCsrfToken(),
                },
                body: formData,
            });

            const data = await response.json();

            if (!response.ok) {
                setUploadErrors(data.errors?.student_file || data.message || 'Unable to parse uploaded file.');
                return;
            }

            setPreviewRows(data.previewRows || []);
            setPreviewColumns(data.filterColumns || []);
            setPreviewIgnoredCount(data.previewRows?.filter((row: PreviewRow) => row.ignored).length ?? 0);
            const initialFilters: Record<string, string> = {};
            (data.filterColumns || []).forEach((column: PreviewColumn) => {
                initialFilters[column.key] = 'All';
            });
            setPreviewFilters(initialFilters);
        } catch (error) {
            setUploadErrors('Unable to parse the file. Ensure it is a valid XLSX or CSV document.');
        } finally {
            setIsUploading(false);
        }
    };

    const handleMassCreate = async () => {
        setShowMassConfirm(false);
        setIsUploading(true);
        setProcessingStatus('processing');
        setProcessingTitle('Creating Students');
        setProcessingMessage(`Creating ${previewFilteredRows.length} students...`);

        try {
            const response = await fetch('/admin/users/mass-create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': getCsrfToken(),
                },
                body: JSON.stringify({ rows: previewFilteredRows }),
            });

            const data = await response.json();

            if (!response.ok) {
                setProcessingStatus('failure');
                setProcessingMessage(data?.errors?.rows ? data.errors.rows[0] : data.message || 'Unable to create users.');
                setTimeout(() => {
                    setProcessingStatus('idle');
                    setUploadErrors(data.errors?.rows ? data.errors.rows[0] : data.message || 'Unable to create users.');
                }, 2000);
                return;
            }

            if (data.createdUsers) {
                setUsersList((current) => [...current, ...data.createdUsers]);
            }
            setMassResult({ success: data.success ?? 0, failed: data.failed ?? 0 });
            setProcessingStatus('success');
            setProcessingMessage(`Batch complete! ${data.success ?? 0} created, ${data.failed ?? 0} failed.`);
            setTimeout(() => {
                setProcessingStatus('idle');
                resetCreateModal();
                setShowAddModal(false);
            }, 2000);
        } catch (error) {
            setProcessingStatus('failure');
            setProcessingMessage('Unable to create users at this time.');
            setTimeout(() => {
                setProcessingStatus('idle');
                setUploadErrors('Unable to create users at this time.');
            }, 2000);
        } finally {
            setIsUploading(false);
        }
    };

    const previewSummaryText = previewRows.length > 0 ? `${previewFilteredRows.length} of ${previewRows.length} previewed students` : '';

    return (
        <>
            <Head title="Users Management" />
            <div className="flex min-h-screen bg-[#f0ebe0] text-[#1a1a2e] font-['Source_Sans_3',sans-serif]">
                <AdminSidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} currentPage="users" />

                <div className="flex-1 w-full lg:ml-64">
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
                            <div className="text-center mb-4 lg:mb-10">
                                <div className="font-['Source_Sans_3',sans-serif] font-light text-xs tracking-widest uppercase text-[#c9a84c] mb-2">
                                    USER MANAGEMENT
                                </div>
                                <h1 className="font-['Libre_Baskerville',serif] text-xl sm:text-2xl md:text-3xl lg:text-4xl text-[#16213e] leading-tight font-bold m-0">
                                    Manage System Users
                                </h1>
                                <div className="w-12 sm:w-15 h-0.5 bg-[#c9a84c] mx-auto my-3 lg:my-4"></div>
                            </div>

                            <div className="bg-white rounded-lg border border-[#d4c9a8] p-4 sm:p-6 lg:p-7 mb-4 lg:mb-6 shadow-md">
                                <h2 className="font-['Libre_Baskerville',serif] text-sm font-bold text-[#0f3460] uppercase tracking-wide border-b border-[#d4c9a8] pb-3 mb-4 lg:mb-5 mt-0">
                                    User List
                                </h2>
                                <p className="text-[#6b6b6b] leading-relaxed text-sm sm:text-base">
                                    View and manage all users in the system. Search, filter, or add new student and panel accounts.
                                </p>
                            </div>

                            <div className="bg-white rounded-lg border border-[#d4c9a8] p-4 sm:p-6 lg:p-7 shadow-md">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
                                    <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-3">
                                        <div className="relative flex-1">
                                            <label htmlFor="user-search" className="sr-only">Search users</label>
                                            <input
                                                id="user-search"
                                                type="text"
                                                value={searchQuery}
                                                onChange={(e) => {
                                                    setSearchQuery(e.target.value);
                                                    setCurrentPage(1);
                                                }}
                                                placeholder="Search by full name"
                                                className="w-full h-12 px-4 border border-[#d4c9a8] rounded-lg bg-[#faf8f2] text-sm text-[#1a1a2e] outline-none transition-all duration-200 focus:border-[#c9a84c] focus:bg-[#fffef8]"
                                            />
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                            {(['All', 'Student', 'Panel'] as const).map((role) => (
                                                <button
                                                    key={role}
                                                    type="button"
                                                    onClick={() => handleRoleFilter(role)}
                                                    className={`px-4 py-2 text-xs font-semibold uppercase rounded-lg transition-all duration-200 ${
                                                        selectedRole === role
                                                            ? 'bg-[#0f3460] text-white'
                                                            : 'bg-[#f0ebe0] text-[#16213e] hover:bg-[#c9a84c] hover:text-white'
                                                    }`}
                                                >
                                                    {role}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowAddModal(true);
                                            resetCreateModal();
                                        }}
                                        className="inline-flex items-center justify-center gap-2 min-h-12 px-5 rounded-lg bg-[#0f3460] text-white text-sm font-semibold uppercase transition-all duration-200 hover:bg-[#16213e]"
                                    >
                                        Add User
                                    </button>
                                </div>

                                <div className="overflow-x-auto rounded-lg border border-[#e3d7b9]">
                                    <table className="min-w-full text-left border-collapse">
                                        <thead className="bg-[#f7f3e8]">
                                            <tr>
                                                <th className="px-4 py-3 text-xs uppercase tracking-wider text-[#6b6b6b]"><span className='hidden sm:inline'>User </span>ID</th>
                                                <th className="px-4 py-3 text-xs uppercase tracking-wider text-[#6b6b6b]">Full Name</th>
                                                <th className="px-4 py-3 text-xs uppercase tracking-wider text-[#6b6b6b]">Role</th>
                                                <th className="px-4 py-3 text-xs uppercase tracking-wider text-[#6b6b6b]">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {paginatedUsers.length > 0 ? (
                                                paginatedUsers.map((user) => (
                                                    <tr key={user.id} className="border-t border-[#e3d7b9] odd:bg-[#ffffff] even:bg-[#fbf8f1]">
                                                        <td className="px-4 py-2 text-sm text-[#16213e] whitespace-nowrap sm:whitespace-normal">{user.id}</td>
                                                        <td className="px-4 py-2 text-sm text-[#16213e] whitespace-nowrap sm:whitespace-normal">{user.full_name}</td>
                                                        <td className="px-4 py-2 text-sm text-[#1a1a2e] uppercase tracking-[0.04em] whitespace-nowrap sm:whitespace-normal">{user.role}</td>
                                                        <td className="px-4 py-2 whitespace-nowrap sm:whitespace-normal">
                                                            <button
                                                                type="button"
                                                                onClick={() => openViewModal(user.id)}
                                                                className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-[#c9a84c] text-sm font-semibold uppercase text-white transition-all duration-200 hover:bg-[#b38b3d]"
                                                            >
                                                                View
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-[#6b6b6b]">
                                                        No users match your search or filter.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <p className="text-sm text-[#6b6b6b]">
                                        Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredUsers.length)} of {filteredUsers.length} users
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
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {showViewModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
                    <div className="w-full max-w-2xl rounded-3xl bg-white shadow-xl overflow-hidden">
                        <div className="flex gap-3 border-b border-[#e3d7b9] p-4 sm:p-5 flex-row items-center justify-between">
                            <div>
                                <h2 className="text-xl font-semibold text-[#16213e]">User Details</h2>
                                <p className="text-sm text-[#6b6b6b]">View complete user information.</p>
                            </div>
                            <button
                                type="button"
                                onClick={closeViewModal}
                                className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#f0ebe0] text-[#16213e] transition-colors duration-200 hover:bg-[#c9a84c] hover:text-white"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-4 sm:p-6">
                            {isLoadingUserDetails ? (
                                <div className="flex items-center justify-center py-8">
                                    <div className="text-sm text-[#6b6b6b]">Loading user details...</div>
                                </div>
                            ) : userDetails ? (
                                <div className="grid gap-6">
                                    <div className="grid gap-4 grid-cols-2">
                                        <div>
                                            <label className="block text-xs font-semibold uppercase tracking-wide text-[#6b6b6b] mb-2">
                                                User ID
                                            </label>
                                            <div className="px-4 py-3 rounded-lg bg-[#faf8f2] border border-[#e3d7b9] text-sm text-[#16213e]">
                                                {userDetails.id}
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-semibold uppercase tracking-wide text-[#6b6b6b] mb-2">
                                                Role
                                            </label>
                                            <div className="px-4 py-2.5 rounded-lg bg-[#faf8f2] border border-[#e3d7b9] text-sm text-[#16213e] font-semibold">
                                                <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold uppercase ${
                                                    userDetails.role === 'Student'
                                                        ? 'bg-[#e3f2fd] text-[#1976d2]'
                                                        : 'bg-[#f3e5f5] text-[#7b1fa2]'
                                                }`}>
                                                    {userDetails.role}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold uppercase tracking-wide text-[#6b6b6b] mb-2">
                                            Full Name
                                        </label>
                                        <div className="px-4 py-3 rounded-lg bg-[#faf8f2] border border-[#e3d7b9] text-sm text-[#16213e]">
                                            {userDetails.full_name}
                                        </div>
                                    </div>

                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div>
                                            <label className="block text-xs font-semibold uppercase tracking-wide text-[#6b6b6b] mb-2">
                                                Username
                                            </label>
                                            <div className="px-4 py-3 rounded-lg bg-[#faf8f2] border border-[#e3d7b9] text-sm text-[#16213e] font-mono">
                                                {userDetails.username || '—'}
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-semibold uppercase tracking-wide text-[#6b6b6b] mb-2">
                                                Generated Password
                                            </label>
                                            <div className="px-4 py-3 rounded-lg bg-[#faf8f2] border border-[#e3d7b9] text-sm text-[#16213e] font-mono">
                                                {userDetails.gen_pass || '—'}
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold uppercase tracking-wide text-[#6b6b6b] mb-2">
                                            Created At
                                        </label>
                                        <div className="px-4 py-3 rounded-lg bg-[#faf8f2] border border-[#e3d7b9] text-sm text-[#6b6b6b]">
                                            {userDetails.created_at}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-8">
                                    <p className="text-sm text-[#c0392b]">Failed to load user details.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
                    <div className="w-full max-w-3xl max-h-[90vh] rounded-3xl bg-white shadow-xl overflow-hidden flex flex-col">
                        <div className="flex gap-3 border-b border-[#e3d7b9] p-4 sm:p-5 flex-row items-center justify-between shrink-0">
                            <div>
                                <h2 className="text-xl font-semibold text-[#16213e]">Create User</h2>
                                <p className="text-sm text-[#6b6b6b]">Choose role and add a new account.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowAddModal(false)}
                                className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#f0ebe0] text-[#16213e] transition-colors duration-200 hover:bg-[#c9a84c] hover:text-white"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
                            <div className="flex flex-wrap gap-3 mb-6">
                                {(['Student', 'Panel'] as const).map((tab) => (
                                    <button
                                        key={tab}
                                        type="button"
                                        onClick={() => setActiveTab(tab)}
                                        className={`rounded-full px-5 py-2 text-sm font-semibold uppercase transition-all duration-200 ${
                                            activeTab === tab
                                                ? 'bg-[#0f3460] text-white'
                                                : 'bg-[#f0ebe0] text-[#16213e] hover:bg-[#c9a84c] hover:text-white'
                                        }`}
                                    >
                                        {tab}
                                    </button>
                                ))}
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div>
                                    <label htmlFor="first-name" className="block text-xs font-semibold uppercase tracking-wide text-[#6b6b6b] mb-2">
                                        First Name
                                    </label>
                                    <input
                                        id="first-name"
                                        type="text"
                                        value={formValues.first_name}
                                        onChange={(e) => setFormValues((prev) => ({ ...prev, first_name: e.target.value }))}
                                        className="w-full h-12 px-4 border border-[#d4c9a8] rounded-lg bg-[#faf8f2] text-sm text-[#1a1a2e] outline-none transition-all duration-200 focus:border-[#c9a84c] focus:bg-[#fffef8]"
                                    />
                                    {formErrors.first_name && <p className="mt-2 text-sm text-[#c0392b]">{formErrors.first_name}</p>}
                                </div>
                                <div>
                                    <label htmlFor="middle-initial" className="block text-xs font-semibold uppercase tracking-wide text-[#6b6b6b] mb-2">
                                        Middle Initial
                                    </label>
                                    <input
                                        id="middle-initial"
                                        type="text"
                                        value={formValues.middle_initial}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            // Only allow single alphabetic character
                                            if (value === '' || /^[A-Za-z]$/.test(value)) {
                                                setFormValues((prev) => ({ ...prev, middle_initial: value.toUpperCase() }));
                                            }
                                        }}
                                        maxLength={1}
                                        className="w-full h-12 px-4 border border-[#d4c9a8] rounded-lg bg-[#faf8f2] text-sm text-[#1a1a2e] outline-none transition-all duration-200 focus:border-[#c9a84c] focus:bg-[#fffef8]"
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <label htmlFor="last-name" className="block text-xs font-semibold uppercase tracking-wide text-[#6b6b6b] mb-2">
                                        Last Name
                                    </label>
                                    <input
                                        id="last-name"
                                        type="text"
                                        value={formValues.last_name}
                                        onChange={(e) => setFormValues((prev) => ({ ...prev, last_name: e.target.value }))}
                                        className="w-full h-12 px-4 border border-[#d4c9a8] rounded-lg bg-[#faf8f2] text-sm text-[#1a1a2e] outline-none transition-all duration-200 focus:border-[#c9a84c] focus:bg-[#fffef8]"
                                    />
                                    {formErrors.last_name && <p className="mt-2 text-sm text-[#c0392b]">{formErrors.last_name}</p>}
                                </div>
                            </div>

                            <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <p className="font-semibold text-[#16213e]">Simple create</p>
                                    <p className="text-sm text-[#6b6b6b]">Create a single user manually.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleSimpleCreate}
                                    disabled={isSubmitting}
                                    className="inline-flex items-center justify-center gap-2 min-h-12 rounded-lg bg-[#c9a84c] px-5 text-sm font-semibold uppercase text-white transition-all duration-200 hover:bg-[#b38b3d] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {isSubmitting ? 'Saving...' : `Save ${activeTab}`}
                                </button>
                            </div>
                            {formErrors.full_name && (
                                <div className="mt-3 rounded-xl bg-[#fdecea] border border-[#f5c6cb] p-3 text-sm text-[#b02a37]">
                                    {formErrors.full_name}
                                </div>
                            )}

                            {activeTab === 'Student' && (
                                <div className="mt-8 rounded-3xl border border-[#e3d7b9] bg-[#faf8f2] p-5">
                                    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <p className="text-sm font-semibold text-[#16213e]">Student batch upload</p>
                                            <p className="text-sm text-[#6b6b6b]">Upload an Excel or CSV file, preview the students, and process creation.</p>
                                        </div>
                                        <span className="rounded-full bg-[#0f3460] px-3 py-1 text-xs font-semibold uppercase text-white">xlsx / csv</span>
                                    </div>

                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div>
                                            <label htmlFor="student-upload" className="block text-xs font-semibold uppercase tracking-wide text-[#6b6b6b] mb-2">
                                                Excel file
                                            </label>
                                            <input
                                                ref={fileInputRef}
                                                id="student-upload"
                                                type="file"
                                                accept=".xlsx,.csv,.txt"
                                                onChange={(e) => {
                                                    setUploadFile(e.target.files?.[0] ?? null);
                                                    setUploadErrors('');
                                                    setPreviewRows([]);
                                                    setPreviewColumns([]);
                                                    setPreviewFilters({});
                                                    setMassResult(null);
                                                }}
                                                className="hidden"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => fileInputRef.current?.click()}
                                                className="w-full min-h-12 rounded-lg border border-[#d4c9a8] bg-[#faf8f2] px-4 text-sm font-semibold uppercase text-[#16213e] transition-all duration-200 hover:bg-[#f0ebe0] flex items-center justify-center"
                                            >
                                                {uploadFile ? uploadFile.name : 'Choose File'}
                                            </button>
                                            {uploadErrors && <p className="mt-2 text-sm text-[#c0392b]">{uploadErrors}</p>}
                                        </div>
                                        <div className="flex items-end">
                                            <button
                                                type="button"
                                                onClick={handleUploadPreview}
                                                disabled={!uploadFile || isUploading}
                                                className="w-full min-h-12 rounded-lg bg-[#0f3460] px-5 text-sm font-semibold uppercase text-white transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[#16213e]"
                                            >
                                                {isUploading ? 'Processing...' : 'Preview Upload'}
                                            </button>
                                        </div>
                                    </div>

                                    {previewColumns.length > 0 && (
                                        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                            {previewColumns.map((column) => (
                                                <div key={column.key} className="space-y-2">
                                                    <label className="block text-xs font-semibold uppercase tracking-wide text-[#6b6b6b]">
                                                        {column.label}
                                                    </label>
                                                    <select
                                                        value={previewFilters[column.key] ?? 'All'}
                                                        onChange={(e) => setPreviewFilters((prev) => ({ ...prev, [column.key]: e.target.value }))}
                                                        className="w-full h-12 rounded-lg border border-[#d4c9a8] bg-white px-4 text-sm text-[#1a1a2e] outline-none focus:border-[#c9a84c]"
                                                    >
                                                        <option value="All">All</option>
                                                        {column.options.map((option) => (
                                                            <option key={option} value={option}>
                                                                {option}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {previewIgnoredCount > 0 && (
                                        <div className="mt-4 rounded-2xl bg-[#fff8e1] border border-[#f4e3a7] p-4 text-sm text-[#735f17]">
                                            {previewIgnoredCount} row{previewIgnoredCount > 1 ? 's' : ''} ignored because the student full name already exists.
                                        </div>
                                    )}

                                    {previewRows.length > 0 && (
                                        <div className="mt-6 rounded-3xl border border-[#e3d7b9] bg-white p-4">
                                            <div className="mb-4 text-sm text-[#6b6b6b]">
                                                {previewSummaryText}
                                            </div>
                                            <div className="overflow-x-auto overflow-y-auto max-h-125 rounded-lg border border-[#e3d7b9]">
                                                <table className="min-w-full text-left border-collapse text-sm">
                                                    <thead className="bg-[#f7f3e8] sticky top-0">
                                                        <tr>
                                                            <th className="px-4 py-3 uppercase tracking-wide text-[#6b6b6b]">Student</th>
                                                            {previewColumns.map((column) => (
                                                                <th key={column.key} className="px-4 py-3 uppercase tracking-wide text-[#6b6b6b]">
                                                                    {column.label}
                                                                </th>
                                                            ))}
                                                            <th className="px-4 py-3 uppercase tracking-wide text-[#6b6b6b]">Status</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {previewFilteredRows.map((row, index) => (
                                                            <tr key={`${row.full_name}-${index}`} className="border-t border-[#e3d7b9] odd:bg-[#ffffff] even:bg-[#fbf8f1]">
                                                                <td className="px-4 py-3 text-[#16213e]">{row.full_name}</td>
                                                                {previewColumns.map((column) => (
                                                                    <td key={column.key} className="px-4 py-3 text-[#16213e]">{row.extra[column.key] || '—'}</td>
                                                                ))}
                                                                <td className="px-4 py-3 text-[#6b6b6b]">{row.full_name.trim() ? 'Ready' : 'Skipped'}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>

                                            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                <p className="text-sm text-[#6b6b6b]">After review, process the final student list.</p>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowMassConfirm(true)}
                                                    disabled={previewFilteredRows.length === 0}
                                                    className="inline-flex items-center justify-center gap-2 min-h-12 rounded-lg bg-[#c9a84c] px-5 text-sm font-semibold uppercase text-white transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[#b38b3d]"
                                                >
                                                    Create Students
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showMassConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
                    <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
                        <div className="mb-4">
                            <h2 className="text-lg font-semibold text-[#16213e]">Confirm Mass Creation</h2>
                            <p className="mt-2 text-sm text-[#6b6b6b]">This will create {previewFilteredRows.length} student accounts from the uploaded preview. Duplicate full names will be skipped.</p>
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => setShowMassConfirm(false)}
                                className="inline-flex items-center justify-center rounded-lg border border-[#d4c9a8] bg-white px-5 py-3 text-sm font-semibold uppercase text-[#16213e] transition-all duration-200 hover:border-[#c9a84c] hover:text-[#16213e]"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleMassCreate}
                                className="inline-flex items-center justify-center rounded-lg bg-[#0f3460] px-5 py-3 text-sm font-semibold uppercase text-white transition-all duration-200 hover:bg-[#16213e]"
                            >
                                Confirm Create
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {processingStatus !== 'idle' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
                    <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
                        <div className="flex flex-col items-center text-center">
                            {/* Loading Animation */}
                            {processingStatus === 'processing' && (
                                <>
                                    <div className="relative w-16 h-16 mb-6">
                                        <div className="absolute inset-0 rounded-full border-4 border-[#e3d7b9] opacity-30"></div>
                                        <div
                                            className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#c9a84c] border-r-[#c9a84c] animate-spin"
                                            style={{
                                                animation: 'spin 2s linear infinite',
                                            }}
                                        ></div>
                                    </div>
                                    <style>{`
                                        @keyframes spin {
                                            from { transform: rotate(0deg); }
                                            to { transform: rotate(360deg); }
                                        }
                                    `}</style>
                                    <h3 className="text-lg font-semibold text-[#16213e] mb-2">{processingTitle}</h3>
                                    <p className="text-sm text-[#6b6b6b]">{processingMessage}</p>
                                </>
                            )}

                            {/* Success Animation */}
                            {processingStatus === 'success' && (
                                <>
                                    <div
                                        className="w-16 h-16 mb-6 rounded-full bg-[#4caf50] flex items-center justify-center animate-pulse"
                                        style={{
                                            animation: 'scaleIn 0.5s ease-out',
                                        }}
                                    >
                                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                    <style>{`
                                        @keyframes scaleIn {
                                            from {
                                                transform: scale(0);
                                                opacity: 0;
                                            }
                                            to {
                                                transform: scale(1);
                                                opacity: 1;
                                            }
                                        }
                                    `}</style>
                                    <h3 className="text-lg font-semibold text-[#16213e] mb-2">Success!</h3>
                                    <p className="text-sm text-[#6b6b6b]">{processingMessage}</p>
                                </>
                            )}

                            {/* Failure Animation */}
                            {processingStatus === 'failure' && (
                                <>
                                    <div
                                        className="w-16 h-16 mb-6 rounded-full bg-[#f44336] flex items-center justify-center animate-pulse"
                                        style={{
                                            animation: 'scaleIn 0.5s ease-out',
                                        }}
                                    >
                                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </div>
                                    <style>{`
                                        @keyframes scaleIn {
                                            from {
                                                transform: scale(0);
                                                opacity: 0;
                                            }
                                            to {
                                                transform: scale(1);
                                                opacity: 1;
                                            }
                                        }
                                    `}</style>
                                    <h3 className="text-lg font-semibold text-[#c0392b] mb-2">Failed</h3>
                                    <p className="text-sm text-[#6b6b6b]">{processingMessage}</p>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showMessageModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 px-4 py-6">
                    <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
                        <div className="text-center">
                            <p className="text-lg font-semibold text-[#16213e]">Success</p>
                            <p className="mt-3 text-sm text-[#6b6b6b]">{successMessage}</p>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
