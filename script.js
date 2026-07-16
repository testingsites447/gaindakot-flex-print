// --- 1. FIREBASE INITIALIZATION & IMPORTS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, collection, addDoc, onSnapshot, doc, deleteDoc, updateDoc, query, orderBy, limit 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// YOUR FIREBASE PROJECT CONFIGURATION
const firebaseConfig = {
  apiKey: "AIzaSyDTYHYQUVN75hBLPhJs2zO3LV9FH4qb7GE",
  authDomain: "gaindakot-flex-print-6a3b8.firebaseapp.com",
  projectId: "gaindakot-flex-print-6a3b8",
  storageBucket: "gaindakot-flex-print-6a3b8.firebasestorage.app",
  messagingSenderId: "194128658156",
  appId: "1:194128658156:web:afd44bbae54ec69c2defc9"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ⚠️ PASTE YOUR GOOGLE APPS SCRIPT WEB APP URL HERE:
const GOOGLE_SHEET_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbxfD5dtjmmODpwvU4kJ-nQatSYyieLdXA9ZjeHeeNx6/dev";

// --- 2. GLOBAL STATE ---
let ordersDB = [];
let selectedClientsArray = [];

// --- 3. FIREBASE REAL-TIME LISTENER ---
const ordersQuery = query(collection(db, "orders"), orderBy("id", "desc"), limit(1000));

onSnapshot(ordersQuery, (snapshot) => {
    ordersDB = [];
    snapshot.forEach((docSnap) => {
        let data = docSnap.data();
        data.firebaseId = docSnap.id; 
        ordersDB.push(data);
    });
    
    // Automatically keep Google Sheets updated in real-time
    syncToGoogleSheets();

    if (document.getElementById('multi-select-dropdown')) populateClientFilter();
    renderLedger();
    if (!document.getElementById('view-dashboard').classList.contains('hidden')) {
        initDashboard();
    }
});

// --- GOOGLE SHEETS LIVE SYNC ENGINE ---
async function syncToGoogleSheets() {
    // FIXED: Now blocks execution ONLY if the URL is empty or still contains the placeholder text
    if (!GOOGLE_SHEET_WEBAPP_URL || GOOGLE_SHEET_WEBAPP_URL.includes("PASTE_YOUR_")) return;
    
    try {
        await fetch(GOOGLE_SHEET_WEBAPP_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "sync_all",
                data: ordersDB
            })
        });
    } catch (err) {
        console.error("Google Sheet Sync Error: ", err);
    }
}

// --- 4. SESSION PERSISTENCE (AUTO-LOGIN) ---
document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('flex_logged_in') === 'true') {
        const portal = document.getElementById('login-portal');
        const mainApp = document.getElementById('main-app');
        
        portal.classList.add('hidden');
        mainApp.classList.remove('hidden');
        mainApp.style.opacity = '1';
        
        window.setDefaultDate();
        const savedView = localStorage.getItem('flex_active_view') || 'booking';
        window.navigate(savedView);
    }
});

// --- 5. TOAST NOTIFICATION ---
window.showToast = function(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const icon = type === 'success' ? '<i class="fa-solid fa-check-circle text-green-400"></i>' : '<i class="fa-solid fa-circle-exclamation text-red-400"></i>';
    toast.className = 'glass-panel bg-[#0d0d0f] border-gold/20 px-4 py-3 rounded-lg shadow-2xl flex items-center gap-3 text-sm animate-toast-enter';
    toast.innerHTML = `${icon} <span class="text-white font-medium">${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.remove('animate-toast-enter');
        toast.classList.add('animate-toast-exit');
        setTimeout(() => toast.remove(), 400);
    }, 3000);
};

// --- 6. NAVIGATION & LOGIN HANDLERS ---
window.handleLogin = function(e) {
    e.preventDefault();
    const emailInput = document.getElementById('login-email').value.trim();
    const passwordInput = document.getElementById('login-password').value;

    const correctEmail = "admin@gaindakot.com"; 
    const correctPassword = "password123";      

    if (emailInput === correctEmail && passwordInput === correctPassword) {
        localStorage.setItem('flex_logged_in', 'true');
        window.showToast("Authentication Successful");
        
        const portal = document.getElementById('login-portal');
        const mainApp = document.getElementById('main-app');
        
        portal.style.opacity = '0';
        setTimeout(() => {
            portal.classList.add('hidden');
            mainApp.classList.remove('hidden');
            setTimeout(() => mainApp.style.opacity = '1', 50);
            window.setDefaultDate();
            window.navigate('booking'); 
        }, 500);
        
        document.getElementById('login-form').reset();
    } else {
        window.showToast("Incorrect Email ID or Passcode", "error");
    }
};

window.performLogout = function() {
    localStorage.removeItem('flex_logged_in');
    localStorage.removeItem('flex_active_view');
    location.reload();
};

window.navigate = function(viewId) {
    localStorage.setItem('flex_active_view', viewId); 
    
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('active', 'text-champagne');
        el.classList.add('text-gray-400');
    });
    const activeBtn = document.getElementById(`nav-${viewId}`);
    if(activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.classList.remove('text-gray-400');
    }
    
    document.querySelectorAll('.view-section').forEach(el => {
        el.classList.add('hidden');
        el.classList.remove('dynamic-slide-up');
    });
    
    const targetView = document.getElementById(`view-${viewId}`);
    if(targetView) {
        targetView.classList.remove('hidden');
        void targetView.offsetWidth; 
        targetView.classList.add('dynamic-slide-up');
    }
    
    if (viewId === 'dashboard') initDashboard();
    if (viewId === 'ledger') renderLedger();
    if (viewId === 'booking') window.setDefaultDate();
};

window.setDefaultDate = function() {
    const dateInput = document.getElementById('inp-date');
    if(dateInput) dateInput.value = new Date().toISOString().split('T')[0];
};

// --- 7. MANUAL BOOKING LOGIC ---
document.querySelectorAll('.calc-trigger').forEach(input => {
    input.addEventListener('input', calculateDue);
});

function calculateDue() {
    const total = parseFloat(document.getElementById('inp-total').value) || 0;
    const advanceInput = document.getElementById('inp-advance');
    let advance = parseFloat(advanceInput.value) || 0;

    if (advance > total) { advance = total; advanceInput.value = advance; }
    const due = total - advance;

    document.getElementById('out-due').innerText = due > 0 ? due.toFixed(2) : 0;
}

window.submitOrder = async function(e) {
    e.preventDefault();
    
    const w = parseFloat(document.getElementById('inp-w').value) || 0;
    const h = parseFloat(document.getElementById('inp-h').value) || 0;
    const qty = parseInt(document.getElementById('inp-qty').value) || 1;
    const sqft = w * h * qty;

    const newOrder = {
        id: Date.now(),
        date: document.getElementById('inp-date').value,
        client: document.getElementById('inp-client').value.trim(),
        particulars: document.getElementById('inp-particulars').value,
        size: (w > 0 && h > 0) ? `${w}x${h}` : 'N/A',
        sqft: sqft > 0 ? sqft : 0,
        qty: qty,
        rate: parseFloat(document.getElementById('inp-rate').value) || 0,
        total: parseFloat(document.getElementById('inp-total').value) || 0,
        advance: parseFloat(document.getElementById('inp-advance').value) || 0,
        due: parseFloat(document.getElementById('out-due').innerText),
        method: document.getElementById('inp-method').value,
        status: 'Pending' 
    };

    try {
        await addDoc(collection(db, "orders"), newOrder);
        window.showToast("Order Saved & Synced");
        document.getElementById('order-form').reset();
        document.getElementById('out-due').innerText = '0';
        window.setDefaultDate();
    } catch (error) {
        console.error("Error adding document: ", error);
        window.showToast("Failed to save order", "error");
    }
};

// --- 8. MULTI-SELECT CLIENT FILTER ---
window.toggleMultiSelect = function() {
    document.getElementById('multi-select-dropdown').classList.toggle('hidden');
    const chevron = document.getElementById('ms-chevron');
    chevron.style.transform = document.getElementById('multi-select-dropdown').classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
};

document.addEventListener('click', function(event) {
    const container = document.getElementById('multi-select-container');
    if (container && !container.contains(event.target)) {
        const dropdown = document.getElementById('multi-select-dropdown');
        if(dropdown && !dropdown.classList.contains('hidden')) {
            dropdown.classList.add('hidden');
            document.getElementById('ms-chevron').style.transform = 'rotate(0deg)';
        }
    }
});

function populateClientFilter() {
    const dropdown = document.getElementById('multi-select-dropdown');
    if(!dropdown) return;
    const uniqueClients = [...new Set(ordersDB.map(order => order.client))].sort();
    
    let html = `
        <label class="flex items-center px-4 py-2 hover:bg-white/5 cursor-pointer rounded-md transition text-sm">
            <input type="checkbox" id="selectAllClientsCb" onchange="window.toggleAllClients(this)" class="custom-checkbox mr-3" ${selectedClientsArray.length === 0 ? 'checked' : ''}>
            <span class="font-bold text-champagne">All Clients</span>
        </label>
        <div class="h-px bg-gray-700/50 my-1 mx-2"></div>
    `;
    uniqueClients.forEach(client => {
        const isChecked = selectedClientsArray.includes(client) ? 'checked' : '';
        html += `
            <label class="flex items-center px-4 py-2 hover:bg-white/5 cursor-pointer rounded-md transition text-sm text-gray-300">
                <input type="checkbox" value="${client}" onchange="window.updateClientSelection()" class="client-cb custom-checkbox mr-3" ${isChecked}>
                <span class="truncate">${client}</span>
            </label>
        `;
    });
    dropdown.innerHTML = html;
    updateMultiSelectText();
}

window.toggleAllClients = function(masterCheckbox) {
    const checkboxes = document.querySelectorAll('.client-cb');
    if (masterCheckbox.checked) {
        selectedClientsArray = []; 
        checkboxes.forEach(cb => cb.checked = false);
    } else {
        masterCheckbox.checked = true; 
    }
    updateMultiSelectText();
    window.renderLedger();
};

window.updateClientSelection = function() {
    const checkboxes = document.querySelectorAll('.client-cb');
    const masterCheckbox = document.getElementById('selectAllClientsCb');
    selectedClientsArray = [];
    checkboxes.forEach(cb => { if (cb.checked) selectedClientsArray.push(cb.value); });
    masterCheckbox.checked = selectedClientsArray.length === 0;
    updateMultiSelectText();
    window.renderLedger();
};

function updateMultiSelectText() {
    const textSpan = document.getElementById('multi-select-text');
    if(!textSpan) return;
    if (selectedClientsArray.length === 0) {
        textSpan.innerText = "All Clients";
        textSpan.classList.replace('text-champagne', 'text-gray-300');
    } else if (selectedClientsArray.length === 1) {
        textSpan.innerText = selectedClientsArray[0];
        textSpan.classList.replace('text-gray-300', 'text-champagne');
    } else {
        textSpan.innerText = `${selectedClientsArray.length} Clients Selected`;
        textSpan.classList.replace('text-gray-300', 'text-champagne');
    }
}

// --- 9. LEDGER LOGIC (WITH NEW PAYMENT INTERACTION FILTER) ---
window.inlineUpdateStatus = async function(firebaseId, selectElement) {
    const newStatus = selectElement.value;
    try {
        await updateDoc(doc(db, "orders", firebaseId), { status: newStatus });
        selectElement.className = `status-select status-${newStatus} focus:outline-none bg-transparent`;
        window.showToast(`Status updated to ${newStatus}`, 'info');
    } catch (error) {
        console.error("Error updating status: ", error);
        window.showToast("Failed to update status", "error");
    }
};

window.renderLedger = function() {
    const searchElement = document.getElementById('search-ledger');
    const dateElement = document.getElementById('filter-date');
    const statusElement = document.getElementById('filter-status');
    const paymentElement = document.getElementById('filter-payment');
    const tbody = document.getElementById('ledger-table-body');
    if(!tbody || !searchElement || !dateElement || !statusElement || !paymentElement) return;
    
    const query = searchElement.value.toLowerCase();
    const dateFilter = dateElement.value;
    const statusFilter = statusElement.value;
    const paymentFilter = paymentElement.value; 
    tbody.innerHTML = '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let filtered = ordersDB.filter(order => {
        if (selectedClientsArray.length > 0 && !selectedClientsArray.includes(order.client)) return false;

        if (paymentFilter === 'due' && order.due <= 0) return false;
        if (paymentFilter === 'clear' && order.due > 0) return false;

        if (statusFilter === 'delivered_unpaid') {
            if (order.status !== 'Delivered' || order.due <= 0) return false;
        } else if (statusFilter !== 'all' && order.status !== statusFilter) {
            return false;
        }

        if (!order.client.toLowerCase().includes(query) && !order.particulars.toLowerCase().includes(query)) return false;

        const orderDate = new Date(order.date);
        orderDate.setHours(0,0,0,0);
        const diffDays = Math.floor((today - orderDate) / (1000 * 60 * 60 * 24));
        if (dateFilter === 'today' && diffDays !== 0) return false;
        if (dateFilter === '7days' && diffDays > 7) return false;
        if (dateFilter === '1month' && diffDays > 30) return false;
        
        return true;
    });

    let tSales = 0, tPaid = 0, tDue = 0;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-12 text-gray-500 font-medium">No records found for these filters.</td></tr>`;
    } else {
        filtered.forEach(order => {
            tSales += order.total;
            tPaid += order.advance;
            tDue += order.due;
            
            const dueIndicator = order.due > 0 
                ? `<span class="text-red-400 font-bold block text-[11px] uppercase tracking-wide mt-1">Due: Rs. ${order.due}</span>`
                : `<span class="text-gray-500 block text-[11px] uppercase tracking-wide mt-1"><i class="fa-solid fa-check"></i> Cleared</span>`;

            const inlineStatusSelect = `
                <select onchange="window.inlineUpdateStatus('${order.firebaseId}', this)" class="status-select status-${order.status} focus:outline-none bg-transparent">
                    <option value="Pending" class="bg-dark text-white" ${order.status === 'Pending' ? 'selected' : ''}>Pending</option>
                    <option value="Ready" class="bg-dark text-white" ${order.status === 'Ready' ? 'selected' : ''}>Ready</option>
                    <option value="Delivered" class="bg-dark text-white" ${order.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
                </select>
            `;

            const row = `
                <tr class="table-row-hover border-b border-gray-800/30">
                    <td class="px-5 py-4 text-gray-400 whitespace-nowrap font-medium">${order.date}</td>
                    <td class="px-5 py-4 font-bold text-white">${order.client}</td>
                    <td class="px-5 py-4 text-gray-300 font-medium">${order.particulars} <br>
                        <span class="text-[11px] text-gray-500 uppercase tracking-wide mt-1 block">
                            ${order.size !== 'N/A' ? `${order.size}ft | ` : ''}Qty: ${order.qty}
                        </span>
                    </td>
                    <td class="px-5 py-4 text-gold font-bold">Rs. ${order.total}</td>
                    <td class="px-5 py-4 text-green-400 font-bold">Rs. ${order.advance} ${dueIndicator}</td>
                    <td class="px-5 py-4">
                        ${inlineStatusSelect}
                    </td>
                    <td class="px-5 py-4 text-center">
                        <div class="flex justify-center gap-4">
                            <button onclick="window.openEditModal('${order.firebaseId}')" class="action-btn text-gray-500 hover:text-champagne" title="Edit Full Order"><i class="fa-solid fa-pen-to-square"></i></button>
                            <button onclick="window.deleteOrder('${order.firebaseId}')" class="action-btn text-gray-500 hover:text-red-500" title="Delete Order"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </td>
                </tr>
            `;
            tbody.insertAdjacentHTML('beforeend', row);
        });
    }

    document.getElementById('ledger-orders-count').innerText = filtered.length;
    document.getElementById('ledger-total-sales').innerText = tSales.toLocaleString('en-IN');
    document.getElementById('ledger-total-paid').innerText = tPaid.toLocaleString('en-IN');
    document.getElementById('ledger-total-due').innerText = tDue.toLocaleString('en-IN');
};

// --- 10. FULL EDIT MODAL ---
window.deleteOrder = async function(firebaseId) {
    if(confirm("Are you sure you want to permanently delete this record from the database?")) {
        try {
            await deleteDoc(doc(db, "orders", firebaseId));
            window.showToast("Record Deleted successfully", "info");
        } catch(err) {
            console.error(err);
            window.showToast("Failed to delete record", "error");
        }
    }
};

window.openEditModal = function(firebaseId) {
    const order = ordersDB.find(o => o.firebaseId === firebaseId);
    if (!order) return;

    const dims = order.size !== 'N/A' ? order.size.split('x') : ['',''];
    
    document.getElementById('edit-id').value = order.firebaseId;
    document.getElementById('edit-date').value = order.date;
    document.getElementById('edit-client').value = order.client;
    document.getElementById('edit-particulars').value = order.particulars;
    document.getElementById('edit-w').value = dims[0];
    document.getElementById('edit-h').value = dims[1];
    document.getElementById('edit-qty').value = order.qty;
    document.getElementById('edit-rate').value = order.rate;
    document.getElementById('edit-total').value = order.total;
    document.getElementById('edit-advance').value = order.advance;
    document.getElementById('edit-due').value = order.due;

    const modal = document.getElementById('edit-modal');
    modal.classList.remove('hidden');
    setTimeout(() => modal.style.opacity = '1', 10);
};

window.closeEditModal = function() {
    const modal = document.getElementById('edit-modal');
    modal.style.opacity = '0';
    setTimeout(() => modal.classList.add('hidden'), 400);
};

document.querySelectorAll('.edit-calc').forEach(input => {
    input.addEventListener('input', calculateEditDue);
});

function calculateEditDue() {
    const total = parseFloat(document.getElementById('edit-total').value) || 0;
    const advanceInput = document.getElementById('edit-advance');
    let advance = parseFloat(advanceInput.value) || 0;

    if (advance > total) { advance = total; advanceInput.value = advance; }
    const due = total - advance;

    document.getElementById('edit-due').value = due > 0 ? due.toFixed(2) : 0;
}

window.saveEdit = async function(e) {
    e.preventDefault();
    const firebaseId = document.getElementById('edit-id').value;
    
    const w = parseFloat(document.getElementById('edit-w').value) || 0;
    const h = parseFloat(document.getElementById('edit-h').value) || 0;
    const qty = parseInt(document.getElementById('edit-qty').value) || 1;
    
    const updatedOrder = {
        date: document.getElementById('edit-date').value,
        client: document.getElementById('edit-client').value.trim(),
        particulars: document.getElementById('edit-particulars').value,
        size: (w > 0 && h > 0) ? `${w}x${h}` : 'N/A',
        sqft: (w * h * qty) > 0 ? (w * h * qty) : 0,
        qty: qty,
        rate: parseFloat(document.getElementById('edit-rate').value) || 0,
        total: parseFloat(document.getElementById('edit-total').value) || 0,
        advance: parseFloat(document.getElementById('edit-advance').value) || 0,
        due: parseFloat(document.getElementById('edit-due').value) || 0
    };
    
    try {
        await updateDoc(doc(db, "orders", firebaseId), updatedOrder);
        window.closeEditModal();
        window.showToast("Record Updated Successfully");
    } catch(err) {
        console.error(err);
        window.showToast("Failed to update record", "error");
    }
};

// --- 11. DASHBOARD ANALYTICS ---
let salesChartInstance = null;

function initDashboard() {
    let todayTotal = 0, weekTotal = 0, monthTotal = 0, totalDue = 0;
    const now = new Date();
    now.setHours(0,0,0,0);
    
    ordersDB.forEach(o => {
        totalDue += o.due;
        const orderDate = new Date(o.date);
        orderDate.setHours(0,0,0,0);
        
        const diffDays = Math.floor((now - orderDate) / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) todayTotal += o.total;
        if (diffDays <= 7) weekTotal += o.total;
        if (diffDays <= 30) monthTotal += o.total;
    });

    document.getElementById('dash-today').innerText = todayTotal.toLocaleString('en-IN');
    document.getElementById('dash-week').innerText = weekTotal.toLocaleString('en-IN');
    document.getElementById('dash-month').innerText = monthTotal.toLocaleString('en-IN');
    document.getElementById('dash-due').innerText = totalDue.toLocaleString('en-IN');
    
    window.updateChartTimeframe();
}

window.updateChartTimeframe = function() {
    const timeframe = document.getElementById('chart-timeframe').value;
    renderChart(timeframe);
};

function renderChart(timeframe) {
    const ctx = document.getElementById('salesChart');
    if(!ctx) return;
    if (salesChartInstance) salesChartInstance.destroy();
    
    let gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(212, 175, 55, 0.4)'); 
    gradient.addColorStop(1, 'rgba(212, 175, 55, 0.0)');
    
    let labels = [];
    let data = [];
    const today = new Date();
    today.setHours(0,0,0,0);

    if (timeframe === 'daily') {
        for(let i=6; i>=0; i--) {
            let d = new Date(today);
            d.setDate(d.getDate() - i);
            labels.push(d.toLocaleDateString('en-US', {weekday: 'short'}));
            let sum = ordersDB.filter(o => {
                let od = new Date(o.date);
                od.setHours(0,0,0,0);
                return od.getTime() === d.getTime();
            }).reduce((acc, o) => acc + o.total, 0);
            data.push(sum);
        }
    } else if (timeframe === 'weekly') {
        for(let i=3; i>=0; i--) {
            labels.push(i === 0 ? 'This Wk' : i + ' Wks Ago');
            let sum = ordersDB.filter(o => {
                let od = new Date(o.date);
                od.setHours(0,0,0,0);
                let diffDays = Math.floor((today - od) / (1000 * 60 * 60 * 24));
                return diffDays >= i*7 && diffDays < (i+1)*7;
            }).reduce((acc, o) => acc + o.total, 0);
            data.push(sum);
        }
    } else if (timeframe === 'monthly') {
        for(let i=5; i>=0; i--) {
            let d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            labels.push(d.toLocaleDateString('en-US', {month: 'short'}));
            let sum = ordersDB.filter(o => {
                let od = new Date(o.date);
                return od.getMonth() === d.getMonth() && od.getFullYear() === d.getFullYear();
            }).reduce((acc, o) => acc + o.total, 0);
            data.push(sum);
        }
    }

    salesChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Gross Sales (Rs.)',
                data: data,
                borderColor: '#D4AF37',
                backgroundColor: gradient,
                borderWidth: 3,
                pointBackgroundColor: '#0c0c0e',
                pointBorderColor: '#D4AF37',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#666' } },
                x: { grid: { display: false }, ticks: { color: '#666' } }
            },
            interaction: { mode: 'index', intersect: false }
        }
    });
}