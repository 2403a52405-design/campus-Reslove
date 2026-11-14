# CampusResolve — Smart Campus Complaint & Service Management System

**Tagline:** *"Making Every Campus Better, One Complaint at a Time."*

A full-stack university facility complaint submission, staff dispatch, real-time tracking, SLA escalation, and service quality analytics platform.

---

## Key Capabilities

- **Three Role-Based Portals**:
  - **Student Portal**: Submit complaints with category, building location, priority, and photo evidence; track 7-stage visual progress; receive real-time notifications; reopen unresolved issues; submit 1–5 star feedback and ratings.
  - **Administrator Portal**: Live KPI dashboard, Chart.js analytics backed by SQL aggregations, staff dispatch & workload balancing, overdue SLA escalation engine, student/staff account governance, category SLA configuration, campus announcements, audit activity logs, and filtered CSV report export.
  - **Staff Portal**: View assigned tickets, accept assignments, log work progress comments, upload resolution proof images, and monitor personal completion metrics.
- **Security & Engineering**:
  - Salted `scrypt` password hashing with timing-safe verification
  - HMAC-SHA256 signed HTTP-only session cookies (`sc_session`)
  - CSRF header token validation (`X-CSRF-Token`) on all mutating endpoints
  - Role-based authorization middleware (`student`, `staff`, `admin`)
  - Validated image upload pipeline (`.jpg`, `.png`, `.webp` up to 5 MB)
- **Dual-Theme UI**: Crisp light & dark mode toggle across all landing, auth, and dashboard views.

---

## Database Architecture (`smart_campus_db`)

The relational schema models 12 normalized tables with primary keys, foreign keys, unique constraints, and indexes (see `database/schema.sql` for the complete MySQL 8 DDL):

1. `users`
2. `students`
3. `staff`
4. `admins`
5. `complaint_categories`
6. `complaints`
7. `complaint_assignments`
8. `complaint_updates`
9. `notifications`
10. `feedback`
11. `announcements`
12. `activity_logs`

---

## Demo Login Credentials (For Academic Evaluation)

| Role | Email | Password |
| :--- | :--- | :--- |
| **Administrator** | `admin@campus.edu` | `Admin@123` |
| **Staff (Electrical)** | `rajesh.elec@campus.edu` | `Staff@123` |
| **Staff (IT & Wi-Fi)** | `priya.it@campus.edu` | `Staff@123` |
| **Staff (Civil & Water)** | `vikram.civil@campus.edu` | `Staff@123` |
| **Student (CSE)** | `aarav.24cs@campus.edu` | `Student@123` |
| **Student (ECE)** | `meera.24ec@campus.edu` | `Student@123` |

---

## Local Execution Commands

```bash
npm install
npm run dev       # Starts Express API + Vite dev server on http://localhost:3000
npm run lint      # Runs TypeScript typechecking
npm run build     # Compiles production frontend bundle
npx tsx tests/api.test.ts   # Runs end-to-end API & RBAC integration tests
```
