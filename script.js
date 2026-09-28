/* ============================================================
   StudyHub — Frontend Logic (Connected to API)
   ============================================================ */
'use strict';

import {
  auth,
  authApi,
  userApi,
  dashboardApi,
  courseApi,
  assignmentApi,
  projectApi,
  friendApi,
  notificationApi,
  analyticsApi,
  settingApi,
} from './api.js';

/* ============================================================
   STATE (Frontend only — data comes from API)
   ============================================================ */
const DB = {
  user: {},
  stats: { level: 1, progress: 0, projects: 0, onTime: 0, activity: 0, collab: 0, gpa: 0, done: 0, studyHours: 0, rank: 0 },
  subjects: [],
  registrySubjects: [],
  friends: [],
  requests: [],
  participants: [],
  projects: [],
  assignments: [],
  notifications: [],
  people: [],
  integrations: [],
};

const state = {
  authScreen: 'screen-login',
  currentScreen: 'dashboard',
  previousScreen: 'dashboard',
  currentSubjectId: null,
  currentAssignmentId: null,
  currentPersonId: null,
  projectFilter: 'all',
  registryFilter: 'all',
  assignmentsFilter: 'all',
  subjectRowCount: 0,
  pendingFiles: { assignment: [], project: [] },
  searchTag: '',
};

/* ============================================================
   HELPERS
   ============================================================ */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function toast(message, type = '') {
  const root = $('#toastRoot');
  if (!root) return;
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 300);
  }, 2400);
}

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts[0].charAt(0) + (parts[1] ? parts[1].charAt(0) : '');
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `قبل ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `قبل ${days} يوم`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toISOString().split('T')[0];
  } catch { return ''; }
}

/* ============================================================
   NAVIGATION
   ============================================================ */
function showAuthScreen(id) {
  state.authScreen = id;
  $$('#authLayer .auth-screen').forEach((s) => s.classList.toggle('active', s.id === id));
}

async function enterApp() {
  $('#authLayer').classList.add('hidden');
  $('#appLayer').classList.remove('hidden');
  try {
    await loadAllData();
  } catch (err) {
    console.error('Data load failed:', err);
    toast(err.message || 'فشل تحميل البيانات', 'error');
  }
  navigate('dashboard');
}

function logout() {
  auth.logout();
  $('#appLayer').classList.add('hidden');
  $('#authLayer').classList.remove('hidden');
  showAuthScreen('screen-login');
  toast('تم تسجيل الخروج', 'success');
}

function navigate(screenId, opts = {}) {
  if (!opts.silent && state.currentScreen !== screenId) {
    state.previousScreen = state.currentScreen;
  }
  state.currentScreen = screenId;
  $$('#content .screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + screenId));
  $$('.side-nav .nav-item').forEach((n) => n.classList.toggle('active', n.dataset.screen === screenId));
  if (window.innerWidth <= 900) closeSidebar();
  const c = $('#content');
  if (c) c.scrollTop = 0;
}

function openSidebar() {
  $('#sidebar')?.classList.add('open');
  $('#sidebarBackdrop')?.classList.add('show');
}

function closeSidebar() {
  $('#sidebar')?.classList.remove('open');
  $('#sidebarBackdrop')?.classList.remove('show');
}

/* ============================================================
   MODALS
   ============================================================ */
function openModal(id) { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
function closeAllModals() { $$('.modal').forEach((m) => m.classList.remove('open')); }

/* ============================================================
   LOAD ALL DATA FROM API
   ============================================================ */
async function loadAllData() {
  // 1. Profile
  const profile = await userApi.getMyProfile();
  DB.user = {
    id: profile.id,
    email: profile.email,
    firstName: profile.firstName,
    lastName: profile.lastName,
    bio: profile.bio || '',
    profilePicUrl: profile.profilePicUrl,
    avatar: profile.profilePicUrl,
    level: profile.level,
    punctualityScore: profile.punctualityScore,
    activityScore: profile.activityScore,
    completedProjectsCount: profile.completedProjectsCount,
    collaborationsCount: profile.collaborationsCount,
    university: profile.academicProfile?.universityName || '',
    department: profile.academicProfile?.department || '',
    major: profile.academicProfile?.major || '',
    uniEmail: profile.academicProfile?.universityEmail || '',
    hours: profile.academicProfile?.passedHours || 0,
  };

  // 2. Analytics
  try {
    const analytics = await analyticsApi.get();
    DB.stats = {
      level: analytics.overview.level,
      progress: analytics.overview.activityScore,
      projects: analytics.overview.completedProjects + analytics.overview.inProgressProjects,
      onTime: analytics.overview.punctualityScore,
      activity: analytics.overview.activityScore,
      collab: analytics.overview.collaborationsCount,
      gpa: 4.62,
      done: analytics.courses.avgProgress,
      studyHours: 21,
      rank: 14,
    };
  } catch { /* keep defaults */ }

  // 3. Courses
  try {
    const courses = await courseApi.getMyCourses();
    DB.subjects = courses
      .filter((e) => e.status === 'CURRENT')
      .map((e) => ({
        id: e.course.id,
        enrollmentId: e.id,
        name: e.course.courseName,
        code: e.course.courseCode,
        section: e.sectionNumber,
        professor: e.course.instructorName,
        hours: e.course.credits,
        progress: e.progress || 0,
        professor_avatar: '👨‍🏫',
      }));

    DB.registrySubjects = courses.map((e) => ({
      name: e.course.courseName,
      code: e.course.courseCode,
      professor: e.course.instructorName,
      hours: e.course.credits,
      progress: e.progress || 0,
      status: e.status === 'CURRENT' ? 'current' : 'done',
    }));
  } catch { /* ignore */ }

  // 4. Projects
  try {
    const projects = await projectApi.getMyProjects();
    DB.projects = projects.map((p) => ({
      id: p.id,
      name: p.title,
      desc: p.description,
      status: mapProjectStatusToUi(p.status),
      tech: (p.technologies || []).join(', ') || 'قيد التحديد',
      progress: p.progress || 0,
    }));
  } catch { /* ignore */ }

  // 5. Friends
  try {
    const friends = await friendApi.list();
    DB.friends = friends.map((f) => ({
      id: f.friend.id,
      name: `${f.friend.firstName} ${f.friend.lastName}`,
      major: f.friend.academicProfile?.major || '',
      avatar: f.friend.firstName?.charAt(0) || '?',
      online: true,
      last: 0,
    }));
  } catch { /* ignore */ }

  try {
    const requests = await friendApi.getRequests();
    DB.requests = requests.map((r) => ({
      id: r.id,
      name: `${r.requester.firstName} ${r.requester.lastName}`,
      major: r.requester.academicProfile?.major || '',
      avatar: r.requester.firstName?.charAt(0) || '?',
      mutual: 0,
    }));
  } catch { /* ignore */ }

  // 6. Assignments
  try {
    const submissions = await assignmentApi.getMyAssignments();
    DB.assignments = submissions.map((a) => ({
      id: a.assignment.id,
      submissionId: a.id,
      subject: a.assignment.course.courseName,
      name: a.assignment.title,
      desc: a.assignment.description,
      due: formatDate(a.assignment.dueDate),
      status: mapSubmissionStatusToUi(a.status),
    }));

    // إضافة الواجبات غير المسلَّمة
    const pending = await assignmentApi.getPending();
    pending.forEach((p) => {
      DB.assignments.push({
        id: p.id,
        subject: p.course.courseName,
        name: p.title,
        desc: p.description,
        due: formatDate(p.dueDate),
        status: 'pending',
      });
    });
  } catch { /* ignore */ }

  // 7. Notifications
  try {
    const notifications = await notificationApi.list();
    DB.notifications = notifications.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.message,
      time: formatTimeAgo(n.createdAt),
      read: n.isRead,
    }));
  } catch { /* ignore */ }

  // 8. Integrations
  try {
    const integrations = await settingApi.listIntegrations();
    DB.integrations = integrations.map((i) => ({
      id: i.appName,
      name: i.appName,
      desc: 'ربط التطبيق مع StudyHub',
      icon: getIntegrationIcon(i.appName),
      connected: i.isConnected,
    }));
  } catch { /* ignore */ }

  renderAll();
}

function mapProjectStatusToUi(status) {
  const map = { IN_PROGRESS: 'active', REVIEW: 'review', COMPLETED: 'done' };
  return map[status] || 'active';
}

function mapSubmissionStatusToUi(status) {
  const map = { SUBMITTED: 'submitted', LATE: 'late', PENDING: 'pending' };
  return map[status] || 'pending';
}

function getIntegrationIcon(name) {
  const icons = {
    'Google Drive': '📁',
    'GitHub': '💻',
    'Notion': '📝',
    'Slack': '💬',
    'Figma': '🎨',
    'Zoom': '📹',
  };
  return icons[name] || '🔗';
}

/* ============================================================
   RENDER FUNCTIONS
   ============================================================ */
function renderAll() {
  renderUserHeader();
  renderDashboard();
  renderFriendsRail();
  renderProjects();
  renderFriends();
  renderRegistry();
  renderAccount();
  renderAssignments();
  renderReports();
  renderNotifications();
  renderIntegrations();
  updateCounts();
}

function renderUserHeader() {
  const u = DB.user;
  const name = `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'مستخدم';
  const av = u.avatar
    ? `<img src="${u.avatar}" alt="" style="width:100%;height:100%;object-fit:cover">`
    : esc((u.firstName || '?').charAt(0));

  const setHtml = (id, html) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  };

  setHtml('headAvatar', av);
  setHtml('sideAvatar', av);
  setHtml('accountAvatar', av);

  const setName = (id, txt) => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  };
  setName('headName', name);
  setName('sideName', name);
  setName('sideMajor', u.major || '—');
  setName('accountName', name);
  setName('accountMajor', u.major || '—');

  const lvl = DB.stats.level || 1;
  const prog = DB.stats.progress || 0;
  const fill = $('#headLevelFill');
  if (fill) fill.style.width = prog + '%';
  const txt = $('#headLevelTxt');
  if (txt) txt.textContent = `المستوى ${lvl} · ${prog}%`;
  $$('.chip-level').forEach((c, i) => c.classList.toggle('on', i < lvl));
  const accLvl = $('#accountLevel');
  if (accLvl) accLvl.textContent = `المستوى ${lvl}`;
}

function renderDashboard() {
  const grid = $('#subjectsGrid');
  if (!grid) return;
  const ftBox = $('#firstTimeBox');

  if (!DB.subjects.length) {
    ftBox?.classList.remove('hidden');
    grid.innerHTML = `<p class="muted">لا توجد مواد بعد. اضغط "إدخال المواد" للبدء.</p>`;
    return;
  }
  ftBox?.classList.add('hidden');
  grid.innerHTML = DB.subjects.map((s) => `
    <div class="subject-card" data-action="open-subject" data-id="${s.id}">
      <h4>${esc(s.name)}</h4>
      <div class="code">${esc(s.code)} · شعبة ${esc(s.section)}</div>
      <div class="prof">${s.professor_avatar} ${esc(s.professor)}</div>
      <div class="progress-mini">
        <div class="muted" style="font-size:.72rem">التقدم ${s.progress}%</div>
        <div class="progress-mini-bar"><span style="width:${s.progress}%"></span></div>
      </div>
    </div>
  `).join('');
}

function renderFriendsRail() {
  const el = $('#friendsRailList');
  if (!el) return;
  if (!DB.friends.length) {
    el.innerHTML = `<p class="muted">لا يوجد أصدقاء بعد.</p>`;
    return;
  }
  const sorted = [...DB.friends].sort((a, b) => a.last - b.last);
  el.innerHTML = sorted.map((f) => `
    <div class="rail-item" data-action="open-person" data-id="${f.id}">
      <div class="avatar avatar-sm">${esc(f.avatar)}</div>
      <div class="rail-item-info">
        <strong>${esc(f.name)}</strong>
        <small>${esc(f.major || '')}</small>
      </div>
      <span class="status-dot ${f.online ? '' : 'off'}"></span>
    </div>
  `).join('');
}

function renderProjects() {
  const el = $('#projectsList');
  if (!el) return;
  const filter = state.projectFilter;
  const list = filter === 'all' ? DB.projects : DB.projects.filter((p) => p.status === filter);

  const statusMap = {
    active: { label: 'قيد التنفيذ', cls: 'active' },
    review: { label: 'قيد المراجعة', cls: 'review' },
    done: { label: 'مكتمل', cls: 'done' },
  };

  el.innerHTML = list.length ? list.map((p) => {
    const st = statusMap[p.status] || statusMap.active;
    return `
      <div class="list-item">
        <div class="avatar avatar-sm">📁</div>
        <div class="list-item-info">
          <strong>${esc(p.name)}</strong>
          <small>${esc(p.desc)}</small>
          <small style="margin-top:4px;color:var(--muted)">التقنيات: ${esc(p.tech)}</small>
        </div>
        <div class="list-item-actions">
          <span class="tag ${st.cls}">${st.label}</span>
          <span class="tag active">${p.progress}%</span>
        </div>
      </div>
    `;
  }).join('') : `<p class="muted">لا توجد مشاريع في هذا التصنيف.</p>`;
}

function renderFriends() {
  const reqCount = $('#reqCount'); if (reqCount) reqCount.textContent = DB.requests.length;
  const frCount = $('#friendsCount'); if (frCount) frCount.textContent = DB.friends.length;

  const reqList = $('#requestsList');
  if (reqList) {
    reqList.innerHTML = DB.requests.length ? DB.requests.map((r) => `
      <div class="list-item">
        <div class="avatar avatar-sm">${esc(r.avatar)}</div>
        <div class="list-item-info">
          <strong>${esc(r.name)}</strong>
          <small>${esc(r.major)}</small>
        </div>
        <div class="list-item-actions">
          <button class="btn btn-primary btn-xs" data-action="accept-request" data-id="${r.id}">قبول</button>
          <button class="btn btn-soft btn-xs" data-action="reject-request" data-id="${r.id}">رفض</button>
        </div>
      </div>
    `).join('') : `<p class="muted">لا توجد طلبات معلّقة.</p>`;
  }

  const frList = $('#friendsList');
  if (frList) {
    frList.innerHTML = DB.friends.length ? DB.friends.map((f) => `
      <div class="list-item">
        <div class="avatar avatar-sm">${esc(f.avatar)}</div>
        <div class="list-item-info">
          <strong>${esc(f.name)}</strong>
          <small>${esc(f.major)}</small>
        </div>
        <div class="list-item-actions">
          <button class="btn btn-soft btn-xs" data-action="message-person" data-id="${f.id}">
            <svg class="icon" style="width:14px;height:14px"><use href="#i-msg"/></svg> مراسلة
          </button>
          <button class="btn btn-soft btn-xs" data-action="open-person" data-id="${f.id}">الملف</button>
        </div>
      </div>
    `).join('') : `<p class="muted">لا يوجد أصدقاء بعد.</p>`;
  }

  const nb = $('#navBadgeFriends');
  if (nb) nb.textContent = DB.requests.length;
}

function renderRegistry() {
  const el = $('#registryBody');
  if (!el) return;
  const filter = state.registryFilter;
  const list = filter === 'all' ? DB.registrySubjects : DB.registrySubjects.filter((s) => s.status === filter);

  el.innerHTML = list.length ? list.map((s) => `
    <tr>
      <td><strong>${esc(s.name)}</strong></td>
      <td>${esc(s.code)}</td>
      <td>${esc(s.professor)}</td>
      <td>${s.hours}</td>
      <td>
        <div class="progress-cell">
          <div class="bar"><span style="width:${s.progress}%"></span></div>
          <span class="muted" style="font-size:.75rem">${s.progress}%</span>
        </div>
      </td>
      <td><span class="tag ${s.status}">${s.status === 'current' ? 'حالية' : 'مكتملة'}</span></td>
    </tr>
  `).join('') : `<tr><td colspan="6"><p class="muted">لا توجد مواد.</p></td></tr>`;
}

function renderAccount() {
  const u = DB.user;
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
  setVal('acc-fname', u.firstName);
  setVal('acc-lname', u.lastName);
  setVal('acc-email', u.email);
  setVal('acc-univ', u.university);
  setVal('acc-dept', u.department);
  setVal('acc-major', u.major);
  setVal('acc-uniEmail', u.uniEmail);
  setVal('acc-hours', u.hours);
  setVal('acc-bio', u.bio);

  const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setTxt('accProjects', DB.stats.projects);
  setTxt('accOnTime', DB.stats.onTime + '%');
  setTxt('accActivity', DB.stats.activity + '%');
  setTxt('accCollab', DB.stats.collab);
}

function renderAssignments() {
  const el = $('#assignmentsList');
  if (!el) return;

  const list = state.assignmentsFilter === 'all'
    ? DB.assignments
    : DB.assignments.filter((a) => a.status === state.assignmentsFilter);

  const statusMap = {
    submitted: { label: 'تم التسليم', cls: 'submitted' },
    pending: { label: 'قيد الانتظار', cls: 'pending' },
    late: { label: 'متأخر', cls: 'late' },
  };

  el.innerHTML = list.length ? list.map((a) => {
    const st = statusMap[a.status] || statusMap.pending;
    return `
      <div class="list-item">
        <div class="avatar avatar-sm">📝</div>
        <div class="list-item-info">
          <strong>${esc(a.name)}</strong>
          <small>${esc(a.subject)} · التسليم: ${esc(a.due)}</small>
        </div>
        <div class="list-item-actions">
          <span class="tag ${st.cls}">${st.label}</span>
          <button class="btn btn-soft btn-xs" data-action="open-assignment-from-list" data-id="${a.id}">عرض</button>
        </div>
      </div>
    `;
  }).join('') : `<p class="muted">لا توجد واجبات في هذا التصنيف.</p>`;

  const setTxt = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  setTxt('asgSubmitted', DB.assignments.filter((a) => a.status === 'submitted').length);
  setTxt('asgPending', DB.assignments.filter((a) => a.status === 'pending').length);
  setTxt('asgLate', DB.assignments.filter((a) => a.status === 'late').length);
}

function renderReports() {
  const setTxt = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  setTxt('repGpa', DB.stats.gpa);
  setTxt('repDone', DB.stats.done + '%');
  setTxt('repHours', DB.stats.studyHours);
  setTxt('repRank', '#' + DB.stats.rank);

  const weekly = [3, 5, 4, 6, 2, 1, 4];
  const days = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
  const max = Math.max(...weekly);
  const chartW = $('#chartWeekly');
  if (chartW) {
    chartW.innerHTML = weekly.map((v, i) => `
      <div class="bar-col">
        <div class="bar" style="height:${(v / max) * 100}%"></div>
        <span>${days[i].substring(0, 3)}</span>
      </div>
    `).join('');
  }

  const subjectData = DB.registrySubjects.slice(0, 4).map((s) => ({ name: s.name, v: s.progress }));
  const chartS = $('#chartSubjects');
  if (chartS) {
    chartS.innerHTML = subjectData.length ? subjectData.map((s) => `
      <div class="hbar-item">
        <div class="hbar-item-top"><span>${esc(s.name)}</span><span class="val">${s.v}%</span></div>
        <div class="hbar-track"><span style="width:${s.v}%"></span></div>
      </div>
    `).join('') : '<p class="muted">لا توجد بيانات.</p>';
  }

  const activity = [
    { name: 'المشاريع المسلّمة', v: DB.stats.projects ? Math.min(100, DB.stats.projects * 10) : 0 },
    { name: 'الالتزام بالمواعيد', v: DB.stats.onTime },
    { name: 'المشاركة', v: DB.stats.activity },
    { name: 'التعاون', v: Math.min(100, DB.stats.collab * 5) },
  ];
  const chartA = $('#chartActivity');
  if (chartA) {
    chartA.innerHTML = activity.map((a) => `
      <div class="hbar-item">
        <div class="hbar-item-top"><span>${a.name}</span><span class="val">${a.v}%</span></div>
        <div class="hbar-track"><span style="width:${a.v}%"></span></div>
      </div>
    `).join('');
  }
}

function renderNotifications() {
  const unread = DB.notifications.filter((n) => !n.read).length;
  const badge = $('#notifBadge');
  if (badge) {
    badge.textContent = unread;
    badge.style.display = unread ? 'grid' : 'none';
  }

  const el = $('#notificationsList');
  if (el) {
    el.innerHTML = DB.notifications.length ? DB.notifications.map((n) => `
      <div class="list-item">
        <div class="avatar avatar-sm">${n.read ? '✓' : '🔔'}</div>
        <div class="list-item-info">
          <strong>${esc(n.title)}</strong>
          <small>${esc(n.body)}</small>
          <small style="color:var(--muted);font-size:.72rem">${esc(n.time)}</small>
        </div>
      </div>
    `).join('') : `<p class="muted">لا توجد تنبيهات.</p>`;
  }
}

function renderIntegrations() {
  const el = $('#integrations');
  if (!el) return;
  el.innerHTML = DB.integrations.map((ig) => `
    <div class="integration">
      <div class="int-ico">${ig.icon}</div>
      <div class="integration-info">
        <strong>${esc(ig.name)}</strong>
        <small>${esc(ig.desc)}</small>
      </div>
      <label class="switch">
        <input type="checkbox" ${ig.connected ? 'checked' : ''} data-action="toggle-integration" data-id="${esc(ig.id)}" />
        <span></span>
      </label>
    </div>
  `).join('');
}

function updateCounts() {
  const setTxt = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  setTxt('statSubjects', DB.subjects.length);
  setTxt('statProjects', DB.projects.length);
  setTxt('statTasks', DB.assignments.filter((a) => a.status === 'pending').length);
  setTxt('statFriends', DB.friends.length);
}

/* ============================================================
   SUBJECT DETAILS
   ============================================================ */
async function openSubject(id) {
  const s = DB.subjects.find((x) => x.id === id);
  if (!s) return;
  state.currentSubjectId = id;

  const hero = $('#subjectHero');
  if (hero) {
    hero.innerHTML = `
      <h2>${esc(s.name)}</h2>
      <div class="muted">${esc(s.code)} · شعبة ${esc(s.section)}</div>
      <div class="meta-row">
        <div class="meta-item"><span>المدرّس</span><strong>${esc(s.professor)}</strong></div>
        <div class="meta-item"><span>الساعات</span><strong>${s.hours}</strong></div>
        <div class="meta-item"><span>التقدم</span><strong>${s.progress}%</strong></div>
      </div>
    `;
  }

  const mini = $('#subjectAssignmentsMini');
  if (mini) {
    try {
      const details = await courseApi.getDetails(id);
      const assignments = details.enrollment.course.assignments || [];
      mini.innerHTML = assignments.length ? assignments.map((a) => `
        <div class="list-item">
          <div class="avatar avatar-sm">📝</div>
          <div class="list-item-info">
            <strong>${esc(a.title)}</strong>
            <small>التسليم: ${formatDate(a.dueDate)}</small>
          </div>
          <div class="list-item-actions">
            <button class="btn btn-soft btn-xs" data-action="open-assignment" data-id="${a.id}">فتح</button>
          </div>
        </div>
      `).join('') : `<p class="muted">لا توجد واجبات لهذه المادة.</p>`;
    } catch {
      mini.innerHTML = `<p class="muted">تعذر تحميل الواجبات.</p>`;
    }
  }

  navigate('subject');
}

async function openParticipants() {
  const s = DB.subjects.find((x) => x.id === state.currentSubjectId);
  if (!s) return;

  const sub = $('#participantsSub');
  if (sub) sub.textContent = s.name;

  const list = $('#participantsList');
  if (!list) return;

  try {
    const participants = await courseApi.getParticipants(s.id);
    DB.participants = participants
      .filter((p) => p.user.id !== DB.user.id)
      .map((p) => ({
        id: p.user.id,
        name: `${p.user.firstName} ${p.user.lastName}`,
        major: p.user.academicProfile?.major || '',
        avatar: p.user.firstName?.charAt(0) || '?',
      }));

    if (sub) sub.textContent = `${s.name} · ${DB.participants.length} طالب`;

    list.innerHTML = DB.participants.length ? DB.participants.map((p) => `
      <div class="list-item">
        <div class="avatar avatar-sm">${esc(p.avatar)}</div>
        <div class="list-item-info">
          <strong>${esc(p.name)}</strong>
          <small>${esc(p.major)}</small>
        </div>
        <div class="list-item-actions">
          <button class="btn btn-soft btn-xs" data-action="message-person" data-id="${p.id}">
            <svg class="icon" style="width:14px;height:14px"><use href="#i-msg"/></svg> مراسلة
          </button>
          <button class="btn btn-primary btn-xs" data-action="add-friend-from-list" data-id="${p.id}">
            <svg class="icon" style="width:14px;height:14px"><use href="#i-user-plus"/></svg> صداقة
          </button>
        </div>
      </div>
    `).join('') : `<p class="muted">لا يوجد مشاركون.</p>`;
  } catch (err) {
    list.innerHTML = `<p class="muted">تعذر تحميل المشاركين.</p>`;
  }

  navigate('participants');
}

function openAssignment(id) {
  const a = DB.assignments.find((x) => x.id === id);
  if (!a) return;
  state.currentAssignmentId = id;

  const header = $('#assignmentHeader');
  if (header) {
    header.innerHTML = `
      <h3>${esc(a.name)}</h3>
      <p class="muted" style="margin-top:6px">${esc(a.desc)}</p>
      <div style="margin-top:10px;display:flex;gap:16px;flex-wrap:wrap;font-size:.82rem">
        <span>📚 ${esc(a.subject)}</span>
        <span>📅 تاريخ التسليم: ${esc(a.due)}</span>
      </div>
    `;
  }
  const due = $('#assignmentDue');
  if (due) due.textContent = 'التسليم: ' + a.due;
  const answer = $('#assignmentAnswer');
  if (answer) answer.value = '';
  state.pendingFiles.assignment = [];
  renderAssignmentFiles();

  navigate('assignment');
}

function renderAssignmentFiles() {
  const el = $('#assignmentFiles');
  if (!el) return;
  el.innerHTML = state.pendingFiles.assignment.map((f, i) => `
    <span class="file-chip">
      <svg class="icon"><use href="#i-file"/></svg>
      ${esc(f.name)}
      <button style="margin-inline-start:4px;color:var(--danger)" data-action="remove-assignment-file" data-index="${i}">×</button>
    </span>
  `).join('');
}

/* ============================================================
   SUBJECT ROWS (MODAL)
   ============================================================ */
function addSubjectRow(name = '', section = '') {
  state.subjectRowCount++;
  const rowId = 'sr-' + state.subjectRowCount;
  const wrapper = document.createElement('div');
  wrapper.className = 'subject-row';
  wrapper.dataset.rowId = rowId;
  wrapper.innerHTML = `
    <button type="button" class="remove-row" data-action="remove-subject-row" data-row="${rowId}">×</button>
    <div class="field" style="margin-bottom:10px">
      <label>المادة</label>
      <input type="text" class="sr-name" placeholder="اسم المادة" value="${esc(name)}" />
    </div>
    <div class="field" style="margin-bottom:0">
      <label>الشعبة</label>
      <input type="text" class="sr-section" placeholder="رقم الشعبة" value="${esc(section)}" />
    </div>
  `;
  const rows = $('#subjectRows');
  if (rows) rows.appendChild(wrapper);
}

function removeSubjectRow(rowId) {
  document.querySelector(`.subject-row[data-row-id="${rowId}"]`)?.remove();
}

/* ============================================================
   PEOPLE SEARCH
   ============================================================ */
async function runPeopleSearch(query = '') {
  const el = $('#peopleResults');
  if (!el) return;
  el.innerHTML = '<p class="muted">جاري البحث...</p>';
  try {
    const users = await userApi.searchUsers(query);
    el.innerHTML = users.length ? users.map((u) => `
      <div class="list-item">
        <div class="avatar avatar-sm">${esc(u.firstName?.charAt(0) || '?')}</div>
        <div class="list-item-info">
          <strong>${esc(u.firstName)} ${esc(u.lastName)}</strong>
          <small>${esc(u.academicProfile?.major || '')}</small>
        </div>
        <div class="list-item-actions">
          <button class="btn btn-soft btn-xs" data-action="follow-person" data-id="${u.id}">متابعة</button>
          <button class="btn btn-primary btn-xs" data-action="add-friend-from-list" data-id="${u.id}">صداقة</button>
        </div>
      </div>
    `).join('') : `<p class="muted">لا توجد نتائج.</p>`;
  } catch (err) {
    el.innerHTML = `<p class="muted">فشل البحث.</p>`;
  }
}

async function runProjectSearch() {
  const el = $('#projectSearchResults');
  if (!el) return;
  const q = $('#projectSearchInput')?.value.trim() || '';
  el.innerHTML = '<p class="muted">جاري البحث...</p>';
  try {
    const projects = await projectApi.search(q);
    el.innerHTML = projects.length ? projects.map((p) => `
      <div class="list-item">
        <div class="avatar avatar-sm">📁</div>
        <div class="list-item-info">
          <strong>${esc(p.title)}</strong>
          <small>${esc(p.description?.substring(0, 80) || '')}</small>
          <small style="color:var(--muted);font-size:.72rem">
            بواسطة: ${esc(p.user?.firstName || '')} ${esc(p.user?.lastName || '')}
          </small>
        </div>
      </div>
    `).join('') : `<p class="muted">لا توجد نتائج.</p>`;
  } catch (err) {
    el.innerHTML = `<p class="muted">فشل البحث.</p>`;
  }
}

/* ============================================================
   PERSON PROFILE
   ============================================================ */
async function openPerson(id) {
  state.currentPersonId = id;
  const el = $('#personContent');
  if (!el) return;
  el.innerHTML = '<p class="muted">جاري التحميل...</p>';

  try {
    const p = await userApi.getPublicProfile(id);
    const name = `${p.firstName} ${p.lastName}`;
    const avatar = p.profilePicUrl
      ? `<img src="${p.profilePicUrl}" alt="" style="width:100%;height:100%;object-fit:cover">`
      : esc(p.firstName?.charAt(0) || '?');

    el.innerHTML = `
      <div class="account-grid">
        <div class="glass panel profile-card">
          <div class="profile-avatar">${avatar}</div>
          <h3>${esc(name)}</h3>
          <p class="muted">${esc(p.academicProfile?.major || '')}</p>
          <p class="muted" style="font-size:.78rem">${esc(p.academicProfile?.universityName || '')}</p>
          <div class="level-badge">المستوى ${p.level}</div>
          <div class="stars">★★★★☆</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
            <button class="btn btn-primary btn-sm" data-action="add-friend-from-list" data-id="${esc(id)}">إضافة صديق</button>
            <button class="btn btn-soft btn-sm" data-action="message-person" data-id="${esc(id)}">مراسلة</button>
          </div>
        </div>
        <div class="account-stats">
          <div class="stat glass"><span>المشاريع</span><strong>${p.completedProjectsCount || 0}</strong></div>
          <div class="stat glass"><span>المتعاونون</span><strong>${p.collaborationsCount || 0}</strong></div>
          <div class="stat glass"><span>الالتزام</span><strong>${p.punctualityScore || 0}%</strong></div>
          <div class="stat glass"><span>النشاط</span><strong>${Math.min(100, (p.collaborationsCount || 0) * 10)}%</strong></div>
        </div>
        <div class="glass panel" style="grid-column:1/-1">
          <div class="section-title"><h3>النبذة</h3></div>
          <p class="muted">${esc(p.bio || 'لا توجد نبذة.')}</p>
        </div>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<p class="muted">فشل تحميل الملف الشخصي.</p>`;
  }

  navigate('person');
}

/* ============================================================
   PROJECT FILES
   ============================================================ */
function renderProjectFiles() {
  const el = $('#projectFiles');
  if (!el) return;
  el.innerHTML = state.pendingFiles.project.map((f, i) => `
    <span class="file-chip">
      <svg class="icon"><use href="#i-file"/></svg>
      ${esc(f.name)}
      <button style="margin-inline-start:4px;color:var(--danger)" data-action="remove-project-file" data-index="${i}">×</button>
    </span>
  `).join('');
}

/* ============================================================
   EXPLORER WITH ANALYSIS
   ============================================================ */
function openExplorerWithAnalysis(analysis) {
  const el = $('#explorerContent');
  if (!el) return;

  const tools = (analysis.suggestedTools || []).map((t) => t.tool || t);
  const majors = (analysis.suggestedMajors || []).map((m) => m.major || m);
  const similar = analysis.similarProjects || [];
  const collaborators = analysis.suggestedCollaborators || [];
  const recommendations = analysis.recommendations || [];

  el.innerHTML = `
    <div class="explorer-block">
      <h4>🔍 نتيجة الفحص الديناميكي</h4>
      <p>نوع المشروع: <strong>${esc(analysis.projectType)}</strong></p>
      <p>مؤشر التفرد: <strong>${analysis.uniquenessScore}%</strong></p>
      <p>
        ${similar.length
          ? `<span class="badge-no">تم العثور على ${similar.length} مشروع مشابه</span>`
          : `<span class="badge-yes">فكرة جديدة! ✨</span>`}
      </p>
    </div>

    ${similar.length ? `
      <div class="explorer-block">
        <h4>📁 مشاريع مشابهة</h4>
        <div class="list">
          ${similar.map((p) => `
            <div class="list-item">
              <div class="avatar avatar-sm">📁</div>
              <div class="list-item-info">
                <strong>${esc(p.title)}</strong>
                <small>${esc((p.description || '').substring(0, 80))}...</small>
              </div>
              <span class="tag active">${p.similarity}%</span>
            </div>
          `).join('')}
        </div>
      </div>` : ''}

    ${collaborators.length ? `
      <div class="explorer-block">
        <h4>👥 مقترحون للتعاون</h4>
        <div class="list">
          ${collaborators.map((c) => `
            <div class="list-item">
              <div class="avatar avatar-sm">${esc(c.firstName?.charAt(0) || '?')}</div>
              <div class="list-item-info">
                <strong>${esc(c.firstName)} ${esc(c.lastName)}</strong>
                <small>${esc(c.academicProfile?.major || '')}</small>
              </div>
              <span class="tag active">${c.matchScore || 0}%</span>
            </div>
          `).join('')}
        </div>
      </div>` : ''}

    <div class="explorer-block">
      <h4>🛠️ الأدوات المقترحة</h4>
      <div class="tool-tags">
        ${tools.length ? tools.map((t) => `<span class="tool-tag">${esc(t)}</span>`).join('') : '<span class="muted">لا توجد اقتراحات</span>'}
      </div>
    </div>

    <div class="explorer-block">
      <h4>🎓 التخصصات المفيدة</h4>
      <div class="tool-tags">
        ${majors.length ? majors.map((m) => `<span class="tool-tag">${esc(m)}</span>`).join('') : '<span class="muted">لا توجد اقتراحات</span>'}
      </div>
    </div>

    ${recommendations.length ? `
      <div class="explorer-block" style="background:linear-gradient(135deg,rgba(109,139,255,.15),rgba(143,109,255,.08))">
        <h4>💡 توصيات</h4>
        <ul style="padding-inline-start:20px;line-height:2">
          ${recommendations.map((r) => `<li>${esc(r)}</li>`).join('')}
        </ul>
      </div>` : ''}

    <div style="text-align:center;margin-top:14px">
      <button class="btn btn-primary" data-action="close-modal" data-modal="modal-explorer">فهمت، شكراً</button>
    </div>
  `;

  openModal('modal-explorer');
}

/* ============================================================
   EVENT DELEGATION
   ============================================================ */
document.addEventListener('click', async function (e) {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;

  try {
    switch (action) {

      /* ---------- AUTH ---------- */
      case 'toggle-pass': {
        const input = document.getElementById(target.dataset.target);
        if (input) input.type = input.type === 'password' ? 'text' : 'password';
        break;
      }
      case 'go-signup': showAuthScreen('screen-signup'); break;
      case 'go-login': showAuthScreen('screen-login'); break;
      case 'go-setup1': showAuthScreen('screen-setup1'); break;

      case 'forgot': {
        const email = $('#login-email')?.value.trim();
        if (!email) { toast('أدخل بريدك الإلكتروني أولاً', 'error'); return; }
        try {
          await authApi.forgotPassword(email);
          toast('تم إرسال رابط الاستعادة إن كان البريد مسجلاً', 'success');
        } catch (err) {
          toast(err.message, 'error');
        }
        break;
      }

      case 'login': {
        const email = $('#login-email').value.trim();
        const pass = $('#login-pass').value.trim();
        if (!email || !pass) { toast('يرجى إدخال البريد وكلمة السر', 'error'); return; }
        try {
          const result = await authApi.login(email, pass);
          auth.setTokens(result.accessToken, result.refreshToken);
          auth.setUser(result.user);
          toast('تم تسجيل الدخول بنجاح ✅', 'success');
          await enterApp();
        } catch (err) {
          toast(err.message || 'فشل تسجيل الدخول', 'error');
        }
        break;
      }

      case 'google': {
        toast('تسجيل Google غير مفعّل حالياً', 'error');
        break;
      }

      case 'signup-next': {
        const email = $('#signup-email').value.trim();
        const password = $('#signup-pass').value.trim();
        if (!email) { toast('أدخل البريد الإلكتروني', 'error'); return; }
        if (password.length < 8) { toast('كلمة السر 8 أحرف على الأقل', 'error'); return; }
        try {
          const result = await authApi.signup({
            email,
            password,
            firstName: 'طالب',
            lastName: 'جديد',
          });
          auth.setTokens(result.accessToken, result.refreshToken);
          auth.setUser(result.user);
          toast('تم إنشاء الحساب! أكمل بياناتك', 'success');
          showAuthScreen('screen-setup1');
        } catch (err) {
          toast(err.message || 'فشل إنشاء الحساب', 'error');
        }
        break;
      }

      case 'setup1-next': {
        const fname = $('#setup-fname').value.trim();
        const lname = $('#setup-lname').value.trim();
        const bio = $('#setup-bio').value.trim();
        if (!fname || !lname) { toast('أدخل الاسم الأول واسم العائلة', 'error'); return; }
        try {
          const updated = await userApi.updateProfile({ firstName: fname, lastName: lname, bio });
          DB.user = { ...DB.user, ...updated };
          showAuthScreen('screen-setup2');
        } catch (err) {
          toast(err.message, 'error');
        }
        break;
      }

      case 'setup2-finish': {
        const data = {
          universityName: $('#setup-univ').value.trim(),
          department: $('#setup-dept').value.trim(),
          major: $('#setup-major').value.trim(),
          universityEmail: $('#setup-email').value.trim(),
          passedHours: parseInt($('#setup-hours').value, 10) || 0,
        };
        if (!data.universityName || !data.department || !data.major || !data.universityEmail) {
          toast('يرجى إكمال جميع الحقول', 'error');
          return;
        }
        try {
          await userApi.saveAcademicInfo(data);
          toast('تم إنشاء الحساب بنجاح 🎉', 'success');
          await enterApp();
        } catch (err) {
          toast(err.message || 'فشل حفظ البيانات', 'error');
        }
        break;
      }

      case 'pick-avatar': {
        document.getElementById('avatarInput')?.click();
        break;
      }

      case 'logout': logout(); break;

      /* ---------- NAV ---------- */
      case 'nav': navigate(target.dataset.screen); break;
      case 'toggle-sidebar': openSidebar(); break;
      case 'close-sidebar': closeSidebar(); break;

      /* ---------- MODALS ---------- */
      case 'close-modal': closeModal(target.dataset.modal); break;

      case 'open-add-subjects': {
        const rows = $('#subjectRows');
        if (rows) rows.innerHTML = '';
        state.subjectRowCount = 0;
        addSubjectRow();
        openModal('modal-add-subjects');
        break;
      }

      case 'add-subject-row': addSubjectRow(); break;
      case 'remove-subject-row': removeSubjectRow(target.dataset.row); break;

      case 'save-subjects': {
        const rows = $$('.subject-row');
        const courses = [];
        rows.forEach((r) => {
          const name = r.querySelector('.sr-name').value.trim();
          const section = r.querySelector('.sr-section').value.trim();
          if (!name) return;
          courses.push({
            courseCode: 'GEN-' + Date.now() + '-' + courses.length,
            courseName: name,
            instructorName: 'TBD',
            sectionNumber: section || '101',
            credits: 3,
          });
        });
        if (!courses.length) { toast('أدخل مادة واحدة على الأقل', 'error'); return; }
        try {
          await courseApi.enroll(courses);
          closeModal('modal-add-subjects');
          toast(`تمت إضافة ${courses.length} مادة ✅`, 'success');
          await loadAllData();
        } catch (err) {
          toast(err.message, 'error');
        }
        break;
      }

      case 'open-search-projects':
        runProjectSearch();
        openModal('modal-search-projects');
        break;

      case 'run-project-search': await runProjectSearch(); break;

      case 'search-tag':
        state.searchTag = target.dataset.tag;
        $$('#searchTags .chip-filter').forEach((c) => c.classList.toggle('active', c === target));
        await runProjectSearch();
        break;

      case 'open-add-friend': {
        const inp = $('#peopleSearchInput');
        if (inp) inp.value = '';
        await runPeopleSearch('');
        openModal('modal-add-friend');
        break;
      }

      case 'run-people-search':
        await runPeopleSearch($('#peopleSearchInput')?.value || '');
        break;

      case 'open-add-project': {
        const t = $('#np-title'); if (t) t.value = '';
        const d = $('#np-desc'); if (d) d.value = '';
        const p = $('#np-private'); if (p) p.checked = false;
        const s = $('#np-showinfo'); if (s) s.checked = true;
        state.pendingFiles.project = [];
        renderProjectFiles();
        openModal('modal-add-project');
        break;
      }

      case 'save-project': {
        const title = $('#np-title').value.trim();
        const desc = $('#np-desc').value.trim();
        if (!title) { toast('أدخل اسم المشروع', 'error'); return; }
        if (desc.length < 20) { toast('الوصف 20 حرف على الأقل', 'error'); return; }
        const isPrivate = $('#np-private').checked;
        const showInfo = $('#np-showinfo').checked;
        const fileInput = document.getElementById('projectFileInput');
        const file = fileInput?.files?.[0] || null;

        try {
          await projectApi.create({ title, description: desc, isPrivate, showInfo }, file);
          closeModal('modal-add-project');
          toast('تم إنشاء المشروع ✅', 'success');

          // استدعاء الخوارزمية الذكية
          try {
            const analysis = await projectApi.analyze(title, desc);
            openExplorerWithAnalysis(analysis);
          } catch (err) {
            console.warn('Analyze failed:', err);
          }

          await loadAllData();
        } catch (err) {
          toast(err.message || 'فشل إنشاء المشروع', 'error');
        }
        break;
      }

      case 'pick-project-file':
        document.getElementById('projectFileInput')?.click();
        break;

      case 'remove-project-file': {
        const i = parseInt(target.dataset.index, 10);
        state.pendingFiles.project.splice(i, 1);
        renderProjectFiles();
        break;
      }

      case 'open-notifications':
        openModal('modal-notifications');
        break;

      case 'clear-notifications': {
        try {
          await notificationApi.markAllRead();
          DB.notifications.forEach((n) => { n.read = true; });
          renderNotifications();
          toast('تم تحديد الكل كمقروء', 'success');
        } catch (err) {
          toast(err.message, 'error');
        }
        break;
      }

      case 'send-message': {
        const body = $('#msgBody')?.value.trim();
        if (!body) { toast('اكتب رسالة أولاً', 'error'); return; }
        // ملاحظة: لا يوجد endpoint للمراسلة في الخوارزمية الحالية
        toast('تم إرسال الرسالة (محاكاة)', 'success');
        const mb = $('#msgBody'); if (mb) mb.value = '';
        closeModal('modal-message');
        break;
      }

      /* ---------- DASHBOARD ---------- */
      case 'open-subject': await openSubject(target.dataset.id); break;
      case 'back-dashboard': navigate('dashboard'); break;
      case 'back-subject':
        if (state.currentSubjectId) await openSubject(state.currentSubjectId);
        else navigate('dashboard');
        break;

      case 'open-participants': await openParticipants(); break;

      case 'open-subject-assignments':
        state.assignmentsFilter = 'all';
        $$('#screen-assignments .chip-filter').forEach((c) => c.classList.toggle('active', c.dataset.filter === 'all'));
        navigate('assignments');
        break;

      case 'open-files': {
        const s = DB.subjects.find((x) => x.id === state.currentSubjectId);
        const el = $('#filesList');
        if (el) {
          el.innerHTML = `
            <div class="list-item">
              <div class="avatar avatar-sm">📄</div>
              <div class="list-item-info">
                <strong>محتوى المحاضرة 1.pdf</strong>
                <small>${esc(s?.name || '')} · 2.4 MB</small>
              </div>
            </div>
            <div class="list-item">
              <div class="avatar avatar-sm">📊</div>
              <div class="list-item-info">
                <strong>شرائح الفصل الثاني.pptx</strong>
                <small>${esc(s?.name || '')} · 5.1 MB</small>
              </div>
            </div>
          `;
        }
        openModal('modal-files');
        break;
      }

      /* ---------- ASSIGNMENTS ---------- */
      case 'open-assignment':
      case 'open-assignment-from-list':
        openAssignment(target.dataset.id);
        break;

      case 'pick-assignment-file':
        document.getElementById('assignmentFileInput')?.click();
        break;

      case 'remove-assignment-file': {
        const i = parseInt(target.dataset.index, 10);
        state.pendingFiles.assignment.splice(i, 1);
        renderAssignmentFiles();
        break;
      }

      case 'submit-assignment': {
        const id = state.currentAssignmentId;
        if (!id) return;
        const submissionText = $('#assignmentAnswer')?.value.trim();
        const fileInput = document.getElementById('assignmentFileInput');
        const file = fileInput?.files?.[0] || null;

        if (!submissionText && !file) {
          toast('أضف نصاً أو ملفاً على الأقل', 'error');
          return;
        }

        try {
          await assignmentApi.submit(id, { submissionText, file });
          toast('تم تسليم الواجب ✅', 'success');
          await loadAllData();
          setTimeout(() => navigate('assignments'), 400);
        } catch (err) {
          toast(err.message || 'فشل التسليم', 'error');
        }
        break;
      }

      /* ---------- FILTERS ---------- */
      case 'filter-projects':
        state.projectFilter = target.dataset.filter;
        $$('#projectFilters .chip-filter').forEach((c) => c.classList.toggle('active', c === target));
        renderProjects();
        break;

      case 'filter-registry':
        state.registryFilter = target.dataset.filter;
        $$('#screen-registry .chip-filter').forEach((c) => c.classList.toggle('active', c === target));
        renderRegistry();
        break;

      case 'filter-assignments':
        state.assignmentsFilter = target.dataset.filter;
        $$('#screen-assignments .chip-filter').forEach((c) => c.classList.toggle('active', c === target));
        renderAssignments();
        break;

      /* ---------- FRIENDS ---------- */
      case 'accept-request': {
        try {
          await friendApi.respond(target.dataset.id, 'accept');
          toast('تم قبول طلب الصداقة', 'success');
          await loadAllData();
        } catch (err) {
          toast(err.message, 'error');
        }
        break;
      }

      case 'reject-request': {
        try {
          await friendApi.respond(target.dataset.id, 'reject');
          toast('تم رفض الطلب');
          await loadAllData();
        } catch (err) {
          toast(err.message, 'error');
        }
        break;
      }

      case 'message-person': {
        const id = target.dataset.id;
        const p = DB.friends.find((x) => x.id === id) || DB.participants.find((x) => x.id === id);
        const title = $('#msgTitle');
        if (title) title.textContent = p ? 'مراسلة ' + p.name : 'مراسلة';
        const mb = $('#msgBody'); if (mb) mb.value = '';
        openModal('modal-message');
        break;
      }

      case 'follow-person':
        toast('تمت المتابعة ✅', 'success');
        break;

      case 'add-friend-from-list': {
        try {
          await friendApi.sendRequest(target.dataset.id);
          toast('تم إرسال طلب الصداقة ✅', 'success');
        } catch (err) {
          toast(err.message, 'error');
        }
        break;
      }

      case 'open-person': await openPerson(target.dataset.id); break;
      case 'back-from-person': navigate('participants'); break;

      /* ---------- ACCOUNT ---------- */
      case 'save-account': {
        const data = {
          firstName: $('#acc-fname').value.trim(),
          lastName: $('#acc-lname').value.trim(),
          bio: $('#acc-bio').value.trim(),
        };
        try {
          await userApi.updateProfile(data);
          // حفظ بيانات أكاديمية أيضاً
          const academic = {
            universityName: $('#acc-univ').value.trim(),
            department: $('#acc-dept').value.trim(),
            major: $('#acc-major').value.trim(),
            universityEmail: $('#acc-uniEmail').value.trim(),
            passedHours: parseInt($('#acc-hours').value, 10) || 0,
          };
          if (academic.universityName && academic.universityEmail) {
            await userApi.saveAcademicInfo(academic);
          }
          toast('تم حفظ التعديلات ✅', 'success');
          await loadAllData();
        } catch (err) {
          toast(err.message, 'error');
        }
        break;
      }

      /* ---------- INTEGRATIONS ---------- */
      case 'toggle-integration':
        // التبديل يتم عبر حدث change
        break;
    }
  } catch (err) {
    console.error('Action error:', action, err);
    toast(err.message || 'حدث خطأ', 'error');
  }
});

/* ============================================================
   CHANGE EVENTS
   ============================================================ */
document.addEventListener('change', async function (e) {
  const t = e.target;

  // Avatar upload
  if (t.id === 'avatarInput' && t.files[0]) {
    const file = t.files[0];
    if (file.size > 2 * 1024 * 1024) {
      toast('حجم الصورة كبير جداً (الحد 2MB)', 'error');
      return;
    }
    try {
      const preview = document.getElementById('avatarPreview');
      if (preview) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          preview.innerHTML = `<img src="${ev.target.result}" alt="" style="width:100%;height:100%;object-fit:cover">`;
        };
        reader.readAsDataURL(file);
      }
      await userApi.updateProfile({}, file);
      toast('تم رفع الصورة ✅', 'success');
      await loadAllData();
    } catch (err) {
      toast(err.message || 'فشل رفع الصورة', 'error');
    }
    t.value = '';
  }

  // Assignment files
  if (t.id === 'assignmentFileInput') {
    Array.from(t.files).forEach((f) => state.pendingFiles.assignment.push({ name: f.name }));
    renderAssignmentFiles();
  }

  // Project files
  if (t.id === 'projectFileInput') {
    Array.from(t.files).forEach((f) => state.pendingFiles.project.push({ name: f.name }));
    renderProjectFiles();
  }

  // Password strength
  if (t.id === 'signup-pass') {
    const v = t.value;
    const pct = Math.min(100, v.length * 12);
    const bar = document.getElementById('passBar');
    if (bar) bar.style.width = pct + '%';
  }

  // Integration toggle
  if (t.dataset?.action === 'toggle-integration') {
    try {
      await settingApi.toggleIntegration(t.dataset.id, t.checked);
      toast(`تم ${t.checked ? 'تفعيل' : 'إلغاء'} الربط`, 'success');
    } catch (err) {
      toast(err.message, 'error');
      t.checked = !t.checked;
    }
  }
});

/* ============================================================
   INPUT EVENTS (live search)
   ============================================================ */
let searchDebounce;
document.addEventListener('input', function (e) {
  if (e.target.id === 'projectSearchInput') {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => runProjectSearch(), 400);
  }
  if (e.target.id === 'peopleSearchInput') {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => runPeopleSearch(e.target.value), 400);
  }
});

/* ============================================================
   KEYBOARD
   ============================================================ */
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    closeAllModals();
    closeSidebar();
  }
});

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', function () {
  if (auth.isLoggedIn()) {
    enterApp();
  } else {
    showAuthScreen('screen-login');
  }
});