        // Set Chart defaults for dark theme
        Chart.defaults.color = '#6B7280';
        Chart.defaults.font.family = "'Inter', sans-serif";

        // 1. Cargo Weight Trends (Line Chart)
        const ctxWeight = document.getElementById('weightTrendChart').getContext('2d');
        const weightGradient = ctxWeight.createLinearGradient(0, 0, 0, 320);
        weightGradient.addColorStop(0, 'rgba(45, 212, 191, 0.2)');
        weightGradient.addColorStop(1, 'rgba(45, 212, 191, 0)');

        new Chart(ctxWeight, {
            type: 'line',
            data: {
                labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                datasets: [
                    {
                        label: 'Actual Weight',
                        data: [1200, 1900, 1500, 2400, 2100, 2800, 2300],
                        borderColor: '#2DD4BF',
                        borderWidth: 3,
                        tension: 0.4,
                        fill: true,
                        backgroundColor: weightGradient,
                        pointBackgroundColor: '#2DD4BF',
                        pointBorderColor: '#0B0E14',
                        pointBorderWidth: 2,
                        pointRadius: 4
                    },
                    {
                        label: 'Target',
                        data: [1500, 1500, 1500, 1500, 1500, 1500, 1500],
                        borderColor: '#374151',
                        borderDash: [5, 5],
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { grid: { color: '#1F2937' }, border: { display: false } },
                    x: { grid: { display: false } }
                }
            }
        });

        // 2. Incident Distribution (Doughnut)
        const ctxIncident = document.getElementById('incidentDistributionChart').getContext('2d');
        new Chart(ctxIncident, {
            type: 'doughnut',
            data: {
                labels: ['Normal', 'Overload', 'Loss'],
                datasets: [{
                    data: [54, 34, 12],
                    backgroundColor: ['#2DD4BF', '#F59E0B', '#EF4444'],
                    borderWidth: 0,
                    cutout: '80%',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });

        // 3. Zone Efficiency (Bar Chart)
        const ctxZone = document.getElementById('zoneEfficiencyChart').getContext('2d');
        new Chart(ctxZone, {
            type: 'bar',
            data: {
                labels: ['Zone A', 'Zone B', 'Zone C', 'Zone D', 'Zone E'],
                datasets: [{
                    label: 'Efficiency %',
                    data: [82, 94, 78, 88, 91],
                    backgroundColor: '#2DD4BF',
                    borderRadius: 6,
                    barThickness: 24
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { grid: { color: '#1F2937' }, border: { display: false }, min: 0, max: 100 },
                    x: { grid: { display: false } }
                }
            }
        });