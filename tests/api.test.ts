import assert from 'node:assert/strict';
import cookieParser from 'cookie-parser';
import express from 'express';
import http from 'node:http';
import { initializeDatabase } from '../server/db.ts';
import { createApiRouter } from '../server/routes.ts';

async function runTests() {
  initializeDatabase();

  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api', createApiRouter());

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}/api`;

  async function req(
    path: string,
    options: { method?: string; body?: unknown; cookie?: string; csrf?: string } = {}
  ) {
    const headers: Record<string, string> = {};
    if (options.body) headers['Content-Type'] = 'application/json';
    if (options.cookie) headers['Cookie'] = options.cookie;
    if (options.csrf) headers['X-CSRF-Token'] = options.csrf;

    const res = await fetch(`${baseUrl}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const setCookie = res.headers.get('set-cookie');
    const cookieVal = setCookie ? setCookie.split(';')[0] : options.cookie;
    const text = await res.text();
    const data = text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) : text;
    return { status: res.status, data, cookie: cookieVal };
  }

  try {
    console.log('1. Testing public stats endpoint...');
    const pub = await req('/public/stats');
    assert.equal(pub.status, 200);
    assert(pub.data.total_complaints >= 10);

    console.log('2. Testing student registration...');
    const uniqueSuffix = Date.now();
    const reg = await req('/auth/register', {
      method: 'POST',
      body: {
        full_name: 'Test Student',
        email: `test.student.${uniqueSuffix}@campus.edu`,
        password: 'Password123',
        roll_number: `BT26TST${uniqueSuffix % 10000}`,
        department: 'Computer Science & Engineering',
        academic_year: 2,
        hostel_block: 'Hostel Block B',
      },
    });
    assert.equal(reg.status, 201);
    assert.equal(reg.data.user.role, 'student');
    const studentCookie = reg.cookie!;
    const studentCsrf = reg.data.csrfToken as string;

    console.log('3. Testing RBAC blocks student from admin endpoints...');
    const forbidden = await req('/admin/users', { cookie: studentCookie });
    assert.equal(forbidden.status, 403);

    console.log('4. Testing CSRF protection rejects state change without token...');
    const noCsrf = await req('/complaints', {
      method: 'POST',
      cookie: studentCookie,
      body: { category_id: 1, title: 'Broken switch', location: 'Block A', description: 'Switch sparked twice.' },
    });
    assert.equal(noCsrf.status, 403);

    console.log('5. Testing complaint submission...');
    const submit = await req('/complaints', {
      method: 'POST',
      cookie: studentCookie,
      csrf: studentCsrf,
      body: {
        category_id: 1,
        title: 'Test corridor light failure',
        location: 'Academic Block B · Floor 1',
        priority: 'High',
        description: 'Three corridor lights near Lab 102 are completely non-functional.',
      },
    });
    assert.equal(submit.status, 201);
    assert(submit.data.complaint_code.startsWith('CMP-'));
    const complaintId = submit.data.id as number;

    console.log('6. Testing Admin login & staff assignment...');
    const adminLogin = await req('/auth/login', {
      method: 'POST',
      body: { email: 'admin@campus.edu', password: 'Admin@123' },
    });
    assert.equal(adminLogin.status, 200);
    assert.equal(adminLogin.data.user.role, 'admin');
    const adminCookie = adminLogin.cookie!;
    const adminCsrf = adminLogin.data.csrfToken as string;

    const assign = await req(`/complaints/${complaintId}/assign`, {
      method: 'POST',
      cookie: adminCookie,
      csrf: adminCsrf,
      body: { staff_id: 1, priority: 'Critical', notes: 'Inspect breaker panel immediately.' },
    });
    assert.equal(assign.status, 200);

    console.log('7. Testing Staff login & status resolution...');
    const staffLogin = await req('/auth/login', {
      method: 'POST',
      body: { email: 'rajesh.elec@campus.edu', password: 'Staff@123' },
    });
    assert.equal(staffLogin.status, 200);
    const staffCookie = staffLogin.cookie!;
    const staffCsrf = staffLogin.data.csrfToken as string;

    const resolve = await req(`/complaints/${complaintId}/status`, {
      method: 'PATCH',
      cookie: staffCookie,
      csrf: staffCsrf,
      body: { status: 'Resolved', comment: 'Replaced tripped MCB and two LED drivers.' },
    });
    assert.equal(resolve.status, 200);

    console.log('8. Testing Student feedback rating & auto-close...');
    const fb = await req(`/complaints/${complaintId}/feedback`, {
      method: 'POST',
      cookie: studentCookie,
      csrf: studentCsrf,
      body: { rating: 5, comments: 'Resolved same afternoon.' },
    });
    assert.equal(fb.status, 201);

    const detail = await req(`/complaints/${complaintId}`, { cookie: studentCookie });
    assert.equal(detail.status, 200);
    assert.equal(detail.data.complaint.status, 'Closed');
    assert.equal(detail.data.feedback.rating, 5);

    console.log('9. Testing Admin analytics & CSV export...');
    const analytics = await req('/analytics', { cookie: adminCookie });
    assert.equal(analytics.status, 200);
    assert(analytics.data.byCategory.length > 0);

    const csvRes = await req('/reports/export.csv', { cookie: adminCookie });
    assert.equal(csvRes.status, 200);
    assert(typeof csvRes.data === 'string' && csvRes.data.includes('Complaint ID,Title,Category'));

    console.log('All integration tests passed successfully!');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
