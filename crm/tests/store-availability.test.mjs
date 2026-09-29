import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getStoreAvailability, getStoreAvailabilityMessage, STORE_AVAILABILITY} from '../public/store-availability.mjs';

const mondayMorning = new Date('2026-09-28T12:00:00Z'); // 09:00 em São Paulo
const mondayEvening = new Date('2026-09-28T22:00:00Z'); // 19:00 em São Paulo
const schedule = {mon: {enabled: true, open: '08:00', close: '18:00'}};
const auto = {timezone: 'America/Sao_Paulo', manualOverride: {mode: 'auto'}, schedule};

test('override explícito prevalece sobre horário desabilitado', () => {
    const disabled = {timezone: 'America/Sao_Paulo', schedule: {mon: {enabled: false}}};
    assert.equal(getStoreAvailability({...disabled, manualOverride: {mode: 'force_open'}}, mondayMorning), STORE_AVAILABILITY.OPEN);
    assert.equal(getStoreAvailability({...auto, manualOverride: {mode: 'force_closed'}}, mondayMorning), STORE_AVAILABILITY.CLOSED);
});

test('horário automático distingue expediente, fora do expediente e dia desabilitado', () => {
    assert.equal(getStoreAvailability(auto, mondayMorning), STORE_AVAILABILITY.OPEN);
    assert.equal(getStoreAvailability(auto, mondayEvening), STORE_AVAILABILITY.CLOSED);
    assert.equal(getStoreAvailability({...auto, schedule: {mon: {enabled: false}}}, mondayMorning), STORE_AVAILABILITY.CLOSED);
});

test('configuração ausente, incompleta ou inválida não é anunciada como fechamento', () => {
    for (const config of [null, {}, {frete: {valor: 0}}, {...auto, schedule: {}},
        {...auto, schedule: {mon: {enabled: true, open: '18:00', close: '08:00'}}},
        {...auto, timezone: 'timezone-invalida'}]) {
        const availability = getStoreAvailability(config, mondayMorning);
        assert.equal(availability, STORE_AVAILABILITY.CONFIG_UNAVAILABLE);
        assert.match(getStoreAvailabilityMessage(availability), /Não foi possível verificar/);
    }
    assert.match(getStoreAvailabilityMessage(STORE_AVAILABILITY.CLOSED), /loja está fechada/);
});
