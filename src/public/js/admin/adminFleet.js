/* ==========================================================================
   1. SPARKLINE CHARTS (WEIGHT TRENDS)
   ========================================================================== */
document.addEventListener('DOMContentLoaded', function() {

    function createSparkline(id, data, hexColor) {
        const canvas = document.getElementById(id);
        if(!canvas) return; // Prevent errors if canvas isn't on screen
        const ctx = canvas.getContext('2d');
        
        // Create a subtle vertical gradient for the fill
        const gradient = ctx.createLinearGradient(0, 0, 0, 40);
        gradient.addColorStop(0, hexColor + '40'); // 25% opacity
        gradient.addColorStop(1, hexColor + '00'); // Transparent

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map((_, i) => i),
                datasets: [{
                    data: data,
                    borderColor: hexColor,
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 3,
                    pointBackgroundColor: '#0f172a', // slate-900
                    pointBorderColor: hexColor,
                    fill: true,
                    backgroundColor: gradient,
                    tension: 0.4 // Smooth curves
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
                scales: {
                    x: { display: false },
                    y: { 
                        display: false,
                        // Add a tiny bit of padding so line bounds don't get clipped
                        suggestedMin: Math.min(...data) - 10,
                        suggestedMax: Math.max(...data) + 10
                    }
                },
                layout: { padding: 2 }
            }
        });
    }

    // --- THEME COLORS ---
    const colors = {
        emerald: '#34d399', 
        rose: '#fb7185',    
        slate: '#64748b'    
    };

    // Initialize sparklines with new theme colors
    createSparkline('sparkline-1', [600, 700, 650, 850, 800, 920], colors.emerald);
    createSparkline('sparkline-2', [750, 750, 750, 750, 450, 450], colors.rose);
    createSparkline('sparkline-3', [0, 0, 0, 0, 0, 0], colors.slate);
});


/* ==========================================================================
   2. MODAL CONTROLS (VIEW, EDIT, DELETE)
   ========================================================================== */
// Called by the HTML buttons to open specific modals
window.toggleModal = function(modalId) {
    const overlay = document.getElementById('modalOverlay');
    const modal = document.getElementById(modalId);
    
    if (modal && overlay) {
        // Show elements
        overlay.classList.remove('hidden');
        modal.classList.remove('hidden');
        
        // Slight delay to allow CSS transitions to trigger
        setTimeout(() => {
            overlay.classList.remove('opacity-0');
            modal.classList.remove('opacity-0', 'scale-95');
            modal.classList.add('opacity-100', 'scale-100');
        }, 10);
    }
};

// Called by "Cancel" or "X" buttons to close everything
window.closeAllModals = function() {
    const overlay = document.getElementById('modalOverlay');
    const modals = document.querySelectorAll('[id$="Modal"]'); // Grabs viewModal, editModal, deleteModal
    
    // Fade out
    overlay.classList.add('opacity-0');
    modals.forEach(modal => {
        modal.classList.remove('opacity-100', 'scale-100');
        modal.classList.add('opacity-0', 'scale-95');
    });

    // Hide after transition completes
    setTimeout(() => {
        overlay.classList.add('hidden');
        modals.forEach(modal => modal.classList.add('hidden'));
    }, 300);
};


/* ==========================================================================
   3. DYNAMIC PAGINATION LOGIC
   ========================================================================== */
const totalItems = 114; // In reality, fetch this from your database
const itemsPerPage = 10;
const totalPages = Math.ceil(totalItems / itemsPerPage);

function renderPagination(currentPage) {
    const container = document.getElementById('pagination-controls');
    if (!container) return;

    let html = '';

    // Previous Button
    const prevDisabled = currentPage === 1;
    html += `<button onclick="goToPage(${currentPage - 1})" class="p-2 rounded-lg border border-slate-700 text-slate-400 transition ${prevDisabled ? 'opacity-50 cursor-not-allowed bg-slate-800/50' : 'hover:text-white hover:bg-slate-800'}" ${prevDisabled ? 'disabled' : ''}>
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
    </button>`;

    // Helper function to render a page number button
    const addPageBtn = (page) => {
        const isActive = page === currentPage;
        const activeClass = 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
        const inactiveClass = 'border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white';
        html += `<button onclick="goToPage(${page})" class="w-8 h-8 flex items-center justify-center rounded-lg border text-xs font-bold transition ${isActive ? activeClass : inactiveClass}">${page}</button>`;
    };

    // Helper for the "..." dots
    const addDots = () => {
        html += `<span class="w-8 h-8 flex items-center justify-center text-slate-600 text-xs font-bold">...</span>`;
    };

    // Pagination Display Logic
    if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) addPageBtn(i);
    } else {
        if (currentPage <= 4) {
            for (let i = 1; i <= 5; i++) addPageBtn(i);
            addDots();
            addPageBtn(totalPages);
        } else if (currentPage >= totalPages - 3) {
            addPageBtn(1);
            addDots();
            for (let i = totalPages - 4; i <= totalPages; i++) addPageBtn(i);
        } else {
            addPageBtn(1);
            addDots();
            addPageBtn(currentPage - 1);
            addPageBtn(currentPage);
            addPageBtn(currentPage + 1);
            addDots();
            addPageBtn(totalPages);
        }
    }

    // Next Button
    const nextDisabled = currentPage === totalPages;
    html += `<button onclick="goToPage(${currentPage + 1})" class="p-2 rounded-lg border border-slate-700 text-slate-400 transition ${nextDisabled ? 'opacity-50 cursor-not-allowed bg-slate-800/50' : 'hover:text-white hover:bg-slate-800'}" ${nextDisabled ? 'disabled' : ''}>
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
    </button>`;

    container.innerHTML = html;

    // Update the "Showing 1 to 10 of 114" text
    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);
    document.getElementById('pagination-info').innerHTML = `Showing <span class="text-white font-bold">${startItem}</span> to <span class="text-white font-bold">${endItem}</span> of <span class="text-white font-bold">${totalItems}</span> entries`;
}

window.goToPage = function(page) {
    if (page >= 1 && page <= totalPages) {
        renderPagination(page);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    renderPagination(1);
});


/* ==========================================================================
   4. BUTTON FILTER LOGIC (STATUS TABS)
   ========================================================================== */
window.filterFleet = function(filterType, clickedBtn) {
    // Reset all buttons to inactive
    const buttons = document.querySelectorAll('.filter-btn');
    buttons.forEach(btn => {
        if(btn.innerText.includes('Alerts')) {
            btn.className = "filter-btn px-4 py-2 bg-transparent text-rose-400 text-xs font-bold rounded-lg border border-transparent hover:bg-rose-500/10 transition flex items-center gap-2";
        } else if (btn.innerText.includes('Maintenance')) {
            btn.className = "filter-btn px-4 py-2 bg-transparent text-amber-400 text-xs font-bold rounded-lg border border-transparent hover:bg-amber-500/10 transition flex items-center gap-2";
        } else {
            btn.className = "filter-btn px-4 py-2 bg-transparent text-slate-400 text-xs font-bold rounded-lg border border-transparent hover:text-slate-200 transition";
        }
    });

    // Set clicked button to active style
    if(clickedBtn.innerText.includes('Alerts')) {
        clickedBtn.className = "filter-btn px-4 py-2 bg-rose-500/20 text-rose-400 text-xs font-bold rounded-lg border border-rose-500/50 transition flex items-center gap-2 shadow-[0_0_10px_rgba(244,63,94,0.2)]";
    } else if (clickedBtn.innerText.includes('Maintenance')) {
        clickedBtn.className = "filter-btn px-4 py-2 bg-amber-500/20 text-amber-400 text-xs font-bold rounded-lg border border-amber-500/50 transition flex items-center gap-2 shadow-[0_0_10px_rgba(245,158,11,0.2)]";
    } else {
        clickedBtn.className = "filter-btn px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-lg border border-slate-700 hover:bg-slate-700 transition shadow-md";
    }

    // Filter table rows based on button clicked
    const tableBody = document.getElementById('fleet-table-body');
    if (!tableBody) return;
    const rows = tableBody.getElementsByTagName('tr');

    Array.from(rows).forEach(row => {
        const rowText = row.textContent.toUpperCase();
        
        if (filterType === 'all') {
            row.style.display = '';
        } else if (filterType === 'active') {
            if (rowText.includes('IN TRANSIT') || rowText.includes('IDLE')) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        } else if (filterType === 'maintenance') {
            if (rowText.includes('MAINTENANCE')) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        } else if (filterType === 'alert') {
            if (rowText.includes('CARGO LOSS') || rowText.includes('ALERT')) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        }
    });
};


/* ==========================================================================
   5. REAL-TIME SEARCH FILTERING (SEARCH BAR)
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('fleetSearchInput');
    const tableBody = document.getElementById('fleet-table-body');
    
    if (searchInput && tableBody) {
        searchInput.addEventListener('keyup', function(e) {
            const searchTerm = e.target.value.toLowerCase();
            const rows = tableBody.getElementsByTagName('tr');

            Array.from(rows).forEach(row => {
                // Get all text content from the row and convert to lowercase
                const rowText = row.textContent.toLowerCase();
                
                // If the row text contains the search term, show it, otherwise hide it
                if (rowText.includes(searchTerm)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });
    }
});