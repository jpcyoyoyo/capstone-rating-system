<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AdminController;
use App\Http\Controllers\AdminLoginController;
use App\Http\Controllers\NonAdminController;
use App\Http\Controllers\NonAdminLoginController;

Route::redirect('/', '/admin/login');
Route::redirect('/admin/', '/admin/login');

Route::get('/admin/login', [AdminLoginController::class, 'showLoginForm'])->name('admin.login');
Route::post('/admin/login', [AdminLoginController::class, 'login'])->name('admin.login.post');

Route::middleware(['auth', 'role:Admin'])->group(function () {
    Route::get('/admin/dashboard', [AdminController::class, 'dashboard'])->name('admin.dashboard');
    Route::get('/admin/users', [AdminController::class, 'users'])->name('admin.users');
    Route::get('/admin/users/search', [AdminController::class, 'searchUsers'])->name('admin.users.search');
    Route::get('/admin/users/{id}', [AdminController::class, 'getUser'])->name('admin.users.show');
    Route::post('/admin/users/create', [AdminController::class, 'createUser'])->name('admin.users.create');
    Route::post('/admin/users/upload-preview', [AdminController::class, 'previewStudentUpload'])->name('admin.users.upload.preview');
    Route::post('/admin/users/mass-create', [AdminController::class, 'massCreateUsers'])->name('admin.users.mass.create');
    Route::get('/admin/capstones', [AdminController::class, 'capstones'])->name('admin.capstones');
    Route::get('/admin/capstones/{id}', [AdminController::class, 'getCapstoneDetail'])->name('admin.capstones.show');
    Route::post('/admin/capstones/create', [AdminController::class, 'createCapstone'])->name('admin.capstones.create');
    Route::post('/admin/capstones/{id}/update-members', [AdminController::class, 'updateCapstoneMembers'])->name('admin.capstones.update.members');
    Route::post('/admin/capstones/{id}/update-details', [AdminController::class, 'updateCapstoneDetails'])->name('admin.capstones.update.details');
    Route::post('/admin/capstones/{id}/create-proposal', [AdminController::class, 'createProposal'])->name('admin.capstones.create.proposal');
    Route::delete('/admin/capstones/{id}/proposals/{proposalId}', [AdminController::class, 'deleteProposal'])->name('admin.capstones.delete.proposal');
    Route::post('/admin/capstones/{id}/proposals/{proposalId}/update-title', [AdminController::class, 'updateProposalTitle'])->name('admin.capstones.update.proposal.title');
    Route::post('/admin/logout', [AdminController::class, 'logout'])->name('admin.logout');
});

// Non-Admin Capstone Evaluation Routes (No Authentication Required)
Route::get('/capstone', [NonAdminController::class, 'listCapstones'])->name('capstone.list');
Route::get('/capstone/{capstone_id}', [NonAdminController::class, 'showCapstone'])->name('capstone.show');
Route::get('/capstone/{capstone_id}/proposal/{proposal_id}', [NonAdminController::class, 'showProposal'])->name('capstone.proposal.show');
Route::get('/capstone/{capstone_id}/defense-evaluation', [NonAdminController::class, 'showProposalDefenseEvaluation'])->name('capstone.defense.evaluation');
Route::post('/capstone/{capstone_id}/defense-evaluation/{proposal_id}/{evaluator_id}', [NonAdminController::class, 'updateProposalDefenseEvaluation'])->name('capstone.defense.evaluation.update');
Route::post('/capstone/{capstone_id}/defense-evaluation/{proposal_id}/{evaluator_id}/toggle-submission', [NonAdminController::class, 'toggleProposalDefenseSubmission'])->name('capstone.defense.evaluation.toggle');
Route::post('/capstone/{capstone_id}/defense-evaluation/{proposal_id}/{evaluator_id}/reset', [NonAdminController::class, 'resetProposalDefenseEvaluation'])->name('capstone.defense.evaluation.reset');
Route::get('/capstone/{capstone_id}/peer-evaluation', [NonAdminController::class, 'showPeerSelfEvaluation'])->name('capstone.peer.evaluation');
Route::post('/capstone/{capstone_id}/self-evaluation/{proposal_id}/{reviewer_id}', [NonAdminController::class, 'updateSelfEvaluation'])->name('capstone.self.evaluation.update');
Route::post('/capstone/{capstone_id}/self-evaluation/{proposal_id}/{reviewer_id}/toggle-submission', [NonAdminController::class, 'toggleSelfEvaluationSubmission'])->name('capstone.self.evaluation.toggle');
Route::post('/capstone/{capstone_id}/self-evaluation/{proposal_id}/{reviewer_id}/reset', [NonAdminController::class, 'resetSelfEvaluation'])->name('capstone.self.evaluation.reset');
Route::get('/capstone/{capstone_id}/oral-evaluation', [NonAdminController::class, 'showOralPresentationEvaluation'])->name('capstone.oral.evaluation');
Route::post('/capstone/{capstone_id}/oral-evaluation/{proposal_id}/{evaluator_id}', [NonAdminController::class, 'updateOralPresentationEvaluation'])->name('capstone.oral.evaluation.update');
Route::post('/capstone/{capstone_id}/oral-evaluation/{proposal_id}/{evaluator_id}/toggle-submission', [NonAdminController::class, 'toggleOralPresentationSubmission'])->name('capstone.oral.evaluation.toggle');
Route::post('/capstone/{capstone_id}/oral-evaluation/{proposal_id}/{evaluator_id}/reset', [NonAdminController::class, 'resetOralPresentationEvaluation'])->name('capstone.oral.evaluation.reset');

// Legacy routes (optional - kept for backwards compatibility)
Route::get('/login/{capstone_id}', [NonAdminLoginController::class, 'showLoginForm'])->name('nonadmin.login');
Route::post('/login/{capstone_id}', [NonAdminLoginController::class, 'login'])->name('nonadmin.login.post');

Route::middleware(['auth', 'role:Student,Panel'])->group(function () {
    Route::get('/form/{capstone_id}', [NonAdminController::class, 'showForm'])->name('nonadmin.form');
});

// API Routes for PDF Generation
Route::get('/api/capstone/{capstone_id}/submitted-forms', [NonAdminController::class, 'getSubmittedForms']);
Route::get('/api/capstone/{capstone_id}/progress', [NonAdminController::class, 'getProgress']);
Route::get('/api/test-progress/{capstone_id}', [NonAdminController::class, 'testProgress']);
Route::post('/api/capstone/{capstone_id}/generate-pdf-zip', [NonAdminController::class, 'generatePdfZip']);

require __DIR__.'/settings.php';
