import React from 'react';
import { Head, usePage } from '@inertiajs/react';

export default function Form() {
    const { capstone_id } = usePage().props as any;

    return (
        <>
            <Head title="Form" />
            <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
                <div className="max-w-7xl mx-auto">
                    <h1 className="text-3xl font-bold text-gray-900">Form for Capstone {capstone_id}</h1>
                    <p className="mt-4 text-gray-600">Form content will be implemented here.</p>
                    {/* Add form content here */}
                </div>
            </div>
        </>
    );
}