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
    appState.invoices = (invoicesRes.data || []).map(i => {
        let itemsData = [];
        let extraData = {};
        try {
            const parsed = typeof i.items === 'string' ? JSON.parse(i.items) : (i.items || {});
            if (parsed && (parsed.invoice_items || parsed.items)) {
                const parsedItems = parsed.invoice_items || parsed.items || [];
                itemsData = parsedItems.map(it => ({
                    description: it.description || it.service_name || "Service Item",
                    amount: Number(it.amount) || (Number(it.quantity) * Number(it.unit_price)) || 0,
                    service_name: it.service_name || it.description || "Service Item",
                    quantity: Number(it.quantity) !== undefined && Number(it.quantity) !== null ? Number(it.quantity) : 1,
                    unit_price: Number(it.unit_price) || Number(it.amount) || 0,
                    total: Number(it.total) || Number(it.amount) || (Number(it.quantity) * Number(it.unit_price)) || 0
                }));
                extraData = parsed;
            } else {
                const arr = Array.isArray(parsed) ? parsed : [];
                itemsData = arr.map(it => ({
                    description: it.description || "Service Item",
                    amount: Number(it.amount) || 0,
                    service_name: it.description || "Service Item",
                    quantity: 1,
                    unit_price: Number(it.amount) || 0,
                    total: Number(it.amount) || 0
                }));
            }
        } catch (e) {
            console.error("Failed to parse items json", e);
        }

        return {
            id: i.id,
            clientId: i.client_id,
            date: i.date,
            dueDate: i.due_date,
            items: itemsData,
            paid: Number(i.paid),
            notes: i.notes,

            // Extracted rich schema fields
            invoice_id: extraData.invoice_id || i.id,
            invoice_number: extraData.invoice_number || i.id,
            invoice_date: extraData.invoice_date || i.date,
            due_date: extraData.due_date || i.due_date,
            status: extraData.status || (Number(i.paid) > 0 ? "Paid" : "Pending"),
            company_details: extraData.company_details || {
                company_name: "Pradraksha Groups",
                address: "Pradraksha Towers, Sector 4, HSR Layout, Bangalore, Karnataka - 560102",
                email: "finance@pradraksha.com",
                phone: "+91 98765 43210",
                website: "www.pradraksha.com"
            },
            client_details: extraData.client_details || null,
            project_details: extraData.project_details || {
                project_name: "",
                project_type: "",
                description: ""
            },
            invoice_items: itemsData,
            subtotal: extraData.subtotal || itemsData.reduce((s, it) => s + it.total, 0),
            discount: extraData.discount || 0,
            tax: extraData.tax || 0,
            grand_total: extraData.grand_total || itemsData.reduce((s, it) => s + it.total, 0),
            payment_details: extraData.payment_details || {
                payment_mode: "UPI",
                upi_id: "8310311290",
                payment_link: "https://upi.link/pradraksha"
            },
            terms_conditions: extraData.terms_conditions || "1. Payments should be made within the due date.\n2. Interest of 12% per annum may be charged on late payments.\n3. Goods or services once delivered are non-refundable.",
            advance_received: Number(i.paid),
            balance_due: extraData.balance_due !== undefined ? extraData.balance_due : Math.max(0, (extraData.grand_total || itemsData.reduce((s, it) => s + it.total, 0)) - Number(i.paid)),
            created_at: extraData.created_at || new Date().toISOString()
        };
    });
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
        client_id: inv.clientId || (inv.client_details ? inv.client_details.id : null),
        date: inv.invoice_date || inv.date,
        due_date: inv.due_date || inv.dueDate,
        items: JSON.stringify({
            invoice_id: inv.invoice_id || inv.id,
            invoice_number: inv.invoice_number || inv.id,
            invoice_date: inv.invoice_date || inv.date,
            due_date: inv.due_date || inv.dueDate,
            status: inv.status || "Pending",
            company_details: inv.company_details,
            client_details: inv.client_details,
            project_details: inv.project_details,
            invoice_items: inv.invoice_items || inv.items,
            subtotal: inv.subtotal,
            discount: inv.discount,
            tax: inv.tax,
            grand_total: inv.grand_total,
            payment_details: inv.payment_details,
            notes: inv.notes,
            terms_conditions: inv.terms_conditions,
            advance_received: inv.advance_received || inv.paid,
            balance_due: inv.balance_due,
            created_at: inv.created_at || new Date().toISOString()
        }),
        paid: Number(inv.advance_received !== undefined ? inv.advance_received : inv.paid),
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
    (appState.agreements || []).forEach(agr => totalPipeline += Number(agr.cost));
    
    let totalCollected = 0;
    (appState.payments || []).forEach(pay => totalCollected += Number(pay.amount));
    
    const outstanding = totalPipeline - totalCollected;
    const clientCount = (appState.clients || []).length;
    
    // Invoices Ledger Calculations (Flat, no GST)
    let ledgerTotalBilled = 0;
    (appState.invoices || []).forEach(inv => {
        const subtotal = (inv.items || []).reduce((s, item) => s + Number(item.amount), 0);
        ledgerTotalBilled += subtotal;
    });
    
    const ledgerTotalPending = ledgerTotalBilled - totalCollected;
    
    // Inject values
    const pipelineEl = document.getElementById('val-total-pipeline');
    if (pipelineEl) pipelineEl.textContent = formatCurrency(totalPipeline);
    
    const collectedEl = document.getElementById('val-total-collected');
    if (collectedEl) collectedEl.textContent = formatCurrency(totalCollected);
    
    const outstandingEl = document.getElementById('val-total-outstanding');
    if (outstandingEl) outstandingEl.textContent = formatCurrency(outstanding);
    
    const clientCountEl = document.getElementById('val-client-count');
    if (clientCountEl) clientCountEl.textContent = clientCount;
    
    const percent = totalPipeline > 0 ? Math.round((totalCollected / totalPipeline) * 100) : 0;
    const percentCollectedEl = document.getElementById('val-percent-collected');
    if (percentCollectedEl) percentCollectedEl.textContent = `${percent}% of portfolio value`;
    
    // Count unpaid invoices (flat grand total)
    const unpaidCount = (appState.invoices || []).filter(i => {
        const grandTotal = (i.items || []).reduce((s, it) => s + Number(it.amount), 0);
        return i.paid < grandTotal;
    }).length;
    const pendingCountEl = document.getElementById('val-pending-count');
    if (pendingCountEl) pendingCountEl.textContent = `${unpaidCount} unpaid invoices`;

    // Ledger View widgets
    const billedLedgerEl = document.getElementById('ledger-total-billed');
    if (billedLedgerEl) billedLedgerEl.textContent = formatCurrency(ledgerTotalBilled);
    
    const collectedLedgerEl = document.getElementById('ledger-total-collected');
    if (collectedLedgerEl) collectedLedgerEl.textContent = formatCurrency(totalCollected);
    
    const pendingLedgerEl = document.getElementById('ledger-total-pending');
    if (pendingLedgerEl) pendingLedgerEl.textContent = formatCurrency(Math.max(0, ledgerTotalPending));
    
    const ledgerPercent = ledgerTotalBilled > 0 ? Math.round((totalCollected / ledgerTotalBilled) * 100) : 0;
    const ledgerPercentEl = document.getElementById('ledger-percent-collected');
    if (ledgerPercentEl) ledgerPercentEl.textContent = `${ledgerPercent}% collection rate`;

    // Modern greeting logic
    const greetingTitleEl = document.getElementById('greeting-title');
    const greetingInsightEl = document.getElementById('greeting-insight');
    if (greetingTitleEl) {
        const hour = new Date().getHours();
        let greeting = "Welcome back, Operator";
        if (hour < 12) greeting = "Good Morning, Operator";
        else if (hour < 17) greeting = "Good Afternoon, Operator";
        else greeting = "Good Evening, Operator";
        greetingTitleEl.textContent = greeting;
    }
    if (greetingInsightEl) {
        const dbStatus = supabaseClient ? "Supabase Cloud Database connected and in sync." : "Offline Mode active: caching operations locally in browser.";
        greetingInsightEl.textContent = `You have registered ${clientCount} corporate client partners. ${dbStatus}`;
    }

    // Circular gauge updates
    const gaugeValueText = document.getElementById('gauge-value-text');
    const gaugeCircleFg = document.getElementById('gauge-circle-fg');
    const gaugeDetailText = document.getElementById('gauge-detail-text');
    
    const rate = ledgerTotalBilled > 0 ? Math.round((totalCollected / ledgerTotalBilled) * 100) : 0;
    
    if (gaugeValueText) {
        gaugeValueText.textContent = `${rate}%`;
    }
    if (gaugeCircleFg) {
        // Circumference of r=28 is 175.93
        const circumference = 175.929;
        const offset = Math.max(0, Math.min(circumference, circumference * (1 - rate / 100)));
        gaugeCircleFg.style.strokeDashoffset = offset;
    }
    if (gaugeDetailText) {
        gaugeDetailText.textContent = `${formatCurrency(totalCollected)} Collected`;
    }

    // Render interactive SVG telemetry chart
    renderDashboardChart();
}

function renderDashboardChart() {
    const svg = document.getElementById('dashboard-chart-svg');
    if (!svg) return;

    // Determine last 6 months
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const year = d.getFullYear();
        const monthNum = String(d.getMonth() + 1).padStart(2, '0');
        const label = d.toLocaleDateString('en-IN', { month: 'short' });
        months.push({
            key: `${year}-${monthNum}`,
            label: label,
            year: year,
            month: d.getMonth()
        });
    }

    const billedByMonth = Array(6).fill(0);
    const collectedByMonth = Array(6).fill(0);

    // Group Invoiced Amounts
    (appState.invoices || []).forEach(inv => {
        if (!inv.date) return;
        const invDate = new Date(inv.date);
        const y = invDate.getFullYear();
        const m = String(invDate.getMonth() + 1).padStart(2, '0');
        const key = `${y}-${m}`;
        const index = months.findIndex(item => item.key === key);
        if (index > -1) {
            const subtotal = (inv.items || []).reduce((s, item) => s + Number(item.amount), 0);
            billedByMonth[index] += subtotal;
        }
    });

    // Group Recorded Collections
    (appState.payments || []).forEach(pay => {
        if (!pay.date) return;
        const payDate = new Date(pay.date);
        const y = payDate.getFullYear();
        const m = String(payDate.getMonth() + 1).padStart(2, '0');
        const key = `${y}-${m}`;
        const index = months.findIndex(item => item.key === key);
        if (index > -1) {
            collectedByMonth[index] += Number(pay.amount);
        }
    });

    // If both billed and collected are zero for all months, add some mock seed visuals so the chart looks nice
    const hasData = billedByMonth.some(v => v > 0) || collectedByMonth.some(v => v > 0);
    let chartBilled = [...billedByMonth];
    let chartCollected = [...collectedByMonth];

    if (!hasData) {
        // Mock data representing standard billing operations
        chartBilled = [15000, 45000, 25000, 60000, 40000, 75000];
        chartCollected = [10000, 35000, 20000, 50000, 30000, 65000];
    }

    const maxVal = Math.max(10000, ...chartBilled, ...chartCollected);

    // Margins and Dimensions
    const width = 600;
    const height = 240;
    const padLeft = 65;
    const padRight = 20;
    const padTop = 25;
    const padBottom = 35;

    const drawW = width - padLeft - padRight;
    const drawH = height - padTop - padBottom;

    const pointsX = [];
    const pointsYBilled = [];
    const pointsYCollected = [];

    for (let i = 0; i < 6; i++) {
        const x = padLeft + (i * (drawW / 5));
        const yBilled = height - padBottom - (chartBilled[i] / maxVal * drawH);
        const yCollected = height - padBottom - (chartCollected[i] / maxVal * drawH);

        pointsX.push(x);
        pointsYBilled.push(yBilled);
        pointsYCollected.push(yCollected);
    }

    // SVG Helper to interpolate Bézier curve
    function getBezierPath(xArr, yArr) {
        if (xArr.length === 0) return "";
        let path = `M ${xArr[0]} ${yArr[0]}`;
        for (let i = 0; i < xArr.length - 1; i++) {
            const xMid = (xArr[i] + xArr[i+1]) / 2;
            path += ` C ${xMid} ${yArr[i]}, ${xMid} ${yArr[i+1]}, ${xArr[i+1]} ${yArr[i+1]}`;
        }
        return path;
    }

    const billedPath = getBezierPath(pointsX, pointsYBilled);
    const collectedPath = getBezierPath(pointsX, pointsYCollected);

    const billedArea = `${billedPath} L ${pointsX[5]} ${height - padBottom} L ${pointsX[0]} ${height - padBottom} Z`;
    const collectedArea = `${collectedPath} L ${pointsX[5]} ${height - padBottom} L ${pointsX[0]} ${height - padBottom} Z`;

    // Clear everything except defs
    const defs = svg.querySelector('defs');
    svg.innerHTML = '';
    if (defs) {
        svg.appendChild(defs);
    }

    // 1. Gridlines and Y-axis labels
    const gridCount = 4;
    for (let i = 0; i <= gridCount; i++) {
        const fraction = i / gridCount;
        const val = fraction * maxVal;
        const y = height - padBottom - (fraction * drawH);
        
        // Gridline
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", padLeft);
        line.setAttribute("y1", y);
        line.setAttribute("x2", width - padRight);
        line.setAttribute("y2", y);
        line.setAttribute("class", "chart-grid-line");
        svg.appendChild(line);

        // Y label
        const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
        txt.setAttribute("x", padLeft - 10);
        txt.setAttribute("y", y + 4);
        txt.setAttribute("text-anchor", "end");
        txt.setAttribute("class", "chart-axis-label");
        
        // Compact notation for large numbers
        let formattedVal = "";
        if (val >= 100000) formattedVal = '₹' + (val / 100000).toFixed(1) + 'L';
        else if (val >= 1000) formattedVal = '₹' + (val / 1000).toFixed(0) + 'k';
        else formattedVal = '₹' + val;
        
        txt.textContent = formattedVal;
        svg.appendChild(txt);
    }

    // 2. X-axis Labels (Months)
    for (let i = 0; i < 6; i++) {
        const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
        txt.setAttribute("x", pointsX[i]);
        txt.setAttribute("y", height - 10);
        txt.setAttribute("text-anchor", "middle");
        txt.setAttribute("class", "chart-axis-label");
        txt.textContent = months[i].label;
        svg.appendChild(txt);
    }

    // 3. Draw Areas
    const areaB = document.createElementNS("http://www.w3.org/2000/svg", "path");
    areaB.setAttribute("d", billedArea);
    areaB.setAttribute("fill", "url(#revenue-gradient)");
    areaB.setAttribute("opacity", "0.25");
    svg.appendChild(areaB);

    const areaC = document.createElementNS("http://www.w3.org/2000/svg", "path");
    areaC.setAttribute("d", collectedArea);
    areaC.setAttribute("fill", "url(#collected-gradient)");
    areaC.setAttribute("opacity", "0.25");
    svg.appendChild(areaC);

    // 4. Draw Lines
    const lineB = document.createElementNS("http://www.w3.org/2000/svg", "path");
    lineB.setAttribute("d", billedPath);
    lineB.setAttribute("fill", "none");
    lineB.setAttribute("stroke", "var(--primary)");
    lineB.setAttribute("stroke-width", "3.5");
    lineB.setAttribute("stroke-linecap", "round");
    lineB.style.filter = "drop-shadow(0 4px 10px rgba(99, 102, 241, 0.35))";
    svg.appendChild(lineB);

    const lineC = document.createElementNS("http://www.w3.org/2000/svg", "path");
    lineC.setAttribute("d", collectedPath);
    lineC.setAttribute("fill", "none");
    lineC.setAttribute("stroke", "var(--success)");
    lineC.setAttribute("stroke-width", "3.5");
    lineC.setAttribute("stroke-linecap", "round");
    lineC.style.filter = "drop-shadow(0 4px 10px rgba(16, 185, 129, 0.35))";
    svg.appendChild(lineC);

    // 5. Draw Interactive Nodes
    for (let i = 0; i < 6; i++) {
        // Billed Circle
        const circB = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circB.setAttribute("cx", pointsX[i]);
        circB.setAttribute("cy", pointsYBilled[i]);
        circB.setAttribute("r", "5");
        circB.setAttribute("class", "chart-point-revenue");
        circB.style.transition = "r var(--transition-fast)";
        
        bindTooltip(circB, months[i].label, "Invoiced", chartBilled[i], "var(--primary)", hasData);
        svg.appendChild(circB);

        // Collected Circle
        const circC = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circC.setAttribute("cx", pointsX[i]);
        circC.setAttribute("cy", pointsYCollected[i]);
        circC.setAttribute("r", "5");
        circC.setAttribute("class", "chart-point-collected");
        circC.style.transition = "r var(--transition-fast)";
        
        bindTooltip(circC, months[i].label, "Collected", chartCollected[i], "var(--success)", hasData);
        svg.appendChild(circC);
    }
}

function bindTooltip(circle, month, type, amount, color, hasRealData) {
    const tooltip = document.getElementById('chart-tooltip');
    if (!tooltip) return;

    circle.addEventListener('mouseenter', (e) => {
        circle.setAttribute("r", "7.5");
        
        const dataNote = hasRealData ? "" : " <span style='font-style:italic; opacity:0.6;'>(Mock Data)</span>";
        tooltip.innerHTML = `
            <div style="font-weight: 700; color: var(--text-secondary); margin-bottom: 0.25rem;">${month} 2026${dataNote}</div>
            <div style="display:flex; align-items:center; gap: 0.35rem; font-weight:700;">
                <span style="width: 8px; height: 8px; border-radius: 50%; background: ${color}; display:inline-block;"></span>
                <span>${type}: <b>${formatCurrency(amount)}</b></span>
            </div>
        `;
        tooltip.style.display = 'block';
    });

    circle.addEventListener('mousemove', (e) => {
        const containerRect = circle.ownerSVGElement.parentNode.getBoundingClientRect();
        const tooltipW = tooltip.offsetWidth;
        const tooltipH = tooltip.offsetHeight;
        
        // Calculate offset relative to chart-container
        const x = e.clientX - containerRect.left + 15;
        const y = e.clientY - containerRect.top - tooltipH - 10;
        
        // Keep within bounds
        const finalX = x + tooltipW > containerRect.width ? x - tooltipW - 30 : x;
        const finalY = y < 0 ? y + tooltipH + 30 : y;
        
        tooltip.style.left = `${finalX}px`;
        tooltip.style.top = `${finalY}px`;
    });

    circle.addEventListener('mouseleave', () => {
        circle.setAttribute("r", "5");
        tooltip.style.display = 'none';
    });
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
            const grandTotal = inv.grand_total !== undefined ? inv.grand_total : inv.items.reduce((s, i) => s + i.amount, 0);
            let statusBadge = '';
            if (inv.status) {
                if (inv.status === 'Paid') {
                    statusBadge = '<span class="badge badge-paid" style="padding: 0.15rem 0.4rem; font-size: 0.65rem;">Paid</span>';
                } else if (inv.status === 'Pending') {
                    statusBadge = '<span class="badge badge-partial" style="padding: 0.15rem 0.4rem; font-size: 0.65rem;">Pending</span>';
                } else if (inv.status === 'Overdue') {
                    statusBadge = '<span class="badge badge-unpaid" style="padding: 0.15rem 0.4rem; font-size: 0.65rem;">Overdue</span>';
                } else {
                    statusBadge = '<span class="badge badge-type" style="padding: 0.15rem 0.4rem; font-size: 0.65rem;">Draft</span>';
                }
            } else {
                statusBadge = inv.paid >= grandTotal ? '<span class="badge badge-paid" style="padding: 0.15rem 0.4rem; font-size: 0.65rem;">Paid</span>' : (inv.paid > 0 ? '<span class="badge badge-partial" style="padding: 0.15rem 0.4rem; font-size: 0.65rem;">Partial</span>' : '<span class="badge badge-unpaid" style="padding: 0.15rem 0.4rem; font-size: 0.65rem;">Unpaid</span>');
            }
            tr.innerHTML = `
                <td><span class="badge badge-partial">Invoice</span></td>
                <td>${inv.id} ${statusBadge}</td>
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

function calculateInvoiceFormTotals() {
    let subtotal = 0;
    document.querySelectorAll('#invoice-items-tbody tr').forEach(tr => {
        const qtyInput = tr.querySelector('.item-qty');
        const priceInput = tr.querySelector('.item-price');
        const qty = qtyInput ? (Number(qtyInput.value) || 0) : 0;
        const price = priceInput ? (Number(priceInput.value) || 0) : 0;
        subtotal += qty * price;
    });
    
    const discount = Number(document.getElementById('invoice-discount')?.value) || 0;
    const taxPercent = Number(document.getElementById('invoice-tax')?.value) || 0;
    const taxAmount = (subtotal - discount) * (taxPercent / 100);
    const grandTotal = Math.max(0, (subtotal - discount) + taxAmount);
    const paid = Number(document.getElementById('invoice-paid')?.value) || 0;
    const balanceDue = Math.max(0, grandTotal - paid);
    
    // Update labels
    const subtotalEl = document.getElementById('lbl-invoice-subtotal');
    if (subtotalEl) subtotalEl.textContent = `₹${subtotal.toLocaleString('en-IN')}`;
    
    const discountEl = document.getElementById('lbl-invoice-discount');
    if (discountEl) discountEl.textContent = `-₹${discount.toLocaleString('en-IN')}`;
    
    const taxEl = document.getElementById('lbl-invoice-tax');
    if (taxEl) taxEl.textContent = `+₹${taxAmount.toLocaleString('en-IN')}`;
    
    const grandTotalEl = document.getElementById('lbl-invoice-grand-total');
    if (grandTotalEl) grandTotalEl.textContent = `₹${grandTotal.toLocaleString('en-IN')}`;
    
    const balanceDueEl = document.getElementById('lbl-invoice-balance-due');
    if (balanceDueEl) balanceDueEl.textContent = `₹${balanceDue.toLocaleString('en-IN')}`;
}

function initInvoiceItemsTable(tbodyId, addBtnId) {
    const tbody = document.getElementById(tbodyId);
    const btn = document.getElementById(addBtnId);
    
    function addRow(service = "", qty = 1, price = "") {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" class="item-name" list="billing-items-list" placeholder="Describe billing component..." value="${service}" required></td>
            <td><input type="number" class="item-qty" min="1" placeholder="1" value="${qty}" required style="text-align: center;"></td>
            <td><input type="number" class="item-price" min="0" placeholder="0" value="${price}" required style="text-align: right;"></td>
            <td style="text-align: right; font-weight: 600;"><span class="item-total">₹0</span></td>
            <td style="text-align: center;"><button type="button" class="item-delete-btn">&times;</button></td>
        `;
        
        const qtyInput = tr.querySelector('.item-qty');
        const priceInput = tr.querySelector('.item-price');
        const totalSpan = tr.querySelector('.item-total');
        
        function updateRowTotal() {
            const q = Number(qtyInput.value) || 0;
            const p = Number(priceInput.value) || 0;
            const t = q * p;
            totalSpan.textContent = `₹${t.toLocaleString('en-IN')}`;
            calculateInvoiceFormTotals();
        }
        
        qtyInput.addEventListener('input', updateRowTotal);
        priceInput.addEventListener('input', updateRowTotal);
        
        tr.querySelector('.item-delete-btn').onclick = () => {
            tr.remove();
            if (tbody.children.length === 0) addRow("", 1, "");
            calculateInvoiceFormTotals();
        };
        
        tbody.appendChild(tr);
        updateRowTotal();
    }
    
    if (btn) {
        btn.onclick = () => addRow("", 1, "");
    }
    
    if (tbody && tbody.children.length === 0) {
        addRow("", 1, "");
    }
    
    return { addRow };
}

const invoiceTable = initInvoiceItemsTable('invoice-items-tbody', 'btn-invoice-add-item');

function addPresetItem(name) {
    const tbody = document.getElementById('invoice-items-tbody');
    if (!tbody) return;
    
    // Check if there is already an empty row in the table to reuse
    let emptyRow = null;
    const rows = tbody.querySelectorAll('tr');
    for (let i = 0; i < rows.length; i++) {
        const tr = rows[i];
        const nameInput = tr.querySelector('.item-name');
        const priceInput = tr.querySelector('.item-price');
        if (nameInput && !nameInput.value && priceInput && !priceInput.value) {
            emptyRow = tr;
            break;
        }
    }
    
    if (emptyRow) {
        const nameInput = emptyRow.querySelector('.item-name');
        nameInput.value = name;
        const qtyInput = emptyRow.querySelector('.item-qty');
        if (qtyInput) qtyInput.value = 1;
        const priceInput = emptyRow.querySelector('.item-price');
        if (priceInput) priceInput.focus();
        // Update row total
        const event = new Event('input');
        if (priceInput) priceInput.dispatchEvent(event);
    } else {
        // Add a new row using invoiceTable
        invoiceTable.addRow(name, 1, "");
        // Focus price field on the last row
        const newRows = tbody.querySelectorAll('tr');
        if (newRows.length > 0) {
            const lastRow = newRows[newRows.length - 1];
            const priceInput = lastRow.querySelector('.item-price');
            if (priceInput) priceInput.focus();
        }
    }
}
window.addPresetItem = addPresetItem;

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
    const dueDate = document.getElementById('invoice-due-date').value;
    const status = document.getElementById('invoice-status').value;
    
    // Company details
    const company_details = {
        company_name: document.getElementById('invoice-co-name').value,
        address: document.getElementById('invoice-co-address').value,
        email: document.getElementById('invoice-co-email').value,
        phone: document.getElementById('invoice-co-phone').value,
        website: document.getElementById('invoice-co-website').value
    };
    
    // Client selection
    const clientId = document.getElementById('invoice-client-select').value;
    const client = appState.clients.find(c => c.id === clientId);
    if (!client) {
        alert("Please select a client.");
        return;
    }
    
    const client_details = {
        id: client.id,
        client_name: client.name,
        business_name: client.business,
        email: client.email,
        phone: client.phone,
        address: client.address
    };
    
    // Project details
    const project_details = {
        project_name: document.getElementById('invoice-proj-name').value,
        project_type: document.getElementById('invoice-proj-type').value,
        description: document.getElementById('invoice-proj-desc').value
    };
    
    // Invoice items
    const invoice_items = [];
    document.querySelectorAll('#invoice-items-tbody tr').forEach(tr => {
        const service_name = tr.querySelector('.item-name').value;
        const quantity = Number(tr.querySelector('.item-qty').value) || 1;
        const unit_price = Number(tr.querySelector('.item-price').value) || 0;
        const total = quantity * unit_price;
        
        if (service_name) {
            invoice_items.push({
                service_name,
                quantity,
                unit_price,
                total
            });
        }
    });
    
    if (invoice_items.length === 0) {
        alert("Please add at least one line item.");
        return;
    }
    
    // Financials
    let subtotal = invoice_items.reduce((s, it) => s + it.total, 0);
    const discount = Number(document.getElementById('invoice-discount').value) || 0;
    const taxPercent = Number(document.getElementById('invoice-tax').value) || 0;
    const taxAmount = (subtotal - discount) * (taxPercent / 100);
    const grand_total = Math.max(0, (subtotal - discount) + taxAmount);
    const advance_received = Number(document.getElementById('invoice-paid').value) || 0;
    const balance_due = Math.max(0, grand_total - advance_received);
    const notes = document.getElementById('invoice-notes').value;
    const terms_conditions = document.getElementById('invoice-terms').value;
    
    // Build legacy items array for compatibility
    const items = invoice_items.map(it => ({
        description: it.service_name,
        amount: it.total
    }));
    
    const updatedInvoice = {
        id: invoiceNum,
        clientId,
        date: invoiceDate,
        dueDate,
        items,
        paid: advance_received,
        notes,
        
        // Rich fields
        invoice_id: invoiceNum,
        invoice_number: invoiceNum,
        invoice_date: invoiceDate,
        status,
        company_details,
        client_details,
        project_details,
        invoice_items,
        subtotal,
        discount,
        tax: taxPercent,
        grand_total,
        payment_details: {
            payment_mode: document.getElementById('invoice-pay-mode').value,
            upi_id: document.getElementById('invoice-pay-upi').value,
            payment_link: document.getElementById('invoice-pay-link').value
        },
        terms_conditions,
        advance_received,
        balance_due,
        created_at: new Date().toISOString()
    };
    
    const existingIndex = appState.invoices.findIndex(i => i.id === invoiceNum);
    if (existingIndex > -1) {
        updatedInvoice.created_at = appState.invoices[existingIndex].created_at || updatedInvoice.created_at;
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
    
    const paper = assembleInvoiceHTML(updatedInvoice);
    const viewport = document.getElementById('invoice-pdf-viewport');
    viewport.innerHTML = '';
    viewport.appendChild(paper);
    
    currentInvoiceDraftElement = paper;
    currentInvoiceClientName = client.business.replace(/\s+/g, '_');
    currentInvoiceNumber = invoiceNum;
    document.getElementById('btn-invoice-export').disabled = false;
});

function assembleInvoiceHTML(id, client, date, dueDate, items, paid, notes) {
    let inv = {};
    if (typeof id === 'object' && id !== null) {
        inv = { ...id }; // Clone to avoid mutating in-memory state
    } else {
        inv = {
            id: id,
            invoice_number: id,
            invoice_date: date,
            date: date,
            due_date: dueDate,
            dueDate: dueDate,
            invoice_items: (items || []).map(it => ({
                service_name: it.description || "Service Item",
                quantity: 1,
                unit_price: it.amount || 0,
                total: it.amount || 0
            })),
            subtotal: (items || []).reduce((s, it) => s + it.amount, 0),
            discount: 0,
            tax: 0,
            grand_total: (items || []).reduce((s, it) => s + it.amount, 0),
            advance_received: paid || 0,
            balance_due: ((items || []).reduce((s, it) => s + it.amount, 0)) - (paid || 0),
            notes: notes || "",
            status: "Pending",
            company_details: {
                company_name: "Pradraksha Groups",
                address: "Pradraksha Towers, HSR Layout, Sector 4, Bangalore 560102",
                email: "finance@pradraksha.com",
                phone: "+91 98765 43210",
                website: "www.pradraksha.com"
            },
            client_details: client ? {
                business_name: client.business,
                client_name: client.name,
                address: client.address,
                email: client.email,
                phone: client.phone
            } : null,
            project_details: {
                project_name: "Service Delivery",
                project_type: "Digital Services",
                description: "Digital web services and setup"
            },
            payment_details: {
                payment_mode: "UPI",
                upi_id: "8310311290",
                payment_link: "https://upi.link/pradraksha"
            },
            terms_conditions: "1. Payments should be made within the due date.\n2. Interest of 12% per annum may be charged on late payments.\n3. Goods or services once delivered are non-refundable."
        };
    }

    // Resolve client details if missing but clientId is present
    if (!inv.client_details && (client || inv.clientId)) {
        const resolveClient = client || appState.clients.find(c => c.id === inv.clientId);
        if (resolveClient) {
            inv.client_details = {
                business_name: resolveClient.business || resolveClient.business_name || "Corporate Client",
                client_name: resolveClient.name || resolveClient.client_name || "",
                address: resolveClient.address || "",
                email: resolveClient.email || "",
                phone: resolveClient.phone || ""
            };
        }
    }

    // Resolve items list if invoice_items is missing/empty but legacy items is present
    if ((!inv.invoice_items || inv.invoice_items.length === 0) && inv.items) {
        inv.invoice_items = inv.items.map(it => ({
            service_name: it.description || it.service_name || "Service Item",
            quantity: it.quantity !== undefined ? it.quantity : 1,
            unit_price: it.unit_price !== undefined ? it.unit_price : (it.amount || 0),
            total: it.total !== undefined ? it.total : (it.amount || 0)
        }));
    }

    const subtotal = inv.subtotal || 0;
    const discount = inv.discount || 0;
    const taxPercent = inv.tax || 0;
    const taxAmount = (subtotal - discount) * (taxPercent / 100);
    const grandTotal = inv.grand_total || (subtotal - discount + taxAmount);
    const paidVal = inv.advance_received !== undefined ? inv.advance_received : (inv.paid || 0);
    const balance = inv.balance_due !== undefined ? inv.balance_due : Math.max(0, grandTotal - paidVal);
    
    const pDetails = inv.payment_details || {};
    const payMode = pDetails.payment_mode || (pDetails.bank_name ? "Bank" : "UPI");
    let paymentInstructionsHTML = "";
    if (payMode === "Cash") {
        paymentInstructionsHTML = `
            <div>Settlement Mode: <b>Cash / Self Settlement</b></div>
            <div style="color: #475569; margin-top: 4px;">Please settle the invoice amount directly in cash or offline physical transfer.</div>
        `;
    } else if (payMode === "Bank") {
        paymentInstructionsHTML = `
            <div>Bank Name: <b>${pDetails.bank_name || ''}</b></div>
            <div>Account No: <b>${pDetails.account_number || ''}</b></div>
            <div>IFSC Code: <b>${pDetails.ifsc || ''}</b></div>
            ${pDetails.upi_id ? `<div>UPI ID: <b>${pDetails.upi_id}</b></div>` : ''}
            ${pDetails.payment_link ? `<div style="margin-top: 6px;"><b>Gateway Link:</b> <a href="${pDetails.payment_link}" target="_blank" style="color: #2563eb; text-decoration: underline;">${pDetails.payment_link}</a></div>` : ''}
        `;
    } else {
        paymentInstructionsHTML = `
            <div>Settlement Mode: <b>UPI Transfer</b></div>
            <div>UPI ID / Number: <b>${pDetails.upi_id || '8310311290'}</b></div>
            ${pDetails.payment_link ? `<div style="margin-top: 6px;"><b>Gateway Link:</b> <a href="${pDetails.payment_link}" target="_blank" style="color: #2563eb; text-decoration: underline;">${pDetails.payment_link}</a></div>` : ''}
        `;
    }
    
    const div = document.createElement('div');
    div.className = 'print-template';
    
    let itemsHTML = "";
    (inv.invoice_items || []).forEach((item, index) => {
        itemsHTML += `
            <tr>
                <td style="width: 8%; text-align: center; padding: 8px 10px; vertical-align: middle;">${index + 1}</td>
                <td style="width: 45%; text-align: left; padding: 8px 10px; vertical-align: middle; word-wrap: break-word; white-space: normal;">
                    <div style="font-weight: 700; color: #0f172a; word-wrap: break-word; white-space: normal;">${item.service_name}</div>
                </td>
                <td style="width: 12%; text-align: center; padding: 8px 10px; vertical-align: middle;">${item.quantity || 1}</td>
                <td style="width: 20%; text-align: right; padding: 8px 10px; vertical-align: middle;">₹${(item.unit_price || 0).toLocaleString('en-IN')}</td>
                <td style="width: 15%; text-align: right; font-weight: 600; padding: 8px 10px; vertical-align: middle;">₹${(item.total || 0).toLocaleString('en-IN')}</td>
            </tr>
        `;
    });

    const statusMap = {
        'Draft': { bg: '#e2e8f0', color: '#475569', label: 'Draft' },
        'Pending': { bg: '#fef3c7', color: '#b45309', label: 'Pending Payment' },
        'Paid': { bg: '#d1fae5', color: '#065f46', label: 'Fully Paid' },
        'Overdue': { bg: '#fee2e2', color: '#991b1b', label: 'Overdue Dues' }
    };
    const currentStatus = statusMap[inv.status || 'Pending'] || statusMap['Pending'];
    
    div.innerHTML = `
        <div class="print-header">
            <div class="print-brand">
                <div class="print-brand-title" style="color: #1e3a8a; font-weight: 800; font-size: 20px;">${inv.company_details?.company_name || 'PRADRAKSHA GROUPS'}</div>
                <div class="print-brand-tagline" style="letter-spacing: 1px;">${inv.company_details?.website || 'www.pradraksha.com'}</div>
            </div>
            <div class="print-doc-meta" style="text-align: right;">
                <div style="display: inline-block; background: ${currentStatus.bg}; color: ${currentStatus.color}; padding: 0.25rem 0.75rem; border-radius: var(--radius-sm); font-size: 10px; font-weight: 700; text-transform: uppercase; margin-bottom: 0.5rem; letter-spacing: 0.5px;">
                    ${currentStatus.label}
                </div>
                <div class="print-doc-title" style="font-size: 22px; font-weight: 800; color: #0f172a; margin-top: 0.25rem;">INVOICE</div>
                <table style="display: inline-table; width: 240px; font-size: 10.5px; margin-top: 0.4rem; border-collapse: collapse; border: none; text-align: right;">
                    <tr>
                        <td style="width: 100px; text-align: left; color: #64748b; font-weight: 600; padding: 2px 0; border: none;">Invoice Ref:</td>
                        <td style="width: 140px; text-align: right; font-weight: 700; color: #0f172a; padding: 2px 0; border: none;">${inv.invoice_number}</td>
                    </tr>
                    <tr>
                        <td style="width: 100px; text-align: left; color: #64748b; font-weight: 600; padding: 2px 0; border: none;">Issued Date:</td>
                        <td style="width: 140px; text-align: right; font-weight: 700; color: #334155; padding: 2px 0; border: none;">${formatDateString(inv.invoice_date)}</td>
                    </tr>
                    <tr>
                        <td style="width: 100px; text-align: left; color: #64748b; font-weight: 600; padding: 2px 0; border: none;">Due Date:</td>
                        <td style="width: 140px; text-align: right; font-weight: 700; color: ${inv.status === 'Overdue' ? '#b91c1c' : '#334155'}; padding: 2px 0; border: none;">${inv.due_date ? formatDateString(inv.due_date) : 'On Receipt'}</td>
                    </tr>
                </table>
            </div>
        </div>

        <div class="print-addresses" style="font-size: 11px; margin-bottom: 20px; gap: 30px;">
            <div>
                <div class="print-address-title" style="font-weight: 700; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 2px;">Billing From</div>
                <div class="print-address-name" style="font-weight: 700; font-size: 12px; margin-top: 4px;">${inv.company_details?.company_name || 'Pradraksha Groups'}</div>
                <div style="color: #475569;">${inv.company_details?.address || ''}</div>
                <div style="color: #475569;">Email: ${inv.company_details?.email || ''} | Phone: ${inv.company_details?.phone || ''}</div>
            </div>
            <div>
                <div class="print-address-title" style="font-weight: 700; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 2px;">Invoiced To (Client)</div>
                <div class="print-address-name" style="font-weight: 700; font-size: 12px; margin-top: 4px;">${inv.client_details?.business_name || 'Corporate Client'}</div>
                <div style="color: #475569;">Attn: ${inv.client_details?.client_name || ''}</div>
                <div style="color: #475569;">${inv.client_details?.address || ''}</div>
                <div style="color: #475569;">Email: ${inv.client_details?.email || ''} | Phone: ${inv.client_details?.phone || ''}</div>
            </div>
        </div>

        ${inv.project_details?.project_name ? `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: var(--radius-sm); padding: 0.75rem 1rem; margin-bottom: 1.5rem; font-size: 11px;">
            <div style="font-weight: 700; color: #1e3a8a; text-transform: uppercase; font-size: 9px; letter-spacing: 0.5px; margin-bottom: 0.2rem;">Associated Project details</div>
            <div><b>Project Name:</b> ${inv.project_details.project_name} (${inv.project_details.project_type})</div>
            ${inv.project_details.description ? `<div style="color: #475569; margin-top: 0.2rem;"><b>Description:</b> ${inv.project_details.description}</div>` : ''}
        </div>
        ` : ''}

        <table class="print-table" style="font-size: 11px; margin-bottom: 20px; table-layout: fixed; width: 100%;">
            <thead>
                <tr>
                    <th style="width: 8%; text-align: center; padding: 8px 10px;">#</th>
                    <th style="width: 45%; text-align: left; padding: 8px 10px;">Product/Service Billing Description</th>
                    <th style="width: 12%; text-align: center; padding: 8px 10px;">Qty</th>
                    <th style="width: 20%; text-align: right; padding: 8px 10px;">Unit Rate</th>
                    <th style="width: 15%; text-align: right; padding: 8px 10px;">Amount (INR)</th>
                </tr>
            </thead>
            <tbody>
                ${itemsHTML}
            </tbody>
        </table>

        <div class="print-financial-summary" style="margin-top: 15px; font-size: 11px; display: table; width: 100%; border-spacing: 20px 0;">
            <div class="print-payment-instructions" style="display: table-cell; width: 55%; vertical-align: top; padding-right: 15px; box-sizing: border-box;">
                <div class="print-instructions-title" style="font-weight: 700; color: #1e3a8a;">Settlement Details</div>
                ${paymentInstructionsHTML}
                
                ${inv.notes ? `
                <div style="margin-top: 12px; background: #fffbeb; border: 1px solid #fde68a; border-radius: var(--radius-sm); padding: 8px 12px; color: #b45309; font-size: 10.5px; font-weight: 500; display: block; width: 100%; box-sizing: border-box; line-height: 1.4;">
                    <b style="color: #b45309; text-transform: uppercase; font-size: 9px; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">Remarks & Directives:</b>
                    <span>${inv.notes}</span>
                </div>
                ` : ''}
            </div>
            <div class="print-totals" style="display: table-cell; width: 40%; vertical-align: top; padding-left: 15px;">
                <table style="width: 100%; border-collapse: collapse; margin: 0; padding: 0; line-height: 1.55; border: none;">
                    <tr>
                        <td style="text-align: left; padding: 4px 0; color: #64748b; font-size: 11px; border: none; font-weight: 500;">Subtotal:</td>
                        <td style="text-align: right; padding: 4px 0; font-weight: 600; color: #334155; font-size: 11px; border: none;">₹${subtotal.toLocaleString('en-IN')}</td>
                    </tr>
                    <tr>
                        <td style="text-align: left; padding: 4px 0; color: #64748b; font-size: 11px; border: none; font-weight: 500;">Discount Applied:</td>
                        <td style="text-align: right; padding: 4px 0; font-weight: 600; color: #b91c1c; font-size: 11px; border: none;">- ₹${discount.toLocaleString('en-IN')}</td>
                    </tr>
                    <tr>
                        <td style="text-align: left; padding: 4px 0; color: #64748b; font-size: 11px; border: none; font-weight: 500;">GST/Tax Amount (${taxPercent}%):</td>
                        <td style="text-align: right; padding: 4px 0; font-weight: 600; color: #334155; font-size: 11px; border: none;">+ ₹${taxAmount.toLocaleString('en-IN')}</td>
                    </tr>
                    <tr>
                        <td style="text-align: left; padding: 6px 0 4px 0; font-weight: 700; color: #1e3a8a; font-size: 11px; border-top: 1px solid #cbd5e1; border-bottom: none;">Grand Total:</td>
                        <td style="text-align: right; padding: 6px 0 4px 0; font-weight: 700; color: #1e3a8a; font-size: 11px; border-top: 1px solid #cbd5e1; border-bottom: none;">₹${grandTotal.toLocaleString('en-IN')}</td>
                    </tr>
                    <tr>
                        <td style="text-align: left; padding: 4px 0; color: #64748b; font-size: 11px; border: none; font-weight: 500;">Advance / Deductions:</td>
                        <td style="text-align: right; padding: 4px 0; font-weight: 600; color: #059669; font-size: 11px; border: none;">₹${paidVal.toLocaleString('en-IN')}</td>
                    </tr>
                    <tr>
                        <td style="text-align: left; padding: 8px 0 4px 0; font-size: 14px; font-weight: 800; color: #1e3a8a; border-top: 1.8px solid #cbd5e1; border-bottom: none;">Balance Net Due:</td>
                        <td style="text-align: right; padding: 8px 0 4px 0; font-size: 14px; font-weight: 800; color: ${balance > 0 ? '#b45309' : '#059669'}; border-top: 1.8px solid #cbd5e1; border-bottom: none;">₹${balance.toLocaleString('en-IN')}</td>
                    </tr>
                </table>
            </div>
        </div>

        ${inv.terms_conditions ? `
        <div style="margin-top: 25px; border-top: 1.5px solid #cbd5e1; padding-top: 10px; font-size: 9.5px; color: #64748b; line-height: 1.5;">
            <div style="font-weight: 700; color: #475569; text-transform: uppercase; font-size: 8.5px; margin-bottom: 0.25rem;">Terms & Conditions</div>
            <div style="white-space: pre-wrap;">${inv.terms_conditions}</div>
        </div>
        ` : ''}

        <div class="print-agreement-signatures" style="margin-top: 35px; page-break-inside: avoid; gap: 40px;">
            <div class="print-sig-box" style="border: none;">
            </div>
            <div class="print-sig-box" style="border-top: 1px dashed #cbd5e1; padding-top: 6px; font-size:10px;">
                <div class="print-sig-title" style="font-size: 8.5px; color: #475569;">For ${inv.company_details?.company_name || 'PRADRAKSHA GROUPS'}</div>
                <div style="height: 25px;"></div>
                <div>Authorized Signatory (Finance Dept)</div>
            </div>
        </div>
    `;
    return div;
}

// PDF Export Helper to render standard A4 desktop sheets off-screen
function exportPaperElement(element, filename, forceSinglePage = false) {
    if (!element) return;
    
    // Create a hidden wrapper container to hold the paper offscreen without layout offsets
    const wrapper = document.createElement('div');
    wrapper.style.position = 'absolute';
    wrapper.style.left = '-9999px';
    wrapper.style.top = '0';
    wrapper.style.width = '794px';
    wrapper.style.overflow = 'hidden';
    wrapper.style.zIndex = '-9999';
    document.body.appendChild(wrapper);
    
    // Clone the element so we do not distort the visible preview
    const paper = element.cloneNode(true);
    wrapper.appendChild(paper);
    
    // Style as a standard A4 page (relative positioning to avoid html2canvas absolute/fixed bugs)
    paper.style.position = 'relative';
    paper.style.width = '794px';
    if (forceSinglePage) {
        paper.style.height = '1122px';
        paper.style.overflow = 'hidden';
    } else {
        paper.style.minHeight = '1122px';
    }
    paper.style.background = '#ffffff';
    paper.style.padding = '40px';
    paper.style.boxSizing = 'border-box';
    
    // Enforce high contrast text colors inside pdf, respecting custom inline styles
    const allText = paper.querySelectorAll('*');
    allText.forEach(el => {
        if (!el.style.color) {
            el.style.color = '#1e293b';
        }
    });
    
    const opt = {
        margin:       0, // Use 0 margin to prevent page breaking and scaling issues
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
                paper = assembleInvoiceHTML(inv, client);
                filename = `Invoice_${refId}_${client.business.replace(/\s+/g, '_')}.pdf`;
            }
        }
    }
    
    if (paper && filename) {
        exportPaperElement(paper, filename, type === 'invoice');
    }
}
window.triggerDocumentDownload = triggerDocumentDownload; // Bind globalChannels

// PDF Export triggers for Form Pages

document.getElementById('btn-agree-export').onclick = () => {
    if (!currentAgreeDraftElement) return;
    exportPaperElement(currentAgreeDraftElement, `Agreement_${currentAgreeClientName}.pdf`, false);
};

document.getElementById('btn-invoice-export').onclick = () => {
    if (!currentInvoiceDraftElement) return;
    exportPaperElement(currentInvoiceDraftElement, `Invoice_${currentInvoiceNumber}_${currentInvoiceClientName}.pdf`, true);
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
    invoiceTable.addRow("", 1, "");
    calculateInvoiceFormTotals();
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

function togglePaymentModeFields() {
    const modeSelect = document.getElementById('invoice-pay-mode');
    if (!modeSelect) return;
    const mode = modeSelect.value;
    const upiFields = document.getElementById('invoice-upi-fields');
    if (upiFields) {
        upiFields.style.display = mode === 'UPI' ? 'flex' : 'none';
    }
}
window.togglePaymentModeFields = togglePaymentModeFields;

function initInvoiceFormDefaults() {
    document.getElementById('invoice-date').value = new Date().toISOString().substring(0, 10);
    const baseNum = appState.invoices.length + 1;
    const padded = String(baseNum).padStart(3, '0');
    document.getElementById('invoice-num').value = `PR-2026-${padded}`;
    togglePaymentModeFields();
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
    
    // Live calculations event listeners for invoice discount, tax, and paid inputs
    const discountInput = document.getElementById('invoice-discount');
    const taxInput = document.getElementById('invoice-tax');
    const paidInput = document.getElementById('invoice-paid');
    
    if (discountInput) discountInput.addEventListener('input', calculateInvoiceFormTotals);
    if (taxInput) taxInput.addEventListener('input', calculateInvoiceFormTotals);
    if (paidInput) paidInput.addEventListener('input', calculateInvoiceFormTotals);
    
    // Enforce permanent prefix for Settlement Reference Notes
    const notesTextarea = document.getElementById('invoice-notes');
    if (notesTextarea) {
        const prefix = "to be paid with in date: ";
        notesTextarea.addEventListener('keydown', function(e) {
            const selectionStart = notesTextarea.selectionStart;
            const selectionEnd = notesTextarea.selectionEnd;
            if (e.key === 'Backspace' && selectionStart <= prefix.length && selectionEnd <= prefix.length) {
                e.preventDefault();
            }
            if (e.key === 'Delete' && selectionStart < prefix.length) {
                e.preventDefault();
            }
        });
        
        notesTextarea.addEventListener('input', function() {
            if (!notesTextarea.value.startsWith(prefix)) {
                notesTextarea.value = prefix;
            }
        });

        const datetimePicker = document.getElementById('invoice-notes-datetime');
        if (datetimePicker) {
            datetimePicker.addEventListener('input', function() {
                const val = datetimePicker.value;
                if (val) {
                    const dateObj = new Date(val);
                    const formatted = dateObj.toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                    });
                    notesTextarea.value = prefix + formatted;
                } else {
                    notesTextarea.value = prefix;
                }
            });
        }
    }
    
    renderQRCodeWidget();
    initThemeToggle();
    lucide.createIcons();
    updateAllViews();
});

// --- 13. MODERNIZATION & VIEW MODE FUNCTIONS ---
function initThemeToggle() {
    const savedTheme = localStorage.getItem('pradraksha_theme') || 'dark';
    setTheme(savedTheme);
    
    const toggleSidebar = document.getElementById('btn-toggle-theme-sidebar');
    const toggleHeader = document.getElementById('btn-toggle-theme-header');
    
    const handleToggle = () => {
        const currentTheme = document.body.classList.contains('light-theme') ? 'light' : 'dark';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        setTheme(newTheme);
    };
    
    if (toggleSidebar) toggleSidebar.onclick = handleToggle;
    if (toggleHeader) toggleHeader.onclick = handleToggle;
}

function setTheme(theme) {
    const toggleSidebar = document.getElementById('btn-toggle-theme-sidebar');
    const toggleHeader = document.getElementById('btn-toggle-theme-header');
    
    if (theme === 'light') {
        document.body.classList.add('light-theme');
        if (toggleSidebar) toggleSidebar.innerHTML = `<i data-lucide="moon" class="theme-icon" style="width: 14px; height: 14px;"></i>`;
        if (toggleHeader) toggleHeader.innerHTML = `<i data-lucide="moon" class="theme-icon" style="width: 14px; height: 14px;"></i>`;
        localStorage.setItem('pradraksha_theme', 'light');
    } else {
        document.body.classList.remove('light-theme');
        if (toggleSidebar) toggleSidebar.innerHTML = `<i data-lucide="sun" class="theme-icon" style="width: 14px; height: 14px;"></i>`;
        if (toggleHeader) toggleHeader.innerHTML = `<i data-lucide="sun" class="theme-icon" style="width: 14px; height: 14px;"></i>`;
        localStorage.setItem('pradraksha_theme', 'dark');
    }
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}


function setAgreementView(mode) {
    const container = document.getElementById('agreement-split-container');
    if (!container) return;
    container.classList.remove('view-mode-form', 'view-mode-preview');
    if (mode === 'form') container.classList.add('view-mode-form');
    if (mode === 'preview') container.classList.add('view-mode-preview');
    
    document.querySelectorAll('#section-agreements .view-toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-view') === mode);
    });
}
window.setAgreementView = setAgreementView;

function setInvoiceView(mode) {
    const container = document.getElementById('invoice-split-container');
    if (!container) return;
    container.classList.remove('view-mode-form', 'view-mode-preview');
    if (mode === 'form') container.classList.add('view-mode-form');
    if (mode === 'preview') container.classList.add('view-mode-preview');
    
    document.querySelectorAll('#section-invoices .view-toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-view') === mode);
    });
}
window.setInvoiceView = setInvoiceView;

