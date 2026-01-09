const CONFIG = {
    sheetId: '1yJ1JnPy0xrlLFHj5QTr0We-m7uGzIg8sftm_UnHkJ6o',
    tabs: {
        restaurants: { gid: '0', label: 'Restaurants' },
        butchers: { gid: '1152193421', label: 'Butchers' },
        suppliers: { gid: '1315902036', label: 'Meat Suppliers' },
        general: { gid: '813162340', label: 'General Foods' }
    }
};

// ... (rest of config)

// Logic Update in createCard


const STATE = {
    currentTab: 'restaurants',
    data: [], // Current tab data
    cache: {} // Cache for switching tabs without refetch
};

// DOM Elements
const elements = {
    tabs: document.querySelectorAll('.tab-btn'),
    dataList: document.getElementById('dataList'),
    loading: document.getElementById('loadingState'),
    error: document.getElementById('errorState'),
    search: document.getElementById('searchInput'),
    searchStats: document.getElementById('searchStats')
};

// Initialize
function init() {
    setupTabs();
    setupSearch();
    setupTheme();
    loadTab('restaurants');
}

function setupTheme() {
    const toggleBtn = document.getElementById('themeToggle');
    const savedTheme = localStorage.getItem('theme');

    // Apply saved theme
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        // Update icon to sun
        toggleBtn.innerHTML = '<i data-lucide="sun"></i>';
    }

    toggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');

        // Save preference
        localStorage.setItem('theme', isDark ? 'dark' : 'light');

        // Toggle Icon
        toggleBtn.innerHTML = isDark
            ? '<i data-lucide="sun"></i>'
            : '<i data-lucide="moon"></i>';

        // Re-render icons since we replaced innerHTML
        if (window.lucide) window.lucide.createIcons();
    });
}

// Event Listeners
function setupTabs() {
    elements.tabs.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            if (tab !== STATE.currentTab) {
                // Update UI
                elements.tabs.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Clear Search and Stats
                elements.search.value = '';
                elements.searchStats.classList.add('hidden');
                elements.searchStats.textContent = '';

                // Load Data
                loadTab(tab);
            }
        });
    });
}

function setupSearch() {
    elements.search.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const filtered = filterData(STATE.data, query);
        renderData(filtered);

        // Update Stats
        if (query.length > 0) {
            elements.searchStats.classList.remove('hidden');
            const count = filtered.length;
            elements.searchStats.textContent = `${count} result${count !== 1 ? 's' : ''} found`;
        } else {
            elements.searchStats.classList.add('hidden');
        }
    });
}

// Data Fetching
async function loadTab(tabKey) {
    STATE.currentTab = tabKey;
    showLoading();

    // Check cache first
    if (STATE.cache[tabKey]) {
        STATE.data = STATE.cache[tabKey];
        renderData(STATE.data);
        return;
    }

    const gid = CONFIG.tabs[tabKey].gid;
    const directUrl = `https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/export?format=csv&gid=${gid}`;

    // Attempt fetch with fallback proxies
    fetchWithProxy(directUrl, (data) => {
        // Success callback
        processData(data, tabKey);
    }, () => {
        // Failure callback
        showError();
    });
}

function fetchWithProxy(targetUrl, onSuccess, onFailure) {
    // List of proxies to try in order
    // Note: AllOrigins raw is usually most reliable for simple text
    const proxies = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
        `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
        `https://thingproxy.freeboard.io/fetch/${targetUrl}`
    ];

    let attempt = 0;

    function tryNext() {
        if (attempt >= proxies.length) {
            console.error('All proxies failed');
            onFailure();
            return;
        }

        const url = proxies[attempt];
        attempt++;

        // Use fetch with a timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 sec timeout per proxy

        fetch(url, { signal: controller.signal })
            .then(response => {
                if (!response.ok) throw new Error('Network response was not ok');
                return response.text();
            })
            .then(csvText => {
                clearTimeout(timeoutId);
                // Parse the CSV text
                Papa.parse(csvText, {
                    header: false,
                    skipEmptyLines: true,
                    complete: (results) => {
                        if (results.data && results.data.length > 0) {
                            onSuccess(results.data);
                        } else {
                            throw new Error('Empty data'); // Trigger next proxy
                        }
                    },
                    error: (e) => { throw e; }
                });
            })
            .catch(err => {
                clearTimeout(timeoutId);
                console.warn(`Proxy ${attempt} (${url}) failed:`, err);
                tryNext();
            });
    }

    tryNext();
}

function processData(rows, tabKey) {
    if (!rows || rows.length === 0) {
        showError();
        return;
    }

    // Find the header row (contains "Status" AND "Name" - case insensitive)
    const headerIndex = rows.findIndex(row =>
        row.some(cell => cell && typeof cell === 'string' && cell.toLowerCase().includes('status')) &&
        row.some(cell => cell && typeof cell === 'string' && (cell.toLowerCase().includes('name') || cell.toLowerCase().includes('brand')))
    );

    if (headerIndex === -1) {
        console.warn('Could not detect header row automatically. Using raw data.');
        showError();
        return;
    }

    // Extract headers and data
    const headers = rows[headerIndex].map(h => h.trim());
    const dataRows = rows.slice(headerIndex + 1);

    const processedData = dataRows.map(row => {
        const item = {};
        headers.forEach((header, index) => {
            if (header) {
                item[header] = row[index] || '';
            }
        });
        return item;
    }).filter(item => {
        // Filter out empty entries (must have a name)
        const name = item['Restaurant Name'] || item['Butcher Name'] || item['Brand'] || item['Supplier name'] || '';
        return name.length > 1;
    });

    STATE.data = processedData;
    STATE.cache[tabKey] = processedData;
    renderData(processedData);
}

// Old load function wrapper to match structure (deleted old Papa.parse inside loadTab)
// We need to clean up loadTab to remove the old Papa.parse block.
/* logic is handled above by replacing lines 140-194 */


// Rendering
function renderData(data) {
    elements.loading.classList.add('hidden');
    elements.error.classList.add('hidden');
    elements.dataList.innerHTML = '';

    if (data.length === 0) {
        elements.dataList.innerHTML = '<div class="state-view"><p>No results found.</p></div>';
        return;
    }

    data.forEach((item, index) => {
        const card = createCard(item);
        elements.dataList.appendChild(card);

        // Add staggered animation delay
        const cardElement = card.querySelector('.item-card');
        if (cardElement) {
            cardElement.style.animationDelay = `${index * 0.05}s`;
        }
    });

    // Refresh icons
    if (window.lucide) window.lucide.createIcons();
}

function filterData(data, query) {
    if (!query) return data;
    return data.filter(item => {
        return Object.values(item).some(val =>
            String(val).toLowerCase().includes(query)
        );
    });
}

function createCard(item) {
    // Identify fields dynamically based on tab
    let name = item['Restaurant Name'] || item['Butcher Name'] || item['Supplier name'];

    // Specific handling for General Foods (Brand + Food Item)
    if (!name) {
        if (item['Food Item'] && item['Brand']) {
            name = `${item['Food Item']} by ${item['Brand']}`;
        } else {
            name = item['Brand'] || 'Unknown';
        }
    }

    // Fallback if keys are messed up due to header parsing issues
    if (name === 'Unknown') {
        const keys = Object.keys(item);
        for (let k of keys) {
            if (k.toLowerCase().includes('name') || k.toLowerCase().includes('brand')) {
                name = item[k];
                break;
            }
        }
        if (name === 'Unknown') name = Object.values(item)[0];
    }

    let status = item['Status'] || 'Unknown';
    // Handle multi-line header for butchers: "Contact Details\n(Address, Phone, Website)"
    // We check for exact match first, then partial match
    let contactKey = 'Contact Details (Address, Phone, Website)';
    if (!item[contactKey]) {
        // Try finding a key that starts with "Contact Details"
        const possibleKey = Object.keys(item).find(k => k.startsWith('Contact Details'));
        if (possibleKey) contactKey = possibleKey;
    }

    let address = item['Address'] || item['Location'] || item[contactKey] || '';

    // Specific Fields
    let supplier = item['Supplier'] || item['Meat Supplier'] || '';
    let meatSource = item['Meat Source'] || '';
    let chickenSource = item['Chicken Source'] || item['Chicken Supplier'] || '';
    let lastContacted = item['Last Contacted'] || item['Last Contact'] || '';
    let notes = item['Notes'] || item['Notes & other enquiry details'] || '';

    // Status Styling & Info Logic
    let statusClass = 'status-badge';
    let statusDesc = '';
    const s = status.toLowerCase();

    if (s.includes('verified') || s.includes('fully fits criteria')) {
        statusClass += ' status-verified';
        statusDesc = s.includes('fully fits')
            ? "This supplier fully meets our Halal/Hand Slaughtered criteria."
            : "Both the supplier and the seller have been verified by our team OR The product does not contain any problematic ingredients.";
    } else if (s.includes('confirmed')) {
        statusClass += ' status-confirmed';
        statusDesc = "Either the supplier or seller have confirmed that this business is halal/HS, and we are awaiting confirmation from the other party.";
    } else if (s.includes('pending')) {
        statusClass += ' status-pending';
        statusDesc = "We have received a new entry and are currently looking to confirm the status of this business/product.";
    } else if (s.includes('issues') || s.includes('does not fit criteria') || s.includes('doubtful')) {
        statusClass += ' status-issues';
        statusDesc = s.includes('does not fit')
            ? "This supplier does not meet our Halal/Hand Slaughtered criteria."
            : "A company which previously supplied a halal product may now use impermissible ingredients/non HS meat OR A restaurant/butcher will not confirm their supplier OR A product contains impermissible ingredients.";
    } else if (s.includes('partially') || s.includes('somewhat fits criteria')) {
        statusClass += ' status-partial';
        statusDesc = s.includes('somewhat fits')
            ? "This supplier meets some but not all of our strict criteria."
            : "A restaurant provides some halal/HS meat, but there is a risk of cross contamination with non-HS or non-halal meat, they sell haram products, etc OR Some varieties/flavours of a product are halal, but not all.";
    }

    const fragment = document.createRange().createContextualFragment(`
        <div class="item-card">
            <div class="item-header">
                <h3 class="item-name">${name}</h3>
                <div class="status-wrapper">
                    ${statusDesc ? `
                    <div class="info-icon" onclick="toggleTooltip(this)">
                        <i data-lucide="info"></i>
                        <div class="tooltip-text">${statusDesc}</div>
                    </div>` : ''}
                    <span class="${statusClass}">${status}</span>
                </div>
            </div>
            <div class="item-meta">
                ${address ? `
                <div class="meta-row">
                    <i data-lucide="map-pin"></i>
                    <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ' ' + address)}" 
                       target="_blank" 
                       class="text-link"
                       style="white-space: pre-line;">${address}</a>
                </div>` : ''}

                ${supplier ? `
                <div class="meta-row">
                    <i data-lucide="truck"></i>
                    <span>Supplier: ${supplier}</span>
                </div>` : ''}

                ${meatSource ? `
                <div class="meta-row">
                    <i data-lucide="beef"></i>
                    <span>Red Meat: ${meatSource}</span>
                </div>` : ''}

                ${chickenSource ? `
                <div class="meta-row">
                    <i data-lucide="drumstick"></i>
                    <span>Chicken: ${chickenSource}</span>
                </div>` : ''}

                 ${lastContacted ? `
                <div class="meta-row">
                    <i data-lucide="phone"></i>
                    <span>Last Contacted: ${lastContacted}</span>
                </div>` : ''}
                
                ${notes ? `
                <div class="meta-separator"></div>
                ${(() => {
                let noteContent = notes;
                let isLink = false;

                if (STATE.currentTab === 'general') {
                    isLink = true;
                    // specific formatting: newline after 'pdf', newline before 'Refer'
                    noteContent = noteContent
                        .replace(/(pdf)/gi, '$1\n')
                        .replace(/(Refer)/g, '\n$1');
                }

                return `
                    <div class="meta-row">
                        <i data-lucide="file-text"></i>
                        ${isLink
                        ? `<a href="https://drive.google.com/drive/u/0/folders/1RYeVnPILXRJWGsPtsD8Ewvw5LrPAeXkX" target="_blank" class="text-link" style="white-space: pre-line;">${noteContent}</a>`
                        : `<span>${noteContent}</span>`}
                    </div>`;
            })()}
                ` : ''}
            </div>
        </div>
    `);

    return fragment;
}

// Tooltip Logic
window.toggleTooltip = function (element) {
    console.log('Tooltip clicked', element);
    // Close other tooltips first
    const allTooltips = document.querySelectorAll('.tooltip-text.active');
    allTooltips.forEach(t => {
        if (t.parentElement !== element) {
            t.classList.remove('active');
        }
    });

    // Toggle current
    const tooltip = element.querySelector('.tooltip-text');
    if (tooltip) {
        tooltip.classList.toggle('active');
    }

    // Stop propagation so the document click listener doesn't immediately close it
    if (window.event) {
        window.event.stopPropagation();
    }
};

// Close tooltips when clicking outside
document.addEventListener('click', (e) => {
    // If we didn't click inside an info-icon, close all tooltips
    if (!e.target.closest('.info-icon')) {
        document.querySelectorAll('.tooltip-text.active').forEach(el => {
            el.classList.remove('active');
        });
    }
});

// Helpers
function showLoading() {
    elements.loading.classList.remove('hidden');
    elements.error.classList.add('hidden');
    elements.dataList.innerHTML = '';
}

function showError() {
    elements.loading.classList.add('hidden');
    elements.error.classList.remove('hidden');
}

// Start
init();
