import { ArrowRight, CheckCircle2, Database, Download, Moon, Sun, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ChartCanvas } from '../components/ChartCanvas.tsx';
import { SafeImage } from '../components/StatusVisuals.tsx';
import { apiRequest, formatDateShort } from '../lib/api.ts';
import type { PublicStats, UserProfile } from '../types.ts';

interface LandingPageProps {
  user: UserProfile | null;
  darkMode: boolean;
  onToggleTheme: () => void;
  onNavigate: (route: string) => void;
}

const SCHEMA_TABLES = [
  'users (PK id, email UNIQUE, password_hash, role, is_active)',
  'students (PK id, FK user_id UNIQUE, roll_number UNIQUE, department, academic_year, hostel_block)',
  'staff (PK id, FK user_id UNIQUE, employee_code UNIQUE, department, specialization, availability_status)',
  'admins (PK id, FK user_id UNIQUE, admin_code UNIQUE, designation)',
  'complaint_categories (PK id, name UNIQUE, sla_hours, is_active)',
  'complaints (PK id, complaint_code UNIQUE, FK student_id, FK category_id, FK assigned_staff_id, priority, status, is_escalated)',
  'complaint_assignments (PK id, FK complaint_id, FK staff_id, FK assigned_by_admin_id, assigned_at)',
  'complaint_updates (PK id, FK complaint_id, FK updated_by_user_id, status_from, status_to, comment, attachment_path)',
  'notifications (PK id, FK user_id, FK complaint_id, title, message, type, is_read)',
  'feedback (PK id, FK complaint_id UNIQUE, FK student_id, rating 1-5, comments)',
  'announcements (PK id, FK admin_id, title, content, audience, is_pinned)',
  'activity_logs (PK id, FK user_id, action, entity_type, entity_id, details)',
];

export function LandingPage({ user, darkMode, onToggleTheme, onNavigate }: LandingPageProps) {
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [contactForm, setContactForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [contactStatus, setContactStatus] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [submittingContact, setSubmittingContact] = useState(false);
  const [showSchemaModal, setShowSchemaModal] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<PublicStats>('/public/stats')
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoadingStats(false));
  }, []);

  async function handleContactSubmit(e: React.FormEvent) {
    e.preventDefault();
    setContactStatus(null);
    setSubmittingContact(true);
    try {
      const res = await apiRequest<{ message: string }>('/public/contact', {
        method: 'POST',
        body: JSON.stringify(contactForm),
      });
      setContactStatus({ type: 'ok', text: res.message });
      setContactForm({ name: '', email: '', subject: '', message: '' });
    } catch (err) {
      setContactStatus({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to send message.',
      });
    } finally {
      setSubmittingContact(false);
    }
  }

  async function handleDownloadProject() {
    setDownloadingZip(true);
    setDownloadError(null);
    try {
      const response = await fetch('/api/public/download-project', { credentials: 'include' });
      if (!response.ok) {
        throw new Error(`Download failed (HTTP ${response.status}).`);
      }
      const buf = await response.arrayBuffer();
      const bytes = new Uint8Array(buf);
      if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
        throw new Error('Received an invalid archive response instead of a ZIP file.');
      }
      const blob = new Blob([bytes], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'campusresolve-project.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Unable to download ZIP.');
    } finally {
      setDownloadingZip(false);
    }
  }

  const activeCategories = stats?.byCategory.filter((c) => c.count > 0) ?? [];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 font-display"
          >
            CampusResolve
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a
              href="#about"
              className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors whitespace-nowrap shrink-0"
            >
              About
            </a>
            <a
              href="#workflow"
              className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors whitespace-nowrap shrink-0"
            >
              Workflow
            </a>
            <a
              href="#analytics"
              className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors whitespace-nowrap shrink-0"
            >
              Analytics
            </a>
            <a
              href="#contact"
              className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors whitespace-nowrap shrink-0"
            >
              Contact
            </a>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => onNavigate(user ? 'dashboard' : 'login')}
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {user ? 'Open Portal' : 'Portal Login'}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Split */}
      <section id="top" className="max-w-7xl mx-auto px-6 pt-10 pb-14 lg:pt-14 lg:pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-between py-2">
            <div>
              <p className="text-sm font-medium text-blue-700 dark:text-blue-400 mb-3">
                Smart Campus Complaint & Service Management System
              </p>
              <h1
                className="font-display font-bold tracking-tight text-slate-950 dark:text-white leading-[1.1] text-balance"
                style={{ fontSize: 'clamp(2.25rem, 4vw, 3.45rem)' }}
              >
                Making Every Campus Better, One Complaint at a Time.
              </h1>
              <p className="mt-5 text-base lg:text-lg text-slate-600 dark:text-slate-300 max-w-xl leading-relaxed">
                A centralized university operations portal where students report facility issues with photo evidence,
                administrators dispatch specialists against category SLAs, and maintenance teams log verified
                resolutions.
              </p>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => onNavigate(user ? (user.role === 'student' ? 'submit' : 'dashboard') : 'login')}
                className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>{user ? 'Go to Workspace' : 'Submit a Complaint'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
              {!user && (
                <button
                  type="button"
                  onClick={() => onNavigate('register')}
                  className="px-5 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Student Registration
                </button>
              )}
              <button
                type="button"
                onClick={onToggleTheme}
                aria-label="Toggle Light and Dark Theme"
                className="inline-flex items-center gap-2 px-3.5 py-3 text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {darkMode ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-indigo-600" />}
                <span>{darkMode ? 'Light' : 'Dark'}</span>
              </button>
            </div>
          </div>

          <div className="lg:col-span-6 min-h-[280px] lg:min-h-[420px]">
            <div className="h-full w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-200 dark:bg-slate-900">
              <SafeImage
                src="/src/assets/images/hero_campus_quad_1794543004757.jpg"
                alt="University engineering campus courtyard and academic building"
                className="w-full h-full object-cover"
                fallbackLabel="University Campus Quadrangle"
              />
            </div>
          </div>
        </div>

        {/* Full-Width 4-Column Live Database KPI Strip */}
        <div className="mt-10 grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Complaints Logged</div>
            <div className="mt-2 text-3xl font-bold font-mono tabular-nums text-slate-950 dark:text-white">
              {loadingStats ? '—' : stats?.total_complaints ?? 0}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Across 11 campus categories</div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Resolved & Closed</div>
            <div className="mt-2 text-3xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              {loadingStats ? '—' : stats?.resolved_complaints ?? 0}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Verified with staff proof</div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Average Resolution</div>
            <div className="mt-2 text-3xl font-bold font-mono tabular-nums text-blue-700 dark:text-blue-400">
              {loadingStats ? '—' : `${stats?.avg_resolution_hours ?? 24}h`}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Monitored against category SLAs</div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Student Satisfaction</div>
            <div className="mt-2 text-3xl font-bold font-mono tabular-nums text-indigo-700 dark:text-indigo-400">
              {loadingStats ? '—' : `${stats?.avg_rating ?? 4.6} / 5`}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              From {stats?.rating_count ?? 0} verified ratings
            </div>
          </div>
        </div>
      </section>

      {/* About & Campus Facility Bento Grid */}
      <section id="about" className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-2xl mb-10">
            <h2 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-950 dark:text-white font-display">
              Built for University Facilities, Hostels, and Academic Blocks
            </h2>
            <p className="mt-3 text-slate-600 dark:text-slate-300 leading-relaxed">
              Disconnected spreadsheets and paper registers delay repairs across hostels, classrooms, and labs.
              CampusResolve unites students, campus administrators, and maintenance engineers on one auditable platform.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-900 flex flex-col">
              <div className="h-64 overflow-hidden">
                <SafeImage
                  src="/src/assets/images/campus_service_desk_1794543006259.jpg"
                  alt="Campus operations coordinator desk with building maps and dispatch monitors"
                  className="w-full h-full object-cover"
                  fallbackLabel="Campus Operations Control Desk"
                />
              </div>
              <div className="p-6">
                <h3 className="text-lg font-bold text-slate-950 dark:text-white font-display">
                  Role-Separated Operations & SLA Escalation
                </h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  Administrators assign incoming tickets based on live staff workload, override priorities for critical
                  utility faults, and trigger automated SLA escalation alerts whenever an unresolved ticket exceeds its
                  category window.
                </p>
              </div>
            </div>

            <div className="lg:col-span-5 grid grid-rows-2 gap-6">
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-900 grid grid-cols-1 sm:grid-cols-5">
                <div className="sm:col-span-2 h-44 sm:h-full overflow-hidden">
                  <SafeImage
                    src="/src/assets/images/campus_lab_facility_1794543005498.jpg"
                    alt="University engineering and computer laboratory workstations"
                    className="w-full h-full object-cover"
                    fallbackLabel="Engineering Laboratory"
                  />
                </div>
                <div className="sm:col-span-3 p-5 flex flex-col justify-center">
                  <h3 className="text-base font-bold text-slate-950 dark:text-white font-display">
                    Labs, Wi-Fi & Classroom Tech
                  </h3>
                  <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    Dedicated categories for instrumentation, campus Wi-Fi access points, projectors, and HVAC units.
                  </p>
                </div>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-900 grid grid-cols-1 sm:grid-cols-5">
                <div className="sm:col-span-2 h-44 sm:h-full overflow-hidden">
                  <SafeImage
                    src="/src/assets/images/campus_library_hall_1794543006145.jpg"
                    alt="Modern university library reading hall"
                    className="w-full h-full object-cover"
                    fallbackLabel="Central Library Hall"
                  />
                </div>
                <div className="sm:col-span-3 p-5 flex flex-col justify-center">
                  <h3 className="text-base font-bold text-slate-950 dark:text-white font-display">
                    Hostels, Library & Sanitation
                  </h3>
                  <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    Students attach site photos, verify repairs upon completion, or reopen unresolved cases directly.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Workflow Section */}
      <section id="workflow" className="border-t border-slate-200 dark:border-slate-800 py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-2xl mb-10">
            <h2 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-950 dark:text-white font-display">
              Transparent 7-Stage Resolution Lifecycle
            </h2>
            <p className="mt-2 text-slate-600 dark:text-slate-300">
              Every ticket receives a unique tracking ID (<span className="font-mono text-sm">CMP-YYYY-XXXX</span>)
              and an immutable timestamped audit trail from submission through closure.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                num: '01.',
                title: 'Student Logs Issue',
                body: 'Select from 11 campus categories, tag the exact building and room, set priority, and upload photographic evidence.',
              },
              {
                num: '02.',
                title: 'Triage & Staff Dispatch',
                body: 'Campus administrators review priority, monitor technician workloads, and assign the best specialist team.',
              },
              {
                num: '03.',
                title: 'Progress & Proof Upload',
                body: 'Assigned staff accept the ticket, log diagnostic updates, and attach a resolution proof photo on completion.',
              },
              {
                num: '04.',
                title: 'Verification & Rating',
                body: 'Students receive instant notifications, rate the resolution quality from 1 to 5 stars, or reopen if unresolved.',
              },
            ].map((step) => (
              <div
                key={step.num}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6"
              >
                <div className="text-sm font-mono font-semibold text-blue-700 dark:text-blue-400 mb-3">
                  {step.num}
                </div>
                <h3 className="text-base font-bold text-slate-950 dark:text-white font-display">{step.title}</h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Live Analytics & Announcements Section */}
      <section id="analytics" className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-7 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
              <div className="flex items-center justify-between gap-4 mb-5">
                <div>
                  <h2 className="text-xl font-bold text-slate-950 dark:text-white font-display">
                    Live Campus Issue Distribution
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Aggregated directly from the relational campus database
                  </p>
                </div>
              </div>
              {activeCategories.length > 0 ? (
                <ChartCanvas
                  type="bar"
                  horizontal
                  darkMode={darkMode}
                  height={280}
                  labels={activeCategories.map((c) => c.name)}
                  datasets={[
                    {
                      label: 'Recorded Complaints',
                      data: activeCategories.map((c) => c.count),
                      backgroundColor: '#2563eb',
                      borderColor: '#1d4ed8',
                      borderRadius: 4,
                    },
                  ]}
                />
              ) : (
                <div className="h-[280px] flex items-center justify-center text-sm text-slate-500">
                  Loading live campus distribution...
                </div>
              )}
            </div>

            <div className="lg:col-span-5 flex flex-col justify-between bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
              <div>
                <h2 className="text-xl font-bold text-slate-950 dark:text-white font-display mb-4">
                  Campus Service Bulletins
                </h2>
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {(stats?.announcements ?? []).map((ann) => (
                    <div key={ann.id} className="py-3.5 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1">
                        <span>{ann.audience}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatDateShort(ann.created_at)}</span>
                        {ann.is_pinned ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-semibold text-blue-700 dark:text-blue-400">Pinned</span>
                          </>
                        ) : null}
                      </div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{ann.title}</h3>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{ann.content}</p>
                    </div>
                  ))}
                  {(!stats?.announcements || stats.announcements.length === 0) && (
                    <p className="text-sm text-slate-500 py-6">No active campus bulletins.</p>
                  )}
                </div>
              </div>
              <div className="pt-5 mt-5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {stats?.total_students ?? 0} Students · {stats?.total_staff ?? 0} Specialists active
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('login')}
                  className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer whitespace-nowrap"
                >
                  Sign in to view all
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact & Help Desk */}
      <section id="contact" className="border-t border-slate-200 dark:border-slate-800 py-16">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-5">
            <h2 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-950 dark:text-white font-display">
              Campus Help Desk & Inquiries
            </h2>
            <p className="mt-3 text-slate-600 dark:text-slate-300 leading-relaxed">
              Need help activating your student portal account or reporting an urgent safety hazard outside standard
              office hours? Reach the Campus Operations Desk directly.
            </p>
            <div className="mt-6 space-y-3 text-sm text-slate-700 dark:text-slate-300">
              <div>
                <span className="font-semibold text-slate-950 dark:text-white">Operations Office:</span> Ground Floor,
                Centre for Engineering & Technology
              </div>
              <div>
                <span className="font-semibold text-slate-950 dark:text-white">Support Hours:</span> Mon–Sat, 08:00 AM
                to 08:00 PM (24/7 Critical SLA Watch)
              </div>
              <div>
                <span className="font-semibold text-slate-950 dark:text-white">Helpdesk Email:</span>{' '}
                operations@campus.edu
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 lg:p-8">
            <form onSubmit={handleContactSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Your Name
                  </label>
                  <input
                    type="text"
                    required
                    value={contactForm.name}
                    onChange={(e) => setContactForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Aarav Patel"
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Campus Email
                  </label>
                  <input
                    type="email"
                    required
                    value={contactForm.email}
                    onChange={(e) => setContactForm((p) => ({ ...p, email: e.target.value }))}
                    placeholder="you@campus.edu"
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Subject
                </label>
                <input
                  type="text"
                  required
                  value={contactForm.subject}
                  onChange={(e) => setContactForm((p) => ({ ...p, subject: e.target.value }))}
                  placeholder="Account support or general campus inquiry"
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Message
                </label>
                <textarea
                  rows={4}
                  required
                  value={contactForm.message}
                  onChange={(e) => setContactForm((p) => ({ ...p, message: e.target.value }))}
                  placeholder="Describe your question or assistance request..."
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>
              {contactStatus && (
                <div
                  className={`flex items-center gap-2 text-sm px-3.5 py-2.5 rounded-lg border ${
                    contactStatus.type === 'ok'
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300'
                      : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300'
                  }`}
                >
                  {contactStatus.type === 'ok' && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                  <span>{contactStatus.text}</span>
                </div>
              )}
              <button
                type="submit"
                disabled={submittingContact}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-lg transition-colors disabled:opacity-60 cursor-pointer"
              >
                {submittingContact ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Quiet Academic Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div>
            <span className="font-semibold text-slate-900 dark:text-white">CampusResolve</span>
            <span className="mx-2">·</span>
            <span>Smart Campus Complaint & Service Management System</span>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <button
              type="button"
              onClick={handleDownloadProject}
              disabled={downloadingZip}
              className="inline-flex items-center gap-1.5 font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer disabled:opacity-60"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{downloadingZip ? 'Preparing ZIP...' : 'Download Project (.zip)'}</span>
            </button>
            {downloadError && <span className="text-rose-600 dark:text-rose-400">{downloadError}</span>}
            <button
              type="button"
              onClick={() => setShowSchemaModal(true)}
              className="inline-flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              <Database className="h-3.5 w-3.5" />
              <span>Database Schema (12 Tables)</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('login')}
              className="hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              Portal Login
            </button>
            <button
              type="button"
              onClick={() => onNavigate('register')}
              className="hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              Register
            </button>
          </div>
        </div>
      </footer>

      {showSchemaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-w-2xl w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-slate-950 dark:text-white font-display">
                  Normalized Relational Schema (smart_campus_db)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Full MySQL 8 DDL available in database/schema.sql
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSchemaModal(false)}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {SCHEMA_TABLES.map((tbl, idx) => (
                <div
                  key={tbl}
                  className="text-xs font-mono px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300"
                >
                  <span className="text-blue-700 dark:text-blue-400 mr-2">{String(idx + 1).padStart(2, '0')}.</span>
                  {tbl}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
