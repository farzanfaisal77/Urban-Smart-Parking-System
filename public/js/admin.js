requireAuth('admin');

// Tab Switching Logic
window.switchTab = (tabName) => {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.admin-nav button').forEach(el => el.classList.remove('active'));
    
    document.getElementById(`tab-${tabName}`).classList.add('active');
    document.getElementById(`nav-btn-${tabName}`).classList.add('active');

    if (tabName === 'users') loadUsers();
    if (tabName === 'lots') loadLots();
    if (tabName === 'sessions') loadSessions();
};

async function loadUsers() {
    try {
        const users = await apiCall('/admin/users');
        const tbody = document.querySelector('#users-table tbody');
        tbody.innerHTML = users.map(u => {
            const vehiclesArray = u.vehicles || [];
            const vHtml = vehiclesArray.length === 0 
                ? '<span style="color:var(--text-muted)">No vehicles attached</span>'
                : vehiclesArray.map(v => {
                    let parkHtml = '';
                    if (v.parked_slot) {
                        parkHtml = `<div style="font-size: 0.7rem; color: #facc15; margin-top: 4px; display:flex; align-items:center; gap: 4px;">
                                        <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                                        Parked in ${v.parked_lot} (Slot ${v.parked_slot})
                                    </div>`;
                    }
                    return `<div style="background: rgba(0,0,0,0.2); border: 1px solid #334155; border-radius: 6px; padding: 0.5rem; margin-bottom: 0.5rem; display: inline-block; margin-right: 0.5rem;">
                                <div style="font-weight: bold; font-family: monospace;">${v.license_plate} <span class="badge ${v.type}">${v.type}</span></div>
                                <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">${v.make_model || 'Unknown Make'}</div>
                                ${parkHtml}
                            </div>`;
                }).join('');
                
            return `
            <tr>
                <td style="color:var(--text-muted); font-family: monospace;">#${u.id}</td>
                <td>
                    <div style="font-weight:bold; font-size: 1.1rem;">${u.username}</div>
                    <div style="font-size:0.85rem; color:var(--text-muted); margin-top:0.25rem;">${u.phone || 'No phone provided'}</div>
                    <div style="font-size:0.85rem; color:#ef4444; margin-top:0.25rem; font-weight: bold;">Due Fees: $${parseFloat(u.due_fees || 0).toFixed(2)}</div>
                </td>
                <td>${vHtml}</td>
                <td style="display:flex; flex-direction:column; gap:0.5rem;">
                    <button onclick="setUserDues(${u.id}, '${u.username}', ${u.due_fees || 0})" style="background:#22c55e; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Set Dues</button>
                    <button onclick="deleteUser(${u.id}, '${u.username}')" style="background:#ef4444; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Delete</button>
                </td>
            </tr>
        `}).join('');
    } catch (e) { console.error('Error loading users', e); }
}

let adminDriverCache = [];

async function loadLots() {
    const container = document.getElementById('lots-container');
    try {
        const lots = await apiCall('/lots');
        // Cache users so we don't spam the endpoint per slot
        adminDriverCache = await apiCall('/admin/users');

        if (lots.length === 0) {
            container.innerHTML = '<div style="background: rgba(30,41,59,0.5); padding: 2rem; border-radius: 12px; text-align: center; color: var(--text-muted); border: 1px dashed #475569;">No lots created yet. Use the form to the left.</div>';
            return;
        }
        
        container.innerHTML = '';

        for (let lot of lots) {
            const slots = await apiCall(`/lots/${lot.lot_id}/slots`);
            const occRate = lot.total > 0 ? ((lot.total - lot.available_slots) / lot.total * 100).toFixed(0) : 0;
            
            const lotEl = document.createElement('div');
            lotEl.style = "background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); padding: 2rem; border-radius: 12px; border: 1px solid #334155; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);";
            
            let slotsHtml = slots.map(s => {
                const isLocked = s.status !== 'available';
                
                // User Context injected
                let userContext = '';
                if (s.driver_id) {
                    const usr = adminDriverCache.find(u => u.id === s.driver_id);
                    if (usr) {
                        const veh = usr.vehicles.find(v => v.parked_slot === s.slot_number) || usr.vehicles[0]; // fallback to first vehicle if misaligned
                        const entryTime = veh && veh.entry_time ? new Date(veh.entry_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Unknown Time';
                        userContext = `
                            <div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px dashed rgba(255,255,255,0.1); font-size: 0.8rem;">
                                <div style="color: #93c5fd; font-weight: bold; margin-bottom: 2px;">👤 ${usr.username}</div>
                                <div style="color: var(--text-muted); display: flex; justify-content: space-between;">
                                    <span>${veh ? veh.license_plate : 'Unknown'}</span>
                                    <span style="color: #facc15;">Since ${entryTime}</span>
                                </div>
                            </div>
                        `;
                    }
                }

                return `
                <div style="display:flex; flex-direction:column; padding: 1rem; background: ${isLocked ? 'rgba(59, 130, 246, 0.1)' : 'rgba(0,0,0,0.25)'}; border: 1px solid ${isLocked ? 'rgba(59, 130, 246, 0.3)' : 'transparent'}; border-radius: 8px;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 0.5rem;">
                        <div style="display:flex; flex-direction:column;">
                            <span style="font-family:monospace; font-size: 1.1rem; font-weight: bold;">Slot ${s.slot_number}</span>
                        </div>
                        <select onchange="updateSlotStatus(${s.id}, this.value)" style="border:none; padding: 0.2rem; border-radius: 4px; background: rgba(0,0,0,0.3); font-size:0.75rem; font-weight:bold; color:${!isLocked?'var(--primary)':'#ef4444'}">
                            <option value="available" ${s.status==='available'?'selected':''}>AVAILABLE</option>
                            <option value="occupied" ${s.status==='occupied'?'selected':''}>OCCUPIED</option>
                            <option value="reserved" ${s.status==='reserved'?'selected':''}>RESERVED</option>
                        </select>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: bold;">Slot Type:</span>
                        <select class="slot-type-select" onchange="updateSlotType(${s.id}, this.value)" ${isLocked ? 'disabled title="Cannot edit occupied slot"' : ''} style="${isLocked ? 'opacity:0.5; cursor:not-allowed;' : ''}; max-width: 80px; font-size: 0.8rem; padding: 0.1rem 0.4rem;">
                            <option value="car" ${s.slot_type==='car'?'selected':''}>Car</option>
                            <option value="bike" ${s.slot_type==='bike'?'selected':''}>Bike</option>
                            <option value="lorry" ${s.slot_type==='lorry'?'selected':''}>Lorry</option>
                        </select>
                    </div>

                    ${userContext}
                </div>
            `}).join('');

            lotEl.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:1.5rem; align-items: flex-start; padding-bottom: 1rem; border-bottom: 1px solid #334155;">
                    <div>
                        <h4 style="font-size: 1.8rem; margin-bottom: 0.5rem; color: #f8fafc;">${lot.name}</h4>
                        <p style="color:var(--text-muted); font-size: 0.95rem;">📍 ${lot.address}</p>
                        <p style="color:var(--text-muted); font-size: 0.85rem; margin-top: 0.5rem;">Total Slots: ${lot.total_slots}</p>
                        <button onclick="deleteLot(${lot.lot_id})" class="btn" style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color:#ef4444; font-size:0.75rem; cursor:pointer; margin-top:1rem; padding: 0.3rem 0.6rem; border-radius: 4px;">Trash Lot</button>
                    </div>
                    <div style="text-align: right; background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 8px;">
                        <div style="font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase;">Occupancy</div>
                        <div style="font-size: 2.2rem; letter-spacing: -1px; font-weight: bold; color: ${occRate > 80 ? '#ef4444' : 'var(--primary)'}">${occRate}%</div>
                    </div>
                </div>
                <div class="slot-types-container" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; border: none; padding-top: 0; margin-top: 0;">
                    ${slotsHtml}
                </div>
            `;
            container.appendChild(lotEl);
        }
    } catch (e) {
        console.error('Failed to load lots', e);
    }
}

async function loadSessions() {
    try {
        const sessions = await apiCall('/admin/sessions');
        const tbody = document.querySelector('#sessions-table tbody');
        
        if (sessions.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding: 2rem;">No parking sessions logged across the network.</td></tr>`;
            return;
        }
        
        tbody.innerHTML = sessions.map(s => {
            const statusBadge = s.status === 'active' 
                ? `<span style="background:rgba(250, 204, 21, 0.2); color:#facc15; padding: 3px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: bold; display: inline-block;">ACTIVE</span>`
                : `<span style="background:rgba(34, 197, 94, 0.2); color:#4ade80; padding: 3px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: bold; display: inline-block;">COMPLETED</span>`;
                
            const exTime = s.exit_time ? new Date(s.exit_time).toLocaleString() : '-';
            
            return `
            <tr>
                <td style="color:var(--text-muted); font-family: monospace;">#${s.id}</td>
                <td style="font-weight: bold;">${s.username}</td>
                <td>${s.license_plate} <span style="font-size:0.7rem; opacity: 0.7">(${s.vehicle_type})</span></td>
                <td>${s.lot_name}</td>
                <td style="font-family: monospace; font-weight: bold">${s.slot_number}</td>
                <td style="font-weight: bold; color: #93c5fd;">${s.duration_hours || '-'}</td>
                <td style="font-weight: bold; color: #22c55e;">${s.fee_charged !== null && s.fee_charged !== undefined ? '$'+parseFloat(s.fee_charged).toFixed(2) : '-'}</td>
                <td style="font-size: 0.85rem">${new Date(s.entry_time).toLocaleString()}</td>
                <td style="font-size: 0.85rem; color: ${s.exit_time ? 'inherit' : 'var(--text-muted)'}">${exTime}</td>
                <td>${statusBadge}</td>
            </tr>
        `}).join('');
    } catch (e) {
        console.error('Error loading sessions', e);
    }
}

window.viewSlotDetails = async (slotId) => {
    const sInfo = window[`slotInfo_${slotId}`];
    if (!sInfo || !sInfo.driver_id) return;
    try {
        // Fetch user data directly from our users endpoint list
        const users = await apiCall('/admin/users');
        const u = users.find(user => user.id === sInfo.driver_id);
        if (u) {
            const activeV = u.vehicles.find(v => v.parked_slot === sInfo.slot_number);
            const vString = activeV ? `Vehicle: ${activeV.license_plate} (${activeV.make_model})` : 'Vehicle info missing';
            
            await showAlert(`Slot ${sInfo.slot_number} Info\n--------------------\nDriver: ${u.username}\nPhone: ${u.phone || 'N/A'}\nStatus: ${sInfo.status.toUpperCase()}\n\n${vString}`);
        } else {
            await showAlert('Driver details not found. They might have been deleted.');
        }
    } catch(e) {
        await showAlert("Failed to fetch driver details");
    }
};

window.updateSlotType = async (slotId, newType) => {
    try {
        await apiCall(`/slots/${slotId}`, 'PUT', { slot_type: newType });
        loadLots();
    } catch(e) {
        await showAlert("Error updating slot: " + e.message);
    }
};

window.updateSlotStatus = async (slotId, newStatus) => {
    try {
        await apiCall(`/admin/slots/${slotId}/status`, 'PUT', { status: newStatus });
        loadLots();
    } catch(e) {
        await showAlert("Error overriding status: " + e.message);
        loadLots(); // revert dropdown visually
    }
};

window.deleteLot = async (lotId) => {
    try {
        await apiCall(`/lots/${lotId}`, 'DELETE');
        loadLots();
    } catch(e) {
        await showAlert("Error deleting lot: " + e.message);
    }
}

window.deleteUser = async (userId, username) => {
    if(!(await showConfirm(`WARNING: Deleting driver "${username}" will destroy their account, unregister all vehicles, and wipe active parking sessions. Proceed?`))) return;
    try {
        await apiCall(`/admin/users/${userId}`, 'DELETE');
        loadUsers(); // refresh the table
        loadLots();  // visually clear them from any active lot boxes
    } catch(e) {
        await showAlert("Error deleting user: " + e.message);
    }
};

window.setUserDues = async (userId, username, currentDues) => {
    const amtStr = await showPrompt(`Set new due amount for driver "${username}":`, currentDues);
    if (amtStr === null) return;
    const amt = parseFloat(amtStr);
    if (isNaN(amt)) {
        await showAlert("Invalid amount entered.");
        return;
    }
    try {
        await apiCall(`/admin/users/${userId}/dues`, 'PUT', { amount: amt });
        loadUsers();
    } catch(e) {
        await showAlert("Error setting dues: " + e.message);
    }
};

document.getElementById('create-lot-form').onsubmit = async (e) => {
    e.preventDefault();
    const n = document.getElementById('lot-name').value;
    const a = document.getElementById('lot-address').value;
    const s = parseInt(document.getElementById('lot-slots').value);
    const p = parseFloat(document.getElementById('lot-price').value);
    
    const errEl = document.getElementById('admin-error');
    const sucEl = document.getElementById('admin-success');
    errEl.innerText = ''; sucEl.innerText = '';

    try {
        const res = await apiCall('/lots', 'POST', { name: n, address: a, total_slots: s, price_per_hour: p });
        sucEl.innerText = res.message;
        document.getElementById('create-lot-form').reset();
        loadLots();
    } catch (err) {
        errEl.innerText = err.message;
    }
};

// Init
document.addEventListener('DOMContentLoaded', () => {
    switchTab('users'); // loads users
});
