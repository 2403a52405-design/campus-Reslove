import { ArrowLeft, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useState } from 'react';
import { SafeImage } from '../components/StatusVisuals.tsx';
import { apiRequest, setCsrfToken } from '../lib/api.ts';
import type { UserProfile } from '../types.ts';

interface AuthPagesProps {
  mode: 'login' | 'register';
  onAuthSuccess: (user: UserProfile) => void;
  onNavigate: (route: string) => void;
}

const DEMO_ACCOUNTS = [
  {
    role: 'Administrator',
    name: 'Dr. Arvind Menon',
    email: 'admin@campus.edu',
    pass: 'Admin@123',
    scope: 'Full system control, dispatch, analytics & CSV export',
  },
  {
    role: 'Staff · Electrical',
    name: 'Rajesh Kumar',
    email: 'rajesh.elec@campus.edu',
    pass: 'Staff@123',
    scope: 'Assigned electrical & HVAC tickets, proof upload',
  },
  {
    role: 'Staff · IT & Wi-Fi',
    name: 'Priya Nair',
    email: 'priya.it@campus.edu',
    pass: 'Staff@123',
    scope: 'Network, lab instrumentation & reopened ticket queue',
  },
  {
    role: 'Student · B.Tech CSE',
    name: 'Aarav Patel',
    email: 'aarav.24cs@campus.edu',
    pass: 'Student@123',
    scope: 'Submit complaints, track progress, rate & reopen',
  },
];

export function AuthPages({ mode, onAuthSuccess, onNavigate }: AuthPagesProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  const [regForm, setRegForm] = useState({
    full_name: '',
    email: '',
    password: '',
    phone: '',
    roll_number: '',
    department: 'Computer Science & Engineering',
    academic_year: '3',
    hostel_block: 'Hostel Block A',
  });

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiRequest<{ user: UserProfile; csrfToken: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setCsrfToken(res.csrfToken);
      onAuthSuccess(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiRequest<{ user: UserProfile; csrfToken: string }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          ...regForm,
          academic_year: Number(regForm.academic_year),
        }),
      });
      setCsrfToken(res.csrfToken);
      onAuthSuccess(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  }

  function fillDemo(demoEmail: string, demoPass: string) {
    setEmail(demoEmail);
    setPassword(demoPass);
    setError(null);
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 grid grid-cols-1 lg:grid-cols-12">
      {/* Left Architectural Showcase Column */}
      <div className="hidden lg:flex lg:col-span-5 relative bg-slate-900 text-white flex-col justify-between p-10 overflow-hidden">
        <SafeImage
          src="/src/assets/images/hero_campus_quad_1794543004757.jpg"
          alt="University campus architecture"
          className="absolute inset-0 w-full h-full object-cover opacity-35"
          fallbackLabel="CampusResolve"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-slate-950/40" />

        <div className="relative z-10">
          <button
            type="button"
            onClick={() => onNavigate('landing')}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-200 hover:text-white cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to CampusResolve</span>
          </button>
        </div>

        <div className="relative z-10">
          <h1 className="text-3xl font-bold tracking-tight font-display leading-tight text-balance">
            Making Every Campus Better, One Complaint at a Time.
          </h1>
          <p className="mt-4 text-sm text-slate-300 leading-relaxed max-w-md">
            Authenticated portal for Students, Campus Administrators, and Maintenance Specialists. All actions are
            audited with role-based permissions and SLA tracking.
          </p>
        </div>
      </div>

      {/* Right Auth Form Column */}
      <div className="lg:col-span-7 flex flex-col justify-center px-6 py-10 sm:px-12 lg:px-16">
        <div className="max-w-lg w-full mx-auto">
          <div className="flex items-center justify-between mb-8">
            <button
              type="button"
              onClick={() => onNavigate('landing')}
              className="lg:hidden inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Home</span>
            </button>
            <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg ml-auto">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  onNavigate('login');
                }}
                className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  mode === 'login'
                    ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  onNavigate('register');
                }}
                className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  mode === 'register'
                    ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Student Register
              </button>
            </div>
          </div>

          {mode === 'login' ? (
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white font-display">
                Sign in to CampusResolve
              </h2>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                Enter your Student, Staff, or Administrator credentials.
              </p>

              <form onSubmit={handleLogin} className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Campus Email
                  </label>
                  <div className="relative">
                    <Mail className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@campus.edu"
                      className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPass ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full pl-10 pr-10 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((v) => !v)}
                      aria-label="Toggle password visibility"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="text-sm px-3.5 py-2.5 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-lg transition-colors disabled:opacity-60 cursor-pointer"
                >
                  {submitting ? 'Authenticating...' : 'Sign In'}
                </button>
              </form>

              {/* Demo Credentials Panel Clearly Labeled for Testing */}
              <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Demo Credentials (Testing & Evaluation)
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">Click any role to fill</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {DEMO_ACCOUNTS.map((acc) => (
                    <button
                      key={acc.email}
                      type="button"
                      onClick={() => fillDemo(acc.email, acc.pass)}
                      className="text-left p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-500 dark:hover:border-blue-500 transition-colors cursor-pointer"
                    >
                      <div className="text-xs font-bold text-blue-700 dark:text-blue-400">{acc.role}</div>
                      <div className="text-xs font-semibold text-slate-900 dark:text-white mt-0.5">{acc.name}</div>
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-1 truncate">
                        {acc.email}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white font-display">
                Create Student Account
              </h2>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                Register with your university roll number to log and track campus facility requests.
              </p>

              <form onSubmit={handleRegister} className="mt-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={regForm.full_name}
                      onChange={(e) => setRegForm((p) => ({ ...p, full_name: e.target.value }))}
                      placeholder="e.g. Sneha Reddy"
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Roll Number
                    </label>
                    <input
                      type="text"
                      required
                      value={regForm.roll_number}
                      onChange={(e) => setRegForm((p) => ({ ...p, roll_number: e.target.value }))}
                      placeholder="e.g. BT24CSE108"
                      className="w-full px-3.5 py-2.5 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      University Email
                    </label>
                    <input
                      type="email"
                      required
                      value={regForm.email}
                      onChange={(e) => setRegForm((p) => ({ ...p, email: e.target.value }))}
                      placeholder="student@campus.edu"
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      value={regForm.phone}
                      onChange={(e) => setRegForm((p) => ({ ...p, phone: e.target.value }))}
                      placeholder="+91 98490 00000"
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Department
                    </label>
                    <select
                      value={regForm.department}
                      onChange={(e) => setRegForm((p) => ({ ...p, department: e.target.value }))}
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    >
                      <option>Computer Science & Engineering</option>
                      <option>Electronics & Communication</option>
                      <option>Mechanical Engineering</option>
                      <option>Electrical & Electronics</option>
                      <option>Civil Engineering</option>
                      <option>Information Technology</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Academic Year
                    </label>
                    <select
                      value={regForm.academic_year}
                      onChange={(e) => setRegForm((p) => ({ ...p, academic_year: e.target.value }))}
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    >
                      <option value="1">Year 1</option>
                      <option value="2">Year 2</option>
                      <option value="3">Year 3</option>
                      <option value="4">Year 4</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Hostel / Residence
                    </label>
                    <select
                      value={regForm.hostel_block}
                      onChange={(e) => setRegForm((p) => ({ ...p, hostel_block: e.target.value }))}
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    >
                      <option>Hostel Block A</option>
                      <option>Hostel Block B</option>
                      <option>Hostel Block C</option>
                      <option>Hostel Block D</option>
                      <option>Day Scholar</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Password (min 6 chars)
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={regForm.password}
                      onChange={(e) => setRegForm((p) => ({ ...p, password: e.target.value }))}
                      placeholder="Create a strong password"
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                {error && (
                  <div className="text-sm px-3.5 py-2.5 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-lg transition-colors disabled:opacity-60 cursor-pointer"
                >
                  {submitting ? 'Creating Account...' : 'Register Student Account'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
