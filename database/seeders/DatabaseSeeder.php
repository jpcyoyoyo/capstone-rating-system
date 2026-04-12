<?php

namespace Database\Seeders;

use App\Models\User;
// use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // User::factory(10)->create();

        User::updateOrCreate(
            ['username' => 'admin'],
            [
                'full_name' => 'Admin User',
                'gen_pass' => 'Admin123',
                'hash_pass' => Hash::make('Admin123'),
                'role' => 'Admin',
            ]
        );

        $this->call([
            CapstoneSeeder::class,
        ]);
    }
}
