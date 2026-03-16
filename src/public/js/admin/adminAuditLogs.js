        function openAuditModal(event, actor, ip, time, agent, desc) {
            // Populate Modal Data
            document.getElementById('modal-event').textContent = event;
            document.getElementById('modal-actor').textContent = actor;
            document.getElementById('modal-ip').textContent = ip;
            document.getElementById('modal-time').textContent = time;
            document.getElementById('modal-agent').textContent = agent;
            document.getElementById('modal-desc').textContent = desc;

            // Trigger animations
            const overlay = document.getElementById('modalOverlay');
            const modal = document.getElementById('auditContextModal');
            
            overlay.classList.remove('hidden');
            modal.classList.remove('hidden');
            
            setTimeout(() => {
                overlay.classList.remove('opacity-0');
                modal.classList.remove('opacity-0', 'scale-95');
                modal.classList.add('opacity-100', 'scale-100');
            }, 10);
        }

        function closeAuditModal() {
            const overlay = document.getElementById('modalOverlay');
            const modal = document.getElementById('auditContextModal');
            
            overlay.classList.add('opacity-0');
            modal.classList.remove('opacity-100', 'scale-100');
            modal.classList.add('opacity-0', 'scale-95');

            setTimeout(() => {
                overlay.classList.add('hidden');
                modal.classList.add('hidden');
            }, 300);
        }