import React from 'react';
import { Head, useForm } from '@inertiajs/react';

export default function Login() {
    const { data, setData, post, processing, errors } = useForm({
        username: '',
        password: '',
    });

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        post('/admin/login');
    };

    return (
        <>
            <Head title="Admin Login" />
            <div className="min-h-screen bg-[#f0ebe0] text-[#1a1a2e] font-['Source_Sans_3',sans-serif] py-4 sm:py-8 px-4 sm:px-6">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-8 sm:mb-10">
                        <div className="font-['Source_Sans_3',sans-serif] font-light text-xs tracking-widest uppercase text-[#c9a84c] mb-2">
                            ADMIN ACCESS
                        </div>
                        <h1 className="font-['Libre_Baskerville',serif] text-xl sm:text-2xl md:text-3xl lg:text-4xl text-[#16213e] leading-tight font-bold m-0">
                            Capstone Rating System
                        </h1>
                        <div className="w-12 sm:w-15 h-0.5 bg-[#c9a84c] mx-auto my-3 sm:my-4"></div>
                    </div>

                    <div className="bg-white rounded-lg border border-[#d4c9a8] p-4 sm:p-6 lg:p-7 mb-4 sm:mb-6 shadow-md max-w-sm mx-auto">
                        <h2 className="font-['Libre_Baskerville',serif] text-sm font-bold text-[#0f3460] uppercase tracking-wide border-b border-[#d4c9a8] pb-3 mb-4 sm:mb-5 mt-0 text-center">
                            Admin Login
                        </h2>

                        <form onSubmit={submit} className="flex flex-col gap-4">
                            <div>
                                <label htmlFor="username" className="block text-xs font-semibold tracking-wide uppercase text-[#6b6b6b] mb-1.5">
                                    Username
                                </label>
                                <input
                                    id="username"
                                    name="username"
                                    type="text"
                                    required
                                    className="w-full font-['Source_Sans_3',sans-serif] text-sm py-2.5 px-3.5 border border-[#d4c9a8] rounded bg-[#faf8f2] text-[#1a1a2e] transition-all duration-200 outline-none focus:border-[#c9a84c] focus:bg-[#fffef8] focus:shadow-[0_0_0_3px_rgba(201,168,76,0.15)]"
                                    value={data.username}
                                    onChange={(e) => setData('username', e.target.value)}
                                />
                                {errors.username && <div className="text-[#c0392b] text-sm mt-1">{errors.username}</div>}
                            </div>

                            <div>
                                <label htmlFor="password" className="block text-xs font-semibold tracking-wide uppercase text-[#6b6b6b] mb-1.5">
                                    Password
                                </label>
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    required
                                    className="w-full font-['Source_Sans_3',sans-serif] text-sm py-2.5 px-3.5 border border-[#d4c9a8] rounded bg-[#faf8f2] text-[#1a1a2e] transition-all duration-200 outline-none focus:border-[#c9a84c] focus:bg-[#fffef8] focus:shadow-[0_0_0_3px_rgba(201,168,76,0.15)]"
                                    value={data.password}
                                    onChange={(e) => setData('password', e.target.value)}
                                />
                                {errors.password && <div className="text-[#c0392b] text-sm mt-1">{errors.password}</div>}
                            </div>

                            <button
                                type="submit"
                                disabled={processing}
                                className="w-full font-['Source_Sans_3',sans-serif] text-sm font-semibold tracking-wide uppercase py-3 px-8 rounded cursor-pointer border-none transition-all duration-200 bg-[#0f3460] text-white mt-4 hover:bg-[#16213e] hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(15,52,96,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {processing ? 'Signing in...' : 'Sign in'}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </>
    );
}