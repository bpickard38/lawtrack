import React, { createContext, useContext, useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface User {
  id: number;
  email: string;
  full_name: string;
  role?: 'admin' | 'billing' | 'attorney';
  firm_id?: number | null;
}

interface Attorney {
  id: number;
  user_id: number;
  name: string;
  email: string;
  billable_rate: number;
}

interface AuthContextType {
  user: User | null;
  attorney: Attorney | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (args: {
    email: string;
    password: string;
    fullName: string;
    firmName?: string;
    role?: 'admin' | 'billing' | 'attorney';
  }) => Promise<void>;
  updateProfile: (args: { email?: string; fullName?: string }) => Promise<void>;
  changePassword: (args: { currentPassword: string; newPassword: string }) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [attorney, setAttorney] = useState<Attorney | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing token on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('auth_token');
    if (savedToken) {
      setToken(savedToken);
      fetchUserData(savedToken);
    } else {
      setIsLoading(false);
    }
  }, []);

  async function fetchUserData(authToken: string) {
    try {
      // Get user info
      const userResponse = await fetch(`${API_BASE}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      
      if (!userResponse.ok) {
        throw new Error('Failed to fetch user');
      }
      
      const userData = await userResponse.json();
      setUser(userData);

      // Get attorney profile only for attorney-role users
      if (userData?.role === 'attorney' || !userData?.role) {
        const attorneyResponse = await fetch(`${API_BASE}/api/auth/attorney`, {
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        });

        if (attorneyResponse.ok) {
          const attorneyData = await attorneyResponse.json();
          setAttorney(attorneyData);
        } else {
          setAttorney(null);
        }
      } else {
        setAttorney(null);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      localStorage.removeItem('auth_token');
      setToken(null);
      setUser(null);
      setAttorney(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function login(email: string, password: string) {
    const formData = new FormData();
    formData.append('username', email); // OAuth2 expects 'username' field
    formData.append('password', password);

    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Login failed');
    }

    const data = await response.json();
    const authToken = data.access_token;
    
    localStorage.setItem('auth_token', authToken);
    setToken(authToken);
    await fetchUserData(authToken);
  }

  async function register(args: {
    email: string;
    password: string;
    fullName: string;
    firmName?: string;
    role?: 'admin' | 'billing' | 'attorney';
  }) {
    const response = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: args.email,
        password: args.password,
        full_name: args.fullName,
        firm_name: args.firmName || undefined,
        role: args.role || undefined,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Registration failed');
    }

    // Auto-login after registration
    await login(args.email, args.password);
  }

  async function updateProfile(args: { email?: string; fullName?: string }) {
    if (!token) throw new Error('Not authenticated');

    const response = await fetch(`${API_BASE}/api/auth/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        email: args.email || undefined,
        full_name: args.fullName || undefined,
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.detail || 'Failed to update profile');
    }

    // Backend returns { user, access_token? }
    if (data?.access_token) {
      localStorage.setItem('auth_token', data.access_token);
      setToken(data.access_token);
      await fetchUserData(data.access_token);
      return;
    }

    // If no new token, refresh current user data
    await fetchUserData(token);
  }

  async function changePassword(args: { currentPassword: string; newPassword: string }) {
    if (!token) throw new Error('Not authenticated');

    const response = await fetch(`${API_BASE}/api/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        current_password: args.currentPassword,
        new_password: args.newPassword,
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.detail || 'Failed to change password');
    }
  }

  function logout() {
    localStorage.removeItem('auth_token');
    setToken(null);
    setUser(null);
    setAttorney(null);
  }

  return (
    <AuthContext.Provider value={{ user, attorney, token, login, register, updateProfile, changePassword, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}