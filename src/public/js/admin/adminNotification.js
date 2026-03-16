  // Modal Logic
        function openModal(modalId) {
            const overlay = document.getElementById('modalOverlay');
            const modal = document.getElementById(modalId);
            
            overlay.classList.remove('hidden');
            modal.classList.remove('hidden');
            
            setTimeout(() => {
                overlay.classList.remove('opacity-0');
                modal.classList.remove('opacity-0', 'scale-95');
                modal.classList.add('opacity-100', 'scale-100');
            }, 10);
        }

        function closeAllModals() {
            const overlay = document.getElementById('modalOverlay');
            const modals = document.querySelectorAll('[id$="Modal"]'); 
            
            overlay.classList.add('opacity-0');
            modals.forEach(modal => {
                modal.classList.remove('opacity-100', 'scale-100');
                modal.classList.add('opacity-0', 'scale-95');
            });

            setTimeout(() => {
                overlay.classList.add('hidden');
                modals.forEach(modal => modal.classList.add('hidden'));
            }, 300);
        }

        function closeModal(modalId) {
            closeAllModals(); // For simplicity, just close all
        }

        // Tab Logic
        function switchTab(tabName) {
            const btnInbox = document.getElementById('tabInbox');
            const btnSent = document.getElementById('tabSent');
            const tableInbox = document.getElementById('inboxTable');
            const tableSent = document.getElementById('sentTable');

            if(tabName === 'inbox') {
                // Active Inbox
                btnInbox.className = "flex-1 py-4 text-sm font-bold border-b-2 border-emerald-400 text-emerald-400 transition bg-emerald-500/5";
                // Inactive Sent
                btnSent.className = "flex-1 py-4 text-sm font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-300 transition hover:bg-slate-800/30";
                
                tableInbox.classList.remove('hidden');
                tableSent.classList.add('hidden');
            } else {
                // Active Sent
                btnSent.className = "flex-1 py-4 text-sm font-bold border-b-2 border-blue-400 text-blue-400 transition bg-blue-500/5";
                // Inactive Inbox
                btnInbox.className = "flex-1 py-4 text-sm font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-300 transition hover:bg-slate-800/30";
                
                tableSent.classList.remove('hidden');
                tableInbox.classList.add('hidden');
            }
        }

        // Mark as Read
        function markAllAsRead() {
            // Visually remove all the pulsing unread dots from the DOM
            const unreadDots = document.querySelectorAll('td .bg-blue-500, td .bg-rose-500');
            unreadDots.forEach(dot => {
                if(dot.classList.contains('animate-pulse')) {
                    dot.parentElement.innerHTML = ''; // Clear the table cell
                }
            });
            
            // Clear hover backgrounds on unread rows
            const unreadRows = document.querySelectorAll('.bg-blue-500\\/5, .bg-rose-500\\/5');
            unreadRows.forEach(row => {
                row.classList.remove('bg-blue-500/5', 'bg-rose-500/5', 'hover:bg-blue-500/10', 'hover:bg-rose-500/10');
                row.classList.add('hover:bg-slate-800/40');
            });
        }