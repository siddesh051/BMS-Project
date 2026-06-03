class SessionManager {
constructor() {
this.sessionKey = 'qg_bid_portal_session';
this.sessionTimeout = 8 * 60 * 60 * 1000;
this.warningTime = 30 * 60 * 1000;
this.checkInterval = 60 * 1000;
this.sessionCheckTimer = null;
this.warningShown = false;
this.initSessionCheck();
console.log('Session Manager initialized');
}
createSession(userData) {
const sessionData = {
userId: userData.UserID,
username: userData.Username,
userType: userData.UserType,
fullName: userData.FullName,
email: userData.Email,
department: userData.Department,
portalAccess: userData.PortalAccess,
trackerAccess: userData.TrackerAccess,
accessPermissions: userData.AccessPermissions,
loginTime: new Date().toISOString(),
lastActivity: new Date().toISOString(),
sessionId: this.generateSessionId(),
expiresAt: new Date(Date.now() + this.sessionTimeout).toISOString()
};
try {
localStorage.setItem(this.sessionKey, JSON.stringify(sessionData));
console.log('Session created for user:', userData.Username, 'Access:', sessionData.accessPermissions);
this.startSessionMonitoring();
this.logSessionActivity('SESSION_CREATED', sessionData);
return sessionData;
} catch (error) {
console.error('Failed to create session:', error);
return null;
}
}
getSession() {
try {
const sessionData = localStorage.getItem(this.sessionKey);
if (!sessionData) {
return null;
}
const session = JSON.parse(sessionData);
if (this.isSessionExpired(session)) {
console.log('Session expired, removing...');
this.destroySession();
return null;
}
return session;
} catch (error) {
console.error('Error getting session:', error);
this.destroySession();
return null;
}
}
updateActivity() {
const session = this.getSession();
if (session) {
session.lastActivity = new Date().toISOString();
localStorage.setItem(this.sessionKey, JSON.stringify(session));
}
}
isSessionExpired(session) {
if (!session || !session.expiresAt) {
return true;
}
const expiryTime = new Date(session.expiresAt);
const currentTime = new Date();
return currentTime >= expiryTime;
}
isSessionNearExpiry(session) {
if (!session || !session.expiresAt) {
return false;
}
const expiryTime = new Date(session.expiresAt);
const currentTime = new Date();
const timeUntilExpiry = expiryTime.getTime() - currentTime.getTime();
return timeUntilExpiry <= this.warningTime && timeUntilExpiry > 0;
}
extendSession() {
const session = this.getSession();
if (session) {
session.expiresAt = new Date(Date.now() + this.sessionTimeout).toISOString();
session.lastActivity = new Date().toISOString();
localStorage.setItem(this.sessionKey, JSON.stringify(session));
this.warningShown = false;
console.log('Session extended for user:', session.username);
this.logSessionActivity('SESSION_EXTENDED', session);
return true;
}
return false;
}
destroySession() {
const session = this.getSession();
try {
localStorage.removeItem(this.sessionKey);
this.stopSessionMonitoring();
if (session) {
console.log('Session destroyed for user:', session.username);
this.logSessionActivity('SESSION_DESTROYED', session);
}
return true;
} catch (error) {
console.error('Error destroying session:', error);
return false;
}
}
isAuthenticated() {
const session = this.getSession();
return session !== null;
}
hasPortalAccess() {
const session = this.getSession();
return session && session.portalAccess === true;
}
hasTrackerAccess() {
const session = this.getSession();
return session && session.trackerAccess === true;
}
hasBothAccess() {
const session = this.getSession();
return session && session.portalAccess === true && session.trackerAccess === true;
}
hasAnyAccess() {
const session = this.getSession();
return session && (session.portalAccess === true || session.trackerAccess === true);
}
getAccessType() {
const session = this.getSession();
if (!session) return 'none';
if (session.portalAccess && session.trackerAccess) return 'both';
if (session.portalAccess) return 'portal';
if (session.trackerAccess) return 'tracker';
return 'none';
}
requiresAccess(accessType) {
const session = this.getSession();
if (!session) return false;
if (accessType === 'portal') return session.portalAccess === true;
if (accessType === 'tracker') return session.trackerAccess === true;
return false;
}
hasRole(requiredRole) {
const session = this.getSession();
if (!session) {
return false;
}
return session.userType === requiredRole;
}
hasAnyRole(roles) {
const session = this.getSession();
if (!session) {
return false;
}
return roles.includes(session.userType);
}
getTrackerRole() {
const session = this.getSession();
if (!session || !session.trackerAccess) {
return null;
}
return session.userType;
}
canCreateBids() {
const session = this.getSession();
if (!session || !session.trackerAccess) {
return false;
}
return ['Admin', 'Director', 'Manager'].includes(session.userType);
}
canApproveBids() {
const session = this.getSession();
if (!session || !session.trackerAccess) {
return false;
}
return ['Admin', 'Director', 'Manager'].includes(session.userType);
}
canDeleteDocuments() {
const session = this.getSession();
if (!session || !session.trackerAccess) {
return false;
}
return ['Admin', 'Director', 'Manager'].includes(session.userType);
}
canUploadDocuments() {
const session = this.getSession();
if (!session || !session.trackerAccess) {
return false;
}
return ['Admin', 'Director', 'Manager', 'Engineer'].includes(session.userType);
}
validateTrackerPermissions(requiredPermission) {
const session = this.getSession();
if (!session || !session.trackerAccess) {
return false;
}
switch (requiredPermission) {
case 'create_bid':
return this.canCreateBids();
case 'approve_bid':
return this.canApproveBids();
case 'delete_document':
return this.canDeleteDocuments();
case 'upload_document':
return this.canUploadDocuments();
case 'view_own_bids':
return session.userType === 'Engineer';
case 'view_all_bids':
return ['Admin', 'Director', 'Manager'].includes(session.userType);
default:
return false;
}
}
getTrackerDashboardUrl() {
const session = this.getSession();
if (!session || !session.trackerAccess) {
return '/auth/login.html';
}
switch (session.userType) {
case 'Admin':
case 'Director':
return '/bid-management/admin-tracker.html';
case 'Manager':
return '/bid-management/manager-tracker.html';
case 'Engineer':
return '/bid-management/engineer-tracker.html';
default:
return '/bid-management/bid-tracker-dashboard.html';
}
}
getDashboardUrl() {
const session = this.getSession();
if (!session) {
return '/auth/login.html';
}
switch (session.userType) {
case 'Admin':
return '/dashboards/admin/admin-dashboard.html';
case 'Manager':
return '/dashboards/manager/manager-dashboard.html';
case 'Engineer':
return '/dashboards/engineer/engineer-dashboard.html';
default:
console.warn('Unknown user type:', session.userType);
return '/auth/login.html';
}
}
redirectToDashboard() {
const session = this.getSession();
if (!session) {
this.redirectToLogin();
return;
}
if (!this.hasAnyAccess()) {
this.logout();
return;
}
const accessType = this.getAccessType();
if (accessType === 'both') {
window.location.href = '/home/home.html';
} else if (accessType === 'portal') {
const dashboardUrl = this.getDashboardUrl();
window.location.href = dashboardUrl;
} else if (accessType === 'tracker') {
const trackerUrl = this.getTrackerDashboardUrl();
window.location.href = trackerUrl;
} else {
this.logout();
}
}
generateSessionId() {
return 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}
initSessionCheck() {
this.checkSessionOnLoad();
this.addActivityListeners();
}
checkSessionOnLoad() {
const currentPath = window.location.pathname;
const isLoginPage = currentPath.includes('login.html');
const session = this.getSession();
// if (!isLoginPage && !session) {
// console.log('No valid session found, redirecting to login');
// this.redirectToLogin();
// } else if (isLoginPage && session) {
// console.log('Valid session found, redirecting to dashboard');
// this.redirectToDashboard();
// } else if (session) {
// this.startSessionMonitoring();
// }
}
startSessionMonitoring() {
this.stopSessionMonitoring();
this.sessionCheckTimer = setInterval(() => {
const session = this.getSession();
if (!session) {
console.log('Session lost, redirecting to login');
this.redirectToLogin();
return;
}
if (this.isSessionExpired(session)) {
console.log('Session expired, redirecting to login');
this.showSessionExpiredMessage();
this.destroySession();
this.redirectToLogin();
return;
}
if (this.isSessionNearExpiry(session) && !this.warningShown) {
this.showSessionWarning();
}
}, this.checkInterval);
}
stopSessionMonitoring() {
if (this.sessionCheckTimer) {
clearInterval(this.sessionCheckTimer);
this.sessionCheckTimer = null;
}
}
addActivityListeners() {
const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
events.forEach(event => {
document.addEventListener(event, this.throttle(() => {
this.updateActivity();
}, 30000), true);
});
}
throttle(func, limit) {
let inThrottle;
return function() {
const args = arguments;
const context = this;
if (!inThrottle) {
func.apply(context, args);
inThrottle = true;
setTimeout(() => inThrottle = false, limit);
}
}
}
showSessionWarning() {
this.warningShown = true;
const warningDiv = document.createElement('div');
warningDiv.className = 'session-warning';
warningDiv.innerHTML = `
<div class="session-warning-content">
<i class="fas fa-clock"></i>
<div class="warning-text">
<strong>Session Expiring Soon</strong>
<p>Your session will expire in 30 minutes. Click "Extend Session" to continue working.</p>
</div>
<div class="warning-actions">
<button onclick="sessionManager.extendSession(); this.parentElement.parentElement.parentElement.remove();" class="extend-btn">
<i class="fas fa-refresh"></i> Extend Session
</button>
<button onclick="sessionManager.logout();" class="logout-btn">
<i class="fas fa-sign-out-alt"></i> Logout
</button>
</div>
</div>
`;
document.body.appendChild(warningDiv);
setTimeout(() => {
if (document.body.contains(warningDiv)) {
warningDiv.remove();
}
}, 5 * 60 * 1000);
}
showSessionExpiredMessage() {
const expiredDiv = document.createElement('div');
expiredDiv.className = 'session-expired';
expiredDiv.innerHTML = `
<div class="session-expired-content">
<i class="fas fa-exclamation-triangle"></i>
<div class="expired-text">
<strong>Session Expired</strong>
<p>Your session has expired due to inactivity. Please log in again.</p>
</div>
<button onclick="window.location.href='/auth/login.html';" class="login-again-btn">
<i class="fas fa-sign-in-alt"></i> Login Again
</button>
</div>
`;
document.body.appendChild(expiredDiv);
}
redirectToLogin() {
window.location.href = '/auth/login.html';
}
logout() {
const session = this.getSession();
if (session) {
this.logSessionActivity('USER_LOGOUT', session);
// Notify server about logout
this.notifyServerLogout(session.sessionId);
}
// Clear all session data
this.destroySession();
// Clear any cached data
this.clearAllCachedData();
// Notify other tabs
localStorage.setItem('logout_timestamp', Date.now());
// Redirect to login
this.redirectToLogin();
}

async notifyServerLogout(sessionId) {
try {
fetch('/api/auth/logout', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ sessionId })
});
} catch (error) {
console.warn('Failed to notify server of logout:', error);
}
}

clearAllCachedData() {
// Clear session storage
sessionStorage.clear();
// Remove specific localStorage items (keep only essential ones)
const keysToRemove = [];
for (let i = 0; i < localStorage.length; i++) {
const key = localStorage.key(i);
if (key && (key.startsWith('qg_') || key.startsWith('bid_') || key.startsWith('tracker_'))) {
keysToRemove.push(key);
}
}
keysToRemove.forEach(key => localStorage.removeItem(key));
}

async logSessionActivity(action, sessionData) {
try {
fetch('/api/auth/log-activity', {
method: 'POST',
headers: {
'Content-Type': 'application/json'
},
body: JSON.stringify({
action: action,
userId: sessionData.userId,
username: sessionData.username,
sessionId: sessionData.sessionId,
timestamp: new Date().toISOString(),
userAgent: navigator.userAgent,
ipAddress: 'client-side'
})
});
} catch (error) {
console.warn('Failed to log session activity:', error);
}
}
getSessionInfo() {
const session = this.getSession();
if (!session) {
return null;
}
const loginTime = new Date(session.loginTime);
const expiresAt = new Date(session.expiresAt);
const timeLeft = expiresAt.getTime() - new Date().getTime();
return {
username: session.username,
fullName: session.fullName,
userType: session.userType,
department: session.department,
portalAccess: session.portalAccess,
trackerAccess: session.trackerAccess,
accessType: this.getAccessType(),
loginTime: loginTime.toLocaleString(),
timeLeft: this.formatTimeRemaining(timeLeft),
sessionId: session.sessionId
};
}
formatTimeRemaining(milliseconds) {
if (milliseconds <= 0) {
return 'Expired';
}
const hours = Math.floor(milliseconds / (1000 * 60 * 60));
const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
if (hours > 0) {
return `${hours}h ${minutes}m`;
} else {
return `${minutes}m`;
}
}

}
const sessionManager = new SessionManager();
// Notify all tabs when the session key is removed or changed
window.addEventListener('storage', function(e) {
  // If the session key is removed, another tab has logged out
  if (e.key === sessionManager.sessionKey && e.newValue === null) {
    sessionManager.destroySession();
    // Optionally redirect the current page to login
    window.location.href = '/auth/login.html';
  }
});


window.sessionManager = sessionManager;