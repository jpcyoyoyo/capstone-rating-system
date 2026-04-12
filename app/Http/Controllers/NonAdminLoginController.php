<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use App\Models\User;
use Inertia\Inertia;

class NonAdminLoginController extends Controller
{
    public function showLoginForm($capstone_id)
    {
        return Inertia::render('NonAdmin/Login', [
            'capstone_id' => $capstone_id,
        ]);
    }

    public function login(Request $request, $capstone_id)
    {
        $request->validate([
            'username' => 'required|string',
            'password' => 'required|string',
        ]);

        $user = User::where('username', $request->username)
                    ->whereIn('role', ['Student', 'Panel'])
                    ->first();

        if ($user && Hash::check($request->password, $user->hash_pass)) {
            Auth::login($user);
            return redirect("/form/{$capstone_id}");
        }

        return back()->withErrors(['username' => 'Invalid credentials']);
    }
}
