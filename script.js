// ==========================================
// 1. BANCO DE DADOS 
// ==========================================
const DB_NAME = 'PilatesSPA_DB';
const DB_VERSION = 13; 
let dbInstance = null;

const DB = {
    initDB: () => {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                const tx = e.target.transaction;

                if (!db.objectStoreNames.contains('alunos')) db.createObjectStore('alunos', { keyPath: 'id', autoIncrement: true });

                let storeEvo;
                if (!db.objectStoreNames.contains('evolucoes')) {
                    storeEvo = db.createObjectStore('evolucoes', { keyPath: 'id', autoIncrement: true });
                } else { storeEvo = tx.objectStore('evolucoes'); }
                if (!storeEvo.indexNames.contains('alunoId')) storeEvo.createIndex('alunoId', 'alunoId', { unique: false });

                if (!db.objectStoreNames.contains('aulas')) db.createObjectStore('aulas', { keyPath: 'id', autoIncrement: true });

                let storeMat;
                if (!db.objectStoreNames.contains('aula_alunos')) {
                    storeMat = db.createObjectStore('aula_alunos', { keyPath: 'id', autoIncrement: true });
                } else { storeMat = tx.objectStore('aula_alunos'); }
                if (!storeMat.indexNames.contains('aulaId')) storeMat.createIndex('aulaId', 'aulaId', { unique: false });
                if (!storeMat.indexNames.contains('alunoId')) storeMat.createIndex('alunoId', 'alunoId', { unique: false });

                if (!db.objectStoreNames.contains('config')) db.createObjectStore('config', { keyPath: 'key' });

                if (!db.objectStoreNames.contains('presencas')) db.createObjectStore('presencas', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('faltas')) db.createObjectStore('faltas', { keyPath: 'id', autoIncrement: true });
                if (!db.objectStoreNames.contains('reposicoes')) db.createObjectStore('reposicoes', { keyPath: 'id', autoIncrement: true });
            };
            request.onsuccess = (e) => { dbInstance = e.target.result; resolve(dbInstance); };
            request.onerror = (e) => reject(e.target.error);
        });
    },
    executeTx: (storeName, mode, callback) => {
        return new Promise((resolve, reject) => {
            const tx = dbInstance.transaction(storeName, mode);
            const store = tx.objectStore(storeName);
            let result;
            try {
                const request = callback(store);
                if (request) { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }
                else { tx.oncomplete = () => resolve(result); }
            } catch (err) { reject(err); }
        });
    },
    getAll: (storeName) => DB.executeTx(storeName, 'readonly', (store) => store.getAll()),
    save: (storeName, data) => DB.executeTx(storeName, 'readwrite', (store) => data.id || data.key ? store.put(data) : store.add(data)),
    remove: (storeName, id) => DB.executeTx(storeName, 'readwrite', (store) => store.delete(id)),
    getByIndex: (storeName, indexName, value) => DB.executeTx(storeName, 'readonly', (store) => store.index(indexName).getAll(Number(value))),
    getConfig: (key) => DB.executeTx('config', 'readonly', (store) => store.get(key)),
    exportJSON: async () => {
        const data = { alunos: await DB.getAll('alunos'), evolucoes: await DB.getAll('evolucoes'), aulas: await DB.getAll('aulas'), aula_alunos: await DB.getAll('aula_alunos') };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `Pilates_Backup.json`; a.click(); URL.revokeObjectURL(url);
    },
    importJSON: async (jsonData) => {
        const stores = ['alunos', 'evolucoes', 'aulas', 'aula_alunos'];
        for (const storeName of stores) {
            await DB.executeTx(storeName, 'readwrite', (store) => store.clear());
            if (jsonData[storeName]) for (const item of jsonData[storeName]) await DB.executeTx(storeName, 'readwrite', (store) => store.add(item));
        }
    }
};

// ==========================================
// 2. UI E NAVEGAÇÃO BLINDADA
// ==========================================
const formatMoney = (val) => Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const getLocalDate = () => { const tzOffset = (new Date()).getTimezoneOffset() * 60000; return (new Date(Date.now() - tzOffset)).toISOString().split('T')[0]; };
const getLocalMonth = () => { const tzOffset = (new Date()).getTimezoneOffset() * 60000; return (new Date(Date.now() - tzOffset)).toISOString().slice(0, 7); };
const formatDisplayDate = (isoStr) => { if (!isoStr) return ""; const [y, m, d] = isoStr.split('-'); return `${d}/${m}/${y}`; };

const getDatesOfCurrentWeek = () => {
    const today = new Date();
    const currentDay = today.getDay();
    const dates = {};
    const nomes = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

    for (let i = 1; i <= 6; i++) {
        const diff = i - currentDay;
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + diff);
        const dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

        dates[nomes[i]] = {
            dateStr: dateStr,
            isPast: dateStr < todayStr,
            isToday: dateStr === todayStr
        };
    }
    return dates;
};

let fpDataEvo, fpAulaInicio, fpAulaFim, fpMesFin, fpMesPdf, fpDataReposicao;
let fpEditAulaInicio, fpEditAulaFim;
let choicesProntuario, choicesAgenda, choicesFreqAluno, choicesFiltroDia;
let choicesAgendaRep, choicesFiltroDiaRep;
let confirmCallback = null;

const setupNavigation = () => {
    document.querySelectorAll('.menu-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (UI && UI.closeAllModals) UI.closeAllModals();
            document.querySelectorAll('.menu-item, .tab-pane').forEach(el => el.classList.remove('active'));
            const currentBtn = e.currentTarget;
            currentBtn.classList.add('active');
            const tabTarget = document.getElementById(currentBtn.dataset.tab);
            if (tabTarget) tabTarget.classList.add('active');

            if (currentBtn.dataset.tab === 'tab-painel') updatePainelAoVivo();
        });
    });
};

const initPlugins = () => {
    try {
        fpDataEvo = flatpickr("#evo-data", { locale: "pt", dateFormat: "Y-m-d", altInput: true, altFormat: "d/m/Y", disableMobile: true });
        fpAulaInicio = flatpickr("#aula-inicio", { enableTime: true, noCalendar: true, dateFormat: "H:i", time_24hr: true, disableMobile: true });
        fpAulaFim = flatpickr("#aula-fim", { enableTime: true, noCalendar: true, dateFormat: "H:i", time_24hr: true, disableMobile: true });
        
        fpEditAulaInicio = flatpickr("#edit-aula-inicio", { enableTime: true, noCalendar: true, dateFormat: "H:i", time_24hr: true, disableMobile: true });
        fpEditAulaFim = flatpickr("#edit-aula-fim", { enableTime: true, noCalendar: true, dateFormat: "H:i", time_24hr: true, disableMobile: true });

        const monthConfig = { locale: "pt", disableMobile: true, plugins: [new monthSelectPlugin({ shorthand: false, dateFormat: "Y-m", altFormat: "F Y" })] };

        fpMesFin = flatpickr("#mes-financeiro", { ...monthConfig, altInput: true, altFormat: "F Y", onChange: () => { if (typeof loadData === 'function') loadData(); } });
        fpMesPdf = flatpickr("#pdf-mes-escolha", { ...monthConfig, altInput: true, altFormat: "F Y" });

        choicesProntuario = new Choices('#select-aluno-prontuario', { searchEnabled: true, itemSelectText: "", placeholderValue: "Buscar aluno...", noResultsText: "Não encontrado", shouldSort: false });
        choicesAgenda = new Choices('#select-aula-gerenciar', { searchEnabled: false, itemSelectText: "", placeholderValue: "Selecione a turma...", shouldSort: false });
        choicesFreqAluno = new Choices('#aluno-frequencia', { searchEnabled: false, itemSelectText: "", shouldSort: false });
        choicesFiltroDia = new Choices('#filtro-dia-agenda', { searchEnabled: false, itemSelectText: "", shouldSort: false });

        choicesAgendaRep = new Choices('#select-aula-reposicao', { searchEnabled: false, itemSelectText: "", placeholderValue: "Selecione a turma...", shouldSort: false });
        choicesFiltroDiaRep = new Choices('#filtro-dia-reposicao', { searchEnabled: false, itemSelectText: "", shouldSort: false });

        fpDataReposicao = flatpickr("#reposicao-data", { locale: "pt", dateFormat: "Y-m-d", altInput: true, altFormat: "d/m/Y", disableMobile: true, minDate: "today" });
    } catch (e) { console.error("Erro nos plugins visuais", e); }
};

const UI = {
    toggleModal: (id, show) => {
        const modal = document.getElementById(id);
        if (!modal) return;
        modal.classList.toggle('active', show);
        if (!show) {
            const form = modal.querySelector('form');
            if (form) form.reset();
            const hid = modal.querySelector('input[type="hidden"]');
            if (hid) hid.value = '';
            if (id === 'modal-aluno' && choicesFreqAluno) choicesFreqAluno.setChoiceByValue('1');
        }
    },
    closeAllModals: () => { document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active')); },

    customConfirm: (title, text, type, callback) => {
        document.getElementById('confirm-title').innerText = title;
        document.getElementById('confirm-text').innerText = text;
        const icon = document.getElementById('confirm-icon');
        const btnYes = document.getElementById('btn-confirm-yes');

        if (type === 'del') {
            icon.innerHTML = '<i class="fa-solid fa-trash-can" style="color: var(--danger);"></i>';
            btnYes.className = 'btn btn-danger btn-full';
        } else {
            icon.innerHTML = '<i class="fa-solid fa-circle-exclamation" style="color: var(--primary);"></i>';
            btnYes.className = 'btn btn-primary btn-full';
        }

        UI.toggleModal('modal-confirm', true);

        btnYes.onclick = () => {
            if (callback) callback();
            UI.toggleModal('modal-confirm', false);
        };
    },

    renderAlunos: (alunos, precos) => {
        const tbody = document.getElementById('tbody-alunos');
        tbody.innerHTML = alunos.map(a => {
            const freq = a.frequencia || 1;
            const valor = precos[freq] || 0;
            return `<tr>
                <td><strong>${a.nome}</strong></td><td>${freq}x semana</td><td>${formatMoney(valor)}</td>
                <td>
                    <button class="btn btn-outline" style="padding:6px 10px; font-size:13px;" data-action="edit-aluno" data-id="${a.id}"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-danger" style="padding:6px 10px; font-size:13px;" data-action="del-aluno" data-id="${a.id}"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>`;
        }).join('') || '<tr><td colspan="4" style="text-align:center; padding: 20px;">Nenhum aluno matriculado.</td></tr>';
    },

    renderFinanceiro: (alunos, precos, mes) => {
        const tbody = document.getElementById('tbody-financeiro');
        tbody.innerHTML = alunos.map(a => {
            const freq = a.frequencia || 1;
            if (!a.pagamentos) a.pagamentos = {};
            const status = a.pagamentos[mes] || 'pendente';
            const valor = precos[freq] || 0;

            const statusColor = status === 'pago' ? '#10b981' : status === 'pendente' ? '#f59e0b' : '#ef4444';
            const statusText = status === 'pago' ? 'Pago' : status === 'pendente' ? 'Pendente' : 'Atrasado';

            return `<tr>
                <td><strong>${a.nome}</strong></td><td>${freq}x</td><td>${formatMoney(valor)}</td>
                <td>
                    <div class="only-print st-${status}" style="font-weight: bold; margin-bottom: 0; padding: 0; border: none; color: ${statusColor} !important;">
                        ${statusText}
                    </div>
                    <select class="status-select-native st-${status} no-print" data-action="change-status" data-id="${a.id}">
                        <option value="pago" ${status === 'pago' ? 'selected' : ''}>Pago</option>
                        <option value="pendente" ${status === 'pendente' ? 'selected' : ''}>Pendente</option>
                        <option value="atrasado" ${status === 'atrasado' ? 'selected' : ''}>Atrasado</option>
                    </select>
                </td>
            </tr>`;
        }).join('') || '<tr><td colspan="4" style="text-align:center; padding: 20px;">Sem dados.</td></tr>';
    },

    renderAulasList: (aulas) => {
        const list = document.getElementById('lista-aulas');
        if (aulas.length === 0) {
            list.innerHTML = '<p style="color:gray; padding: 10px;">Nenhuma turma criada.</p>';
            return;
        }

        const diasOrdenados = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
        let html = '';

        diasOrdenados.forEach(dia => {
            const aulasDoDia = aulas.filter(a => a.diaSemana === dia).sort((a, b) => a.inicio.localeCompare(b.inicio));
            if (aulasDoDia.length > 0) {
                html += `<h4 style="margin-top: 15px; margin-bottom: 5px; color: var(--primary-dark); border-bottom: 1px solid var(--border); padding-bottom: 5px;">${dia}</h4>`;
                html += aulasDoDia.map(aula => `
                    <div class="bloco-agenda">
                        <div style="flex: 1;"><strong>${aula.nome}</strong><br><span style="font-size:0.9rem; color:var(--text-light);"><i class="fa-regular fa-clock"></i> ${aula.inicio} - ${aula.fim} | <i class="fa-solid fa-user-group"></i> ${aula.limite} máx.</span></div>
                        <div class="btn-group" style="gap: 5px;">
                            <button class="btn btn-outline" style="padding:6px 10px; font-size:13px;" data-action="edit-aula" data-id="${aula.id}"><i class="fa-solid fa-pen"></i></button>
                            <button class="btn btn-danger" style="padding:6px 10px; font-size:13px;" data-action="del-aula" data-id="${aula.id}"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>
                `).join('');
            }
        });

        const aulasSemDia = aulas.filter(a => !a.diaSemana).sort((a, b) => a.inicio.localeCompare(b.inicio));
        if (aulasSemDia.length > 0) {
            html += `<h4 style="margin-top: 15px; margin-bottom: 5px; color: var(--primary-dark); border-bottom: 1px solid var(--border); padding-bottom: 5px;">Aulas sem dia definido</h4>`;
            html += aulasSemDia.map(aula => `
                <div class="bloco-agenda">
                    <div style="flex: 1;"><strong>${aula.nome}</strong><br><span style="font-size:0.9rem; color:var(--text-light);"><i class="fa-regular fa-clock"></i> ${aula.inicio} - ${aula.fim} | <i class="fa-solid fa-user-group"></i> ${aula.limite} máx.</span></div>
                    <div class="btn-group" style="gap: 5px;">
                        <button class="btn btn-outline" style="padding:6px 10px; font-size:13px;" data-action="edit-aula" data-id="${aula.id}"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn btn-danger" style="padding:6px 10px; font-size:13px;" data-action="del-aula" data-id="${aula.id}"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            `).join('');
        }

        list.innerHTML = html;
    },

    renderCalendarioGeral: () => {
        const grid = document.getElementById('grid-calendario');
        if (!grid) return;

        const dias = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
        const weekDates = getDatesOfCurrentWeek();

        let html = '';

        dias.forEach(dia => {
            const infoDia = weekDates[dia];
            const dataRealStr = infoDia.dateStr;
            const aulasDia = state.aulas.filter(a => a.diaSemana === dia).sort((a, b) => a.inicio.localeCompare(b.inicio));

            const pastStyle = infoDia.isPast ? 'opacity: 0.6; filter: grayscale(0.8);' : '';
            const todayBadge = infoDia.isToday ? '<span style="font-size:0.7rem; background:var(--primary); color:white; padding:2px 6px; border-radius:4px; margin-left:5px;">Hoje</span>' : '';

            html += `<div class="day-col" style="${pastStyle}">
                <div class="day-title flex-between">
                    <span>${dia.split('-')[0].toUpperCase()}</span>
                    <span style="font-size:0.75rem; font-weight:normal; color:var(--text-light);">${formatDisplayDate(dataRealStr)}</span>
                    ${todayBadge}
                </div>`;

            if (aulasDia.length === 0) {
                html += `<p class="text-center text-light mt-1" style="font-size:0.85rem;">Livre</p>`;
            } else {
                html += aulasDia.map(aula => {
                    const matriculas = state.aula_alunos.filter(m => m.aulaId === aula.id);
                    const reposicoes = state.reposicoes.filter(r => r.dataReposicao === dataRealStr && r.aulaIdReposicao === aula.id);

                    let nomesHtmlArr = [];

                    matriculas.forEach(m => {
                        const aluno = state.alunos.find(a => a.id === m.alunoId);
                        if (aluno) nomesHtmlArr.push(aluno.nome);
                    });

                    reposicoes.forEach(r => {
                        const aluno = state.alunos.find(a => a.id === r.alunoId);
                        if (aluno) nomesHtmlArr.push(`<span style="color:var(--warning); font-weight:bold;">${aluno.nome} (Reposição)</span>`);
                    });

                    let listaNomesHtml = '';
                    if (nomesHtmlArr.length > 0) {
                        listaNomesHtml = `<div style="margin-top: 8px; font-size: 0.8rem; color: var(--text-main); line-height: 1.4;">
                            <strong>Alunos:</strong><br>
                            ${nomesHtmlArr.join('<br>')}
                        </div>`;
                    } else {
                        listaNomesHtml = `<div style="margin-top: 8px; font-size: 0.75rem; color: var(--text-light);">Nenhum aluno matriculado</div>`;
                    }

                    const totalOcupado = matriculas.length + reposicoes.length;
                    const extraRep = reposicoes.length > 0 ? ` <span style="color:var(--warning); font-weight:bold;">(+${reposicoes.length} rep)</span>` : '';

                    return `<div class="mini-card" style="border-left: 4px solid var(--primary);">
                        <strong>${aula.nome}</strong><br>
                        <span style="font-size:0.8rem;"><i class="fa-regular fa-clock"></i> ${aula.inicio} - ${aula.fim}</span><br>
                        <span style="font-size:0.75rem; color:var(--text-light);"><i class="fa-solid fa-users"></i> ${matriculas.length}/${aula.limite} fixos${extraRep}</span>
                        ${listaNomesHtml}
                    </div>`;
                }).join('');
            }
            html += `</div>`;
        });

        grid.innerHTML = html;
    },

    updateChoicesSafe: (alunos, aulas) => {
        if (!choicesProntuario || !choicesAgenda) return;

        choicesProntuario.clearStore();
        const arrAlunos = alunos.map(a => ({ value: String(a.id), label: a.nome }));
        choicesProntuario.setChoices([{ value: '', label: 'Selecione o aluno...', placeholder: true, selected: true }, ...arrAlunos], 'value', 'label', true);

        // Update dropdown Fixo
        const valAtualAula = document.getElementById('select-aula-gerenciar').value;
        const diaSelecionado = document.getElementById('filtro-dia-agenda').value;

        let aulasFiltradas = diaSelecionado ? aulas.filter(a => a.diaSemana === diaSelecionado) : aulas;
        choicesAgenda.clearStore();
        const arrAulas = aulasFiltradas.sort((a, b) => a.inicio.localeCompare(b.inicio)).map(a => ({ value: String(a.id), label: `${a.diaSemana ? a.diaSemana.substring(0, 3) + ' - ' : ''}${a.nome} (${a.inicio} - ${a.fim})` }));
        choicesAgenda.setChoices([{ value: '', label: 'Selecione a turma...', placeholder: true, selected: true }, ...arrAulas], 'value', 'label', true);

        if (valAtualAula && arrAulas.some(a => a.value === valAtualAula)) {
            choicesAgenda.setChoiceByValue(String(valAtualAula));
        } else {
            document.getElementById('area-alocacao').style.display = 'none';
        }

        // Update dropdown Reposicao
        if (choicesAgendaRep) {
            const valAtualRep = document.getElementById('select-aula-reposicao').value;
            const diaSelRep = document.getElementById('filtro-dia-reposicao').value;
            let aulasFiltRep = diaSelRep ? aulas.filter(a => a.diaSemana === diaSelRep) : aulas;
            choicesAgendaRep.clearStore();
            const arrAulasRep = aulasFiltRep.sort((a, b) => a.inicio.localeCompare(b.inicio)).map(a => ({ value: String(a.id), label: `${a.diaSemana ? a.diaSemana.substring(0, 3) + ' - ' : ''}${a.nome} (${a.inicio} - ${a.fim})` }));
            choicesAgendaRep.setChoices([{ value: '', label: 'Selecione a turma...', placeholder: true, selected: true }, ...arrAulasRep], 'value', 'label', true);
            if (valAtualRep && arrAulasRep.some(a => a.value === valAtualRep)) {
                choicesAgendaRep.setChoiceByValue(String(valAtualRep));
            } else {
                document.getElementById('area-reposicao-alocacao').style.display = 'none';
            }
        }
    },

    renderEvolucoes: (evolucoes) => {
        const container = document.getElementById('timeline-evolucoes');
        if (evolucoes.length === 0) return container.innerHTML = '<p style="color:gray;">Nenhum atendimento registrado no período.</p>';

        const getSortTime = (d) => {
            if (!d) return 0;
            if (d.includes('/')) { const [dia, mes, ano] = d.split('/'); return new Date(`${ano}-${mes}-${dia}`).getTime(); }
            return new Date(d).getTime();
        };

        const getDisplayDate = (d) => {
            if (!d) return "";
            if (d.includes('/')) return d;
            const [ano, mes, dia] = d.split('-'); return `${dia}/${mes}/${ano}`;
        };

        container.innerHTML = evolucoes.sort((a, b) => getSortTime(b.data) - getSortTime(a.data)).map(evo => `
            <div class="tl-item">
                <div class="tl-header">
                    <span class="tl-date">${getDisplayDate(evo.data)}</span>
                    <div class="no-print">
                        <button type="button" class="btn btn-outline" style="padding: 6px 10px; font-size: 0.8rem;" data-action="edit-evo" data-id="${evo.id}"><i class="fa-solid fa-pen"></i></button>
                        <button type="button" class="btn btn-danger" style="padding: 6px 10px; font-size: 0.8rem;" data-action="del-evo" data-id="${evo.id}"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
                <div style="color: var(--text-main); line-height: 1.5; margin-top: 5px;">${evo.descricao.replace(/\n/g, '<br>')}</div>
            </div>`).join('');
    }
};

// ==========================================
// 3. LÓGICA DE TEMPO REAL E DADOS
// ==========================================
let state = { alunos: [], aulas: [], precos: { 1: 120, 2: 180, 3: 230 }, currentEvos: [], aula_alunos: [], presencas: [], faltas: [], reposicoes: [], aulaAdiantadaId: null };

const carregarFaltasEReposicoes = () => {
    const tbody = document.getElementById('tbody-faltas');
    if (!tbody) return;

    const faltasComAlunos = state.faltas.map(f => {
        const alu = state.alunos.find(a => a.id === f.alunoId);
        return { ...f, nomeAluno: alu ? alu.nome : 'Desconhecido' };
    }).sort((a, b) => b.id - a.id);

    tbody.innerHTML = faltasComAlunos.map(f => {
        const isPendente = f.status === 'pendente';
        const statusBadge = isPendente
            ? `<span class="vagas-badge lotado">Pendente</span>`
            : `<span class="vagas-badge" style="background: #fffbeb; color: var(--warning); border-color: #fde68a;">Reposta</span>`;

        const btnAcao = isPendente
            ? `<button class="btn btn-outline" style="padding:6px 10px; font-size:12px;" data-action="abrir-reposicao" data-id="${f.id}">Agendar</button>`
            : `<button class="btn btn-outline" style="padding:6px 10px; font-size:12px; border-color: var(--warning); color: var(--warning);" data-action="abrir-reposicao" data-id="${f.id}"><i class="fa-solid fa-pen"></i> Editar</button>`;

        let infoFalta = formatDisplayDate(f.data);
        if (!isPendente) {
            const rep = state.reposicoes.find(r => r.faltaId === f.id);
            if (rep) {
                infoFalta += ` <span style="font-size:0.8rem; color:var(--warning); font-weight:bold; margin-left: 5px;">(Rep: ${formatDisplayDate(rep.dataReposicao)})</span>`;
            }
        }

        return `<tr>
            <td><strong>${f.nomeAluno}</strong></td>
            <td>${infoFalta}</td>
            <td>${statusBadge}</td>
            <td>${btnAcao}</td>
        </tr>`;
    }).join('') || '<tr><td colspan="4" class="text-center" style="padding: 20px;">Nenhuma falta pendente registrada.</td></tr>';
};

const updatePainelAoVivo = () => {
    const today = new Date();
    const diasArray = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    const diaSemanaNome = diasArray[today.getDay()];

    const clock = document.getElementById('relogio-agora');
    if (clock) clock.innerText = today.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const dtAgora = document.getElementById('data-agora');
    if (dtAgora) dtAgora.innerText = `${diaSemanaNome}, ${today.toLocaleDateString('pt-BR')}`;

    const timeNow = today.getHours().toString().padStart(2, '0') + ':' + today.getMinutes().toString().padStart(2, '0');
    const dataHojeStr = getLocalDate();

    const aulasHoje = state.aulas.filter(a => a.diaSemana === diaSemanaNome).sort((a, b) => a.inicio.localeCompare(b.inicio));

    let emAndamento = null;
    if (state.aulaAdiantadaId) {
        emAndamento = aulasHoje.find(a => a.id === state.aulaAdiantadaId);
        if (emAndamento && timeNow > emAndamento.fim) {
            state.aulaAdiantadaId = null;
            emAndamento = null;
        }
    }
    if (!emAndamento) {
        emAndamento = aulasHoje.find(a => timeNow >= a.inicio && timeNow <= a.fim);
    }

    let proxima = null;
    if (emAndamento) {
        proxima = aulasHoje.find(a => a.inicio > emAndamento.inicio);
    } else {
        proxima = aulasHoje.find(a => a.inicio > timeNow);
    }

    const boxAndamento = document.getElementById('painel-em-andamento');
    if (boxAndamento) {
        if (emAndamento) {
            const matriculasFixas = state.aula_alunos.filter(m => m.aulaId === emAndamento.id);
            const reposicoesHj = state.reposicoes.filter(r => r.dataReposicao === dataHojeStr && r.aulaIdReposicao === emAndamento.id);

            const listAlunosIds = [];
            matriculasFixas.forEach(m => listAlunosIds.push({ id: m.alunoId, tipo: 'Fixo' }));
            reposicoesHj.forEach(r => listAlunosIds.push({ id: r.alunoId, tipo: 'Reposição' }));

            let htmlAlunos = '';
            if (listAlunosIds.length === 0) {
                htmlAlunos = '<p class="text-light mt-1">Nenhum aluno esperado nesta turma.</p>';
            } else {
                htmlAlunos = '<div class="mt-1 flex-column" style="gap:8px;">';
                listAlunosIds.forEach(item => {
                    const alu = state.alunos.find(x => x.id === item.id);
                    if (!alu) return;

                    const presencaId = `${dataHojeStr}_${emAndamento.id}_${alu.id}`;
                    const pRecord = state.presencas.find(p => p.id === presencaId);
                    const statusP = pRecord ? pRecord.status : '';

                    htmlAlunos += `
                    <div class="flex-between mini-card" style="margin-bottom:0; padding: 12px; border-left: 3px solid var(--success);">
                        <div><strong>${alu.nome}</strong> <span style="font-size:0.75rem; color: var(--text-light);">(${item.tipo})</span></div>
                        <div class="btn-group" style="gap: 5px;">
                            <button class="presenca-btn ${statusP === 'P' ? 'active-p' : ''}" data-action="marcar-p" data-aluno="${alu.id}" data-aula="${emAndamento.id}">P</button>
                            <button class="presenca-btn ${statusP === 'F' ? 'active-f' : ''}" data-action="marcar-f" data-aluno="${alu.id}" data-aula="${emAndamento.id}">F</button>
                        </div>
                    </div>`;
                });
                htmlAlunos += '</div>';
            }

            boxAndamento.innerHTML = `
                <h4 style="font-size: 1.1rem; color: var(--text-main); margin-bottom: 5px;">${emAndamento.nome}</h4>
                <span class="vagas-badge" style="display: inline-block; margin-bottom: 12px; margin-top: 5px; background: #e6f7f6; color: var(--primary-dark);"><i class="fa-regular fa-clock"></i> ${emAndamento.inicio} até ${emAndamento.fim}</span>
                ${htmlAlunos}
            `;
        } else {
            boxAndamento.innerHTML = '<p class="text-light mt-1">Nenhuma aula acontecendo neste exato minuto.</p>';
        }
    }

    const boxProxima = document.getElementById('painel-proxima');
    if (boxProxima) {
        if (proxima) {
            const matriculasFixas = state.aula_alunos.filter(m => m.aulaId === proxima.id);
            const reposicoesHj = state.reposicoes.filter(r => r.dataReposicao === dataHojeStr && r.aulaIdReposicao === proxima.id);
            const totalEsperado = matriculasFixas.length + reposicoesHj.length;

            const listAlunosProx = [];
            matriculasFixas.forEach(m => listAlunosProx.push({ id: m.alunoId, tipo: 'Fixo' }));
            reposicoesHj.forEach(r => listAlunosProx.push({ id: r.alunoId, tipo: 'Reposição' }));

            let htmlAlunosProx = '';
            if (listAlunosProx.length > 0) {
                htmlAlunosProx = '<div class="mt-2" style="font-size: 0.85rem; color: var(--text-main);">';
                htmlAlunosProx += listAlunosProx.map(item => {
                    const alu = state.alunos.find(x => x.id === item.id);
                    return alu ? `• ${alu.nome} <span style="color:var(--text-light);font-size:0.75rem;">(${item.tipo})</span>` : '';
                }).join('<br>');
                htmlAlunosProx += '</div>';
            } else {
                htmlAlunosProx = '<p class="text-light mt-1" style="font-size: 0.85rem;">Nenhum aluno esperado.</p>';
            }

            boxProxima.innerHTML = `
                <h4 style="font-size: 1.1rem; color: var(--text-main); margin-bottom: 5px;">${proxima.nome}</h4>
                <div style="font-size: 0.95rem; margin-bottom: 10px;">
                    <p><i class="fa-regular fa-clock"></i> Início marcado para as <strong>${proxima.inicio}</strong></p>
                    <p class="mt-1"><i class="fa-solid fa-users"></i> Esperados: <strong>${totalEsperado}</strong> / ${proxima.limite}</p>
                </div>
                ${htmlAlunosProx}
                <button class="btn btn-outline mt-2" style="padding: 6px 12px; font-size: 0.85rem; width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;" data-action="adiantar-aula" data-id="${proxima.id}"><i class="fa-solid fa-forward-step"></i> Iniciar Aula Agora</button>
            `;
        } else {
            boxProxima.innerHTML = '<p class="text-light mt-1">Não há mais aulas agendadas para hoje.</p>';
        }
    }
};

window.renderReposicoesGrid = async (aulaId, dateStr) => {
    window.lastRepData = dateStr;
    const grid = document.getElementById('grid-reposicoes-gerenciar');
    if (!grid) return;

    state.reposicoes = await DB.getAll('reposicoes');
    state.aula_alunos = await DB.getAll('aula_alunos');

    const reposicoesNesteDia = state.reposicoes.filter(r => r.dataReposicao === dateStr && r.aulaIdReposicao === aulaId);
    const matriculasFixas = state.aula_alunos.filter(m => m.aulaId === aulaId);

    const html = state.alunos.map(alu => {
        const isFixo = matriculasFixas.some(m => m.alunoId === alu.id);
        const isRep = reposicoesNesteDia.some(r => r.alunoId === alu.id);

        if (isFixo) {
            return `
                <label class="student-check-item disabled" style="opacity: 0.6; background: #f8fafc;">
                    <input type="checkbox" disabled checked>
                    <span class="custom-checkbox" style="background: var(--border); border-color: var(--border);"></span>
                    <div class="student-info">
                        <span class="name" style="color: var(--text-light);">${alu.nome}</span>
                        <span class="alert" style="display:block; color: var(--text-light); font-size: 0.75rem;">Já matriculado como fixo</span>
                    </div>
                </label>
            `;
        }

        const wrapperStyle = isRep ? "border-color: var(--warning); background-color: #fffbeb;" : "";

        return `
            <label class="student-check-item" style="${wrapperStyle}">
                <input type="checkbox" class="check-reposicao-dinamica" value="${alu.id}" data-aula="${aulaId}" data-data="${dateStr}" ${isRep ? 'checked' : ''}>
                <span class="custom-checkbox"></span>
                <div class="student-info">
                    <span class="name">${alu.nome}</span>
                    <span class="freq" style="color: var(--warning); font-weight: 600;">${isRep ? 'Na Reposição' : 'Adicionar Reposição'}</span>
                </div>
            </label>
        `;
    }).join('');

    grid.innerHTML = html || '<p style="grid-column: 1/-1;">Nenhum aluno disponível.</p>';
};

const loadData = async () => {
    state.alunos = await DB.getAll('alunos');
    state.aulas = await DB.getAll('aulas');
    state.aula_alunos = await DB.getAll('aula_alunos');
    state.presencas = await DB.getAll('presencas');
    state.faltas = await DB.getAll('faltas');
    state.reposicoes = await DB.getAll('reposicoes');

    const conf = await DB.getConfig('precos_tabela');
    if (conf) state.precos = conf.values;

    UI.renderAlunos(state.alunos, state.precos);
    UI.renderAulasList(state.aulas);
    UI.renderCalendarioGeral();
    carregarFaltasEReposicoes();
    updatePainelAoVivo();

    if (fpMesFin && !document.getElementById('mes-financeiro').value) {
        fpMesFin.setDate(getLocalMonth());
    }

    let mesFinValor = document.getElementById('mes-financeiro').value;
    if (fpMesFin && fpMesFin.selectedDates.length > 0) {
        mesFinValor = flatpickr.formatDate(fpMesFin.selectedDates[0], "Y-m");
    }

    UI.renderFinanceiro(state.alunos, state.precos, mesFinValor);
    UI.updateChoicesSafe(state.alunos, state.aulas);

    if (document.getElementById('select-aula-gerenciar') && document.getElementById('select-aula-gerenciar').value) {
        await handleAlocacaoChange();
    }
    if (document.getElementById('select-aula-reposicao') && document.getElementById('select-aula-reposicao').value) {
        await handleReposicaoAbaChange();
    }
};

const handleAlocacaoChange = async () => {
    const aulaId = Number(document.getElementById('select-aula-gerenciar').value);
    const area = document.getElementById('area-alocacao');
    if (!aulaId) return area.style.display = 'none';

    area.style.display = 'block';
    const aula = state.aulas.find(a => a.id === aulaId);

    const matriculasFixas = state.aula_alunos.filter(m => m.aulaId === aulaId);
    const vagasFixasOcupadas = matriculasFixas.length;
    const isFull = vagasFixasOcupadas >= aula.limite;

    document.getElementById('alocacao-titulo-aula').innerText = `${aula.nome}`;

    const badge = document.querySelector('.vagas-badge');
    document.getElementById('aula-ocupacao').innerText = `${vagasFixasOcupadas}/${aula.limite}`;
    if (isFull) badge.classList.add('lotado'); else badge.classList.remove('lotado');

    const htmlCheckboxes = state.alunos.map(alu => {
        const isNaAula = matriculasFixas.some(m => m.alunoId === alu.id);
        const frequenciaPermitida = alu.frequencia || 1;
        const sessoesOcupadasGeral = state.aula_alunos.filter(m => m.alunoId === alu.id).length;

        const limiteEstourado = !isNaAula && (sessoesOcupadasGeral >= frequenciaPermitida);

        if (limiteEstourado) {
            return '';
        }

        const aulaCheiaParaForasteiro = !isNaAula && isFull;
        const isDisabled = aulaCheiaParaForasteiro;

        let alertMsg = "";
        if (aulaCheiaParaForasteiro) alertMsg = "Turma Lotada";

        return `
            <label class="student-check-item ${isDisabled ? 'disabled' : ''}">
                <input type="checkbox" value="${alu.id}" ${isNaAula ? 'checked' : ''} ${isDisabled ? 'disabled' : ''}>
                <span class="custom-checkbox"></span>
                <div class="student-info">
                    <span class="name">${alu.nome}</span>
                    <span class="freq">${sessoesOcupadasGeral}/${frequenciaPermitida} fixas na semana</span>
                    <span class="alert">${alertMsg}</span>
                </div>
            </label>
        `;
    }).join('');

    const container = document.getElementById('lista-alunos-checkbox');
    container.className = 'student-check-list';
    container.innerHTML = htmlCheckboxes;
};

const handleReposicaoAbaChange = async () => {
    const aulaId = Number(document.getElementById('select-aula-reposicao').value);
    const area = document.getElementById('area-reposicao-alocacao');
    if (!aulaId) return area.style.display = 'none';

    area.style.display = 'block';
    const aula = state.aulas.find(a => a.id === aulaId);

    const mapDias = { 'Domingo': 0, 'Segunda-feira': 1, 'Terça-feira': 2, 'Quarta-feira': 3, 'Quinta-feira': 4, 'Sexta-feira': 5, 'Sábado': 6 };
    const diaNum = mapDias[aula.diaSemana];

    if (window.fpRepGerenciar) window.fpRepGerenciar.destroy();

    window.fpRepGerenciar = flatpickr("#data-reposicao-gerenciar", {
        locale: "pt",
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "d/m/Y",
        disableMobile: true,
        minDate: "today",
        enable: [
            function (date) {
                return date.getDay() === diaNum;
            }
        ],
        onChange: function (selectedDates, dateStr) {
            if (dateStr) {
                window.renderReposicoesGrid(aula.id, dateStr);
            }
        }
    });

    if (window.lastRepData && new Date(window.lastRepData + "T12:00:00").getDay() === diaNum) {
        window.fpRepGerenciar.setDate(window.lastRepData);
        window.renderReposicoesGrid(aula.id, window.lastRepData);
    } else {
        window.lastRepData = null;
        document.getElementById('grid-reposicoes-gerenciar').innerHTML = '<p style="grid-column: 1 / -1; color: var(--text-light); font-size: 0.9rem;">Selecione a data acima para visualizar e gerenciar alunos extras para esta turma.</p>';
    }
};

setInterval(updatePainelAoVivo, 60000);

const setup = () => {

    document.getElementById('btn-view-criar').onclick = () => {
        document.getElementById('view-criar-aula').style.display = 'block';
        document.getElementById('view-gerenciar-agenda').style.display = 'none';
        document.getElementById('view-gerenciar-reposicao').style.display = 'none';
        document.getElementById('btn-view-criar').classList.add('active-subtab');
        document.getElementById('btn-view-gerenciar').classList.remove('active-subtab');
        document.getElementById('btn-view-reposicao').classList.remove('active-subtab');
    };
    document.getElementById('btn-view-gerenciar').onclick = () => {
        document.getElementById('view-criar-aula').style.display = 'none';
        document.getElementById('view-gerenciar-agenda').style.display = 'block';
        document.getElementById('view-gerenciar-reposicao').style.display = 'none';
        document.getElementById('btn-view-criar').classList.remove('active-subtab');
        document.getElementById('btn-view-gerenciar').classList.add('active-subtab');
        document.getElementById('btn-view-reposicao').classList.remove('active-subtab');
    };
    document.getElementById('btn-view-reposicao').onclick = () => {
        document.getElementById('view-criar-aula').style.display = 'none';
        document.getElementById('view-gerenciar-agenda').style.display = 'none';
        document.getElementById('view-gerenciar-reposicao').style.display = 'block';
        document.getElementById('btn-view-criar').classList.remove('active-subtab');
        document.getElementById('btn-view-gerenciar').classList.remove('active-subtab');
        document.getElementById('btn-view-reposicao').classList.add('active-subtab');
    };

    document.getElementById('btn-novo-aluno').onclick = () => UI.toggleModal('modal-aluno', true);
    document.getElementById('btn-config-precos').onclick = () => {
        for (let i = 1; i <= 3; i++) document.getElementById(`price-${i}`).value = state.precos[i] || 0;
        UI.toggleModal('modal-precos', true);
    };
    document.getElementById('btn-backup-menu').onclick = () => UI.toggleModal('modal-backup', true);
    document.querySelectorAll('.close-modal').forEach(b => b.onclick = () => UI.toggleModal(b.dataset.target, false));

    document.getElementById('form-aluno').onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('aluno-id').value;
        const data = {
            nome: document.getElementById('aluno-nome').value,
            frequencia: Number(document.getElementById('aluno-frequencia').value) || 1,
            pagamentos: id ? state.alunos.find(a => a.id === Number(id)).pagamentos : {}
        };
        if (id) data.id = Number(id);
        await DB.save('alunos', data);
        UI.toggleModal('modal-aluno', false);
        loadData();
    };

    document.getElementById('form-precos').onsubmit = async (e) => {
        e.preventDefault();
        const values = {
            1: Number(document.getElementById('price-1').value),
            2: Number(document.getElementById('price-2').value),
            3: Number(document.getElementById('price-3').value)
        };
        await DB.save('config', { key: 'precos_tabela', values });
        UI.toggleModal('modal-precos', false);
        loadData();
    };

    document.getElementById('form-aula').onsubmit = async (e) => {
        e.preventDefault();
        const diaSemana = document.getElementById('aula-dia').value;
        const inicio = document.getElementById('aula-inicio').value;
        const fim = document.getElementById('aula-fim').value;

        if (!diaSemana) return UI.customConfirm('Atenção', 'Selecione o dia da semana.', 'info', () => { });
        if (!inicio || !fim) return UI.customConfirm('Atenção', 'Preencha os horários corretamente.', 'info', () => { });
        if (inicio >= fim) return UI.customConfirm('Aviso', 'O horário de término deve ser maior que o início.', 'info', () => { });

        const choque = state.aulas.some(a => a.diaSemana === diaSemana && (inicio < a.fim) && (fim > a.inicio));
        if (choque) return UI.customConfirm('Conflito', 'Já existe uma turma cadastrada nesse período no mesmo dia.', 'info', () => { });

        await DB.save('aulas', {
            nome: document.getElementById('aula-nome').value,
            diaSemana,
            inicio,
            fim,
            limite: Number(document.getElementById('aula-limite').value)
        });

        document.getElementById('form-aula').reset();
        if (fpAulaInicio) fpAulaInicio.clear();
        if (fpAulaFim) fpAulaFim.clear();
        loadData();
    };
    
    document.getElementById('form-edit-aula').onsubmit = async (e) => {
        e.preventDefault();
        const id = Number(document.getElementById('edit-aula-id').value);
        const diaSemana = document.getElementById('edit-aula-dia').value;
        const inicio = document.getElementById('edit-aula-inicio').value;
        const fim = document.getElementById('edit-aula-fim').value;
        const nome = document.getElementById('edit-aula-nome').value;
        const limite = Number(document.getElementById('edit-aula-limite').value);

        if (!inicio || !fim) return UI.customConfirm('Atenção', 'Preencha os horários corretamente.', 'info', () => { });
        if (inicio >= fim) return UI.customConfirm('Aviso', 'O horário de término deve ser maior que o início.', 'info', () => { });

        const choque = state.aulas.some(a => a.id !== id && a.diaSemana === diaSemana && (inicio < a.fim) && (fim > a.inicio));
        if (choque) return UI.customConfirm('Conflito', 'Já existe uma turma cadastrada nesse período no mesmo dia.', 'info', () => { });

        const aulaAtual = state.aulas.find(a => a.id === id);
        if (aulaAtual) {
            aulaAtual.nome = nome;
            aulaAtual.diaSemana = diaSemana;
            aulaAtual.inicio = inicio;
            aulaAtual.fim = fim;
            aulaAtual.limite = limite;
            await DB.save('aulas', aulaAtual);
            UI.toggleModal('modal-edit-aula', false);
            loadData();
        }
    };

    document.getElementById('filtro-dia-agenda').addEventListener('change', () => {
        UI.updateChoicesSafe(state.alunos, state.aulas);
    });

    document.getElementById('select-aula-gerenciar').addEventListener('change', handleAlocacaoChange);

    document.getElementById('filtro-dia-reposicao').addEventListener('change', () => {
        UI.updateChoicesSafe(state.alunos, state.aulas);
    });
    
    document.getElementById('select-aula-reposicao').addEventListener('change', handleReposicaoAbaChange);


    document.getElementById('select-aluno-prontuario').addEventListener('change', async (e) => {
        const id = Number(e.target.value);
        const area = document.getElementById('area-prontuario-detalhe');
        document.getElementById('evo-id').value = ''; document.getElementById('evo-desc').value = '';
        if (fpDataEvo) fpDataEvo.setDate(getLocalDate());

        if (!id) {
            area.style.display = 'none';
            document.getElementById('btn-trigger-pdf-modal').style.display = 'none';
            state.currentEvos = [];
            return;
        }

        area.style.display = 'block';
        document.getElementById('btn-trigger-pdf-modal').style.display = 'inline-flex';

        state.currentEvos = await DB.getByIndex('evolucoes', 'alunoId', id);
        UI.renderEvolucoes(state.currentEvos);
    });

    document.getElementById('lista-alunos-checkbox').addEventListener('change', async (e) => {
        if (e.target.tagName === 'INPUT' && e.target.type === 'checkbox') {
            const alunoId = Number(e.target.value);
            const aulaId = Number(document.getElementById('select-aula-gerenciar').value);
            if (e.target.checked) {
                await DB.save('aula_alunos', { aulaId, alunoId });
            } else {
                const matriculas = await DB.getByIndex('aula_alunos', 'aulaId', aulaId);
                const mat = matriculas.find(m => m.alunoId === alunoId);
                if (mat) await DB.remove('aula_alunos', mat.id);
            }
            await loadData();
        }
    });

    // Event listener separado para a grid dinâmica na nova aba
    document.addEventListener('change', async (e) => {
        if (e.target.tagName === 'INPUT' && e.target.type === 'checkbox' && e.target.classList.contains('check-reposicao-dinamica')) {
            const alunoId = Number(e.target.value);
            const aulaId = Number(e.target.dataset.aula);
            const dataRep = e.target.dataset.data;

            if (e.target.checked) {
                await DB.save('reposicoes', { alunoId, faltaId: 0, dataReposicao: dataRep, aulaIdReposicao: aulaId });
            } else {
                const repos = await DB.getAll('reposicoes');
                const repsToRemove = repos.filter(r => r.alunoId === alunoId && r.dataReposicao === dataRep && r.aulaIdReposicao === aulaId);
                for (let r of repsToRemove) {
                    await DB.remove('reposicoes', r.id);
                    if (r.faltaId && r.faltaId > 0) {
                        const faltas = await DB.getAll('faltas');
                        const falta = faltas.find(f => f.id === r.faltaId);
                        if (falta) {
                            falta.status = 'pendente';
                            await DB.save('faltas', falta);
                        }
                    }
                }
            }
            await loadData();
        }
    });


    document.getElementById('reposicao-data').addEventListener('change', (e) => {
        const dateStr = e.target.value;
        const selectAula = document.getElementById('reposicao-aula');
        if (!dateStr) {
            selectAula.innerHTML = '<option value="" disabled selected>Selecione a data primeiro...</option>';
            return;
        }

        const dateObj = new Date(dateStr + "T12:00:00");
        const dias = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
        const diaNome = dias[dateObj.getDay()];

        const aulasNoDia = state.aulas.filter(a => a.diaSemana === diaNome).sort((a, b) => a.inicio.localeCompare(b.inicio));

        let html = '<option value="" disabled selected>Selecione uma turma...</option>';
        let achouAula = false;

        aulasNoDia.forEach(aula => {
            const matriculasFixas = state.aula_alunos.filter(m => m.aulaId === aula.id).length;
            achouAula = true;
            html += `<option value="${aula.id}">${aula.nome} (${aula.inicio} - ${aula.fim}) - ${matriculasFixas}/${aula.limite} fixos</option>`;
        });

        if (!achouAula) html = '<option value="" disabled selected>Nenhuma turma cadastrada neste dia.</option>';
        selectAula.innerHTML = html;
    });

    document.getElementById('form-reposicao').onsubmit = async (e) => {
        e.preventDefault();
        const faltaId = Number(document.getElementById('reposicao-falta-id').value);
        const dataReposicao = document.getElementById('reposicao-data').value;
        const aulaIdReposicao = Number(document.getElementById('reposicao-aula').value);

        if (!dataReposicao || !aulaIdReposicao) return UI.customConfirm('Aviso', 'Selecione uma data e turma válidas.', 'info', () => { });

        const falta = state.faltas.find(f => f.id === faltaId);
        if (!falta) return;

        const repos = await DB.getAll('reposicoes');
        const repExistente = repos.find(r => r.faltaId === faltaId);

        const dadosRep = { alunoId: falta.alunoId, faltaId, dataReposicao, aulaIdReposicao };
        if (repExistente) dadosRep.id = repExistente.id;

        await DB.save('reposicoes', dadosRep);

        falta.status = 'reposta';
        await DB.save('faltas', falta);

        UI.toggleModal('modal-reposicao', false);
        UI.customConfirm('Sucesso', 'Reposição agendada com sucesso!', 'info', () => { });
        loadData();
    };

    document.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const id = Number(btn.dataset.id);
        const act = btn.dataset.action;

        if (act === 'adiantar-aula') {
            state.aulaAdiantadaId = id;
            updatePainelAoVivo();
            return;
        }

        if (act === 'marcar-p' || act === 'marcar-f') {
            const alunoId = Number(btn.dataset.aluno);
            const aulaId = Number(btn.dataset.aula);
            const dataHojeStr = getLocalDate();
            const presencaId = `${dataHojeStr}_${aulaId}_${alunoId}`;
            const status = act === 'marcar-p' ? 'P' : 'F';

            await DB.save('presencas', { id: presencaId, data: dataHojeStr, aulaId, alunoId, status });

            if (status === 'F') {
                const faltasNoBanco = await DB.getAll('faltas');
                const existeFalta = faltasNoBanco.find(f => f.data === dataHojeStr && f.aulaId === aulaId && f.alunoId === alunoId);
                if (!existeFalta) {
                    await DB.save('faltas', { alunoId, data: dataHojeStr, aulaId, status: 'pendente' });
                }
            } else {
                const faltasNoBanco = await DB.getAll('faltas');
                const existeFalta = faltasNoBanco.find(f => f.data === dataHojeStr && f.aulaId === aulaId && f.alunoId === alunoId);
                if (existeFalta) {
                    const repos = await DB.getAll('reposicoes');
                    const repsVinculadas = repos.filter(r => r.faltaId === existeFalta.id);
                    for (let r of repsVinculadas) {
                        await DB.remove('reposicoes', r.id);
                    }
                    await DB.remove('faltas', existeFalta.id);
                }
            }
            await loadData();
            return;
        }

        if (act === 'abrir-reposicao') {
            const falta = state.faltas.find(f => f.id === id);
            const aluno = state.alunos.find(a => a.id === falta.alunoId);
            document.getElementById('reposicao-falta-id').value = falta.id;
            document.getElementById('txt-info-falta').innerText = `Repondo falta de ${aluno.nome} referente ao dia ${formatDisplayDate(falta.data)}`;

            if (fpDataReposicao) fpDataReposicao.clear();
            document.getElementById('reposicao-aula').innerHTML = '<option value="" disabled selected>Selecione a data primeiro...</option>';

            UI.toggleModal('modal-reposicao', true);
            return;
        }

        if (act === 'del-aluno') {
            UI.customConfirm('Excluir Aluno', 'Isso removerá todo o histórico dele.', 'del', async () => {
                const mats = await DB.getByIndex('aula_alunos', 'alunoId', id);
                for (let m of mats) await DB.remove('aula_alunos', m.id);
                await DB.remove('alunos', id);
                loadData();
            });
        }
        if (act === 'edit-aluno') {
            const a = state.alunos.find(x => x.id === id);
            document.getElementById('aluno-id').value = a.id;
            document.getElementById('aluno-nome').value = a.nome;
            if (choicesFreqAluno) choicesFreqAluno.setChoiceByValue(String(a.frequencia || 1));
            UI.toggleModal('modal-aluno', true);
        }
        if (act === 'del-aula') {
            UI.customConfirm('Excluir Turma', 'Os alunos ficarão livres desse horário.', 'del', async () => {
                
                const mats = await DB.getByIndex('aula_alunos', 'aulaId', id);
                for (let m of mats) await DB.remove('aula_alunos', m.id);

                const repos = await DB.getAll('reposicoes');
                const repsToRemove = repos.filter(r => r.aulaIdReposicao === id);
                for (let r of repsToRemove) {
                    await DB.remove('reposicoes', r.id);
                    if (r.faltaId && r.faltaId > 0) {
                        const faltas = await DB.getAll('faltas');
                        const falta = faltas.find(f => f.id === r.faltaId);
                        if (falta) {
                            falta.status = 'pendente';
                            await DB.save('faltas', falta);
                        }
                    }
                }

                await DB.remove('aulas', id);
                await loadData();
            });
        }
        if (act === 'edit-aula') {
            const aula = state.aulas.find(a => a.id === id);
            if (aula) {
                document.getElementById('edit-aula-id').value = aula.id;
                document.getElementById('edit-aula-dia').value = aula.diaSemana;
                document.getElementById('edit-aula-nome').value = aula.nome;
                document.getElementById('edit-aula-limite').value = aula.limite;
                
                if (fpEditAulaInicio) fpEditAulaInicio.setDate(aula.inicio);
                if (fpEditAulaFim) fpEditAulaFim.setDate(aula.fim);
                
                UI.toggleModal('modal-edit-aula', true);
            }
        }
        if (act === 'edit-evo') {
            const evo = (await DB.getAll('evolucoes')).find(e => e.id === id);
            if (evo) {
                document.getElementById('evo-id').value = evo.id;

                let dataToSet = evo.data;
                if (dataToSet.includes('/')) {
                    const [d, m, y] = dataToSet.split('/');
                    dataToSet = `${y}-${m}-${d}`;
                }
                if (fpDataEvo) fpDataEvo.setDate(dataToSet);
                document.getElementById('evo-desc').value = evo.descricao;
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }
        if (act === 'del-evo') {
            UI.customConfirm('Excluir Registro', 'Apagar esta evolução do prontuário?', 'del', async () => {
                await DB.remove('evolucoes', id);
                const alunoId = Number(document.getElementById('select-aluno-prontuario').value);
                state.currentEvos = await DB.getByIndex('evolucoes', 'alunoId', alunoId);
                UI.renderEvolucoes(state.currentEvos);
            });
        }
    });

    document.addEventListener('change', async (e) => {
        if (e.target.classList.contains('status-select-native')) {
            const id = Number(e.target.dataset.id);

            let mesFinValor = document.getElementById('mes-financeiro').value;
            if (fpMesFin && fpMesFin.selectedDates.length > 0) {
                mesFinValor = flatpickr.formatDate(fpMesFin.selectedDates[0], "Y-m");
            }

            const alu = state.alunos.find(a => a.id === id);
            if (!alu.pagamentos) alu.pagamentos = {};
            alu.pagamentos[mesFinValor] = e.target.value;

            e.target.className = `status-select-native st-${e.target.value}`;

            await DB.save('alunos', alu);
        }
    });

    document.getElementById('btn-export-pdf-fin').onclick = () => {
        let displayMonth = "Geral";
        let fileMonth = "Geral";

        if (fpMesFin && fpMesFin.selectedDates.length > 0) {
            const dateObj = fpMesFin.selectedDates[0];
            const dataBr = dateObj.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
            displayMonth = dataBr.charAt(0).toUpperCase() + dataBr.slice(1);
            fileMonth = flatpickr.formatDate(dateObj, "m_Y");
        }

        const infoFin = document.getElementById('print-fin-info');
        if (infoFin) infoFin.innerText = `Mês de Referência: ${displayMonth}`;

        const originalTitle = document.title;
        document.title = `Financeiro_${fileMonth}`;

        window.print();

        document.title = originalTitle;
    };

    document.getElementById('btn-trigger-pdf-modal').onclick = () => {
        if (fpMesPdf) fpMesPdf.clear();
        UI.toggleModal('modal-pdf-periodo', true);
    }

    document.getElementById('btn-confirm-pdf-prontuario').onclick = () => {
        const id = Number(document.getElementById('select-aluno-prontuario').value);
        const aluno = state.alunos.find(a => a.id === id);
        if (!aluno) return;

        let mesBusca = "";
        let displayMonth = "Todo o histórico";
        let fileMonth = "Geral";

        if (fpMesPdf && fpMesPdf.selectedDates.length > 0) {
            const dateObj = fpMesPdf.selectedDates[0];
            mesBusca = flatpickr.formatDate(dateObj, "Y-m");

            const dataBr = dateObj.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
            displayMonth = dataBr.charAt(0).toUpperCase() + dataBr.slice(1);

            fileMonth = flatpickr.formatDate(dateObj, "m_Y");
        }

        let evosToPrint = state.currentEvos || [];

        if (mesBusca) {
            evosToPrint = evosToPrint.filter(e => {
                let compData = e.data;
                if (compData.includes('/')) {
                    const [d, m, y] = compData.split('/');
                    compData = `${y}-${m}-${d}`;
                }
                return compData.startsWith(mesBusca);
            });
        }

        UI.renderEvolucoes(evosToPrint);
        document.getElementById('print-aluno-info').innerText = `Paciente: ${aluno.nome} | Período: ${displayMonth}`;
        UI.toggleModal('modal-pdf-periodo', false);

        const originalTitle = document.title;
        document.title = `Evolução_${aluno.nome}_${fileMonth}`;

        window.print();

        document.title = originalTitle;
        setTimeout(() => { UI.renderEvolucoes(state.currentEvos); }, 300);
    };

    document.getElementById('form-evolucao').onsubmit = async (e) => {
        e.preventDefault();
        const alunoId = Number(document.getElementById('select-aluno-prontuario').value);

        let dataSalvar = getLocalDate();
        if (fpDataEvo && fpDataEvo.selectedDates.length > 0) {
            dataSalvar = flatpickr.formatDate(fpDataEvo.selectedDates[0], "Y-m-d");
        }

        const dataEvo = { alunoId, data: dataSalvar, descricao: document.getElementById('evo-desc').value };
        const id = document.getElementById('evo-id').value;
        if (id) dataEvo.id = Number(id);

        await DB.save('evolucoes', dataEvo);

        document.getElementById('evo-id').value = '';
        document.getElementById('evo-desc').value = '';
        if (fpDataEvo) fpDataEvo.setDate(getLocalDate());

        state.currentEvos = await DB.getByIndex('evolucoes', 'alunoId', alunoId);
        UI.renderEvolucoes(state.currentEvos);
    };

    document.getElementById('btn-export-json').onclick = () => DB.exportJSON();
    document.getElementById('btn-import-trigger').onclick = () => document.getElementById('input-import-json').click();
    document.getElementById('input-import-json').onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                await DB.importJSON(JSON.parse(ev.target.result));
                UI.toggleModal('modal-backup', false);
                await loadData();
                UI.customConfirm('Sucesso', 'Backup restaurado com sucesso!', 'info', () => { });
            } catch (err) { UI.customConfirm('Erro', 'Arquivo de backup inválido.', 'del', () => { }); }
        };
        reader.readAsText(file);
    };
};

document.addEventListener('DOMContentLoaded', async () => {
    setupNavigation();
    try {
        await DB.initDB();
        initPlugins();
        setup();
        await loadData();
    } catch (e) {
        console.error("Falha ao inicializar", e);
    }
});
