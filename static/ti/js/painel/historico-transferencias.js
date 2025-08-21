/**
 * Histórico de Transferências - Sistema Evoque Fitness
 * 
 * Este módulo gerencia a interface do histórico de transferências com funcionalidades
 * de visualização de métricas, filtros avançados e gráficos.
 */

class HistoricoTransferencias {
    constructor() {
        this.transferencias = [];
        this.agentes = [];
        this.filtros = {};
        this.paginaAtual = 1;
        this.itensPorPagina = 20;
        this.carregando = false;
        this.charts = {};
        this.init();
    }

    init() {
        console.log('🔄 Inicializando histórico de transferências...');
        this.bindEvents();
        this.inicializarFiltros();
        this.carregarAgentes();
        this.carregarDados();
        this.inicializarGraficos();
    }

    /**
     * Vincula eventos da interface
     */
    bindEvents() {
        // Botões principais
        document.getElementById('btnAtualizarHistoricoTransferencias')?.addEventListener('click', () => {
            this.carregarDados(true);
        });

        document.getElementById('btnFiltrosHistoricoTransferencias')?.addEventListener('click', () => {
            this.toggleFiltros();
        });

        document.getElementById('btnFiltrarHistoricoTransferencias')?.addEventListener('click', () => {
            this.aplicarFiltros();
        });

        document.getElementById('btnLimparFiltrosTransferencias')?.addEventListener('click', () => {
            this.limparFiltros();
        });

        // Event delegation para ações da tabela
        document.addEventListener('click', (event) => {
            if (event.target.matches('.btn-detalhes-transferencia')) {
                event.preventDefault();
                const transferenciaId = event.target.dataset.transferenciaId;
                this.mostrarDetalhesTransferencia(transferenciaId);
            }

            if (event.target.matches('.btn-historico-chamado-transferencia')) {
                event.preventDefault();
                const chamadoId = event.target.dataset.chamadoId;
                this.mostrarHistoricoChamado(chamadoId);
            }
        });

        // Navegação de páginas
        document.addEventListener('click', (event) => {
            if (event.target.matches('.pagina-historico-transferencias')) {
                event.preventDefault();
                const pagina = parseInt(event.target.dataset.pagina);
                this.mudarPagina(pagina);
            }
        });

        // Auto-aplicar filtros com debounce
        const campo = document.getElementById('filtroTransferenciaChamado');
        if (campo) {
            campo.addEventListener('input', this.debounce(() => {
                this.aplicarFiltros();
            }, 500));
        }
    }

    /**
     * Inicializa configurações de filtros
     */
    inicializarFiltros() {
        // Definir datas padrão (últimos 30 dias)
        const hoje = new Date();
        const trintaDiasAtras = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000);
        
        const dataInicio = document.getElementById('filtroTransferenciaDataInicio');
        const dataFim = document.getElementById('filtroTransferenciaDataFim');
        
        if (dataInicio) dataInicio.value = trintaDiasAtras.toISOString().split('T')[0];
        if (dataFim) dataFim.value = hoje.toISOString().split('T')[0];
    }

    /**
     * Carrega agentes para os filtros
     */
    async carregarAgentes() {
        try {
            const response = await fetch('/ti/api/agentes/disponiveis');
            if (response.ok) {
                const data = await response.json();
                this.agentes = data.agentes || [];
                this.preencherSelectsAgentes();
            }
        } catch (error) {
            console.error('❌ Erro ao carregar agentes:', error);
        }
    }

    /**
     * Preenche selects de agentes
     */
    preencherSelectsAgentes() {
        const selectOrigemId = 'filtroTransferenciaAgenteOrigem';
        const selectDestinoId = 'filtroTransferenciaAgenteDestino';
        
        const options = this.agentes.map(agente => 
            `<option value="${agente.id}">${agente.usuario.nome}</option>`
        ).join('');
        
        [selectOrigemId, selectDestinoId].forEach(selectId => {
            const select = document.getElementById(selectId);
            if (select) {
                select.innerHTML = '<option value="">Todos</option>' + options;
            }
        });
    }

    /**
     * Carrega dados do histórico
     */
    async carregarDados(forcarAtualizacao = false) {
        if (this.carregando && !forcarAtualizacao) return;

        try {
            this.carregando = true;
            this.mostrarLoading();

            const params = new URLSearchParams({
                pagina: this.paginaAtual,
                itens_por_pagina: this.itensPorPagina,
                ...this.filtros
            });

            const response = await fetch(`/ti/api/historico/transferencias?${params}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            this.transferencias = data.transferencias || [];
            
            this.renderizarTabela();
            this.atualizarEstatisticas(data.estatisticas || {});
            this.renderizarPaginacao(data.total || 0);
            this.atualizarGraficos(data.graficos || {});

        } catch (error) {
            console.error('❌ Erro ao carregar histórico:', error);
            this.mostrarErro('Erro ao carregar histórico de transferências');
        } finally {
            this.carregando = false;
            this.ocultarLoading();
        }
    }

    /**
     * Renderiza tabela de transferências
     */
    renderizarTabela() {
        const tbody = document.getElementById('tabelaHistoricoTransferencias');
        if (!tbody) return;

        if (this.transferencias.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center text-muted py-4">
                        <i class="fas fa-info-circle fa-2x mb-2"></i><br>
                        Nenhuma transferência encontrada com os filtros aplicados.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = this.transferencias.map(transferencia => this.renderizarLinhaTransferencia(transferencia)).join('');
    }

    /**
     * Renderiza uma linha da tabela
     */
    renderizarLinhaTransferencia(transferencia) {
        const tipoColor = this.getTipoTransferenciaColor(transferencia.tipo_transferencia);
        
        return `
            <tr>
                <td>${this.formatarDataCompleta(transferencia.data_transferencia)}</td>
                <td>
                    <strong>${transferencia.chamado.codigo}</strong><br>
                    <small class="text-muted">${transferencia.chamado.solicitante}</small>
                </td>
                <td>${transferencia.agente_anterior.nome || 'Não atribuído'}</td>
                <td>${transferencia.agente_novo.nome || 'Não atribuído'}</td>
                <td>${transferencia.usuario_transferencia.nome}</td>
                <td><span class="badge bg-${tipoColor}">${transferencia.tipo_transferencia}</span></td>
                <td>
                    <span class="text-truncate d-inline-block" style="max-width: 200px;" title="${transferencia.motivo_transferencia}">
                        ${transferencia.motivo_transferencia || 'Não informado'}
                    </span>
                </td>
                <td>
                    ${transferencia.status_anterior} → ${transferencia.status_novo}
                    ${transferencia.prioridade_anterior !== transferencia.prioridade_nova ? 
                        `<br><small class="text-muted">${transferencia.prioridade_anterior} → ${transferencia.prioridade_nova}</small>` : ''
                    }
                </td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-info btn-detalhes-transferencia" 
                                data-transferencia-id="${transferencia.id}" 
                                title="Ver detalhes">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-outline-secondary btn-historico-chamado-transferencia" 
                                data-chamado-id="${transferencia.chamado.id}" 
                                title="Ver chamado">
                            <i class="fas fa-ticket-alt"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }

    /**
     * Atualiza estatísticas
     */
    atualizarEstatisticas(stats) {
        document.getElementById('totalTransferenciasHistorico').textContent = stats.total || 0;
        document.getElementById('transferenciasHojeHistorico').textContent = stats.hoje || 0;
        document.getElementById('agenteMaisAtivoHistorico').textContent = stats.agente_mais_ativo || '-';
        document.getElementById('tempoMedioTransferenciaHistorico').textContent = `${stats.tempo_medio || 0}h`;
    }

    /**
     * Inicializa gráficos
     */
    inicializarGraficos() {
        // Gráfico de transferências por período
        const ctxPeriodo = document.getElementById('chartTransferenciasPeriodo');
        if (ctxPeriodo) {
            this.charts.periodo = new Chart(ctxPeriodo, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Transferências',
                        data: [],
                        borderColor: 'rgb(75, 192, 192)',
                        backgroundColor: 'rgba(75, 192, 192, 0.2)',
                        tension: 0.1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: {
                            display: true,
                            text: 'Transferências por Dia - Últimos 30 dias'
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                stepSize: 1
                            }
                        }
                    }
                }
            });
        }

        // Gráfico de tipos de transferência
        const ctxTipos = document.getElementById('chartTiposTransferencia');
        if (ctxTipos) {
            this.charts.tipos = new Chart(ctxTipos, {
                type: 'doughnut',
                data: {
                    labels: [],
                    datasets: [{
                        data: [],
                        backgroundColor: [
                            'rgb(255, 99, 132)',
                            'rgb(54, 162, 235)',
                            'rgb(255, 205, 86)',
                            'rgb(75, 192, 192)'
                        ]
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        title: {
                            display: true,
                            text: 'Distribuição por Tipo'
                        },
                        legend: {
                            position: 'bottom'
                        }
                    }
                }
            });
        }
    }

    /**
     * Atualiza gráficos com novos dados
     */
    atualizarGraficos(dadosGraficos) {
        // Atualizar gráfico de período
        if (this.charts.periodo && dadosGraficos.periodo) {
            this.charts.periodo.data.labels = dadosGraficos.periodo.labels || [];
            this.charts.periodo.data.datasets[0].data = dadosGraficos.periodo.dados || [];
            this.charts.periodo.update();
        }

        // Atualizar gráfico de tipos
        if (this.charts.tipos && dadosGraficos.tipos) {
            this.charts.tipos.data.labels = dadosGraficos.tipos.labels || [];
            this.charts.tipos.data.datasets[0].data = dadosGraficos.tipos.dados || [];
            this.charts.tipos.update();
        }
    }

    /**
     * Renderiza paginação
     */
    renderizarPaginacao(total) {
        const totalPaginas = Math.ceil(total / this.itensPorPagina);
        const paginacao = document.getElementById('paginacaoHistoricoTransferencias');
        
        if (!paginacao || totalPaginas <= 1) {
            if (paginacao) paginacao.innerHTML = '';
            return;
        }

        let html = '';
        
        // Botão anterior
        html += `
            <li class="page-item ${this.paginaAtual === 1 ? 'disabled' : ''}">
                <a class="page-link pagina-historico-transferencias" data-pagina="${this.paginaAtual - 1}">
                    <i class="fas fa-chevron-left"></i>
                </a>
            </li>
        `;

        // Páginas
        const inicio = Math.max(1, this.paginaAtual - 2);
        const fim = Math.min(totalPaginas, this.paginaAtual + 2);

        if (inicio > 1) {
            html += `<li class="page-item"><a class="page-link pagina-historico-transferencias" data-pagina="1">1</a></li>`;
            if (inicio > 2) {
                html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
            }
        }

        for (let i = inicio; i <= fim; i++) {
            html += `
                <li class="page-item ${i === this.paginaAtual ? 'active' : ''}">
                    <a class="page-link pagina-historico-transferencias" data-pagina="${i}">${i}</a>
                </li>
            `;
        }

        if (fim < totalPaginas) {
            if (fim < totalPaginas - 1) {
                html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
            }
            html += `<li class="page-item"><a class="page-link pagina-historico-transferencias" data-pagina="${totalPaginas}">${totalPaginas}</a></li>`;
        }

        // Botão próximo
        html += `
            <li class="page-item ${this.paginaAtual === totalPaginas ? 'disabled' : ''}">
                <a class="page-link pagina-historico-transferencias" data-pagina="${this.paginaAtual + 1}">
                    <i class="fas fa-chevron-right"></i>
                </a>
            </li>
        `;

        paginacao.innerHTML = html;
    }

    /**
     * Muda página
     */
    mudarPagina(pagina) {
        if (pagina < 1 || pagina === this.paginaAtual) return;
        
        this.paginaAtual = pagina;
        this.carregarDados();
    }

    /**
     * Toggle filtros
     */
    toggleFiltros() {
        const filtros = document.getElementById('filtrosHistoricoTransferencias');
        if (filtros) {
            filtros.style.display = filtros.style.display === 'none' ? 'block' : 'none';
        }
    }

    /**
     * Aplica filtros
     */
    aplicarFiltros() {
        this.filtros = {
            chamado: document.getElementById('filtroTransferenciaChamado')?.value || '',
            agente_origem: document.getElementById('filtroTransferenciaAgenteOrigem')?.value || '',
            agente_destino: document.getElementById('filtroTransferenciaAgenteDestino')?.value || '',
            tipo: document.getElementById('filtroTransferenciaTipo')?.value || '',
            data_inicio: document.getElementById('filtroTransferenciaDataInicio')?.value || '',
            data_fim: document.getElementById('filtroTransferenciaDataFim')?.value || ''
        };

        // Remover valores vazios
        Object.keys(this.filtros).forEach(key => {
            if (!this.filtros[key]) {
                delete this.filtros[key];
            }
        });

        this.paginaAtual = 1;
        this.carregarDados();
    }

    /**
     * Limpa filtros
     */
    limparFiltros() {
        const campos = [
            'filtroTransferenciaChamado',
            'filtroTransferenciaAgenteOrigem',
            'filtroTransferenciaAgenteDestino',
            'filtroTransferenciaTipo',
            'filtroTransferenciaDataInicio',
            'filtroTransferenciaDataFim'
        ];

        campos.forEach(campoId => {
            const campo = document.getElementById(campoId);
            if (campo) campo.value = '';
        });

        this.filtros = {};
        this.paginaAtual = 1;
        this.carregarDados();
    }

    /**
     * Mostra detalhes da transferência
     */
    async mostrarDetalhesTransferencia(transferenciaId) {
        try {
            const transferencia = this.transferencias.find(t => t.id == transferenciaId);
            if (!transferencia) {
                this.mostrarErro('Transferência não encontrada');
                return;
            }

            const modal = this.criarModalDetalhes(transferencia);
            document.body.appendChild(modal);
            
            const bsModal = new bootstrap.Modal(modal);
            bsModal.show();

            // Limpar modal após fechar
            modal.addEventListener('hidden.bs.modal', () => {
                modal.remove();
            });

        } catch (error) {
            console.error('❌ Erro ao mostrar detalhes:', error);
            this.mostrarErro('Erro ao carregar detalhes da transferência');
        }
    }

    /**
     * Cria modal de detalhes
     */
    criarModalDetalhes(transferencia) {
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.setAttribute('tabindex', '-1');
        modal.innerHTML = `
            <div class="modal-dialog modal-lg">
                <div class="modal-content bg-dark text-white">
                    <div class="modal-header border-secondary">
                        <h5 class="modal-title">
                            <i class="fas fa-exchange-alt me-2"></i>
                            Detalhes da Transferência #${transferencia.id}
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <!-- Informações do Chamado -->
                        <div class="card bg-secondary mb-3">
                            <div class="card-header">
                                <h6 class="mb-0">Chamado Transferido</h6>
                            </div>
                            <div class="card-body">
                                <div class="row">
                                    <div class="col-md-6">
                                        <p><strong>Código:</strong> ${transferencia.chamado.codigo}</p>
                                        <p><strong>Solicitante:</strong> ${transferencia.chamado.solicitante}</p>
                                        <p><strong>Problema:</strong> ${transferencia.chamado.problema}</p>
                                    </div>
                                    <div class="col-md-6">
                                        <p><strong>Status Anterior:</strong> ${transferencia.status_anterior}</p>
                                        <p><strong>Status Novo:</strong> ${transferencia.status_novo}</p>
                                        <p><strong>Prioridade:</strong> ${transferencia.prioridade_anterior} → ${transferencia.prioridade_nova}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Informações da Transferência -->
                        <div class="row">
                            <div class="col-md-6">
                                <h6>Agentes Envolvidos</h6>
                                <p><strong>De:</strong> ${transferencia.agente_anterior.nome || 'Não atribuído'}</p>
                                <p><strong>Para:</strong> ${transferencia.agente_novo.nome || 'Não atribuído'}</p>
                                <p><strong>Transferido por:</strong> ${transferencia.usuario_transferencia.nome}</p>
                            </div>
                            <div class="col-md-6">
                                <h6>Informações da Transferência</h6>
                                <p><strong>Data:</strong> ${this.formatarDataCompleta(transferencia.data_transferencia)}</p>
                                <p><strong>Tipo:</strong> <span class="badge bg-${this.getTipoTransferenciaColor(transferencia.tipo_transferencia)}">${transferencia.tipo_transferencia}</span></p>
                                ${transferencia.tempo_entre_transferencias ? `<p><strong>Tempo desde última:</strong> ${transferencia.tempo_entre_transferencias}h</p>` : ''}
                            </div>
                        </div>

                        ${transferencia.motivo_transferencia ? `
                            <div class="mt-3">
                                <h6>Motivo da Transferência</h6>
                                <div class="bg-secondary p-3 rounded">
                                    ${transferencia.motivo_transferencia}
                                </div>
                            </div>
                        ` : ''}

                        ${transferencia.observacoes ? `
                            <div class="mt-3">
                                <h6>Observações</h6>
                                <div class="bg-secondary p-3 rounded">
                                    ${transferencia.observacoes}
                                </div>
                            </div>
                        ` : ''}

                        ${transferencia.metadados && Object.keys(transferencia.metadados).length > 0 ? `
                            <div class="mt-3">
                                <h6>Informações Adicionais</h6>
                                <div class="bg-secondary p-3 rounded">
                                    <pre class="text-white">${JSON.stringify(transferencia.metadados, null, 2)}</pre>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    <div class="modal-footer border-secondary">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                            <i class="fas fa-times me-1"></i>Fechar
                        </button>
                    </div>
                </div>
            </div>
        `;
        return modal;
    }

    /**
     * Mostra histórico completo do chamado
     */
    mostrarHistoricoChamado(chamadoId) {
        if (window.transferenciasChamados) {
            window.transferenciasChamados.mostrarHistoricoTransferencias(chamadoId);
        }
    }

    /**
     * Utilitários
     */
    formatarDataCompleta(dataString) {
        if (!dataString) return '-';
        const data = new Date(dataString);
        return data.toLocaleDateString('pt-BR') + ' ' + data.toLocaleTimeString('pt-BR');
    }

    getTipoTransferenciaColor(tipo) {
        const colors = {
            'manual': 'primary',
            'automatica': 'info',
            'escalacao': 'warning'
        };
        return colors[tipo] || 'secondary';
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    mostrarLoading() {
        const loading = document.getElementById('loadingHistoricoTransferencias');
        if (loading) loading.style.display = 'block';
    }

    ocultarLoading() {
        const loading = document.getElementById('loadingHistoricoTransferencias');
        if (loading) loading.style.display = 'none';
    }

    mostrarErro(mensagem) {
        console.error('❌', mensagem);
        if (typeof mostrarNotificacao === 'function') {
            mostrarNotificacao(mensagem, 'error');
        }
    }
}

// Inicializar quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    // Verificar se estamos na seção de histórico de transferências
    if (document.getElementById('historico-transferencias')) {
        window.historicoTransferencias = new HistoricoTransferencias();
        console.log('✅ Histórico de transferências inicializado');
    }
});

// Exportar para uso global
window.HistoricoTransferencias = HistoricoTransferencias;
