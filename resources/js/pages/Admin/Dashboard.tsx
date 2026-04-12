import React, { useState } from 'react';
import { Head } from '@inertiajs/react';
import AdminSidebar from '../../components/AdminSidebar';

export default function Dashboard() {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <>
            <Head title="Admin Dashboard" />
            <div className="flex min-h-screen bg-[#f0ebe0] text-[#1a1a2e] font-['Source_Sans_3',sans-serif]">
                <AdminSidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} currentPage="dashboard" />

                {/* Main Content */}
                <div className="flex-1 lg:ml-64">
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
                                    ADMIN DASHBOARD
                                </div>
                                <h1 className="font-['Libre_Baskerville',serif] text-xl sm:text-2xl md:text-3xl lg:text-4xl text-[#16213e] leading-tight font-bold m-0">
                                    Welcome to Capstone Rating System
                                </h1>
                                <div className="w-12 sm:w-15 h-0.5 bg-[#c9a84c] mx-auto my-3 lg:my-4"></div>
                            </div>

                            <div className="bg-white rounded-lg border border-[#d4c9a8] p-4 sm:p-6 lg:p-7 mb-4 lg:mb-6 shadow-md">
                                <h2 className="font-['Libre_Baskerville',serif] text-sm font-bold text-[#0f3460] uppercase tracking-wide border-b border-[#d4c9a8] pb-3 mb-4 lg:mb-5 mt-0">
                                    System Overview
                                </h2>
                                <p className="text-[#6b6b6b] leading-relaxed text-sm sm:text-base">
                                    Manage users, capstones, and evaluation forms from this central dashboard. Use the sidebar navigation to access different sections of the system.
                                </p>
                            </div>

                            {/* Dashboard cards */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
                                <div className="bg-white rounded-lg border border-[#d4c9a8] p-4 lg:p-6 shadow-md">
                                    <h3 className="font-['Libre_Baskerville',serif] text-base lg:text-lg text-[#0f3460] m-0 mb-2">
                                        Total Users
                                    </h3>
                                    <p className="text-2xl lg:text-3xl font-bold text-[#16213e] m-0">
                                        1
                                    </p>
                                </div>
                                <div className="bg-white rounded-lg border border-[#d4c9a8] p-4 lg:p-6 shadow-md">
                                    <h3 className="font-['Libre_Baskerville',serif] text-base lg:text-lg text-[#0f3460] m-0 mb-2">
                                        Active Capstones
                                    </h3>
                                    <p className="text-2xl lg:text-3xl font-bold text-[#16213e] m-0">
                                        0
                                    </p>
                                </div>
                                <div className="bg-white rounded-lg border border-[#d4c9a8] p-4 lg:p-6 shadow-md sm:col-span-2 lg:col-span-1">
                                    <h3 className="font-['Libre_Baskerville',serif] text-base lg:text-lg text-[#0f3460] m-0 mb-2">
                                        Pending Evaluations
                                    </h3>
                                    <p className="text-2xl lg:text-3xl font-bold text-[#16213e] m-0">
                                        0
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}