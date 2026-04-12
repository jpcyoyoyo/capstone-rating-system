import React from 'react';
import { router } from '@inertiajs/react';

interface SidebarProps {
    sidebarOpen: boolean;
    setSidebarOpen: (open: boolean) => void;
    currentPage: 'dashboard' | 'users' | 'capstones';
}

export default function Sidebar({ sidebarOpen, setSidebarOpen, currentPage }: SidebarProps) {
    const handleLogout = (e: React.FormEvent) => {
        e.preventDefault();
        router.post('/admin/logout');
    };

    return (
        <>
            {/* Mobile sidebar overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/50 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                ></div>
            )}

            {/* Sidebar */}
            <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-[#d4c9a8] p-6 shadow-lg transform transition-transform duration-300 ease-in-out ${
                sidebarOpen ? 'translate-x-0' : '-translate-x-full'
            } lg:translate-x-0`}>
                <div className="mb-8">
                    <h2 className="font-['Libre_Baskerville',serif] text-xl text-[#16213e] font-bold m-0">
                        Capstone System
                    </h2>
                    <div className="w-10 h-0.5 bg-[#c9a84c] my-2"></div>
                </div>

                <nav>
                    <ul className="list-none p-0 m-0">
                        <li className="mb-2">
                            <a
                                href="/admin/dashboard"
                                className={`block py-3 px-4 text-[#6b6b6b] no-underline font-semibold uppercase text-sm tracking-wide rounded transition-all duration-200 hover:bg-[#c9a84c] hover:text-white ${
                                    currentPage === 'dashboard' ? 'text-[#0f3460] bg-[#f0ebe0]' : ''
                                }`}
                                onClick={() => setSidebarOpen(false)}
                            >
                                Dashboard
                            </a>
                        </li>
                        <li className="mb-2">
                            <a
                                href="/admin/users"
                                className={`block py-3 px-4 text-[#6b6b6b] no-underline font-semibold uppercase text-sm tracking-wide rounded transition-all duration-200 hover:bg-[#c9a84c] hover:text-white ${
                                    currentPage === 'users' ? 'text-[#0f3460] bg-[#f0ebe0]' : ''
                                }`}
                                onClick={() => setSidebarOpen(false)}
                            >
                                Users
                            </a>
                        </li>
                        <li className="mb-2">
                            <a
                                href="/admin/capstones"
                                className={`block py-3 px-4 text-[#6b6b6b] no-underline font-semibold uppercase text-sm tracking-wide rounded transition-all duration-200 hover:bg-[#c9a84c] hover:text-white ${
                                    currentPage === 'capstones' ? 'text-[#0f3460] bg-[#f0ebe0]' : ''
                                }`}
                                onClick={() => setSidebarOpen(false)}
                            >
                                Capstones
                            </a>
                        </li>
                        <li className="mt-8">
                            <form onSubmit={handleLogout}>
                                <button
                                    type="submit"
                                    className="w-full py-3 px-4 bg-[#c0392b] text-white border-none rounded font-semibold uppercase text-sm cursor-pointer transition-all duration-200 hover:bg-[#a93226] hover:-translate-y-0.5"
                                >
                                    Logout
                                </button>
                            </form>
                        </li>
                    </ul>
                </nav>
            </div>
        </>
    );
}