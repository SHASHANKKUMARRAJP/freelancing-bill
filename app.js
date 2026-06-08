// pradraksha-operations-app.js
// Enterprise Operations Engine for Pradraksha Groups: Clients, Proposals, MSAs, Flat Invoices, and Payment Ledger.

// --- 1. CORPORATE STATE & INITIAL DATABASE ---
const DEFAULT_STATE = {
    clients: [],
    quotations: [],
    agreements: [],
    invoices: [],
    payments: [],
    activities: []
};

let appState = {};
let supabaseClient = null;

// --- DEFAULT CLOUD CONFIGURATION ---
// To sync data automatically across all devices after deployment, paste your Supabase credentials here:
const DEFAULT_SUPABASE_CONFIG = {
    url: "https://neqgqnfcbcvzbgecasth.supabase.co", // Paste your Supabase URL here, e.g., "https://xyz.supabase.co"
    key: "sb_publishable_h3JYBMIiodD3c-HuI-kO0w_Pw1IO5Qr"  // Paste your Supabase Anon API Key here
};

// Helper to update the Database connection indicator badge
function updateDBBadge(connected) {
    const badge = document.getElementById('db-status-badge');
    if (!badge) return;
    if (connected) {
        badge.style.background = 'rgba(16, 185, 129, 0.1)';
        badge.style.color = '#10b981';
        badge.style.borderColor = 'rgba(16, 185, 129, 0.2)';
        badge.innerHTML = `<i data-lucide="database" style="width: 14px; height: 14px;"></i><span>DB: Supabase</span>`;
    } else {
        badge.style.background = 'rgba(239, 68, 68, 0.1)';
        badge.style.color = '#ef4444';
        badge.style.borderColor = 'rgba(239, 68, 68, 0.2)';
        badge.innerHTML = `<i data-lucide="database" style="width: 14px; height: 14px;"></i><span>DB: Local</span>`;
    }
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function initSupabase() {
    let url = DEFAULT_SUPABASE_CONFIG.url;
    let key = DEFAULT_SUPABASE_CONFIG.key;

    // Check if user has a custom connection set in local browser storage (overrides default)
    const configStr = localStorage.getItem("pradraksha_supabase_config");
    if (configStr) {
        try {
            const config = JSON.parse(configStr);
            if (config.url && config.key) {
                url = config.url;
                key = config.key;
            }
        } catch (e) {
            console.error("Failed to parse Supabase config", e);
        }
    }

    if (url && key) {
        try {
            supabaseClient = supabase.createClient(url, key);
            document.getElementById('sb-url').value = url;
            document.getElementById('sb-key').value = key;
            document.getElementById('btn-disconnect-supabase').style.display = 'inline-flex';
            updateDBBadge(true);
        } catch (e) {
            console.error("Failed to initialize Supabase client", e);
            updateDBBadge(false);
        }
    } else {
        updateDBBadge(false);
    }
}


async function syncFromSupabase() {
    if (!supabaseClient) return;

    const [clientsRes, agreementsRes, invoicesRes, paymentsRes, activitiesRes] = await Promise.all([
        supabaseClient.from('clients').select('*'),
        supabaseClient.from('agreements').select('*'),
        supabaseClient.from('invoices').select('*'),
        supabaseClient.from('payments').select('*'),
        supabaseClient.from('activities').select('*').order('time', { ascending: false }).limit(30)
    ]);

    if (clientsRes.error) throw clientsRes.error;
    if (agreementsRes.error) throw agreementsRes.error;
    if (invoicesRes.error) throw invoicesRes.error;
    if (paymentsRes.error) throw paymentsRes.error;
    if (activitiesRes.error) throw activitiesRes.error;

    appState.clients = clientsRes.data || [];
    appState.agreements = (agreementsRes.data || []).map(a => ({
        id: a.id,
        clientId: a.client_id,
        projectName: a.project_name,
        cost: Number(a.cost),
        advance: Number(a.advance),
        deliveryDate: a.delivery_date,
        date: a.date,
        scope: a.scope,
        spAddress: a.sp_address,
        spPhone: a.sp_phone,
        spEmail: a.sp_email,
        spDesignation: a.sp_designation,
        clientDesignation: a.client_designation,
        projectType: a.project_type,
        startDate: a.start_date,
        revisions: a.revisions !== null && a.revisions !== undefined ? Number(a.revisions) : null,
        maintenance: Number(a.maintenance),
        maintenancePeriod: a.maintenance_period
    }));
    appState.invoices = (invoicesRes.data || []).map(i => ({
        id: i.id,
        clientId: i.client_id,
        date: i.date,
        dueDate: i.due_date,
        items: typeof i.items === 'string' ? JSON.parse(i.items) : (i.items || []),
        paid: Number(i.paid),
        notes: i.notes
    }));
    appState.payments = (paymentsRes.data || []).map(p => ({
        id: p.id,
        clientId: p.client_id,
        invoiceId: p.invoice_id,
        amount: Number(p.amount),
        date: p.date,
        type: p.type,
        method: p.method,
        notes: p.notes
    }));
    appState.activities = (activitiesRes.data || []).map(act => ({
        text: act.text,
        time: act.time,
        type: act.type
    }));

    localStorage.setItem("pradraksha_groups_db_v2", JSON.stringify(appState));
    updateAllViews();
}

async function dbUpsert(table, data) {
    if (!supabaseClient) return;
    try {
        const { error } = await supabaseClient.from(table).upsert(data);
        if (error) {
            console.error(`Supabase upsert error in ${table}:`, error);
            showToast(`Supabase sync issue: ${error.message}`, "error");
        }
    } catch (e) {
        console.error(`Supabase connection failed for ${table}:`, e);
    }
}

async function dbDelete(table, id) {
    if (!supabaseClient) return;
    try {
        const { error } = await supabaseClient.from(table).delete().eq('id', id);
        if (error) {
            console.error(`Supabase delete error in ${table}:`, error);
            showToast(`Supabase sync issue: ${error.message}`, "error");
        }
    } catch (e) {
        console.error(`Supabase connection failed for ${table}:`, e);
    }
}

function mapClientToDB(client) {
    return {
        id: client.id,
        name: client.name,
        business: client.business,
        phone: client.phone,
        email: client.email,
        address: client.address,
        project_type: client.projectType
    };
}

function mapAgreementToDB(agree) {
    return {
        id: agree.id,
        client_id: agree.clientId,
        project_name: agree.projectName,
        cost: Number(agree.cost),
        advance: Number(agree.advance),
        delivery_date: agree.deliveryDate,
        date: agree.date,
        scope: agree.scope,
        sp_address: agree.spAddress,
        sp_phone: agree.spPhone,
        sp_email: agree.spEmail,
        sp_designation: agree.spDesignation,
        client_designation: agree.clientDesignation,
        project_type: agree.projectType,
        start_date: agree.startDate,
        revisions: agree.revisions,
        maintenance: Number(agree.maintenance),
        maintenance_period: agree.maintenancePeriod
    };
}

function mapInvoiceToDB(inv) {
    return {
        id: inv.id,
        client_id: inv.clientId,
        date: inv.date,
        due_date: inv.dueDate,
        items: inv.items,
        paid: Number(inv.paid),
        notes: inv.notes
    };
}

function mapPaymentToDB(pay) {
    return {
        id: pay.id,
        client_id: pay.clientId,
        invoice_id: pay.invoiceId,
        amount: Number(pay.amount),
        date: pay.date,
        type: pay.type,
        method: pay.method,
        notes: pay.notes
    };
}

function mapActivityToDB(act) {
    return {
        text: act.text,
        time: act.time,
        type: act.type
    };
}

async function migrateLocalDataToSupabase() {
    if (!supabaseClient) return;
    showToast("Starting cloud migration...", "info");
    try {
        if (appState.clients.length > 0) {
            const clientData = appState.clients.map(mapClientToDB);
            await supabaseClient.from('clients').upsert(clientData);
        }
        if (appState.agreements.length > 0) {
            const agreeData = appState.agreements.map(mapAgreementToDB);
            await supabaseClient.from('agreements').upsert(agreeData);
        }
        if (appState.invoices.length > 0) {
            const invoiceData = appState.invoices.map(mapInvoiceToDB);
            await supabaseClient.from('invoices').upsert(invoiceData);
        }
        if (appState.payments.length > 0) {
            const paymentData = appState.payments.map(mapPaymentToDB);
            await supabaseClient.from('payments').upsert(paymentData);
        }
        if (appState.activities.length > 0) {
            const activityData = appState.activities.map(mapActivityToDB);
            await supabaseClient.from('activities').insert(activityData);
        }
        showToast("Local data migrated to cloud.", "success");
    } catch (err) {
        console.error("Migration failed:", err);
        showToast(`Migration failed: ${err.message}`, "error");
    }
}

async function initDatabase() {
    // Purge legacy seed database to force clean slate
    if (localStorage.getItem("pradraksha_groups_data")) {
        localStorage.removeItem("pradraksha_groups_data");
    }

    const localData = localStorage.getItem("pradraksha_groups_db_v2");
    if (localData) {
        try {
            appState = JSON.parse(localData);
        } catch (e) {
            console.error("Local data parsing failed, fallback to defaults.", e);
            appState = JSON.parse(JSON.stringify(DEFAULT_STATE));
        }
    } else {
        appState = JSON.parse(JSON.stringify(DEFAULT_STATE));
    }

    initSupabase();

    if (supabaseClient) {
        try {
            await syncFromSupabase();
        } catch (e) {
            console.error("Supabase sync failed, using local offline cache.", e);
            showToast("Offline mode: using local cache.", "error");
            updateDBBadge(false);
        }
    } else {
        if (!localData) {
            saveState();
        }
    }
}

function saveState() {
    localStorage.setItem("pradraksha_groups_db_v2", JSON.stringify(appState));
    updateAllViews();
}

// --- 2. ROUTER & SECTION SWAPPING ---
const sections = {
    'dashboard': { id: 'section-dashboard', title: 'Corporate Dashboard', subtitle: 'Real-time telemetry and aggregated cashflows for Pradraksha Groups.' },
    'clients': { id: 'section-clients', title: 'Accounts Directory', subtitle: 'Manage corporate client portfolios and legal profiles.' },
    'agreements': { id: 'section-agreements', title: 'Master Services Agreement (MSA)', subtitle: 'Compile formal legal contracts and work schedules.' },
    'invoices': { id: 'section-invoices', title: 'Invoice Creator', subtitle: 'Generate flat corporate invoices and track outstanding balances.' },
    'payments': { id: 'section-payments', title: 'Corporate Ledger', subtitle: 'Track payments received, pending dues, and portfolio receivables.' },
    'qr-generator': { id: 'section-qr-generator', title: 'Utility QR Tool', subtitle: 'Generate custom branded QR code graphics for client web access.' }
};

function handleRoute() {
    let hash = window.location.hash.substring(1);
    if (!sections[hash]) {
        hash = 'dashboard';
    }
    
    // Toggle active link
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    const activeNav = document.getElementById(`nav-${hash}`);
    if (activeNav) activeNav.classList.add('active');
    
    // Toggle section
    document.querySelectorAll('.app-section').forEach(sec => sec.classList.remove('active-section'));
    const targetSection = document.getElementById(sections[hash].id);
    if (targetSection) targetSection.classList.add('active-section');
    
    // Update header titles
    document.getElementById('page-title').textContent = sections[hash].title;
    document.getElementById('page-subtitle').textContent = sections[hash].subtitle;
    
    // Header Action Button Configuration
    const actionBtn = document.getElementById('btn-header-action');
    if (hash === 'clients') {
        actionBtn.style.display = 'inline-flex';
        actionBtn.querySelector('span').textContent = 'Add Account';
        actionBtn.onclick = () => openClientModal();
    } else if (hash === 'payments') {
        actionBtn.style.display = 'inline-flex';
        actionBtn.querySelector('span').textContent = 'Record Receipt';
        actionBtn.onclick = () => openPaymentModal();
    } else {
        actionBtn.style.display = 'none';
    }
}

// --- 3. CORPORATE BALANCE CALCULATION ENGINES ---
function getClientFinancials(clientId) {
    const agreements = appState.agreements.filter(a => a.clientId === clientId);
    const totalBilled = agreements.reduce((sum, current) => sum + Number(current.cost), 0);
    
    const payments = appState.payments.filter(p => p.clientId === clientId);
    const totalPaid = payments.reduce((sum, current) => sum + Number(current.amount), 0);
    
    return {
        billed: totalBilled,
        paid: totalPaid,
        outstanding: totalBilled - totalPaid
    };
}

function updateTelemetryWidgets() {
    // Pipeline totals
    let totalPipeline = 0;
    appState.agreements.forEach(agr => totalPipeline += Number(agr.cost));
    
    let totalCollected = 0;
    appState.payments.forEach(pay => totalCollected += Number(pay.amount));
    
    const outstanding = totalPipeline - totalCollected;
    const clientCount = appState.clients.length;
    
    // Invoices Ledger Calculations (Flat, no GST)
    let ledgerTotalBilled = 0;
    appState.invoices.forEach(inv => {
        const subtotal = inv.items.reduce((s, item) => s + Number(item.amount), 0);
        ledgerTotalBilled += subtotal;
    });
    
    const ledgerTotalPending = ledgerTotalBilled - totalCollected;
    
    // Inject values
    document.getElementById('val-total-pipeline').textContent = formatCurrency(totalPipeline);
    document.getElementById('val-total-collected').textContent = formatCurrency(totalCollected);
    document.getElementById('val-total-outstanding').textContent = formatCurrency(outstanding);
    document.getElementById('val-client-count').textContent = clientCount;
    
    const percent = totalPipeline > 0 ? Math.round((totalCollected / totalPipeline) * 100) : 0;
    document.getElementById('val-percent-collected').textContent = `${percent}% of portfolio value`;
    
    // Count unpaid invoices (flat grand total)
    const unpaidCount = appState.invoices.filter(i => {
        const grandTotal = i.items.reduce((s, it) => s + Number(it.amount), 0);
        return i.paid < grandTotal;
    }).length;
    document.getElementById('val-pending-count').textContent = `${unpaidCount} unpaid invoices`;

    // Ledger View widgets
    document.getElementById('ledger-total-billed').textContent = formatCurrency(ledgerTotalBilled);
    document.getElementById('ledger-total-collected').textContent = formatCurrency(totalCollected);
    document.getElementById('ledger-total-pending').textContent = formatCurrency(Math.max(0, ledgerTotalPending));
    const ledgerPercent = ledgerTotalBilled > 0 ? Math.round((totalCollected / ledgerTotalBilled) * 100) : 0;
    document.getElementById('ledger-percent-collected').textContent = `${ledgerPercent}% collection rate`;
}

// --- 4. RENDER SYSTEM SECTIONS ---

// -- Render Client Directory --
function renderClients() {
    const searchVal = document.getElementById('client-search').value.toLowerCase();
    const typeFilter = document.getElementById('client-filter-type').value;
    const container = document.getElementById('clients-list-container');
    
    container.innerHTML = '';
    
    const filtered = appState.clients.filter(client => {
        const matchesSearch = client.business.toLowerCase().includes(searchVal) || 
                              client.name.toLowerCase().includes(searchVal) || 
                              client.projectType.toLowerCase().includes(searchVal);
        const matchesType = typeFilter === 'ALL' || client.projectType === typeFilter;
        return matchesSearch && matchesType;
    });
    
    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="glass-panel text-center" style="grid-column: 1 / -1; padding: 3rem;">
                <i data-lucide="users-2" style="width: 48px; height: 48px; stroke-width: 1; color: var(--text-muted); margin-bottom: 1rem;"></i>
                <p style="color: var(--text-secondary);">No corporate accounts found matching criteria.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }
    
    filtered.forEach(client => {
        const financials = getClientFinancials(client.id);
        const card = document.createElement('div');
        card.className = 'glass-panel client-card';
        card.onclick = () => openClientDetailModal(client.id);
        
        card.innerHTML = `
            <div class="client-card-header">
                <div>
                    <h3 class="client-card-title">${client.business}</h3>
                    <p class="client-card-subtitle">${client.name}</p>
                </div>
                <span class="badge badge-type">${client.projectType}</span>
            </div>
            
            <div style="margin: 1rem 0; font-size: 0.85rem;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem;">
                    <span style="color: var(--text-secondary);">Contract: <b>₹${financials.billed.toLocaleString()}</b></span>
                    <span style="color: var(--text-secondary);">Settled: <b style="color: var(--success);">₹${financials.paid.toLocaleString()}</b></span>
                </div>
                <div style="width: 100%; height: 5px; background: rgba(255,255,255,0.04); border-radius: var(--radius-full); overflow: hidden;">
                    <div style="width: ${financials.billed > 0 ? Math.min(100, (financials.paid / financials.billed) * 100) : 0}%; height: 100%; background: var(--primary); border-radius: var(--radius-full);"></div>
                </div>
            </div>

            <div class="client-card-details">
                <div class="client-detail-item"><i data-lucide="phone"></i> <span>${client.phone}</span></div>
                <div class="client-detail-item"><i data-lucide="mail"></i> <span>${client.email}</span></div>
            </div>
        `;
        container.appendChild(card);
    });
    
    lucide.createIcons();
}

// -- Render Dropdowns --
function renderClientDropdowns() {
    const agreeSelect = document.getElementById('agree-client-select');
    const invoiceSelect = document.getElementById('invoice-client-select');
    const paymentSelect = document.getElementById('pay-client-select');
    const qrSelect = document.getElementById('qr-client-select');
    
    const elements = [agreeSelect, invoiceSelect, paymentSelect, qrSelect];
    
    elements.forEach(select => {
        if (!select) return;
        const currentVal = select.value;
        select.innerHTML = '<option value="">-- Choose Corporate Client --</option>';
        appState.clients.forEach(client => {
            const option = document.createElement('option');
            option.value = client.id;
            option.textContent = `${client.business} (${client.name})`;
            select.appendChild(option);
        });
        select.value = currentVal;
    });
}

// -- Render Payment Ledger --
function renderPayments() {
    const tbody = document.getElementById('ledger-tbody');
    tbody.innerHTML = '';
    
    if (appState.payments.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="color: var(--text-muted); padding: 2rem;">No transaction records logged in ledger.</td></tr>`;
        return;
    }
    
    const sorted = [...appState.payments].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    sorted.forEach(pay => {
        const client = appState.clients.find(c => c.id === pay.clientId);
        const clientName = client ? client.business : "Deleted Client";
        const tr = document.createElement('tr');
        
        tr.innerHTML = `
            <td>${formatDateString(pay.date)}</td>
            <td style="font-weight: 600;">${clientName}</td>
            <td><span class="badge ${pay.invoiceId ? 'badge-type' : 'badge-unpaid'}" style="font-size: 0.7rem;">${pay.invoiceId || 'N/A'}</span></td>
            <td><span class="badge ${pay.type === 'Advance' ? 'badge-partial' : 'badge-paid'}" style="font-size: 0.7rem;">${pay.type}</span></td>
            <td>${pay.method}</td>
            <td style="font-size: 0.8rem; color: var(--text-secondary); max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${pay.notes || '-'}</td>
            <td style="text-align: right; font-weight: 700; color: var(--success);">₹${pay.amount.toLocaleString()}</td>
        `;
        tbody.appendChild(tr);
    });
}

// -- Render Recent Activities --
function renderRecentActivity() {
    const container = document.getElementById('activity-log-container');
    if (!container) return;
    
    container.innerHTML = '';
    if (appState.activities.length === 0) {
        container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; padding: 1rem 0;">No system logs found.</div>';
        return;
    }
    
    appState.activities.slice(0, 5).forEach(act => {
        const item = document.createElement('div');
        item.className = 'activity-item';
        
        let icon = 'info';
        let badgeClass = 'add';
        if (act.type === 'doc') { icon = 'file-text'; badgeClass = 'doc'; }
        if (act.type === 'pay') { icon = 'credit-card'; badgeClass = 'pay'; }
        
        item.innerHTML = `
            <div class="activity-badge ${badgeClass}"><i data-lucide="${icon}"></i></div>
            <div class="activity-details">
                <div class="activity-text">${act.text}</div>
                <div class="activity-time">${formatTimeAgo(act.time)}</div>
            </div>
        `;
        container.appendChild(item);
    });
    
    lucide.createIcons();
}

function logActivity(text, type = 'info') {
    const newAct = {
        text: text,
        time: new Date().toISOString(),
        type: type
    };
    appState.activities.unshift(newAct);
    if (appState.activities.length > 30) appState.activities.pop();
    
    if (supabaseClient) {
        dbUpsert('activities', mapActivityToDB(newAct));
    }
}

function updateAllViews() {
    updateTelemetryWidgets();
    renderClients();
    renderClientDropdowns();
    renderPayments();
    renderRecentActivity();
}

// --- 5. MODALS CONTROLLER ENGINE ---
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

window.closeModal = closeModal; // Bind global

// Add Client Modal Operations
function openClientModal(clientId = null) {
    const form = document.getElementById('client-form');
    form.reset();
    document.getElementById('client-id').value = '';
    document.getElementById('modal-client-title').textContent = 'Register Account Partner';
    
    if (clientId) {
        const client = appState.clients.find(c => c.id === clientId);
        if (client) {
            document.getElementById('client-id').value = client.id;
            document.getElementById('client-name').value = client.name;
            document.getElementById('client-business').value = client.business;
            document.getElementById('client-phone').value = client.phone;
            document.getElementById('client-email').value = client.email;
            document.getElementById('client-address').value = client.address;
            document.getElementById('client-project-type').value = client.projectType;
            document.getElementById('modal-client-title').textContent = 'Edit Corporate Record';
        }
    }
    openModal('modal-client');
}

// Client Detail Modal Operations
let activeDetailClientId = null;
let activeDetailTab = 'docs';

function openClientDetailModal(clientId) {
    activeDetailClientId = clientId;
    const client = appState.clients.find(c => c.id === clientId);
    if (!client) return;
    
    // Inject parameters
    document.getElementById('detail-business-name').textContent = client.business;
    document.getElementById('detail-contact-name').textContent = client.name;
    document.getElementById('detail-focus-tag').textContent = client.projectType;
    document.getElementById('detail-email').textContent = client.email;
    document.getElementById('detail-phone').textContent = client.phone;
    document.getElementById('detail-address').textContent = client.address;
    
    // Inject financials
    const financials = getClientFinancials(clientId);
    document.getElementById('detail-total-billed').textContent = formatCurrency(financials.billed);
    document.getElementById('detail-total-paid').textContent = formatCurrency(financials.paid);
    document.getElementById('detail-total-balance').textContent = formatCurrency(financials.outstanding);
    
    // Build tabs
    switchDetailTab('docs');
    
    document.getElementById('btn-edit-client-profile').onclick = () => {
        closeModal('modal-client-detail');
        openClientModal(clientId);
    };
    
    document.getElementById('btn-delete-client-profile').onclick = () => {
        if (confirm(`Confirm deletion of ${client.business}? Active invoice mappings and ledger records will be archived.`)) {
            appState.clients = appState.clients.filter(c => c.id !== clientId);
            logActivity(`Deleted corporate directory entry for ${client.business}`, 'info');
            saveState();
            if (supabaseClient) {
                dbDelete('clients', clientId);
            }
            closeModal('modal-client-detail');
            showToast('Account records deleted.', 'info');
        }
    };
    
    document.getElementById('btn-detail-record-payment').onclick = () => {
        closeModal('modal-client-detail');
        openPaymentModal(clientId);
    };
    
    openModal('modal-client-detail');
}

function switchDetailTab(tabName) {
    activeDetailTab = tabName;
    
    const btns = document.querySelectorAll('.client-profile-tabs .tab-btn');
    btns.forEach(btn => btn.classList.remove('active'));
    
    const index = ['docs', 'payments', 'info'].indexOf(tabName);
    if (btns[index]) btns[index].classList.add('active');
    
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.getElementById(`detail-tab-${tabName}`).classList.add('active');
    
    if (tabName === 'docs') {
        const tbody = document.getElementById('detail-docs-tbody');
        tbody.innerHTML = '';
        
        const clientAgreements = appState.agreements.filter(a => a.clientId === activeDetailClientId);
        const clientInvoices = appState.invoices.filter(i => i.clientId === activeDetailClientId);
        
        let docsCount = 0;
        
        clientAgreements.forEach(a => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="badge badge-paid">Agreement</span></td>
                <td>${a.id} (${formatDateString(a.date)})</td>
                <td>₹${a.cost.toLocaleString()}</td>
                <td class="text-right"><button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" onclick="triggerDocumentDownload('agreement', '${a.id}')">View</button></td>
            `;
            tbody.appendChild(tr);
            docsCount++;
        });
        
        clientInvoices.forEach(inv => {
            const tr = document.createElement('tr');
            const grandTotal = inv.items.reduce((s, i) => s + i.amount, 0);
            const status = inv.paid >= grandTotal ? '<span class="badge badge-paid" style="padding: 0.15rem 0.4rem; font-size: 0.65rem;">Paid</span>' : (inv.paid > 0 ? '<span class="badge badge-partial" style="padding: 0.15rem 0.4rem; font-size: 0.65rem;">Partial</span>' : '<span class="badge badge-unpaid" style="padding: 0.15rem 0.4rem; font-size: 0.65rem;">Unpaid</span>');
            tr.innerHTML = `
                <td><span class="badge badge-partial">Invoice</span></td>
                <td>${inv.id} ${status}</td>
                <td>₹${grandTotal.toLocaleString()}</td>
                <td class="text-right"><button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" onclick="triggerDocumentDownload('invoice', '${inv.id}')">View</button></td>
            `;
            tbody.appendChild(tr);
            docsCount++;
        });
        
        if (docsCount === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center" style="color: var(--text-muted); padding: 1rem 0;">No active files compiled.</td></tr>';
        }
    } else if (tabName === 'payments') {
        const tbody = document.getElementById('detail-payments-tbody');
        tbody.innerHTML = '';
        
        const clientPayments = appState.payments.filter(p => p.clientId === activeDetailClientId);
        
        if (clientPayments.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="color: var(--text-muted); padding: 1rem 0;">No ledger receipts.</td></tr>';
            return;
        }
        
        clientPayments.forEach(pay => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${formatDateString(pay.date)}</td>
                <td>${pay.id}</td>
                <td>${pay.type}</td>
                <td>${pay.method}</td>
                <td class="text-right" style="color: var(--success); font-weight: 700;">₹${pay.amount.toLocaleString()}</td>
            `;
            tbody.appendChild(tr);
        });
    }
}
window.switchDetailTab = switchDetailTab; // Bind global

// Payment Modal Operations
function openPaymentModal(clientId = null) {
    const form = document.getElementById('payment-form');
    form.reset();
    
    document.getElementById('pay-date').value = new Date().toISOString().substring(0, 10);
    
    const clientSelect = document.getElementById('pay-client-select');
    const invoiceSelect = document.getElementById('pay-invoice-select');
    invoiceSelect.innerHTML = '<option value="">-- No Invoice Reference --</option>';
    
    if (clientId) {
        clientSelect.value = clientId;
        populateInvoicesDropdownForPayment(clientId);
    }
    
    clientSelect.onchange = () => {
        populateInvoicesDropdownForPayment(clientSelect.value);
    };
    
    invoiceSelect.onchange = () => {
        const invoiceId = invoiceSelect.value;
        if (invoiceId) {
            const invoice = appState.invoices.find(i => i.id === invoiceId);
            if (invoice) {
                const grandTotal = invoice.items.reduce((s, it) => s + it.amount, 0);
                const pending = grandTotal - invoice.paid;
                document.getElementById('pay-amount').value = pending;
            }
        }
    };
    
    openModal('modal-payment');
}

function populateInvoicesDropdownForPayment(clientId) {
    const select = document.getElementById('pay-invoice-select');
    select.innerHTML = '<option value="">-- No Invoice Reference --</option>';
    if (!clientId) return;
    
    const clientInvoices = appState.invoices.filter(i => i.clientId === clientId);
    clientInvoices.forEach(inv => {
        const grandTotal = inv.items.reduce((s, it) => s + it.amount, 0);
        const pending = grandTotal - inv.paid;
        const opt = document.createElement('option');
        opt.value = inv.id;
        opt.textContent = `${inv.id} (Outstanding: ₹${pending.toLocaleString()})`;
        select.appendChild(opt);
    });
}

// --- 6. DYNAMIC FORM SUBMISSIONS (CRUD) ---

// Save Client
document.getElementById('client-form').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const id = document.getElementById('client-id').value;
    const name = document.getElementById('client-name').value;
    const business = document.getElementById('client-business').value;
    const phone = document.getElementById('client-phone').value;
    const email = document.getElementById('client-email').value;
    const address = document.getElementById('client-address').value;
    const projectType = document.getElementById('client-project-type').value;
    
    if (id) {
        const client = appState.clients.find(c => c.id === id);
        if (client) {
            client.name = name;
            client.business = business;
            client.phone = phone;
            client.email = email;
            client.address = address;
            client.projectType = projectType;
            logActivity(`Updated account information for ${business}`, 'add');
            showToast('Account details updated.', 'success');
            if (supabaseClient) {
                dbUpsert('clients', mapClientToDB(client));
            }
        }
    } else {
        const newClient = {
            id: 'client-' + Date.now(),
            name, business, phone, email, address, projectType,
            createdAt: new Date().toISOString()
        };
        appState.clients.push(newClient);
        logActivity(`Registered corporate account: ${business}`, 'add');
        showToast('New client registered.', 'success');
        if (supabaseClient) {
            dbUpsert('clients', mapClientToDB(newClient));
        }
    }
    
    saveState();
    closeModal('modal-client');
});

// Log Payment Receipt
document.getElementById('payment-form').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const clientId = document.getElementById('pay-client-select').value;
    const invoiceId = document.getElementById('pay-invoice-select').value;
    const amount = Number(document.getElementById('pay-amount').value);
    const date = document.getElementById('pay-date').value;
    const type = document.getElementById('pay-type').value;
    const method = document.getElementById('pay-method').value;
    const notes = document.getElementById('pay-notes').value;
    
    const client = appState.clients.find(c => c.id === clientId);
    const clientName = client ? client.business : "Corporate Client";
    
    const newTxn = {
        id: 'TXN-' + Math.floor(Math.random() * 9000 + 1000),
        clientId, invoiceId, amount, date, type, method, notes
    };
    appState.payments.push(newTxn);
    
    let updatedInvoice = null;
    if (invoiceId) {
        const invoice = appState.invoices.find(i => i.id === invoiceId);
        if (invoice) {
            invoice.paid = Number(invoice.paid) + amount;
            updatedInvoice = invoice;
        }
    }
    
    logActivity(`Logged transaction of ${formatCurrency(amount)} from ${clientName}`, 'pay');
    showToast(`Payment of ₹${amount.toLocaleString()} received.`, 'success');
    
    if (supabaseClient) {
        dbUpsert('payments', mapPaymentToDB(newTxn));
        if (updatedInvoice) {
            dbUpsert('invoices', mapInvoiceToDB(updatedInvoice));
        }
    }
    
    saveState();
    closeModal('modal-payment');
});

// --- 7. DYNAMIC ROW BUILDERS ---
function initDynamicRows(tbodyId, addBtnId, isInvoice = false) {
    const tbody = document.getElementById(tbodyId);
    const btn = document.getElementById(addBtnId);
    
    function addRow(service = "", amt = "") {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" class="item-name" placeholder="Describe billing component..." value="${service}" required></td>
            <td><input type="number" class="item-amount" min="0" placeholder="0" value="${amt}" required style="text-align: right;"></td>
            <td style="text-align: center;"><button type="button" class="item-delete-btn">&times;</button></td>
        `;
        
        tr.querySelector('.item-delete-btn').onclick = () => {
            tr.remove();
            if (tbody.children.length === 0) addRow();
        };
        
        tbody.appendChild(tr);
    }
    
    if (btn) {
        btn.onclick = () => addRow();
    }
    
    if (tbody && tbody.children.length === 0) {
        addRow();
    }
    
    return { addRow };
}

const invoiceTable = initDynamicRows('invoice-items-tbody', 'btn-invoice-add-item', false);

// --- 8. DYNAMIC PDF GENERATORS ---

// Compile MSA Agreement
let currentAgreeDraftElement = null;
let currentAgreeClientName = "";

document.getElementById('agreement-form').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const clientId = document.getElementById('agree-client-select').value;
    const client = appState.clients.find(c => c.id === clientId);
    if (!client) return;
    
    const projName = document.getElementById('agree-project-name').value;
    const cost = Number(document.getElementById('agree-cost').value);
    const advance = Number(document.getElementById('agree-advance').value);
    const delivery = document.getElementById('agree-delivery-date').value;
    const agreeDate = document.getElementById('agree-date').value;
    const scope = document.getElementById('agree-scope').value;
    
    // New fields
    const spAddress = document.getElementById('agree-sp-address').value;
    const spPhone = document.getElementById('agree-sp-phone').value;
    const spEmail = document.getElementById('agree-sp-email').value;
    const spDesignation = document.getElementById('agree-sp-designation').value;
    const clientDesignation = document.getElementById('agree-client-designation').value;
    const projectTypeSelect = document.getElementById('agree-project-type').value;
    const projectType = projectTypeSelect === 'Other' ? document.getElementById('agree-project-type-other').value : projectTypeSelect;
    const startDate = document.getElementById('agree-start-date').value;
    const limitRevisions = document.getElementById('agree-revisions-toggle').checked;
    const revisions = limitRevisions ? Number(document.getElementById('agree-revisions').value) : null;
    const maintenance = Number(document.getElementById('agree-maintenance').value);
    const maintenancePeriod = document.getElementById('agree-maintenance-period').value;

    const agreeId = 'AGR-2026-' + Math.floor(Math.random() * 900 + 100);
    
    const agreeObj = {
        id: agreeId,
        clientId, 
        projectName: projName, 
        cost, 
        advance, 
        deliveryDate: delivery, 
        date: agreeDate, 
        scope,
        spAddress,
        spPhone,
        spEmail,
        spDesignation,
        clientDesignation,
        projectType,
        startDate,
        revisions,
        maintenance,
        maintenancePeriod
    };
    
    appState.agreements.push(agreeObj);
    
    logActivity(`Compiled Agreement ${agreeId} for ${client.business}`, 'doc');
    
    if (supabaseClient) {
        dbUpsert('agreements', mapAgreementToDB(agreeObj));
    }
    
    saveState();
    showToast(`Agreement compiled.`, 'success');
    
    const paper = assembleAgreementHTML(agreeObj, client);
    const viewport = document.getElementById('agree-pdf-viewport');
    viewport.innerHTML = '';
    viewport.appendChild(paper);
    
    currentAgreeDraftElement = paper;
    currentAgreeClientName = client.business.replace(/\s+/g, '_');
    document.getElementById('btn-agree-export').disabled = false;
});

function assembleAgreementHTML(agree, client) {
    const div = document.createElement('div');
    div.className = 'print-template';
    
    div.innerHTML = `
        <h1 style="font-size: 16px; font-weight: 800; text-align: center; margin-bottom: 20px; text-transform: uppercase; border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; color: #1e3a8a;">WEBSITE DEVELOPMENT SERVICE AGREEMENT</h1>

        <p style="margin-bottom: 25px; line-height: 1.6; font-size: 11px;">
            This Website Development Service Agreement ("Agreement") is entered into on <b>${formatDateString(agree.date)}</b> between:
        </p>

        <h2 style="font-size: 12px; font-weight: 700; color: #1e3a8a; text-transform: uppercase; margin-bottom: 6px; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 2px;">SERVICE PROVIDER</h2>
        <div style="font-size: 11px; line-height: 1.5; margin-bottom: 15px;">
            <p><b>Pradraksha Group</b></p>
            <p>Address: ${agree.spAddress || '______________________________________'}</p>
            <p>Phone: ${agree.spPhone || '______________________________________'}</p>
            <p>Email: ${agree.spEmail || '______________________________________'}</p>
            <p style="margin-top: 4px; font-style: italic; color: #64748b;">(Hereinafter referred to as the "Service Provider")</p>
        </div>

        <p style="font-weight: 700; font-size: 11px; margin-bottom: 15px;">AND</p>

        <h2 style="font-size: 12px; font-weight: 700; color: #1e3a8a; text-transform: uppercase; margin-bottom: 6px; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 2px;">CLIENT</h2>
        <div style="font-size: 11px; line-height: 1.5; margin-bottom: 20px;">
            <p>Business Name: <b>${client.business}</b></p>
            <p>Client Name: <b>${client.name}</b></p>
            <p>Address: ${client.address || '______________________________________'}</p>
            <p>Phone: ${client.phone || '______________________________________'}</p>
            <p>Email: ${client.email || '______________________________________'}</p>
            <p style="margin-top: 4px; font-style: italic; color: #64748b;">(Hereinafter referred to as the "Client")</p>
        </div>

        <hr style="border: none; border-top: 1px solid #cbd5e1; margin: 20px 0;">

        <h2 style="font-size: 12px; font-weight: 700; color: #0f172a; margin-top: 15px; margin-bottom: 8px;">1. PURPOSE</h2>
        <p style="font-size: 11px; line-height: 1.6; margin-bottom: 15px;">
            The Client engages Pradraksha Group to design, develop, and deliver a website and/or related digital services as described in this Agreement and accompanying quotation.
        </p>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;">

        <h2 style="font-size: 12px; font-weight: 700; color: #0f172a; margin-top: 15px; margin-bottom: 8px;">2. PROJECT SCOPE</h2>
        <div style="font-size: 11px; line-height: 1.6; margin-bottom: 15px;">
            <p>Project Name: <b>${agree.projectName}</b></p>
            <p style="margin-top: 4px;">Project Type: <b>${agree.projectType}</b></p>
            <p style="margin-top: 8px; font-weight: 600;">Included Services:</p>
            <ul style="padding-left: 15px; margin-top: 4px;">
                <li>Website Design and Development</li>
                <li>Mobile Responsive Design</li>
                <li>QR Menu Integration (if applicable)</li>
                <li>Contact Forms (if applicable)</li>
                <li>Gallery/Menu Pages (if applicable)</li>
                <li>Basic SEO Setup (if applicable)</li>
                <li>Deployment and Launch</li>
            </ul>
            <p style="margin-top: 8px; font-weight: 600;">Detailed Requirements:</p>
            <div style="background: #f8fafc; border: 1.5px solid #cbd5e1; padding: 12px; margin-top: 6px; border-radius: var(--radius-sm); font-style: italic; white-space: pre-wrap;">${agree.scope}</div>
            <p style="margin-top: 8px; font-style: italic; color: #64748b;">Only the services specifically agreed upon in writing are included in the project scope.</p>
        </div>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;">

        <h2 style="font-size: 12px; font-weight: 700; color: #0f172a; margin-top: 15px; margin-bottom: 8px;">3. PROJECT COST</h2>
        <div style="font-size: 11px; line-height: 1.6; margin-bottom: 15px;">
            <p>Total Project Cost: <b>₹ ${Number(agree.cost).toLocaleString('en-IN')}</b></p>
            <p>Advance Payment: <b>₹ ${Number(agree.advance).toLocaleString('en-IN')}</b></p>
            <p>Balance Payment: <b>₹ ${(Number(agree.cost) - Number(agree.advance)).toLocaleString('en-IN')}</b></p>
            <p style="margin-top: 10px; font-weight: 600;">Payment Terms:</p>
            <ul style="padding-left: 15px; margin-top: 4px;">
                <li>Advance payment is required before work begins.</li>
                <li>Remaining payment must be completed before final deployment, transfer of ownership, or delivery of source files.</li>
                <li>Payments once made are non-refundable except where required by law.</li>
            </ul>
        </div>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;">

        <h2 style="font-size: 12px; font-weight: 700; color: #0f172a; margin-top: 15px; margin-bottom: 8px;">4. PROJECT TIMELINE</h2>
        <div style="font-size: 11px; line-height: 1.6; margin-bottom: 15px;">
            <p>Project Start Date: <b>${formatDateString(agree.startDate)}</b></p>
            <p>Estimated Delivery Date: <b>${formatDateString(agree.deliveryDate)}</b></p>
            <p style="margin-top: 10px; font-weight: 600;">Delivery timelines are estimates and may be extended due to:</p>
            <ul style="padding-left: 15px; margin-top: 4px;">
                <li>Delayed client feedback</li>
                <li>Delayed content submission</li>
                <li>Additional feature requests</li>
                <li>Technical issues beyond reasonable control</li>
            </ul>
        </div>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;">

        <h2 style="font-size: 12px; font-weight: 700; color: #0f172a; margin-top: 15px; margin-bottom: 8px;">5. CLIENT RESPONSIBILITIES</h2>
        <div style="font-size: 11px; line-height: 1.6; margin-bottom: 15px;">
            <p>The Client agrees to provide:</p>
            <ul style="padding-left: 15px; margin-top: 4px;">
                <li>Business information</li>
                <li>Logos and branding materials</li>
                <li>Images and media content</li>
                <li>Menu details (if applicable)</li>
                <li>Product/service information</li>
                <li>Any other required content</li>
            </ul>
            <p style="margin-top: 8px; font-style: italic; color: #64748b;">The Client is responsible for ensuring that all supplied content is legally owned or licensed for use.</p>
        </div>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;">

        <h2 style="font-size: 12px; font-weight: 700; color: #0f172a; margin-top: 15px; margin-bottom: 8px;">6. REVISIONS</h2>
        <div style="font-size: 11px; line-height: 1.6; margin-bottom: 15px;">
            <p>The project includes ${agree.revisions !== null && agree.revisions !== undefined ? `up to <b>${agree.revisions}</b> rounds of` : '<b>reasonable</b>'} revisions.</p>
            <p>Minor revisions within the agreed scope are included.</p>
            <p>Requests exceeding the agreed revisions or involving significant modifications may incur additional charges.</p>
        </div>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;">

        <h2 style="font-size: 12px; font-weight: 700; color: #0f172a; margin-top: 15px; margin-bottom: 8px;">7. CHANGE REQUESTS AND ADDITIONAL FEATURES</h2>
        <div style="font-size: 11px; line-height: 1.6; margin-bottom: 15px;">
            <p>The project price covers only the scope defined in this Agreement and quotation.</p>
            <p>Any request made after project commencement that introduces new functionality, pages, integrations, redesigns, or additional requirements shall be considered a Change Request.</p>
            <p style="margin-top: 8px; font-weight: 600;">Additional charges may apply for:</p>
            <ul style="padding-left: 15px; margin-top: 4px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 15px;">
                <li>New features</li>
                <li>Additional pages</li>
                <li>Design modifications beyond approved revisions</li>
                <li>Payment gateway integration</li>
                <li>Reservation systems</li>
                <li>Online ordering systems</li>
                <li>Admin panel enhancements</li>
                <li>Database modifications</li>
                <li>Third-party integrations</li>
                <li>Content additions beyond the agreed scope</li>
                <li>Post-delivery enhancements</li>
            </ul>
            <p style="margin-top: 8px;">Pradraksha Group shall provide a separate quotation for such requests.</p>
            <p>Work on additional features will commence only after written approval from the Client.</p>
            <p>Any future changes requested after project completion shall be treated as a separate service and billed accordingly.</p>
        </div>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;">

        <h2 style="font-size: 12px; font-weight: 700; color: #0f172a; margin-top: 15px; margin-bottom: 8px;">8. DOMAIN AND HOSTING</h2>
        <div style="font-size: 11px; line-height: 1.6; margin-bottom: 15px;">
            <p>Unless explicitly included in the quotation:</p>
            <ul style="padding-left: 15px; margin-top: 4px;">
                <li>Domain registration fees are separate.</li>
                <li>Hosting charges are separate.</li>
                <li>SSL certificate charges are separate.</li>
                <li>Annual renewal fees are separate.</li>
            </ul>
            <p style="margin-top: 8px;">The Client is responsible for renewal payments unless covered under a separate maintenance agreement.</p>
            <p style="font-style: italic; color: #64748b;">Pradraksha Group shall not be responsible for website downtime caused by hosting providers, domain registrars, or third-party services.</p>
        </div>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;">

        <h2 style="font-size: 12px; font-weight: 700; color: #0f172a; margin-top: 15px; margin-bottom: 8px;">9. THIRD-PARTY SERVICES</h2>
        <div style="font-size: 11px; line-height: 1.6; margin-bottom: 15px;">
            <p>The website may use third-party services, including but not limited to:</p>
            <ul style="padding-left: 15px; margin-top: 4px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
                <li>Hosting providers</li>
                <li>Domain registrars</li>
                <li>Payment gateways</li>
                <li>Database providers</li>
                <li>Cloud services</li>
                <li>Analytics tools</li>
                <li>AI-assisted development tools</li>
                <li>External APIs</li>
            </ul>
            <p style="margin-top: 8px; font-style: italic; color: #64748b;">Pradraksha Group shall not be liable for interruptions, pricing changes, policy changes, or service failures of third-party providers.</p>
        </div>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;">

        <h2 style="font-size: 12px; font-weight: 700; color: #0f172a; margin-top: 15px; margin-bottom: 8px;">10. WEBSITE OWNERSHIP</h2>
        <div style="font-size: 11px; line-height: 1.6; margin-bottom: 15px;">
            <p>Upon full payment of all outstanding amounts:</p>
            <ul style="padding-left: 15px; margin-top: 4px;">
                <li>The Client shall receive ownership of the completed website as agreed.</li>
                <li>The Client shall own all content supplied by the Client.</li>
            </ul>
            <p style="margin-top: 8px;">Pradraksha Group retains ownership of:</p>
            <ul style="padding-left: 15px; margin-top: 4px;">
                <li>Internal development tools</li>
                <li>Proprietary frameworks</li>
                <li>Reusable code libraries</li>
                <li>Templates</li>
                <li>Development methodologies</li>
            </ul>
            <p style="margin-top: 4px; font-style: italic; color: #64748b;">unless otherwise agreed in writing.</p>
        </div>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;">

        <h2 style="font-size: 12px; font-weight: 700; color: #0f172a; margin-top: 15px; margin-bottom: 8px;">11. MAINTENANCE AND SUPPORT</h2>
        <div style="font-size: 11px; line-height: 1.6; margin-bottom: 15px;">
            <p>Unless otherwise specified:</p>
            <ul style="padding-left: 15px; margin-top: 4px;">
                <li>Ongoing maintenance is not included.</li>
                <li>Website updates are not included.</li>
                <li>Content modifications are not included.</li>
                <li>New features are not included.</li>
            </ul>
            <p style="margin-top: 8px;">Additional maintenance services may be provided under a separate maintenance plan.</p>
            <p style="margin-top: 8px;">
                Maintenance Plan Fee (if applicable): 
                <b>${Number(agree.maintenance) > 0 ? `₹ ${Number(agree.maintenance).toLocaleString('en-IN')} ${agree.maintenancePeriod}` : 'N/A'}</b>
            </p>
        </div>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;">

        <h2 style="font-size: 12px; font-weight: 700; color: #0f172a; margin-top: 15px; margin-bottom: 8px;">12. CONFIDENTIALITY</h2>
        <p style="font-size: 11px; line-height: 1.6; margin-bottom: 15px;">
            Both parties agree to maintain the confidentiality of any non-public business, technical, financial, or operational information shared during the course of the project.
            Such information shall not be disclosed to third parties without prior written consent except where required by law.
        </p>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;">

        <h2 style="font-size: 12px; font-weight: 700; color: #0f172a; margin-top: 15px; margin-bottom: 8px;">13. LIMITATION OF LIABILITY</h2>
        <div style="font-size: 11px; line-height: 1.6; margin-bottom: 15px;">
            <p>Pradraksha Group shall not be liable for:</p>
            <ul style="padding-left: 15px; margin-top: 4px;">
                <li>Loss of revenue</li>
                <li>Loss of profits</li>
                <li>Business interruption</li>
                <li>Data loss</li>
                <li>Cybersecurity incidents</li>
                <li>Third-party service failures</li>
                <li>Search engine ranking fluctuations</li>
                <li>Hosting outages</li>
                <li>Domain expiration due to unpaid renewals</li>
            </ul>
            <p style="margin-top: 8px; font-style: italic; color: #64748b;">In all circumstances, the maximum liability of Pradraksha Group shall not exceed the total amount paid by the Client under this Agreement.</p>
        </div>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;">

        <h2 style="font-size: 12px; font-weight: 700; color: #0f172a; margin-top: 15px; margin-bottom: 8px;">14. TERMINATION</h2>
        <div style="font-size: 11px; line-height: 1.6; margin-bottom: 15px;">
            <p>Either party may terminate this Agreement through written notice.</p>
            <p style="margin-top: 6px;">In the event of termination:</p>
            <ul style="padding-left: 15px; margin-top: 4px;">
                <li>Advance payments shall remain non-refundable.</li>
                <li>Work completed up to the termination date shall be chargeable.</li>
                <li>Deliverables shall only be released after settlement of outstanding dues.</li>
            </ul>
        </div>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;">

        <h2 style="font-size: 12px; font-weight: 700; color: #0f172a; margin-top: 15px; margin-bottom: 8px;">15. ACCEPTANCE OF DELIVERABLES</h2>
        <p style="font-size: 11px; line-height: 1.6; margin-bottom: 15px;">
            The Client shall review the delivered work within seven (7) days of delivery.
            If no written objections are raised within this period, the project shall be deemed accepted.
            Any additional requests after acceptance may be treated as separate paid work.
        </p>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 15px 0;">

        <h2 style="font-size: 12px; font-weight: 700; color: #0f172a; margin-top: 15px; margin-bottom: 8px;">16. GOVERNING LAW</h2>
        <p style="font-size: 11px; line-height: 1.6; margin-bottom: 15px;">
            This Agreement shall be governed by and interpreted in accordance with the laws of India.
            Any disputes arising under this Agreement shall be subject to the jurisdiction of the competent courts where Pradraksha Group is registered or operates.
        </p>

        <hr style="border: none; border-top: 2px solid #cbd5e1; margin: 25px 0;">

        <h2 style="font-size: 13px; font-weight: 700; color: #0f172a; text-transform: uppercase; margin-bottom: 10px; page-break-inside: avoid;">SIGNATURES</h2>

        <div class="print-agreement-signatures" style="margin-top: 20px;">
            <div class="print-sig-box" style="border-top: 1px dashed #475569; padding-top: 8px;">
                <div class="print-sig-title" style="font-weight: 700; font-size: 9px; color: #1e3a8a; text-transform: uppercase; margin-bottom: 8px;">FOR PRADRAKSHA GROUP</div>
                <div style="font-size: 10px; line-height: 1.6;">
                    <p>Name: <b>Pradraksha Group Representative</b></p>
                    <p style="margin-top: 4px;">Designation: <b>${agree.spDesignation || 'Director'}</b></p>
                    <p style="margin-top: 4px;">Signature: ______________________</p>
                    <p style="margin-top: 4px;">Date: <b>${formatDateString(agree.date)}</b></p>
                </div>
            </div>
            <div class="print-sig-box" style="border-top: 1px dashed #475569; padding-top: 8px;">
                <div class="print-sig-title" style="font-weight: 700; font-size: 9px; color: #1e3a8a; text-transform: uppercase; margin-bottom: 8px;">FOR CLIENT</div>
                <div style="font-size: 10px; line-height: 1.6;">
                    <p>Business Name: <b>${client.business}</b></p>
                    <p style="margin-top: 4px;">Name: <b>${client.name}</b></p>
                    <p style="margin-top: 4px;">Designation: <b>${agree.clientDesignation || 'Authorized Signatory'}</b></p>
                    <p style="margin-top: 4px;">Signature: ______________________</p>
                    <p style="margin-top: 4px;">Date: __________________________</p>
                </div>
            </div>
        </div>
    `;
    return div;
}

// Compile Invoice (Flat)
let currentInvoiceDraftElement = null;
let currentInvoiceClientName = "";
let currentInvoiceNumber = "";

document.getElementById('invoice-form').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const invoiceNum = document.getElementById('invoice-num').value;
    const invoiceDate = document.getElementById('invoice-date').value;
    const clientId = document.getElementById('invoice-client-select').value;
    const client = appState.clients.find(c => c.id === clientId);
    if (!client) return;
    
    const paid = Number(document.getElementById('invoice-paid').value);
    const dueDate = document.getElementById('invoice-due-date').value;
    const notes = document.getElementById('invoice-notes').value;
    
    const items = [];
    document.querySelectorAll('#invoice-items-tbody tr').forEach(tr => {
        const desc = tr.querySelector('.item-name').value;
        const amt = Number(tr.querySelector('.item-amount').value);
        if (desc && amt) items.push({ description: desc, amount: amt });
    });
    
    if (items.length === 0) {
        alert("Please add at least one line item.");
        return;
    }
    
    const existingIndex = appState.invoices.findIndex(i => i.id === invoiceNum);
    const updatedInvoice = {
        id: invoiceNum, clientId, date: invoiceDate, dueDate, items, paid, notes
    };
    if (existingIndex > -1) {
        appState.invoices[existingIndex] = updatedInvoice;
        logActivity(`Updated invoice registry for invoice ${invoiceNum}`, 'doc');
    } else {
        appState.invoices.push(updatedInvoice);
        logActivity(`Compiled new invoice ${invoiceNum} for ${client.business}`, 'doc');
    }
    
    if (supabaseClient) {
        dbUpsert('invoices', mapInvoiceToDB(updatedInvoice));
    }
    
    saveState();
    showToast(`Invoice ${invoiceNum} logged.`, 'success');
    
    const paper = assembleInvoiceHTML(invoiceNum, client, invoiceDate, dueDate, items, paid, notes);
    const viewport = document.getElementById('invoice-pdf-viewport');
    viewport.innerHTML = '';
    viewport.appendChild(paper);
    
    currentInvoiceDraftElement = paper;
    currentInvoiceClientName = client.business.replace(/\s+/g, '_');
    currentInvoiceNumber = invoiceNum;
    document.getElementById('btn-invoice-export').disabled = false;
});

function assembleInvoiceHTML(id, client, date, dueDate, items, paid, notes) {
    const subtotal = items.reduce((s, it) => s + it.amount, 0);
    const grandTotal = subtotal;
    const balance = grandTotal - paid;
    
    const div = document.createElement('div');
    div.className = 'print-template';
    
    let itemsHTML = "";
    items.forEach((item, index) => {
        itemsHTML += `
            <tr>
                <td style="width: 8%; text-align: center;">${index + 1}</td>
                <td><b>${item.description}</b></td>
                <td style="width: 25%; text-align: right; font-weight: 600;">₹${item.amount.toLocaleString()}</td>
            </tr>
        `;
    });
    
    div.innerHTML = `
        <div class="print-header">
            <div class="print-brand">
                <div class="print-brand-title">PRADRAKSHA GROUPS</div>
                <div class="print-brand-tagline">Corporate Invoice</div>
            </div>
            <div class="print-doc-meta">
                <div class="print-doc-title">INVOICE</div>
                <div class="print-meta-grid">
                    <span class="print-meta-label">Invoice No:</span><span class="print-meta-val">${id}</span>
                    <span class="print-meta-label">Date:</span><span class="print-meta-val">${formatDateString(date)}</span>
                    <span class="print-meta-label">Due Date:</span><span class="print-meta-val">${dueDate ? formatDateString(dueDate) : 'On Receipt'}</span>
                </div>
            </div>
        </div>

        <div class="print-addresses">
            <div>
                <div class="print-address-title">From Billing Entity</div>
                <div class="print-address-name">Pradraksha Groups</div>
                <div>Pradraksha Towers, HSR Layout, Sector 4</div>
                <div>Bangalore, Karnataka - 560102</div>
                <div>finance@pradraksha.com</div>
            </div>
            <div>
                <div class="print-address-title">Bill To (Client)</div>
                <div class="print-address-name">${client.business}</div>
                <div>Attn: ${client.name}</div>
                <div>${client.address}</div>
                <div>${client.email} | ${client.phone}</div>
            </div>
        </div>

        <table class="print-table">
            <thead>
                <tr>
                    <th style="text-align: center;">#</th>
                    <th style="text-align: left;">Product/Service Billing Description</th>
                    <th style="text-align: right;">Amount (INR)</th>
                </tr>
            </thead>
            <tbody>
                ${itemsHTML}
            </tbody>
        </table>

        <div class="print-financial-summary">
            <div class="print-payment-instructions">
                <div class="print-instructions-title">Payment Coordinates</div>
                <div>UPI ID: <b>pay@pradraksha</b></div>
                <div>Bank Account: <b>HDFC Corporate A/c - 502000881122</b></div>
                <div>IFSC Code: <b>HDFC0000123</b></div>
                <div style="margin-top: 8px; font-style: italic;">${notes || ''}</div>
            </div>
            <div class="print-totals">
                <span class="print-total-label">Subtotal:</span>
                <span class="print-total-val">₹${subtotal.toLocaleString()}</span>
                
                <span class="print-total-label">Gross Total:</span>
                <span class="print-total-val" style="font-weight: 600;">₹${grandTotal.toLocaleString()}</span>
                
                <span class="print-total-label">Deducted / Settled:</span>
                <span class="print-total-val" style="color: var(--success); font-weight:600;">₹${paid.toLocaleString()}</span>
                
                <span class="print-total-label print-total-grand" style="border-top: 1.5px solid #cbd5e1; padding-top: 8px;">Net Due Amount:</span>
                <span class="print-total-val print-total-grand" style="border-top: 1.5px solid #cbd5e1; padding-top: 8px; font-weight:800; color:${balance > 0 ? '#b45309' : '#059669'}">₹${balance.toLocaleString()}</span>
            </div>
        </div>

        <div class="print-agreement-signatures" style="margin-top: 50px;">
            <div class="print-sig-box" style="border: none;">
            </div>
            <div class="print-sig-box">
                <div class="print-sig-title">For Pradraksha Groups</div>
                <div style="height: 35px;"></div>
                <div>Authorized Signatory (Accounts Department)</div>
            </div>
        </div>
    `;
    return div;
}

// PDF Export Helper to render standard A4 desktop sheets off-screen
function exportPaperElement(element, filename) {
    if (!element) return;
    
    // Create a hidden wrapper container to hold the paper offscreen without layout offsets
    const wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.left = '0';
    wrapper.style.top = '0';
    wrapper.style.width = '0';
    wrapper.style.height = '0';
    wrapper.style.overflow = 'hidden';
    wrapper.style.zIndex = '-9999';
    document.body.appendChild(wrapper);
    
    // Clone the element so we do not distort the visible preview
    const paper = element.cloneNode(true);
    wrapper.appendChild(paper);
    
    // Style as a standard A4 page (relative positioning to avoid html2canvas absolute/fixed bugs)
    paper.style.position = 'relative';
    paper.style.width = '794px';
    paper.style.background = '#ffffff';
    paper.style.padding = '40px';
    paper.style.boxSizing = 'border-box';
    
    // Enforce high contrast text colors inside pdf
    const allText = paper.querySelectorAll('*');
    allText.forEach(el => {
        el.style.color = '#1e293b';
    });
    
    const opt = {
        margin:       10,
        filename:     filename,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, scrollX: 0, scrollY: 0 },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    html2pdf().set(opt).from(paper).save().then(() => {
        wrapper.remove();
    });
}

// Global Hook to generate document and run PDF downloader
function triggerDocumentDownload(type, refId) {
    let paper = null;
    let filename = "";
    
    if (type === 'agreement') {
        const agree = appState.agreements.find(a => a.id === refId);
        if (agree) {
            const client = appState.clients.find(c => c.id === agree.clientId);
            if (client) {
                paper = assembleAgreementHTML(agree, client);
                filename = `Agreement_${refId}_${client.business.replace(/\s+/g, '_')}.pdf`;
            }
        }
    } else if (type === 'invoice') {
        const inv = appState.invoices.find(i => i.id === refId);
        if (inv) {
            const client = appState.clients.find(c => c.id === inv.clientId);
            if (client) {
                paper = assembleInvoiceHTML(inv.id, client, inv.date, inv.dueDate, inv.items, inv.paid, inv.notes);
                filename = `Invoice_${refId}_${client.business.replace(/\s+/g, '_')}.pdf`;
            }
        }
    }
    
    if (paper && filename) {
        exportPaperElement(paper, filename);
    }
}
window.triggerDocumentDownload = triggerDocumentDownload; // Bind global

// PDF Export triggers for Form Pages

document.getElementById('btn-agree-export').onclick = () => {
    if (!currentAgreeDraftElement) return;
    exportPaperElement(currentAgreeDraftElement, `Agreement_${currentAgreeClientName}.pdf`);
};

document.getElementById('btn-invoice-export').onclick = () => {
    if (!currentInvoiceDraftElement) return;
    exportPaperElement(currentInvoiceDraftElement, `Invoice_${currentInvoiceNumber}_${currentInvoiceClientName}.pdf`);
};

// Form Resets


document.getElementById('btn-agree-reset').onclick = () => {
    document.getElementById('agreement-form').reset();
    document.getElementById('agree-date').value = new Date().toISOString().substring(0, 10);
    document.getElementById('agree-start-date').value = new Date().toISOString().substring(0, 10);
    
    const deliveryOffset = new Date();
    deliveryOffset.setDate(deliveryOffset.getDate() + 30);
    document.getElementById('agree-delivery-date').value = deliveryOffset.toISOString().substring(0, 10);
    
    const otherGroup = document.getElementById('agree-project-type-other-group');
    if (otherGroup) {
        otherGroup.style.display = 'none';
        document.getElementById('agree-project-type-other').removeAttribute('required');
    }
    
    const maintenanceFields = document.getElementById('agree-maintenance-fields');
    const maintenanceInput = document.getElementById('agree-maintenance');
    if (maintenanceFields) {
        maintenanceFields.style.display = 'none';
    }
    if (maintenanceInput) {
        maintenanceInput.removeAttribute('required');
    }
    
    const revisionsFields = document.getElementById('agree-revisions-fields');
    const revisionsInput = document.getElementById('agree-revisions');
    if (revisionsFields) {
        revisionsFields.style.display = 'block';
    }
    if (revisionsInput) {
        revisionsInput.setAttribute('required', 'true');
        revisionsInput.value = '3';
    }
    
    document.getElementById('agree-pdf-viewport').innerHTML = `
        <div style="padding: 2.5rem; text-align: center; color: var(--text-muted);">
            <i data-lucide="eye" style="width: 48px; height: 48px; stroke-width: 1; margin-bottom: 1rem;"></i>
            <p>Fill in parameters to compile draft of corporate agreement.</p>
        </div>
    `;
    document.getElementById('btn-agree-export').disabled = true;
    lucide.createIcons();
};

document.getElementById('btn-invoice-reset').onclick = () => {
    document.getElementById('invoice-form').reset();
    document.getElementById('invoice-items-tbody').innerHTML = '';
    invoiceTable.addRow();
    
    initInvoiceFormDefaults();
    
    document.getElementById('invoice-pdf-viewport').innerHTML = `
        <div style="padding: 2.5rem; text-align: center; color: var(--text-muted);">
            <i data-lucide="eye" style="width: 48px; height: 48px; stroke-width: 1; margin-bottom: 1rem;"></i>
            <p>Set line costs and select client to display invoice draft.</p>
        </div>
    `;
    document.getElementById('btn-invoice-export').disabled = true;
    lucide.createIcons();
};

function initInvoiceFormDefaults() {
    document.getElementById('invoice-date').value = new Date().toISOString().substring(0, 10);
    const baseNum = appState.invoices.length + 1;
    const padded = String(baseNum).padStart(3, '0');
    document.getElementById('invoice-num').value = `PR-2026-${padded}`;
}

// --- 9. QR CODE & TENT CARD RENDER ENGINE ---
let qrEngineInstance = null;

function renderQRCodeWidget() {
    const url = document.getElementById('qr-text').value || "https://example.com";
    const title = document.getElementById('qr-brand-title').value || "Pradraksha Tech";
    const sub = document.getElementById('qr-brand-sub').value || "Scan to Visit Website";
    const dark = document.getElementById('qr-color-dark').value || "#1e3a8a";
    const light = document.getElementById('qr-color-light').value || "#ffffff";
    
    document.getElementById('mockup-brand-title').textContent = title;
    document.getElementById('mockup-brand-sub').textContent = sub;
    
    const emojiElem = document.getElementById('mockup-qr-logo');
    if (title.toLowerCase().includes('soft') || title.toLowerCase().includes('app') || title.toLowerCase().includes('tech')) {
        emojiElem.textContent = '💻';
    } else if (title.toLowerCase().includes('infra') || title.toLowerCase().includes('cloud')) {
        emojiElem.textContent = '☁️';
    } else if (title.toLowerCase().includes('design') || title.toLowerCase().includes('brand')) {
        emojiElem.textContent = '✨';
    } else if (title.toLowerCase().includes('consult') || title.toLowerCase().includes('strategy')) {
        emojiElem.textContent = '📈';
    } else {
        emojiElem.textContent = '🌐';
    }
    
    const canvasTarget = document.getElementById('qrcode-canvas-target');
    canvasTarget.innerHTML = '';
    
    qrEngineInstance = new QRCode(canvasTarget, {
        text: url,
        width: 180,
        height: 180,
        colorDark : dark,
        colorLight : light,
        correctLevel : QRCode.CorrectLevel.H
    });
}

document.getElementById('qr-client-select').addEventListener('change', function() {
    const selectedId = this.value;
    const client = appState.clients.find(c => c.id === selectedId);
    if (client) {
        document.getElementById('qr-brand-title').value = client.business;
        const cleanName = client.business.toLowerCase().replace(/[^a-z0-9]/g, '');
        document.getElementById('qr-text').value = `https://${cleanName}.co.in`;
        renderQRCodeWidget();
    }
});

['qr-text', 'qr-brand-title', 'qr-brand-sub', 'qr-color-dark', 'qr-color-light'].forEach(id => {
    document.getElementById(id).addEventListener('input', renderQRCodeWidget);
});

// Download Raw QR PNG
document.getElementById('btn-qr-download-png').onclick = () => {
    const container = document.getElementById('qrcode-canvas-target');
    const canvas = container.querySelector('canvas');
    const img = container.querySelector('img');
    let dataUrl = "";
    
    if (canvas) {
        dataUrl = canvas.toDataURL("image/png");
    } else if (img) {
        dataUrl = img.src;
    }
    
    if (dataUrl) {
        const brand = document.getElementById('qr-brand-title').value || "Brand";
        const link = document.createElement('a');
        link.download = `QR_${brand.replace(/\s+/g, '_')}.png`;
        link.href = dataUrl;
        link.click();
        showToast('QR Code PNG downloaded.', 'success');
    } else {
        showToast('QR canvas not ready.', 'error');
    }
};

// Export Table Tent PDF
document.getElementById('btn-qr-download-pdf').onclick = () => {
    const element = document.getElementById('qr-tent-mockup');
    const brand = document.getElementById('qr-brand-title').value || "Brand";
    
    const wrapper = document.createElement('div');
    document.body.appendChild(wrapper);
    wrapper.style.position = 'fixed';
    wrapper.style.left = '0';
    wrapper.style.top = '0';
    wrapper.style.width = '0';
    wrapper.style.height = '0';
    wrapper.style.overflow = 'hidden';
    wrapper.style.zIndex = '-9999';
    
    const printWrap = document.createElement('div');
    wrapper.appendChild(printWrap);
    printWrap.style.position = 'relative';
    printWrap.style.width = '500px';
    printWrap.style.background = '#ffffff';
    printWrap.style.padding = '40px';
    printWrap.innerHTML = element.innerHTML;
    
    printWrap.querySelector('.print-qr-tent').style.border = '2px solid #cbd5e1';
    printWrap.querySelector('.print-qr-tent').style.boxShadow = 'none';
    printWrap.querySelector('.print-qr-img-wrap').style.border = '2px solid #e2e8f0';
    
    const opt = {
        margin:       15,
        filename:     `TableTent_${brand.replace(/\s+/g, '_')}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, scrollX: 0, scrollY: 0 },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    html2pdf().set(opt).from(printWrap).save().then(() => {
        wrapper.remove();
        showToast('Table Tent Card PDF downloaded.', 'success');
    });
};

// --- 10. BACKUP & SYNC ENGINE ---
document.getElementById('btn-open-backup').onclick = () => {
    openModal('modal-backup');
};

document.getElementById('btn-export-json').onclick = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appState, null, 4));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `Pradraksha_Groups_Backup_${new Date().toISOString().slice(0,10)}.json`);
    dlAnchorElem.click();
    showToast('Database exported.', 'success');
};

document.getElementById('btn-reset-db').onclick = async () => {
    if (confirm("Are you sure you want to clear all operational data? This will delete all registered clients, agreements, invoices, and payments permanently.")) {
        appState = JSON.parse(JSON.stringify(DEFAULT_STATE));
        saveState();
        
        if (supabaseClient) {
            try {
                // Delete all rows in parallel using filter matching all ids
                await Promise.all([
                    supabaseClient.from('clients').delete().neq('id', '_dummy_reset_'),
                    supabaseClient.from('agreements').delete().neq('id', '_dummy_reset_'),
                    supabaseClient.from('invoices').delete().neq('id', '_dummy_reset_'),
                    supabaseClient.from('payments').delete().neq('id', '_dummy_reset_'),
                    supabaseClient.from('activities').delete().neq('id', 0)
                ]);
                showToast('Cloud database cleared.', 'success');
            } catch (e) {
                console.error("Failed to clear Supabase tables:", e);
                showToast("Local cache reset, but cloud database could not be cleared completely.", "error");
            }
        }
        
        closeModal('modal-backup');
        showToast('Database reset. All data cleared.', 'success');
    }
};

document.getElementById('backup-file-input').onchange = function(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const importedState = JSON.parse(event.target.result);
            if (importedState.clients && importedState.quotations && importedState.payments) {
                appState = importedState;
                saveState();
                closeModal('modal-backup');
                showToast('Database restored successfully!', 'success');
            } else {
                showToast('Invalid backup file structure.', 'error');
            }
        } catch (err) {
            showToast('Failed to parse JSON backup.', 'error');
        }
    };
    reader.readAsText(file);
};

document.getElementById('btn-save-supabase').onclick = async () => {
    const url = document.getElementById('sb-url').value.trim();
    const key = document.getElementById('sb-key').value.trim();
    
    if (!url || !key) {
        showToast("Please enter both URL and Anon Key.", "error");
        return;
    }
    
    const saveBtn = document.getElementById('btn-save-supabase');
    const originalHTML = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = `Connecting...`;
    
    try {
        const tempClient = supabase.createClient(url, key);
        const { error } = await tempClient.from('clients').select('id').limit(1);
        if (error) throw error;
        
        localStorage.setItem("pradraksha_supabase_config", JSON.stringify({ url, key }));
        supabaseClient = tempClient;
        document.getElementById('btn-disconnect-supabase').style.display = 'inline-flex';
        updateDBBadge(true);
        
        const localDataExists = appState.clients.length > 0 || appState.agreements.length > 0 || appState.invoices.length > 0 || appState.payments.length > 0;
        if (localDataExists) {
            if (confirm("Connection successful! Do you want to upload your existing local data to the Supabase database?")) {
                await migrateLocalDataToSupabase();
            }
        }
        
        await syncFromSupabase();
        showToast("Connected & synced with Supabase successfully!", "success");
        closeModal('modal-backup');
    } catch (err) {
        console.error("Supabase config test failed:", err);
        showToast(`Connection failed: ${err.message || 'Check database access and tables setup.'}`, "error");
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalHTML;
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
};

document.getElementById('btn-disconnect-supabase').onclick = () => {
    if (confirm("Are you sure you want to disconnect from Supabase? The app will revert to using Local Storage cache.")) {
        localStorage.removeItem("pradraksha_supabase_config");
        supabaseClient = null;
        document.getElementById('sb-url').value = '';
        document.getElementById('sb-key').value = '';
        document.getElementById('btn-disconnect-supabase').style.display = 'none';
        updateDBBadge(false);
        showToast("Disconnected from Supabase.", "info");
        initDatabase();
    }
};

// --- 11. TOASTS & DATES UTILITIES ---
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'info';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'alert-triangle';
    
    toast.innerHTML = `
        <i data-lucide="${icon}"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    lucide.createIcons();
    
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease-in reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function formatCurrency(num) {
    return '₹' + Math.round(num).toLocaleString('en-IN');
}

function formatDateString(dateStr) {
    if (!dateStr) return '___ / ___ / ______';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '___ / ___ / ______';
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-IN', options);
}

function formatTimeAgo(dateStr) {
    const seconds = Math.floor((new Date() - new Date(dateStr)) / 1000);
    
    let interval = Math.floor(seconds / 31536000);
    if (interval >= 1) return interval + " years ago";
    interval = Math.floor(seconds / 2592000);
    if (interval >= 1) return interval + " months ago";
    interval = Math.floor(seconds / 86400);
    if (interval >= 1) return interval + " days ago";
    interval = Math.floor(seconds / 3600);
    if (interval >= 1) return interval + " hours ago";
    interval = Math.floor(seconds / 60);
    if (interval >= 1) return interval + " minutes ago";
    return "Just now";
}

// --- 11.5. HELPER ACTIONS FOR USER CONVENIENCE ---
function quickNavigate(target) {
    if (target === 'clients-add') {
        window.location.hash = '#clients';
        setTimeout(() => openClientModal(), 50);
    } else if (target === 'payments-log') {
        window.location.hash = '#payments';
        setTimeout(() => openPaymentModal(), 50);
    } else if (sections[target]) {
        window.location.hash = '#' + target;
    }
}
window.quickNavigate = quickNavigate;

function applyQRPreset(fg, bg) {
    document.getElementById('qr-color-dark').value = fg;
    document.getElementById('qr-color-light').value = bg;
    renderQRCodeWidget();
    showToast('QR Code color preset applied.', 'success');
}
window.applyQRPreset = applyQRPreset;

// --- 12. APP INITIALIZATION HOOKS ---
document.addEventListener("DOMContentLoaded", () => {
    initDatabase();
    
    window.addEventListener('hashchange', handleRoute);
    if (!window.location.hash) {
        window.location.hash = '#dashboard';
    } else {
        handleRoute();
    }
    
    const dateOptions = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
    document.getElementById('current-date-badge').textContent = new Date().toLocaleDateString('en-IN', dateOptions);
    
    document.getElementById('agree-date').value = new Date().toISOString().substring(0, 10);
    document.getElementById('agree-start-date').value = new Date().toISOString().substring(0, 10);
    
    const deliveryOffset = new Date();
    deliveryOffset.setDate(deliveryOffset.getDate() + 30);
    document.getElementById('agree-delivery-date').value = deliveryOffset.toISOString().substring(0, 10);
    
    const projectTypeSelect = document.getElementById('agree-project-type');
    const projectTypeOtherGroup = document.getElementById('agree-project-type-other-group');
    if (projectTypeSelect && projectTypeOtherGroup) {
        projectTypeSelect.addEventListener('change', () => {
            if (projectTypeSelect.value === 'Other') {
                projectTypeOtherGroup.style.display = 'block';
                document.getElementById('agree-project-type-other').setAttribute('required', 'true');
            } else {
                projectTypeOtherGroup.style.display = 'none';
                document.getElementById('agree-project-type-other').removeAttribute('required');
            }
        });
    }
    
    const maintenanceToggle = document.getElementById('agree-maintenance-toggle');
    const maintenanceFields = document.getElementById('agree-maintenance-fields');
    const maintenanceInput = document.getElementById('agree-maintenance');
    if (maintenanceToggle && maintenanceFields) {
        maintenanceToggle.addEventListener('change', () => {
            if (maintenanceToggle.checked) {
                maintenanceFields.style.display = 'block';
                if (maintenanceInput) {
                    maintenanceInput.setAttribute('required', 'true');
                    maintenanceInput.focus();
                }
            } else {
                maintenanceFields.style.display = 'none';
                if (maintenanceInput) {
                    maintenanceInput.removeAttribute('required');
                    maintenanceInput.value = '0';
                }
            }
        });
    }
    
    const revisionsToggle = document.getElementById('agree-revisions-toggle');
    const revisionsFields = document.getElementById('agree-revisions-fields');
    const revisionsInput = document.getElementById('agree-revisions');
    if (revisionsToggle && revisionsFields) {
        revisionsToggle.addEventListener('change', () => {
            if (revisionsToggle.checked) {
                revisionsFields.style.display = 'block';
                if (revisionsInput) {
                    revisionsInput.setAttribute('required', 'true');
                    revisionsInput.value = '3';
                    revisionsInput.focus();
                }
            } else {
                revisionsFields.style.display = 'none';
                if (revisionsInput) {
                    revisionsInput.removeAttribute('required');
                }
            }
        });
    }
    
    initInvoiceFormDefaults();
    renderQRCodeWidget();
    lucide.createIcons();
    updateAllViews();
});
