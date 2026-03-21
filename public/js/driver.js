requireAuth('driver');
let myVehicles = [];

// UI toggles
const phoneSec = document.getElementById('phone-prompt-section');
const vehicleSec = document.getElementById('vehicle-manager-section');

document.addEventListener('DOMContentLoaded', async () => {
    if (!currentUser.phone) {
        phoneSec.style.display = 'block';
    } else {
        vehicleSec.style.display = 'block';
        await loadVehicles();
    }
    reloadUI();
});

// Add Phone
document.getElementById('phone-form').onsubmit = async (e) => {
    e.preventDefault();
    const phoneVal = document.getElementById('user-phone').value;
    try {
        await apiCall('/user/phone', 'POST', { user_id: currentUser.id, phone: phoneVal });
        currentUser.phone = phoneVal;
        localStorage.setItem('user', JSON.stringify(currentUser));
        phoneSec.style.display = 'none';
        vehicleSec.style.display = 'block';
        await loadVehicles();
    } catch(e) { await showAlert(e.message); }
};

// Add Vehicle
document.getElementById('vehicle-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
        await apiCall('/vehicles', 'POST', {
            owner_id: currentUser.id,
            license_plate: document.getElementById('v-plate').value,
            type: document.getElementById('v-type').value,
            make_model: document.getElementById('v-make').value
        });
        document.getElementById('vehicle-form').reset();
        await loadVehicles();
    } catch(e) { await showAlert(e.message); }
};

async function loadVehicles() {
    try {
        myVehicles = await apiCall(`/vehicles/${currentUser.id}`);
        const list = document.getElementById('vehicles-list');
        
        if (myVehicles.length === 0) list.innerHTML = '<p style="color:var(--text-muted); font-size:0.875rem;">No vehicles registered.</p>';
        else {
            list.innerHTML = myVehicles.map(v => `
                <div style="background: rgba(255,255,255,0.05); border: 1px solid #334155; padding: 0.75rem; border-radius: 8px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-weight:bold;">${v.license_plate}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted);">${v.make_model || 'Unknown Make'}</div>
                    </div>
                    <div style="display:flex; align-items:center; gap: 0.5rem;">
                        <span class="badge ${v.type}">${v.type}</span>
                        <button onclick="deleteVehicle(${v.id})" style="background: #ef4444; color: white; border: none; border-radius: 4px; padding: 0.25rem 0.5rem; cursor: pointer; font-size: 0.75rem;" title="Delete Vehicle & Free Slot if parked">Delete</button>
                    </div>
                </div>
            `).join('');
        }
    } catch(e) { console.error('Error loading vehicles', e); }
}

window.deleteVehicle = async (id) => {
    if (!(await showConfirm('Are you sure you want to delete this vehicle? Any active parking sessions for it will be ended.'))) return;
    try {
        await apiCall(`/vehicles/${id}`, 'DELETE');
        await loadVehicles();
        reloadUI(); // refresh active sessions and slots
    } catch(e) {
        await showAlert("Failed to delete vehicle: " + e.message);
    }
};

async function loadSessions() {
    const container = document.getElementById('sessions-container');
    try {
        const sessions = await apiCall(`/my-sessions/${currentUser.id}`);
        
        if (sessions.length === 0) {
            container.innerHTML = '<div style="color:var(--text-muted); padding: 1rem; border: 1px dashed #334155; border-radius: 8px; width: 100%;">You have no active parking sessions.</div>';
            return;
        }

        container.innerHTML = sessions.map(s => {
            const isReserved = s.status === 'reserved';
            const timeLbl = isReserved ? `Reserved For: ${new Date(s.reserved_time).toLocaleString()}` : 'Currently Parked (Now)';
            const color = isReserved ? '#3b82f6' : '#facc15';

            return `
            <div style="background: rgba(30,41,59,0.5); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border: 1px solid ${color}; padding: 1.5rem; border-radius: 12px; min-width: 300px; max-width: 350px;">
                <h4 style="font-size: 1.25rem; margin-bottom: 0.5rem; color: ${color};">${s.lot_name}</h4>
                <p style="margin-bottom: 0.5rem; color: var(--text-main);">Slot <b>${s.slot_number}</b> &bull; ${s.license_plate}</p>
                <p style="font-size:0.75rem; font-family:monospace; background: rgba(0,0,0,0.3); padding: 0.25rem 0.5rem; margin-bottom: 1.5rem; border-radius:4px;">
                    ${timeLbl}
                </p>
                <button onclick="releaseSlot(${s.slot_id})" class="btn" style="width: 100%; border-radius: 8px; background: #ef4444; color: white; padding: 0.75rem;">
                    ${isReserved ? 'Cancel Reservation' : 'Exit & Complete Session'}
                </button>
            </div>
        `}).join('');
    } catch(e) { console.error('Error loading sessions', e); }
}

async function loadDiscovery() {
    const container = document.getElementById('discovery-container');
    try {
        const lots = await apiCall('/lots');
        if (lots.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted)">No parking lots exist.</p>';
            return;
        }

        container.innerHTML = '';
        for (let lot of lots) {
            const slots = await apiCall(`/lots/${lot.lot_id}/slots`);
            const lotEl = document.createElement('div');
            lotEl.className = 'card animate-fade-in';
            
            const slotButtons = slots.map(s => `
                <button onclick="openModal(${s.id}, '${s.slot_number}', '${lot.name}', '${s.status}', '${s.slot_type}')" 
                        class="slot-btn ${s.status}" 
                        style="width: 80px;"
                        title="${s.status !== 'available' ? 'Not Available' : 'Click to park'}">
                    <span>${s.slot_number}</span>
                    <span class="badge ${s.slot_type}" style="font-size: 0.6rem;">${s.slot_type}</span>
                </button>
            `).join('');

            lotEl.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                        <h3 style="font-size: 1.5rem; margin-bottom: 0.5rem;">${lot.name}</h3>
                        <p style="color:var(--text-muted); font-size: 0.875rem; margin-bottom: 1.5rem;">${lot.address}</p>
                    </div>
                    <div style="background: rgba(0,0,0,0.3); padding: 0.5rem 1rem; border-radius: 8px; border: 1px solid #334155; text-align: center;">
                        <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Rate</div>
                        <div style="font-weight: bold; color: #22c55e;">$${parseFloat(lot.price_per_hour || 0).toFixed(2)}/hr</div>
                    </div>
                </div>
                <div class="slots-grid">${slotButtons}</div>
            `;
            container.appendChild(lotEl);
        }
    } catch(e) { console.error('Error loading lots', e); }
}

// Modal Logic
const modal = document.getElementById('reserve-modal');
window.openModal = function(slotId, slotNumber, lotName, status, slotType) {
    if (status !== 'available') return;
    
    // Generate list of matching vehicles
    const validVehicles = myVehicles.filter(v => v.type === slotType);
    const selectEl = document.getElementById('modal-vehicle-id');
    
    if (validVehicles.length === 0) {
        showAlert(`You do not have any registered ${slotType}s to park in this slot.`);
        return;
    }

    selectEl.innerHTML = validVehicles.map(v => `<option value="${v.id}">${v.license_plate} (${v.make_model})</option>`).join('');
    
    document.getElementById('modal-slot-id').value = slotId;
    document.getElementById('modal-slot-title').innerText = slotNumber;
    document.getElementById('modal-lot-title').innerText = lotName;
    
    modal.classList.remove('hidden');
}

window.closeModal = function() {
    modal.classList.add('hidden');
    document.getElementById('reserve-form').reset();
    toggleTimeInput(); // reset
}

window.toggleTimeInput = () => {
    const t = document.getElementById('modal-action-type').value;
    const tContainer = document.getElementById('reserve-time-container');
    const tInput = document.getElementById('modal-time');
    const dInput = document.getElementById('modal-duration-hours');
    
    if (t === 'later') {
        tContainer.classList.remove('hidden');
        tInput.required = true;
        dInput.required = true;
    } else {
        tContainer.classList.add('hidden');
        tInput.required = false;
        dInput.required = false;
    }
};

document.getElementById('reserve-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
        await apiCall('/reserve', 'POST', { 
            slot_id: document.getElementById('modal-slot-id').value, 
            driver_id: currentUser.id,
            vehicle_id: document.getElementById('modal-vehicle-id').value,
            action_type: document.getElementById('modal-action-type').value,
            time: document.getElementById('modal-time').value,
            duration_hours: document.getElementById('modal-action-type').value === 'later' ? document.getElementById('modal-duration-hours').value : null
        });
        closeModal();
        reloadUI();
    } catch(e) {
        await showAlert(e.message);
    }
};

window.releaseSlot = async (slotId) => {
    try {
        await apiCall('/release', 'POST', { slot_id: slotId });
        reloadUI();
    } catch(e) { await showAlert(e.message); }
};

window.loadDues = async function() {
    try {
        const res = await apiCall(`/user/dues/${currentUser.id}`);
        const dues = parseFloat(res.due_fees || 0);
        const duesSec = document.getElementById('dues-section');
        const duesAmt = document.getElementById('user-dues-amount');
        const headDues = document.getElementById('header-dues');
        const headDuesAmt = document.getElementById('header-dues-amt');

        headDues.style.display = 'flex';
        headDuesAmt.innerText = `$${dues.toFixed(2)}`;
        if (dues <= 0) {
            headDues.style.color = 'var(--text-muted)';
        } else {
            headDues.style.color = '#facc15';
        }

        if (dues > 0) {
            duesSec.style.display = 'block';
            duesAmt.innerText = `$${dues.toFixed(2)}`;
        } else {
            duesSec.style.display = 'none';
        }
    } catch(e) { console.error('Error loading dues', e); }
}

window.reloadUI = function() {
    loadSessions();
    loadDiscovery();
    loadDues();
}
