import React from 'react';
import { Head, Link } from '@inertiajs/react';

interface Capstone {
    id: number;
    team_name: string;
    no_of_team_members: number;
    no_of_panel_members: number;
    no_of_proposals: number;
    created_at: string;
    logo?: string | null;
}

interface Props {
    capstones: Capstone[];
}

export default function Capstones({ capstones }: Props) {
    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    };

    return (
        <>
            <Head title="Capstone Evaluations" />
            
            <div className="min-h-screen" style={{ backgroundColor: '#f0ebe0' }}>
                {/* Header */}
                <div className="bg-linear-to-r" style={{ backgroundImage: 'linear-gradient(to right, #16213e, #0f3460)' }}>
                    <div className="max-w-6xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
                        <div className="text-center">
                            <h1 className="text-4xl md:text-5xl font-serif font-bold text-white mb-4">
                                Capstone Evaluation System
                            </h1>
                            <p className="text-lg text-gray-100 max-w-2xl mx-auto">
                                Select a capstone project below to access the evaluation forms
                            </p>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="max-w-6xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
                    {capstones.length === 0 ? (
                        <div 
                            className="rounded-lg border-2 border-dashed p-12 text-center"
                            style={{ borderColor: '#c9a84c', backgroundColor: '#fdfaf4' }}
                        >
                            <h3 className="text-xl font-semibold mb-2" style={{ color: '#0f3460' }}>
                                No Capstone Projects Available
                            </h3>
                            <p style={{ color: '#6b6b6b' }}>
                                There are currently no capstone projects available for evaluation.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {capstones.map((capstone) => (
                                <Link
                                    key={capstone.id}
                                    href={`/capstone/${capstone.id}`}
                                    className="block group"
                                >
                                    <div
                                        className="rounded-lg border-2 overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 h-full flex flex-col"
                                        style={{ 
                                            borderColor: '#d4c9a8',
                                            backgroundColor: '#ffffff',
                                        }}
                                    >
                                        {/* Card Header */}
                                        <div 
                                            className="px-6 py-4 border-b-2"
                                            style={{ 
                                                backgroundColor: '#0f3460',
                                                borderColor: '#0f3460',
                                            }}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="shrink-0">
                                                    {capstone.logo ? (
                                                        <img
                                                            src={capstone.logo}
                                                            alt={`${capstone.team_name} logo`}
                                                            className="w-14 h-14 rounded-xl object-cover border border-white/25"
                                                        />
                                                    ) : (
                                                        <div className="w-14 h-14 rounded-xl border border-white/25 bg-white/10 flex items-center justify-center text-[10px] uppercase tracking-widest text-white/80">
                                                            Logo
                                                        </div>
                                                    )}
                                                </div>
                                                <h2 className="text-xl font-bold text-white group-hover:text-yellow-100 transition-colors duration-300">
                                                    {capstone.team_name}
                                                </h2>
                                            </div>
                                        </div>

                                        {/* Card Content */}
                                        <div className="px-6 py-5 grow">
                                            <div className="space-y-4">
                                                {/* Team Members */}
                                                <div className="flex items-center justify-between">
                                                    <span 
                                                        className="text-sm font-semibold uppercase tracking-wider"
                                                        style={{ color: '#6b6b6b' }}
                                                    >
                                                        Team Members
                                                    </span>
                                                    <div
                                                        className="px-3 py-1 rounded-full font-bold text-white"
                                                        style={{ backgroundColor: '#0f3460' }}
                                                    >
                                                        {capstone.no_of_team_members}
                                                    </div>
                                                </div>

                                                {/* Panel Members */}
                                                <div className="flex items-center justify-between">
                                                    <span 
                                                        className="text-sm font-semibold uppercase tracking-wider"
                                                        style={{ color: '#6b6b6b' }}
                                                    >
                                                        Panel Members
                                                    </span>
                                                    <div
                                                        className="px-3 py-1 rounded-full font-bold text-white"
                                                        style={{ backgroundColor: '#0f3460' }}
                                                    >
                                                        {capstone.no_of_panel_members}
                                                    </div>
                                                </div>

                                                {/* Proposals */}
                                                <div className="flex items-center justify-between">
                                                    <span 
                                                        className="text-sm font-semibold uppercase tracking-wider"
                                                        style={{ color: '#6b6b6b' }}
                                                    >
                                                        Proposals
                                                    </span>
                                                    <div
                                                        className="px-3 py-1 rounded-full font-bold text-white"
                                                        style={{ backgroundColor: '#c9a84c' }}
                                                    >
                                                        {capstone.no_of_proposals}
                                                    </div>
                                                </div>

                                                {/* Created Date */}
                                                <div 
                                                    className="pt-2 text-xs border-t-2"
                                                    style={{ 
                                                        borderColor: '#d4c9a8',
                                                        color: '#6b6b6b',
                                                    }}
                                                >
                                                    Created: {formatDate(capstone.created_at)}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Card Footer */}
                                        <div 
                                            className="px-6 py-3 border-t-2 text-center"
                                            style={{ 
                                                backgroundColor: '#f5f0e0',
                                                borderColor: '#d4c9a8',
                                            }}
                                        >
                                            <span 
                                                className="text-sm font-semibold uppercase tracking-widest group-hover:text-lg transition-all duration-300"
                                                style={{ color: '#0f3460' }}
                                            >
                                                View Details →
                                            </span>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
