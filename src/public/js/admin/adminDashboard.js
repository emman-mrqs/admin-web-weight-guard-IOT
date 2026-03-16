document.addEventListener('DOMContentLoaded', function() {
    
    // Theme Colors (Mapped from Tailwind Slate/Emerald/Amber/Rose palette)
    const theme = {
        text: '#94a3b8',       // slate-400
        grid: '#1e293b',       // slate-800
        bg: '#0f172a',         // slate-900 (Card background)
        emerald: '#34d399',    // emerald-400
        amber: '#fbbf24',      // amber-400
        rose: '#fb7185'        // rose-400
    };

    // Set global Chart.js defaults for text
    Chart.defaults.color = theme.text;
    Chart.defaults.font.family = "'Inter', 'sans-serif'"; // Adjust if you use a specific font

    /* ==========================================
       1. Cargo Weight Line Chart
       ========================================== */
    const weightCtx = document.getElementById('cargoWeightChart').getContext('2d');
    
    // Create a smooth, glowing gradient for the area under the line
    const gradientFill = weightCtx.createLinearGradient(0, 0, 0, 250);
    gradientFill.addColorStop(0, 'rgba(52, 211, 153, 0.4)'); // Emerald-400 at 40% opacity
    gradientFill.addColorStop(1, 'rgba(52, 211, 153, 0.0)'); // Fades to transparent

    new Chart(weightCtx, {
        type: 'line',
        data: {
            labels: ['18:00', '19:30', '21:00', '22:30', '00:00', '01:30', '03:00', '04:30', '06:00'],
            datasets: [{
                label: 'Fleet Average Weight (tons)',
                data: [650, 720, 680, 850, 780, 810, 760, 790, 820],
                borderColor: theme.emerald,
                backgroundColor: gradientFill,
                borderWidth: 3,
                tension: 0.4, // This makes the line beautifully curved instead of jagged
                fill: true,
                pointBackgroundColor: theme.bg,
                pointBorderColor: theme.emerald,
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }, // Hidden since we have custom HTML headers
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)', // slate-900
                    titleColor: '#f8fafc',
                    bodyColor: '#cbd5e1',
                    borderColor: '#334155', // slate-700
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    grid: {
                        color: theme.grid,
                        drawBorder: false, // Removes the solid axis line
                    },
                    ticks: { padding: 10 }
                },
                x: {
                    grid: {
                        display: false, // Hides vertical grid lines for a cleaner look
                        drawBorder: false,
                    },
                    ticks: { padding: 10 }
                }
            }
        }
    });

    /* ==========================================
       2. Fleet Status Doughnut Chart
       ========================================== */
    const fleetCtx = document.getElementById('fleetStatusChart').getContext('2d');

    new Chart(fleetCtx, {
        type: 'doughnut',
        data: {
            labels: ['Normal Capacity', 'Overloaded', 'Potential Loss'],
            datasets: [{
                data: [84, 26, 10], // Matches your HTML stats
                backgroundColor: [
                    theme.emerald,
                    theme.amber,
                    theme.rose
                ],
                // The border creates a gap between segments matching the dark background
                borderColor: theme.bg, 
                borderWidth: 6,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '78%', // Makes the doughnut thin to allow room for the center text
            plugins: {
                legend: { display: false }, // We use custom HTML legend/stats
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleColor: '#f8fafc',
                    bodyColor: '#cbd5e1',
                    borderColor: '#334155',
                    borderWidth: 1,
                    padding: 12
                }
            }
        }
    });
});