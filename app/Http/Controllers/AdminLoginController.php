<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use App\Models\User;
use Inertia\Inertia;

class AdminLoginController extends Controller
{
    public function showLoginForm()
    {
        if (Auth::check() && Auth::user()->role === 'Admin') {
            return redirect('/admin/dashboard');
        }

        return Inertia::render('Admin/Login');
    }

    public function login(Request $request)
    {
        $request->validate([
            'username' => 'required|string',
            'password' => 'required|string',
        ]);

        $user = User::where('username', $request->username)
                    ->where('role', 'Admin')
                    ->first();

        if ($user && Hash::check($request->password, $user->hash_pass)) {
            Auth::login($user);
            return redirect('/admin/dashboard');
        }

        return back()->withErrors(['username' => 'Invalid credentials']);
    }
}
