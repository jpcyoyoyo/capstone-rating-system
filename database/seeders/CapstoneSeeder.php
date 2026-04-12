<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use App\Models\Capstone;

class CapstoneSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        Capstone::create([
            'team_name' => 'Team Alpha',
            'panel_members' => [
                'no_members' => 3,
                'list' => [
                    ['member_id' => '1', 'designation' => 'Panel Chair'],
                    ['member_id' => '2', 'designation' => 'Project Adviser'],
                    ['member_id' => '3', 'designation' => 'Panel Member']
                ]
            ],
            'proposals' => [
                'proposals' => [
                    ['id' => '1'],
                    ['id' => '2']
                ]
            ],
            'team_list' => [
                'no_members' => 4,
                'list' => [
                    ['member_id' => '1', 'designation' => 'PROJECT MANAGER'],
                    ['member_id' => '2', 'designation' => 'Developer'],
                    ['member_id' => '3', 'designation' => 'Designer'],
                    ['member_id' => '4', 'designation' => 'Tester']
                ]
            ],
            'is_live' => true
        ]);

        Capstone::create([
            'team_name' => 'Team Beta',
            'panel_members' => [
                'no_members' => 2,
                'list' => [
                    ['member_id' => '4', 'designation' => 'Panel Chair'],
                    ['member_id' => '5', 'designation' => 'Project Adviser']
                ]
            ],
            'proposals' => [
                'proposals' => [
                    ['id' => '3']
                ]
            ],
            'team_list' => [
                'no_members' => 3,
                'list' => [
                    ['member_id' => '5', 'full_name' => 'John Doe', 'designation' => 'PROJECT MANAGER'],
                    ['member_id' => '6', 'full_name' => 'Jane Smith', 'designation' => 'Developer'],
                    ['member_id' => '7', 'full_name' => 'Bob Johnson', 'designation' => 'Designer']
                ]
            ],
            'is_live' => false
        ]);

        Capstone::create([
            'team_name' => 'Team Gamma',
            'panel_members' => [
                'no_members' => 4,
                'list' => [
                    ['member_id' => '6', 'full_name' => 'John Doe', 'designation' => 'Panel Chair'],
                    ['member_id' => '7', 'full_name' => 'Jane Smith', 'designation' => 'Project Adviser'],
                    ['member_id' => '8', 'full_name' => 'Bob Johnson', 'designation' => 'Panel Member'],
                    ['member_id' => '9', 'full_name' => 'Alice Brown', 'designation' => 'Panel Member']
                ]
            ],
            'proposals' => [
                'proposals' => [
                    ['id' => '4'],
                    ['id' => '5'],
                    ['id' => '6']
                ]
            ],
            'team_list' => [
                'no_members' => 5,
                'list' => [
                    ['member_id' => '8', 'designation' => 'Project Manager'],
                    ['member_id' => '9', 'designation' => 'Developer'],
                    ['member_id' => '10', 'designation' => 'Developer'],
                    ['member_id' => '11', 'designation' => 'Designer'],
                    ['member_id' => '12', 'designation' => 'Tester']
                ]
            ],
            'is_live' => true
        ]);
    }
}
