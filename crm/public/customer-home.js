// The application owns Customer routing. Public menus retain their account modal.
window.addEventListener('customer-account:open', () => window.location.assign('/minha-conta'));
