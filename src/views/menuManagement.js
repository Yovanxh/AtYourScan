/**
 * src/views/menuManagement.js
 * 
 * Menu Management View with strict Admin-only conditional rendering of
 * the "AI Menu Auto-Import" feature.
 * 
 * Phase 1 Implementation:
 * - Validates currentUser and role from active auth store.
 * - Only mounts the "AI Menu Auto-Import" button into the DOM if role === 'admin'.
 * - Non-admin roles (Cashier, Server, Manager, Customer) never render the element into the DOM.
 */

import { renderMenuView } from '../components/MenuView.js';
import { renderMasterMenuIngestionModal } from '../components/MasterMenuIngestionModal.js';

export function renderMenuManagement(container, store, options = {}) {
  // Mount the base Menu View
  const cleanup = renderMenuView(container, store, options);

  // Phase 1: Conditional UI Rendering
  // Ensure currentUser and role are validated from the active auth store
  const currentUser = store?.currentStaff;
  const isAdmin = Boolean(currentUser && (currentUser.role === 'admin' || (currentUser.role || '').toLowerCase() === 'admin'));

  const actionToolbar = container.querySelector('#menu-action-toolbar') || container.querySelector('.menu-action-toolbar');

  if (actionToolbar) {
    // If not admin, ensure any pre-existing button is stripped out so there are no DOM leaks
    const existing = actionToolbar.querySelector('#btn-ai-menu-import');
    if (existing) existing.remove();

    if (isAdmin) {
      // Render the "AI Menu Auto-Import" button
      const aiImportBtn = document.createElement('button');
      aiImportBtn.id = 'btn-ai-menu-import';
      aiImportBtn.className = 'btn-emerald-capsule px-4 py-2.5 rounded-2xl text-xs font-black bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white active:scale-95 transition-all flex items-center gap-2 shadow-md shadow-emerald-600/20 cursor-pointer';
      aiImportBtn.innerHTML = `
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
        </svg>
        <span>AI Menu Auto-Import</span>
      `;

      function openAiMenuModal() {
        let modalLayer = document.getElementById('app-modal-layer');
        if (!modalLayer) {
          modalLayer = document.createElement('div');
          modalLayer.id = 'app-modal-layer';
          modalLayer.className = 'relative z-50';
          document.body?.appendChild(modalLayer);
        }
        renderMasterMenuIngestionModal(modalLayer, store, {
          onComplete: () => {
            renderMenuManagement(container, store, options);
          }
        });
      }

      aiImportBtn.addEventListener('click', openAiMenuModal);
      actionToolbar.prepend(aiImportBtn);
    }
    // If not admin, do not mount the element into the DOM at all
  }

  return cleanup;
}

export default renderMenuManagement;
