// Store logged in user details
let currentUser = JSON.parse(localStorage.getItem('user')) || null;

// Ensure authenticated
function requireAuth(role) {
    if (!currentUser) {
        window.location.href = '/login.html';
        return;
    }
    if (role && currentUser.role !== role) {
        alert("Unauthorized access");
        window.location.href = currentUser.role === 'admin' ? '/admin.html' : '/driver.html';
    }
}

// Ensure NOT authenticated (for login page)
function restrictAuth() {
    if (currentUser) {
        window.location.href = currentUser.role === 'admin' ? '/admin.html' : '/driver.html';
    }
}

// User logout
function logout() {
    localStorage.removeItem('user');
    window.location.href = '/login.html';
}

// Shared API fetcher
async function apiCall(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(`/api${endpoint}`, options);
    const data = await res.json();
    
    if (!res.ok) throw new Error(data.error || 'API Error');
    return data;
}

// Wait for DOM
document.addEventListener('DOMContentLoaded', () => {
    
    // Inject user info into headers if present
    const userInfoEl = document.getElementById('user-info');
    if (userInfoEl && currentUser) {
        userInfoEl.innerHTML = `
            <span>Welcome, <b>${currentUser.username}</b></span>
            <button onclick="logout()" class="btn btn-secondary" style="padding: 0.5rem 1rem; font-size: 1rem; margin-left: 1rem;">Logout</button>
        `;
    }

});
