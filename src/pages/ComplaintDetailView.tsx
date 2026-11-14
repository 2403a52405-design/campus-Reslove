import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  MapPin,
  RotateCcw,
  Star,
  Upload,
  UserCheck,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  ComplaintProgressTracker,
  PriorityIndicator,
  SafeImage,
  StatusIndicator,
} from '../components/StatusVisuals.tsx';
import { apiRequest, formatDateTime } from '../lib/api.ts';
import type {
  Complaint,
  ComplaintAssignment,
  ComplaintPriority,
  ComplaintStatus,
  ComplaintUpdate,
  FeedbackRecord,
  UserProfile,
} from '../types.ts';

interface StaffOption {
  staff_id: number;
  full_name: string;
  department: string;
  specialization: string;
  availability_status: string;
  active_tasks: number;
}

interface ComplaintDetailViewProps {
  complaintId: number;
  user: UserProfile;
  onBack: () => void;
  onToast: (msg: string, type?: 'ok' | 'err') => void;
}

export function ComplaintDetailView({
  complaintId,
  user,
  onBack,
  onToast,
}: ComplaintDetailViewProps) {
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [updates, setUpdates] = useState<ComplaintUpdate[]>([]);
  const [assignments, setAssignments] = useState<ComplaintAssignment[]>([]);
  const [feedback, setFeedback] = useState<FeedbackRecord | null>(null);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Admin assignment state
  const [assignStaffId, setAssignStaffId] = useState('');
  const [assignPriority, setAssignPriority] = useState<ComplaintPriority>('Medium');
  const [assignNotes, setAssignNotes] = useState('');
  const [assigning, setAssigning] = useState(false);

  // Staff / Admin status update state
  const [nextStatus, setNextStatus] = useState<ComplaintStatus>('In Progress');
  const [statusComment, setStatusComment] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Student reopen & feedback state
  const [reopenReason, setReopenReason] = useState('');
  const [showReopenBox, setShowReopenBox] = useState(false);
  const [reopening, setReopening] = useState(false);

  const [rating, setRating] = useState(5);
  const [feedbackComments, setFeedbackComments] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{
        complaint: Complaint;
        updates: ComplaintUpdate[];
        assignments: ComplaintAssignment[];
        feedback: FeedbackRecord | null;
      }>(`/complaints/${complaintId}`);
      setComplaint(res.complaint);
      setUpdates(res.updates);
      setAssignments(res.assignments);
      setFeedback(res.feedback);
      setAssignPriority(res.complaint.priority);
      if (res.complaint.assigned_staff_id) {
        setAssignStaffId(String(res.complaint.assigned_staff_id));
      }
      if (res.complaint.status === 'Assigned' || res.complaint.status === 'Reopened') {
        setNextStatus('In Progress');
      } else if (res.complaint.status === 'In Progress') {
        setNextStatus('Resolved');
      } else {
        setNextStatus(res.complaint.status);
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to load complaint details.', 'err');
    } finally {
      setLoading(false);
    }
  }, [complaintId, onToast]);

  useEffect(() => {
    loadDetail();
    if (user.role === 'admin') {
      apiRequest<{ staff: StaffOption[] }>('/admin/users')
        .then((d) => setStaffOptions(d.staff))
        .catch(() => setStaffOptions([]));
    }
  }, [loadDetail, user.role]);

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!assignStaffId) {
      onToast('Please select a staff member to assign.', 'err');
      return;
    }
    setAssigning(true);
    try {
      const res = await apiRequest<{ message: string }>(`/complaints/${complaintId}/assign`, {
        method: 'POST',
        body: JSON.stringify({
          staff_id: Number(assignStaffId),
          priority: assignPriority,
          notes: assignNotes,
        }),
      });
      onToast(res.message);
      setAssignNotes('');
      await loadDetail();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Assignment failed.', 'err');
    } finally {
      setAssigning(false);
    }
  }

  async function handleStatusUpdate(e: React.FormEvent) {
    e.preventDefault();
    setUpdatingStatus(true);
    try {
      const fd = new FormData();
      fd.append('status', nextStatus);
      fd.append('comment', statusComment);
      if (user.role === 'admin') {
        fd.append('priority', assignPriority);
      }
      if (proofFile) {
        fd.append('resolution_image', proofFile);
      }
      const res = await apiRequest<{ message: string }>(`/complaints/${complaintId}/status`, {
        method: 'PATCH',
        body: fd,
      });
      onToast(res.message);
      setStatusComment('');
      setProofFile(null);
      await loadDetail();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Status update failed.', 'err');
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handleReopen(e: React.FormEvent) {
    e.preventDefault();
    setReopening(true);
    try {
      const res = await apiRequest<{ message: string }>(`/complaints/${complaintId}/reopen`, {
        method: 'POST',
        body: JSON.stringify({ reason: reopenReason }),
      });
      onToast(res.message);
      setReopenReason('');
      setShowReopenBox(false);
      await loadDetail();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not reopen ticket.', 'err');
    } finally {
      setReopening(false);
    }
  }

  async function handleFeedback(e: React.FormEvent) {
    e.preventDefault();
    setSubmittingFeedback(true);
    try {
      const res = await apiRequest<{ message: string }>(`/complaints/${complaintId}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ rating, comments: feedbackComments }),
      });
      onToast(res.message);
      await loadDetail();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not submit rating.', 'err');
    } finally {
      setSubmittingFeedback(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-44 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
        <div className="h-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl" />
      </div>
    );
  }

  if (!complaint) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center">
        <p className="text-sm text-slate-600 dark:text-slate-400">Complaint record could not be located.</p>
        <button
          type="button"
          onClick={onBack}
          className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg cursor-pointer"
        >
          Return to List
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Complaints</span>
        </button>
        <div className="flex items-center gap-4">
          <PriorityIndicator priority={complaint.priority} escalated={Boolean(complaint.is_escalated)} />
          <StatusIndicator status={complaint.status} />
        </div>
      </div>

      {/* Main Ticket Summary Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono font-semibold text-blue-700 dark:text-blue-400">
                {complaint.complaint_code}
              </span>
              <span aria-hidden="true">·</span>
              <span>{complaint.category_name}</span>
              <span aria-hidden="true">·</span>
              <span>SLA {complaint.category_sla_hours}h</span>
              <span aria-hidden="true">·</span>
              <span>Submitted {formatDateTime(complaint.created_at)}</span>
            </div>
            <h1 className="mt-2 text-xl lg:text-2xl font-bold text-slate-950 dark:text-white font-display">
              {complaint.title}
            </h1>
            <div className="mt-2 inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
              <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
              <span>{complaint.location}</span>
            </div>
          </div>
        </div>

        {Boolean(complaint.is_escalated) && !['Resolved', 'Closed'].includes(complaint.status) && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50 dark:bg-rose-950/30 text-sm text-rose-800 dark:text-rose-200">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>
              This complaint exceeded its category SLA target and has been escalated to Campus Administration.
            </span>
          </div>
        )}

        <div>
          <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3">
            Resolution Progress Tracker
          </h2>
          <ComplaintProgressTracker status={complaint.status} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
          <div className="lg:col-span-7 space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                Issue Description
              </h3>
              <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-line">
                {complaint.description}
              </p>
            </div>

            {complaint.resolution_notes && (
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                <h3 className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1.5">
                  Resolution Summary
                </h3>
                <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                  {complaint.resolution_notes}
                </p>
              </div>
            )}

            {(complaint.image_path || complaint.resolution_image_path) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-200 dark:border-slate-800">
                {complaint.image_path && (
                  <div>
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                      Submitted Evidence Photo
                    </div>
                    <div className="h-48 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800">
                      <SafeImage
                        src={complaint.image_path}
                        alt="Student uploaded issue evidence"
                        className="w-full h-full object-cover"
                        fallbackLabel="Submitted Photo"
                      />
                    </div>
                  </div>
                )}
                {complaint.resolution_image_path && (
                  <div>
                    <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-2">
                      Staff Resolution Proof
                    </div>
                    <div className="h-48 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800">
                      <SafeImage
                        src={complaint.resolution_image_path}
                        alt="Staff resolution verification photo"
                        className="w-full h-full object-cover"
                        fallbackLabel="Resolution Proof"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="lg:col-span-5 space-y-4 lg:border-l lg:border-slate-200 lg:dark:border-slate-800 lg:pl-6">
            <div>
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                Reported By Student
              </h3>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">{complaint.student_name}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                <span className="font-mono">{complaint.student_roll}</span> · {complaint.student_department}
              </div>
              {complaint.student_hostel && (
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{complaint.student_hostel}</div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                Assigned Staff Specialist
              </h3>
              {complaint.staff_name ? (
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                    <UserCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span>{complaint.staff_name}</span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    <span className="font-mono">{complaint.staff_code}</span> · {complaint.staff_department}
                  </div>
                  {complaint.staff_specialization && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {complaint.staff_specialization}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Awaiting assignment by Campus Administration.
                </p>
              )}
            </div>

            {complaint.resolved_at && (
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Resolved Timestamp</div>
                <div className="text-xs font-mono text-slate-800 dark:text-slate-200 mt-1">
                  {formatDateTime(complaint.resolved_at)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Role-Specific Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <h2 className="text-base font-bold text-slate-950 dark:text-white font-display mb-4">
            Activity & Status Timeline
          </h2>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {updates.map((u) => (
              <div key={u.id} className="py-3.5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-white">{u.updated_by_name}</span>
                    <span className="mx-1.5">·</span>
                    <span className="capitalize">{u.updated_by_role}</span>
                    <span className="mx-1.5">·</span>
                    <span className="font-semibold text-blue-700 dark:text-blue-400">
                      {u.status_from ? `${u.status_from} → ${u.status_to}` : u.status_to}
                    </span>
                  </div>
                  <span className="font-mono text-[11px]">{formatDateTime(u.created_at)}</span>
                </div>
                <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-300">{u.comment}</p>
              </div>
            ))}
          </div>

          {assignments.length > 0 && (
            <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                Assignment History
              </h3>
              <div className="space-y-1.5">
                {assignments.map((a) => (
                  <div key={a.id} className="text-xs text-slate-600 dark:text-slate-300 flex justify-between gap-2">
                    <span>
                      Dispatched to <strong>{a.staff_name}</strong> ({a.staff_department}) by {a.admin_name}
                    </span>
                    <span className="font-mono text-slate-400 shrink-0">{formatDateTime(a.assigned_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Action Column */}
        <div className="lg:col-span-5 space-y-6">
          {/* Admin Dispatch Panel */}
          {user.role === 'admin' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
              <h2 className="text-base font-bold text-slate-950 dark:text-white font-display mb-4">
                Assign Staff & Priority
              </h2>
              <form onSubmit={handleAssign} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Select Specialist Staff
                  </label>
                  <select
                    required
                    value={assignStaffId}
                    onChange={(e) => setAssignStaffId(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  >
                    <option value="">Choose staff member...</option>
                    {staffOptions.map((sf) => (
                      <option key={sf.staff_id} value={sf.staff_id}>
                        {sf.full_name} — {sf.department} ({sf.active_tasks} active)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Priority Level
                  </label>
                  <select
                    value={assignPriority}
                    onChange={(e) => setAssignPriority(e.target.value as ComplaintPriority)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Dispatch Note
                  </label>
                  <input
                    type="text"
                    value={assignNotes}
                    onChange={(e) => setAssignNotes(e.target.value)}
                    placeholder="Instructions for technician..."
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  />
                </div>
                <button
                  type="submit"
                  disabled={assigning}
                  className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-lg transition-colors disabled:opacity-60 cursor-pointer"
                >
                  {assigning ? 'Assigning...' : 'Assign & Notify Staff'}
                </button>
              </form>
            </div>
          )}

          {/* Staff & Admin Status Progression Panel */}
          {(user.role === 'staff' || user.role === 'admin') && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
              <h2 className="text-base font-bold text-slate-950 dark:text-white font-display mb-4">
                Update Progress & Resolution
              </h2>
              <form onSubmit={handleStatusUpdate} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Target Status
                  </label>
                  <select
                    value={nextStatus}
                    onChange={(e) => setNextStatus(e.target.value as ComplaintStatus)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  >
                    {user.role === 'admin' && <option value="Under Review">Under Review</option>}
                    <option value="Assigned">Assigned</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Resolved">Resolved</option>
                    {user.role === 'admin' && <option value="Closed">Closed</option>}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Work Progress / Resolution Notes
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={statusComment}
                    onChange={(e) => setStatusComment(e.target.value)}
                    placeholder="Describe inspection findings or parts replaced..."
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Resolution Proof Photo (Optional · JPG/PNG/WEBP)
                  </label>
                  <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 cursor-pointer hover:border-blue-500">
                    <Upload className="h-4 w-4 text-slate-400" />
                    <span className="truncate">{proofFile ? proofFile.name : 'Choose proof image...'}</span>
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp"
                      className="hidden"
                      onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={updatingStatus}
                  className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-indigo-700 hover:bg-indigo-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 rounded-lg transition-colors disabled:opacity-60 cursor-pointer"
                >
                  {updatingStatus ? 'Saving Update...' : 'Save Status Update'}
                </button>
              </form>
            </div>
          )}

          {/* Student Feedback & Reopen Actions */}
          {user.role === 'student' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
              {feedback ? (
                <div>
                  <div className="flex items-center gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Your Feedback Recorded</span>
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={`h-4 w-4 ${
                          n <= feedback.rating
                            ? 'text-amber-500 fill-amber-500'
                            : 'text-slate-300 dark:text-slate-700'
                        }`}
                      />
                    ))}
                    <span className="ml-2 text-xs font-mono font-semibold">{feedback.rating}/5</span>
                  </div>
                  {feedback.comments && (
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{feedback.comments}</p>
                  )}
                </div>
              ) : ['Resolved', 'Closed'].includes(complaint.status) ? (
                <form onSubmit={handleFeedback} className="space-y-3">
                  <h2 className="text-base font-bold text-slate-950 dark:text-white font-display">
                    Rate Resolution Quality
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Submitting feedback confirms resolution and closes the ticket.
                  </p>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setRating(n)}
                        className="p-1 cursor-pointer"
                        aria-label={`Rate ${n} stars`}
                      >
                        <Star
                          className={`h-6 w-6 ${
                            n <= rating
                              ? 'text-amber-500 fill-amber-500'
                              : 'text-slate-300 dark:text-slate-700'
                          }`}
                        />
                      </button>
                    ))}
                    <span className="ml-2 text-xs font-mono font-semibold">{rating} / 5</span>
                  </div>
                  <textarea
                    rows={2}
                    value={feedbackComments}
                    onChange={(e) => setFeedbackComments(e.target.value)}
                    placeholder="Optional feedback about service speed or quality..."
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  />
                  <button
                    type="submit"
                    disabled={submittingFeedback}
                    className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors disabled:opacity-60 cursor-pointer"
                  >
                    {submittingFeedback ? 'Submitting...' : 'Submit Rating & Close'}
                  </button>
                </form>
              ) : (
                <div>
                  <h2 className="text-base font-bold text-slate-950 dark:text-white font-display">
                    Ticket Under Active Handling
                  </h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    You will be notified when the assigned team marks this complaint Resolved. Once resolved, you can
                    rate the resolution or reopen the ticket if the problem persists.
                  </p>
                </div>
              )}

              {['Resolved', 'Closed'].includes(complaint.status) && (
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                  {!showReopenBox ? (
                    <button
                      type="button"
                      onClick={() => setShowReopenBox(true)}
                      className="inline-flex items-center gap-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Issue still not fixed? Reopen this complaint</span>
                    </button>
                  ) : (
                    <form onSubmit={handleReopen} className="space-y-3">
                      <label className="block text-xs font-semibold text-rose-700 dark:text-rose-300">
                        Reason for Reopening
                      </label>
                      <textarea
                        rows={2}
                        required
                        minLength={5}
                        value={reopenReason}
                        onChange={(e) => setReopenReason(e.target.value)}
                        placeholder="Explain what remains unresolved..."
                        className="w-full px-3 py-2 text-sm rounded-lg border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="submit"
                          disabled={reopening}
                          className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer"
                        >
                          {reopening ? 'Reopening...' : 'Confirm Reopen'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowReopenBox(false)}
                          className="px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
