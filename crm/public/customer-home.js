import {installCustomerAccount} from './customer-account.js';

let customerAccount;
const openCustomerAccount = async () => {
  if (!customerAccount) {
    customerAccount = installCustomerAccount({
      createAccountButton: false,
      showCheckoutAddressAction: false,
      notify: message => window.dispatchEvent(new CustomEvent('customer-account:notice',{detail:{message}})),
      onCustomer: () => window.dispatchEvent(new CustomEvent('customer-account:notice',{detail:{message:'Seus dados estão disponíveis. Escolha um cardápio para continuar um pedido.'}})),
    });
  }
  await customerAccount.openAccount();
};

window.addEventListener('customer-account:open',()=>{openCustomerAccount().catch(error=>console.error('Não foi possível abrir a Área do Cliente.',error));});
