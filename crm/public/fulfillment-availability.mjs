// Public projection only. An enabled delivery option still requires server readiness.
export function fulfillmentBanner(config) {
  if(config.delivery?.available===true)return '';
  return config.pickup?.enabled===true?'Entrega indisponível. Retirada disponível.':'Entrega e retirada indisponíveis no momento.';
}
