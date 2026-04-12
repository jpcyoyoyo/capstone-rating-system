<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Proposal extends Model
{
    protected $fillable = [
        'capstone_id',
        'title',
        'defense_eval',
        'team_self_eval',
        'team_oral_eval',
        'gen_documents',
    ];

    protected $casts = [
        'defense_eval' => 'array',
        'team_self_eval' => 'array',
        'team_oral_eval' => 'array',
        'gen_documents' => 'array',
    ];

    /**
     * Get the capstone that owns the proposal.
     */
    public function capstone(): BelongsTo
    {
        return $this->belongsTo(Capstone::class);
    }
}
