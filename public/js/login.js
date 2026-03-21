// Restrict if already logged in
restrictAuth();

const loginSec = document.getElementById('login-section');
const signupSec = document.getElementById('signup-section');

window.toggleForm = function() {
    loginSec.classList.toggle('hidden');
    signupSec.classList.toggle('hidden');
}

// Login Handler
document.getElementById('login-form').onsubmit = async (e) => {
    e.preventDefault();
    const u = document.getElementById('login-username').value;
    const p = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');

    try {
        const res = await apiCall('/login', 'POST', { username: u, password: p });
        localStorage.setItem('user', JSON.stringify(res.user));

        // Redirect based on role
        if (res.user.role === 'admin') window.location.href = '/admin.html';
        else window.location.href = '/driver.html';
    } catch (err) {
        errEl.innerText = err.message;
    }
};

// Signup Handler
document.getElementById('signup-form').onsubmit = async (e) => {
    e.preventDefault();
    const u = document.getElementById('signup-username').value;
    const p = document.getElementById('signup-password').value;
    const errEl = document.getElementById('signup-error');
    const sucEl = document.getElementById('signup-success');

    errEl.innerText = '';
    sucEl.innerText = '';

    try {
        const res = await apiCall('/signup', 'POST', { username: u, password: p });
        sucEl.innerText = res.message;
        document.getElementById('signup-form').reset();
    } catch (err) {
        errEl.innerText = err.message;
    }
};
