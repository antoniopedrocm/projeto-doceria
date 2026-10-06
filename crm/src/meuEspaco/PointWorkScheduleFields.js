import React from 'react';
import {
  POINT_WORK_SCHEDULE_TYPES, POINT_WEEK_DAYS, DEFAULT_POINT_DAILY_LOADS,
  sanitizeEmployeeWorkSchedule, isHourlyWorkSchedule, formatPointDurationInput, parsePointDurationToMinutes
} from './pointScheduleCore';

export default function PointWorkScheduleFields({ schedule, bankStartDate, onBankStartDateChange, onScheduleChange,
  effectiveDate, onEffectiveDateChange, showEffectiveDate = false, savedEffectiveDate = '', Input, Select }) {
  const currentWorkSchedule = sanitizeEmployeeWorkSchedule(schedule);
  return (
<div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
                        <div>
                            <p className="text-sm font-semibold text-gray-800">Jornada de trabalho</p>
                            <p className="text-xs text-gray-500">Configure a escala usada na folha de ponto, faltas e banco de horas desta funcionária.</p>
                        </div>
                        {!isHourlyWorkSchedule(currentWorkSchedule) && <>
                        <Input
                            label="Data de início do banco de horas"
                            type="date"
                            value={bankStartDate}
                            onChange={(e) => onBankStartDateChange(e.target.value)}
                        />
                        <p className="text-xs text-gray-500 -mt-2">
                            Se ficar vazio, o sistema usa a data padrão configurada em Meu Espaço &gt; Informações da empresa.
                        </p>
                        </>}
                        <Select
                            label="Tipo de escala"
                            value={currentWorkSchedule.tipoEscala}
                            onChange={(e) => {
                                const nextType = e.target.value;
                                onScheduleChange((schedule) => ({
                                    ...schedule,
                                    tipoEscala: nextType,
                                    diasTrabalho: nextType === 'seg-sab-folga'
                                        ? ['1', '2', '3', '4', '5', '6']
                                        : nextType === 'seg-sex'
                                            ? ['1', '2', '3', '4', '5']
                                            : schedule.diasTrabalho,
                                    folgaSemanal: ['seg-sab-folga', 'horista'].includes(nextType) ? schedule.folgaSemanal : '',
                                    folgaVariavel: ['seg-sab-folga', 'horista'].includes(nextType) ? schedule.folgaVariavel : false,
                                }));
                            }}
                        >
                            {POINT_WORK_SCHEDULE_TYPES.map((type) => (
                                <option key={type.value} value={type.value}>{type.label}</option>
                            ))}
                        </Select>

                        {showEffectiveDate ? <>
                          <Input
                            label="Aplicar nova jornada a partir de"
                            type="date"
                            value={effectiveDate}
                            onChange={(e) => onEffectiveDateChange(e.target.value)}
                            required
                          />
                          <p className="text-xs text-gray-500 -mt-2">
                            Até o dia anterior, vale a jornada anterior. A nova jornada começa na data escolhida, inclusive. As marcações existentes são preservadas.
                          </p>
                        </> : savedEffectiveDate && <p className="text-xs text-gray-600">
                          Vigência registrada da jornada: {savedEffectiveDate.split('-').reverse().join('/')}
                        </p>}

                        {isHourlyWorkSchedule(currentWorkSchedule) ? (
                          <p className="text-sm text-sky-800">Horista: somente horas efetivamente trabalhadas. Não há carga prevista, banco de horas ou horas extras. Mudanças de jornada seguem a data de vigência e preservam as marcações existentes.</p>
                        ) : <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700">Dias trabalhados e carga horária</label>
                                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
                                    {POINT_WEEK_DAYS.map((day) => {
                                        const checked = currentWorkSchedule.diasTrabalho.includes(day.value);
                                        return (
                                            <div key={day.value} className="grid grid-cols-[1fr_110px] items-center gap-3">
                                                <label className="flex items-center gap-2 text-sm text-gray-700">
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={(e) => onScheduleChange((schedule) => {
                                                            const currentDays = new Set(schedule.diasTrabalho);
                                                            if (e.target.checked) {
                                                                currentDays.add(day.value);
                                                            } else {
                                                                currentDays.delete(day.value);
                                                            }
                                                            return {
                                                                ...schedule,
                                                                diasTrabalho: Array.from(currentDays).sort((a, b) => Number(a) - Number(b))
                                                            };
                                                        })}
                                                    />
                                                    {day.label}
                                                </label>
                                                <input
                                                    type="text"
                                                    value={currentWorkSchedule.cargaHorariaPorDia[day.value] || DEFAULT_POINT_DAILY_LOADS[day.value] || '00:00'}
                                                    onChange={(e) => onScheduleChange((schedule) => ({
                                                        ...schedule,
                                                        cargaHorariaPorDia: {
                                                            ...schedule.cargaHorariaPorDia,
                                                            [day.value]: e.target.value
                                                        }
                                                    }))}
                                                    onBlur={(e) => onScheduleChange((schedule) => ({
                                                        ...schedule,
                                                        cargaHorariaPorDia: {
                                                            ...schedule.cargaHorariaPorDia,
                                                            [day.value]: formatPointDurationInput(parsePointDurationToMinutes(e.target.value, parsePointDurationToMinutes(DEFAULT_POINT_DAILY_LOADS[day.value], 0)))
                                                        }
                                                    }))}
                                                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-pink-500 focus:ring-2 focus:ring-pink-500"
                                                    placeholder="08:00"
                                                    disabled={!checked}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="space-y-4">
                                {currentWorkSchedule.tipoEscala === 'seg-sab-folga' && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <Select
                                            label="Folga semanal"
                                            value={currentWorkSchedule.folgaSemanal}
                                            onChange={(e) => onScheduleChange({ folgaSemanal: e.target.value, folgaVariavel: false })}
                                        >
                                            <option value="">Sem folga fixa</option>
                                            {POINT_WEEK_DAYS.filter((day) => day.value !== '0').map((day) => (
                                                <option key={day.value} value={day.value}>{day.label}</option>
                                            ))}
                                        </Select>
                                        <label className="flex items-end gap-2 pb-3 text-sm text-gray-700">
                                            <input
                                                type="checkbox"
                                                checked={Boolean(currentWorkSchedule.folgaVariavel)}
                                                onChange={(e) => onScheduleChange({
                                                    folgaVariavel: e.target.checked,
                                                    folgaSemanal: e.target.checked ? '' : currentWorkSchedule.folgaSemanal
                                                })}
                                            />
                                            Folga variável
                                        </label>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <Input
                                        label="Entrada padrão"
                                        type="time"
                                        value={currentWorkSchedule.horarioPadrao.entrada}
                                        onChange={(e) => onScheduleChange((schedule) => ({
                                            ...schedule,
                                            horarioPadrao: { ...schedule.horarioPadrao, entrada: e.target.value }
                                        }))}
                                    />
                                    <Input
                                        label="Saída almoço padrão"
                                        type="time"
                                        value={currentWorkSchedule.horarioPadrao.almocoSaida}
                                        onChange={(e) => onScheduleChange((schedule) => ({
                                            ...schedule,
                                            horarioPadrao: { ...schedule.horarioPadrao, almocoSaida: e.target.value }
                                        }))}
                                    />
                                    <Input
                                        label="Retorno almoço padrão"
                                        type="time"
                                        value={currentWorkSchedule.horarioPadrao.almocoRetorno}
                                        onChange={(e) => onScheduleChange((schedule) => ({
                                            ...schedule,
                                            horarioPadrao: { ...schedule.horarioPadrao, almocoRetorno: e.target.value }
                                        }))}
                                    />
                                    <Input
                                        label="Saída final padrão"
                                        type="time"
                                        value={currentWorkSchedule.horarioPadrao.saida}
                                        onChange={(e) => onScheduleChange((schedule) => ({
                                            ...schedule,
                                            horarioPadrao: { ...schedule.horarioPadrao, saida: e.target.value }
                                        }))}
                                    />
                                </div>
                            </div>
                        </div>}
                    </div>
  );
}
