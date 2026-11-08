/* Presentation-only viewport/focus support. No checkout/session/payment state. */
(() => {
    const dialogs = [...document.querySelectorAll('[data-checkout-dialog]')];
    let active = null;
    let returnFocus = null;
    let savedOverflow = '';
    const isOpen = dialog => !dialog.classList.contains('hidden');
    const syncViewport = () => {
        const viewport = window.visualViewport;
        for (const dialog of dialogs) {
            dialog.style.setProperty('--checkout-viewport-height', `${viewport?.height || window.innerHeight}px`);
            dialog.style.setProperty('--checkout-viewport-top', `${viewport?.offsetTop || 0}px`);
        }
    };
    const syncDialog = () => {
        const next = dialogs.find(isOpen) || null;
        if (next === active) return;
        if (next) {
            if (!active) {
                returnFocus = document.activeElement;
                savedOverflow = document.body.style.overflow;
                document.body.style.overflow = 'hidden';
            }
            active = next;
            syncViewport();
            if (!next.contains(document.activeElement)) next.querySelector('.checkout-dialog-header button')?.focus({preventScroll: true});
        } else {
            active = null;
            document.body.style.overflow = savedOverflow;
            // A checkout transition may already have focused the next modal.
            if (dialogs.some(dialog => dialog.contains(document.activeElement)) && returnFocus?.isConnected) returnFocus.focus({preventScroll: true});
            returnFocus = null;
        }
    };
    for (const dialog of dialogs) new MutationObserver(syncDialog).observe(dialog, {attributes: true, attributeFilter: ['class']});
    window.addEventListener('resize', syncViewport);
    window.visualViewport?.addEventListener('resize', syncViewport);
    window.visualViewport?.addEventListener('scroll', syncViewport);
    document.addEventListener('keydown', event => {
        if (!active || event.defaultPrevented || !active.contains(document.activeElement)) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            active.querySelector('[aria-label="Fechar checkout"]')?.click();
        } else if (event.key === 'Tab') {
            const controls = [...active.querySelectorAll('button, input, select, textarea, a[href], [tabindex="0"]')]
                .filter(node => !node.disabled && !node.hidden && node.getClientRects().length);
            const first = controls[0], last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
    });
    document.addEventListener('focusin', event => {
        if (active?.querySelector('.checkout-dialog-content')?.contains(event.target)) {
            requestAnimationFrame(() => { if (active?.contains(event.target)) event.target.scrollIntoView({block: 'nearest'}); });
        }
    });
    // Keep existing toast validation messages readable above the fixed-in-panel action.
    const toast = document.getElementById('toast');
    if (toast) new MutationObserver(() => {
        for (const dialog of dialogs) {
            const feedback = dialog.querySelector('.checkout-dialog-feedback');
            const message = isOpen(dialog) && !toast.classList.contains('hidden') ? document.getElementById('toast-message')?.textContent : '';
            feedback.textContent = message || '';
            feedback.hidden = !message;
        }
    }).observe(toast, {attributes: true, attributeFilter: ['class'], childList: true, subtree: true, characterData: true});
    syncViewport();
    syncDialog();
})();
