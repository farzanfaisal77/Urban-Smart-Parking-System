// Store logged in user details
let currentUser = JSON.parse(localStorage.getItem('user')) || null;

// Ensure authenticated
async function requireAuth(role) {
    if (!currentUser) {
        window.location.href = '/login.html';
        return;
    }
    if (role && currentUser.role !== role) {
        await showAlert("Unauthorized access");
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

// Custom Themed Modals
window.showAlert = function(message) {
    return new Promise((resolve) => createModal(message, false, resolve));
};

window.showConfirm = function(message) {
    return new Promise((resolve) => createModal(message, true, resolve));
};

function createModal(message, isConfirm, resolve) {
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
        position: 'fixed', top: '0', left: '0', right: '0', bottom: '0',
        backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)',
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        zIndex: '9999', opacity: '0', transition: 'opacity 0.2s ease'
    });

    const modal = document.createElement('div');
    Object.assign(modal.style, {
        background: '#0f172a', padding: '2rem', borderRadius: '12px',
        maxWidth: '450px', width: '90%', border: '1px solid #334155',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
        color: '#f8fafc', transform: 'scale(0.95)', transition: 'transform 0.2s ease'
    });

    const text = document.createElement('p');
    Object.assign(text.style, {
        marginBottom: '2rem', fontSize: '1.1rem', lineHeight: '1.5',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word'
    });
    text.innerText = message;
    modal.appendChild(text);

    const btnContainer = document.createElement('div');
    Object.assign(btnContainer.style, { display: 'flex', justifyContent: 'flex-end', gap: '1rem' });

    const close = (val) => {
        overlay.style.opacity = '0';
        modal.style.transform = 'scale(0.95)';
        setTimeout(() => { document.body.removeChild(overlay); resolve(val); }, 200);
    };

    if (isConfirm) {
        const cancelBtn = document.createElement('button');
        cancelBtn.innerText = 'Cancel';
        cancelBtn.className = 'btn btn-secondary';
        Object.assign(cancelBtn.style, {
            padding: '0.5rem 1.5rem', borderRadius: '8px', border: '1px solid #334155',
            background: 'transparent', color: 'white', cursor: 'pointer'
        });
        cancelBtn.onclick = () => close(false);
        btnContainer.appendChild(cancelBtn);
    }

    const okBtn = document.createElement('button');
    okBtn.innerText = 'OK';
    okBtn.className = 'btn';
    Object.assign(okBtn.style, {
        padding: '0.5rem 1.5rem', borderRadius: '8px', border: 'none',
        background: '#22c55e', color: '#000', cursor: 'pointer', fontWeight: 'bold'
    });
    okBtn.onclick = () => close(true);
    btnContainer.appendChild(okBtn);

    modal.appendChild(btnContainer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // animate in
    requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        modal.style.transform = 'scale(1)';
    });
}

window.showPrompt = function(message, defaultValue = '') {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed', top: '0', left: '0', right: '0', bottom: '0',
            backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            zIndex: '9999', opacity: '0', transition: 'opacity 0.2s ease'
        });

        const modal = document.createElement('div');
        Object.assign(modal.style, {
            background: '#0f172a', padding: '2rem', borderRadius: '12px',
            maxWidth: '450px', width: '90%', border: '1px solid #334155',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            color: '#f8fafc', transform: 'scale(0.95)', transition: 'transform 0.2s ease'
        });

        const text = document.createElement('p');
        Object.assign(text.style, {
            marginBottom: '1rem', fontSize: '1.1rem', lineHeight: '1.5'
        });
        text.innerText = message;
        modal.appendChild(text);

        const input = document.createElement('input');
        input.type = 'number';
        input.step = '0.01';
        input.value = defaultValue;
        Object.assign(input.style, {
            width: '100%', padding: '0.75rem 1rem', borderRadius: '8px', 
            border: '1px solid #334155', backgroundColor: '#1e293b', color: 'white',
            marginBottom: '2rem', fontSize: '1rem', fontFamily: 'monospace'
        });
        modal.appendChild(input);

        const btnContainer = document.createElement('div');
        Object.assign(btnContainer.style, { display: 'flex', justifyContent: 'flex-end', gap: '1rem' });

        const close = (val) => {
            overlay.style.opacity = '0';
            modal.style.transform = 'scale(0.95)';
            setTimeout(() => { document.body.removeChild(overlay); resolve(val); }, 200);
        };

        const cancelBtn = document.createElement('button');
        cancelBtn.innerText = 'Cancel';
        cancelBtn.className = 'btn btn-secondary';
        Object.assign(cancelBtn.style, {
            padding: '0.5rem 1.5rem', borderRadius: '8px', border: '1px solid #334155',
            background: 'transparent', color: 'white', cursor: 'pointer'
        });
        cancelBtn.onclick = () => close(null);
        btnContainer.appendChild(cancelBtn);

        const okBtn = document.createElement('button');
        okBtn.innerText = 'Submit';
        okBtn.className = 'btn';
        Object.assign(okBtn.style, {
            padding: '0.5rem 1.5rem', borderRadius: '8px', border: 'none',
            background: '#22c55e', color: '#000', cursor: 'pointer', fontWeight: 'bold'
        });
        okBtn.onclick = () => close(input.value);
        btnContainer.appendChild(okBtn);

        modal.appendChild(btnContainer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
            modal.style.transform = 'scale(1)';
            input.focus();
            input.select();
        });
    });
};
