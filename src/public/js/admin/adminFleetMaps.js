/* ==========================================================================
   LIVE COMMAND CENTER MAP LOGIC
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {

    // 1. INITIALIZE MAP
    // Focused on Rodriguez, Calabarzon as requested earlier
    const map = L.map('live-fleet-map', {
        zoomControl: false, 
        attributionControl: false
    }).setView([14.7319, 121.1446], 14);

    // 2. DARK MODE TILES (CartoDB Dark Matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
    }).addTo(map);

    // 3. CUSTOM ICON GENERATOR
    const createLiveIcon = (colorClass, isAlert = false) => {
        const ping = isAlert ? `<span class="animate-ping absolute inline-flex h-full w-full rounded-full ${colorClass} opacity-75"></span>` : '';
        return L.divIcon({
            className: 'custom-live-marker',
            html: `
                <div class="relative flex h-5 w-5">
                    ${ping}
                    <span class="relative inline-flex rounded-full h-5 w-5 ${colorClass} border-2 border-slate-900 shadow-lg"></span>
                </div>
            `,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });
    };

    // 4. ADD SAMPLE VEHICLES
    const vehicles = [
        { id: 'RC-8802', type: 'Trailer Truck', pos: [14.7335, 121.1470], status: 'active', color: 'bg-emerald-500' },
        { id: 'RC-0034', type: 'Reefer Truck', pos: [14.7298, 121.1423], status: 'alert', color: 'bg-rose-500' },
        { id: 'RC-9211', type: 'Small Truck', pos: [14.7351, 121.1409], status: 'active', color: 'bg-emerald-500' }
    ];

    vehicles.forEach(v => {
        const marker = L.marker(v.pos, { 
            icon: createLiveIcon(v.color, v.status === 'alert') 
        }).addTo(map);

        // Modern Popup Styling
        marker.bindPopup(`
            <div class="bg-slate-900 text-slate-200 p-1 min-w-[120px]">
                <p class="text-[10px] font-bold text-slate-500 uppercase mb-1">${v.type}</p>
                <p class="text-sm font-extrabold text-white mb-2">#${v.id}</p>
                <div class="flex flex-col gap-1">
                    <button onclick="window.location.href='/admin/fleet'" class="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-[9px] font-bold rounded transition text-center uppercase tracking-widest">View Details</button>
                </div>
            </div>
        `);
    });

    // 5. INJECT POPUP STYLING
    const style = document.createElement('style');
    style.innerHTML = `
        .leaflet-popup-content-wrapper, .leaflet-popup-tip {
            background: #0f172a !important;
            border: 1px solid #1e293b !important;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5) !important;
            color: #f8fafc !important;
        }
        .leaflet-popup-close-button { color: #64748b !important; }
    `;
    document.head.appendChild(style);
});