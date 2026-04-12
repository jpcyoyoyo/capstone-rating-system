<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Capstone extends Model
{
    protected $fillable = [
        'team_name',
        'panel_members',
        'proposals',
        'team_list',
        'is_live',
        'logo',
    ];

    protected $casts = [
        'panel_members' => 'array',
        'proposals' => 'array',
        'team_list' => 'array',
        'is_live' => 'boolean',
    ];

    /**
     * Get all proposals for the capstone.
     */
    public function proposalRecords(): HasMany
    {
        return $this->hasMany(Proposal::class);
    }
}
