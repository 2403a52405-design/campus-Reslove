import { Bell, CheckCheck, HelpCircle, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { apiRequest, formatDateTime } from '../lib/api.ts';
import type { NotificationItem, UserProfile } from '../types.ts';

export function NotificationsView({
  notifications,
  onMarkRead,
  onMarkAllRead,
  onOpenComplaint,
}: {
  notifications: NotificationItem[];
  onMarkRead: (id: number) => void;
  onMarkAllRead: () => void;
  onOpenComplaint: (complaintId: number) => void;
}) {
  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950 dark:text-white font-display">Notifications</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Real-time status updates, staff assignments, escalations, and campus bulletins.
          </p>
        </div>
        {notifications.some((n) => !n.is_read) && (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 rounded-lg cursor-pointer"
          >
            <CheckCheck className="h-4 w-4" />
            <span>Mark All Read</span>
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
        {notifications.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            <Bell className="h-6 w-6 mx-auto mb-2 text-slate-400" />
            You have no notifications yet.
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className={`p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                !n.is_read ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
              }`}
            >
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="capitalize font-semibold text-blue-700 dark:text-blue-400">{n.type}</span>
                  <span>·</span>
                  <span className="font-mono">{formatDateTime(n.created_at)}</span>
                  {!n.is_read && (
                    <>
                      <span>·</span>
                      <span className="font-semibold text-indigo-600 dark:text-indigo-400">Unread</span>
                    </>
                  )}
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{n.title}</div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{n.message}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {n.complaint_id && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!n.is_read) onMarkRead(n.id);
                      onOpenComplaint(n.complaint_id!);
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                  >
                    View Ticket
                  </button>
                )}
                {!n.is_read && (
                  <button
                    type="button"
                    onClick={() => onMarkRead(n.id)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer"
                  >
                    Mark Read
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function ProfileView({
  user,
  onUpdated,
  onToast,
}: {
  user: UserProfile;
  onUpdated: (user: UserProfile) => void;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}) {
  const [form, setForm] = useState({
    full_name: user.full_name,
    phone: user.phone || '',
    department: user.department || '',
    academic_year: String(user.academic_year || 1),
    hostel_block: user.hostel_block || 'Day Scholar',
    availability_status: user.availability_status || 'Available',
    new_password: '',
  });
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiRequest<{ user: UserProfile }>('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({
          ...form,
          academic_year: Number(form.academic_year),
        }),
      });
      onUpdated(res.user);
      setForm((p) => ({ ...p, new_password: '' }));
      onToast('Profile settings saved.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to update profile.', 'err');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-950 dark:text-white font-display">Profile & Account Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Manage your campus contact details, residence info, or update your password.
        </p>
      </div>

      <form
        onSubmit={handleSave}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
      >
        <div className="flex items-center gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="h-11 w-11 rounded-lg bg-blue-700 text-white flex items-center justify-center font-display font-bold text-base">
            {user.full_name
              .split(' ')
              .slice(0, 2)
              .map((w) => w[0])
              .join('')}
          </div>
          <div>
            <div className="text-sm font-bold text-slate-950 dark:text-white">{user.full_name}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {user.email} · <span className="capitalize">{user.role}</span>
              {user.roll_number ? ` · ${user.roll_number}` : ''}
              {user.employee_code ? ` · ${user.employee_code}` : ''}
              {user.admin_code ? ` · ${user.admin_code}` : ''}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Full Name
            </label>
            <input
              type="text"
              required
              value={form.full_name}
              onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Phone Number
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
        </div>

        {user.role === 'student' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Department
              </label>
              <input
                type="text"
                value={form.department}
                onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Year</label>
              <select
                value={form.academic_year}
                onChange={(e) => setForm((p) => ({ ...p, academic_year: e.target.value }))}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="1">Year 1</option>
                <option value="2">Year 2</option>
                <option value="3">Year 3</option>
                <option value="4">Year 4</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Hostel / Residence
              </label>
              <input
                type="text"
                value={form.hostel_block}
                onChange={(e) => setForm((p) => ({ ...p, hostel_block: e.target.value }))}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          </div>
        )}

        {user.role === 'staff' && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Duty Availability Status
            </label>
            <select
              value={form.availability_status}
              onChange={(e) =>
                setForm((p) => ({ ...p, availability_status: e.target.value as 'Available' | 'Busy' | 'Off Duty' }))
              }
              className="w-full sm:w-64 px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              <option value="Available">Available</option>
              <option value="Busy">Busy</option>
              <option value="Off Duty">Off Duty</option>
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            Change Password (leave blank to keep current)
          </label>
          <input
            type="password"
            minLength={6}
            value={form.new_password}
            onChange={(e) => setForm((p) => ({ ...p, new_password: e.target.value }))}
            placeholder="Min 6 characters"
            className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}

export function HelpAndAboutView({
  user,
  onToast,
}: {
  user: UserProfile;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  async function handleHelpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      const res = await apiRequest<{ message: string }>('/public/contact', {
        method: 'POST',
        body: JSON.stringify({
          name: user.full_name,
          email: user.email,
          subject,
          message,
        }),
      });
      onToast(res.message);
      setSubject('');
      setMessage('');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to submit inquiry.', 'err');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-950 dark:text-white font-display">Help & System Guide</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          SLA targets, security architecture, and direct operations desk support.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3">
          <div className="flex items-center gap-2 text-base font-bold text-slate-950 dark:text-white font-display">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
            <span>Campus SLA Policy</span>
          </div>
          <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
            <li>• Water Supply, Washroom & Wi-Fi Issues: 12-hour target SLA.</li>
            <li>• Electrical, Hostel & Transport Issues: 24-hour target SLA.</li>
            <li>• Laboratory Equipment: 36-hour target SLA.</li>
            <li>• Classroom & Library Maintenance: 48-hour target SLA.</li>
            <li>• Overdue tickets automatically escalate to Campus Administration.</li>
          </ul>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-2 text-base font-bold text-slate-950 dark:text-white font-display mb-3">
            <HelpCircle className="h-5 w-5 text-indigo-600" />
            <span>Contact Operations Desk</span>
          </div>
          <form onSubmit={handleHelpSubmit} className="space-y-3">
            <input
              type="text"
              required
              minLength={3}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <textarea
              rows={3}
              required
              minLength={10}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe your help request..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
            <button
              type="submit"
              disabled={sending}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
            >
              {sending ? 'Sending...' : 'Send Help Request'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
