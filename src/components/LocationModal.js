/**
 * src/components/LocationModal.js
 * Café Location, Commercial Name & Branch Switcher Modal
 */

export function renderLocationModal(container, store, options = {}) {
  if (!container || !store) return;
  const venue = store.venue || {};
  const currentName = venue.name && venue.name !== 'Registered Cafe' ? venue.name : 'First Way Cafe';
  const currentSlug = venue.slug || venue.id || 'first-way-cafe';
  const currentUpi = venue.upi_id || 'vanshwaghre-1@okicici';
  const cafesList = Array.isArray(store.cafes) && store.cafes.length > 0 ? store.cafes : (Array.isArray(store.tenants) ? store.tenants : []);

  container.innerHTML = `
    <div id="modal-location-backdrop" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div class="bg-[#181C2E] border border-white/10 rounded-3xl w-full max-w-lg p-6 shadow-2xl text-white relative">
        <button id="btn-close-location-modal" class="absolute top-5 right-5 text-zinc-400 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors text-lg cursor-pointer">
          ✕
        </button>

        <div class="flex items-center gap-3 mb-5">
          <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#FF7622] to-amber-500 flex items-center justify-center text-2xl shadow-lg shadow-orange-500/30">
            🍽️
          </div>
          <div>
            <h3 class="text-lg font-black text-white">Café Location & Branding</h3>
            <p class="text-xs text-zinc-400">View and update your active registered café profile</p>
          </div>
        </div>

        <!-- Rename Cafe Form -->
        <div class="bg-black/30 border border-white/5 rounded-2xl p-4 mb-4">
          <label class="block text-xs font-bold text-zinc-300 mb-1.5">Registered Café Display Name</label>
          <div class="flex gap-2">
            <input 
              id="input-edit-cafe-name" 
              type="text" 
              value="${currentName}" 
              placeholder="Enter your café commercial name" 
              class="flex-1 bg-[#111115] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#FF7622] transition-colors"
            />
            <button 
              id="btn-save-cafe-name" 
              class="px-4 py-2.5 bg-[#FF7622] hover:bg-[#FF8C42] active:scale-95 text-white text-xs font-black rounded-xl shadow-md shadow-orange-500/20 transition-all cursor-pointer whitespace-nowrap"
            >
              Save Name
            </button>
          </div>
          <p id="location-name-status" class="text-[11px] text-emerald-400 mt-2 hidden"></p>
        </div>

        <!-- Venue Technical Metadata -->
        <div class="grid grid-cols-2 gap-3 text-xs mb-5">
          <div class="bg-[#111115] border border-white/5 rounded-xl p-3">
            <span class="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Café ID</span>
            <span class="font-mono text-zinc-200 text-[11px] truncate block">${venue.id || 'cafe-first-way-cafe-hotc'}</span>
          </div>
          <div class="bg-[#111115] border border-white/5 rounded-xl p-3">
            <span class="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">UPI Payment VPA</span>
            <span class="font-mono text-emerald-400 text-[11px] truncate block">${currentUpi}</span>
          </div>
        </div>

        <!-- Registered Cafes Switcher (if multiple exist) -->
        ${cafesList.length > 1 ? `
          <div class="mb-4">
            <span class="text-xs font-bold text-zinc-300 block mb-2">Switch Active Branch / Café:</span>
            <div class="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              ${cafesList.map(c => `
                <div class="flex items-center justify-between p-2.5 rounded-xl border ${c.id === venue.id ? 'bg-[#FF7622]/15 border-[#FF7622]/40 text-white' : 'bg-[#111115] border-white/5 text-zinc-300 hover:border-white/20'} transition-all">
                  <div>
                    <span class="font-bold text-xs block">${c.name}</span>
                    <span class="text-[10px] text-zinc-400">${c.slug || c.id}</span>
                  </div>
                  ${c.id === venue.id ? `
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FF7622] text-white">Active</span>
                  ` : `
                    <button data-switch-cafe-id="${c.id}" class="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold transition-colors cursor-pointer">
                      Switch
                    </button>
                  `}
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div class="flex justify-end pt-2 border-t border-white/10">
          <button id="btn-done-location-modal" class="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-zinc-200 text-xs font-bold transition-all cursor-pointer">
            Done
          </button>
        </div>
      </div>
    </div>
  `;

  // Bind actions
  const close = () => {
    container.innerHTML = '';
    options.onClose?.();
  };

  container.querySelector('#modal-location-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-location-backdrop') close();
  });
  container.querySelector('#btn-close-location-modal')?.addEventListener('click', close);
  container.querySelector('#btn-done-location-modal')?.addEventListener('click', close);

  const saveBtn = container.querySelector('#btn-save-cafe-name');
  const nameInput = container.querySelector('#input-edit-cafe-name');
  const statusEl = container.querySelector('#location-name-status');

  saveBtn?.addEventListener('click', async () => {
    const newName = nameInput?.value?.trim();
    if (!newName) return;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    try {
      if (typeof store.updateCafeName === 'function') {
        await store.updateCafeName(newName);
      } else {
        if (!store.venue) store.venue = {};
        store.venue.name = newName;
        store.save?.('ays_venue', store.venue);
        store.notify?.({ type: 'VENUE_UPDATED', venue: store.venue });
      }
      if (statusEl) {
        statusEl.textContent = `✓ Café name updated to "${newName}"!`;
        statusEl.classList.remove('hidden');
      }
      saveBtn.textContent = 'Saved!';
      setTimeout(() => {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Name';
      }, 1500);
    } catch (e) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Name';
    }
  });

  container.querySelectorAll('[data-switch-cafe-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-switch-cafe-id');
      if (targetId && typeof store.activateCafeEnvironment === 'function') {
        store.activateCafeEnvironment(targetId);
        close();
      }
    });
  });
}
