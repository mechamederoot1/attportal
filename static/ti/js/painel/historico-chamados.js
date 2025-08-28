/**
 * Histórico de Chamados - Sistema Evoque Fitness
 * 
 * Este módulo gerencia a interface do histórico de chamados com funcionalidades
 * de reabertura, filtros avançados e visualização de métricas.
 */

class HistoricoChamados {
    constructor() {
        this.chamados = [];
        this.filtros = {};
        this.paginaAtual = 1;
        this.itensPorPagina = 20;
        this.carregando = false;
        this.init();
    }

    init() {
        console.log('🔄 Inicializando histórico de chamados...');
        this.bindEvents();
        this.inicializarFiltros();
        this.carregarDados();
    }

    /**
     * Vincula eventos da interface
     */
    bindEvents() {
        // Botões principais
        document.getElementById('btnAtualizarHistoricoChamados')?.addEventListener('click', () => {
            this.carregarDados(true);
        });

        document.getElementById('btnFiltrosHistoricoChamados')?.addEventListener('click', () => {
            this.toggleFiltros();
        });

        document.getElementById('btnFiltrarHistoricoChamados')?.addEventListener('click', () => {
            this.aplicarFiltros();
        });

        document.getElementById('btnLimparFiltrosHistorico')?.addEventListener('click', () => {
            this.limparFiltros();
        });

        // Event delegation para ações da tabela
        document.addEventListener('click', (event) => {
            if (event.target.matches('.btn-reabrir-chamado-historico')) {
                event.preventDefault();
                const chamadoId = event.target.dataset.chamadoId;
                this.abrirModalReabertura(chamadoId);
            }

            if (event.target.matches('.btn-detalhes-chamado-historico')) {
                event.preventDefault();
                const chamadoId = event.target.dataset.chamadoId;
                this.mostrarDetalhesChamado(chamadoId);
            }

            if (event.target.matches('.btn-historico-reaberturas')) {
                event.preventDefault();
                const chamadoId = event.target.dataset.chamadoId;
                this.mostrarHistoricoReaberturas(chamadoId);
            }
        });

        // Navegação de páginas
        document.addEventListener('click', (event) => {
            if (event.target.matches('.pagina-historico-chamados')) {
                event.preventDefault();
                const pagina = parseInt(event.target.dataset.pagina);
                this.mudarPagina(pagina);
            }
        });

        // Auto-aplicar filtros com debounce
        const campos = ['filtroHistoricoSolicitante', 'filtroHistoricoProblema'];
        campos.forEach(campoId => {
            const campo = document.getElementById(campoId);
            if (campo) {
                campo.addEventListener('input', this.debounce(() => {
                    this.aplicarFiltros();
                }, 500));
            }
        });
    }

    /**
     * Inicializa configurações de filtros
     */
    inicializarFiltros() {
        // Carregar unidades para o filtro
        this.carregarUnidades();
        
        // Definir datas padrão (últimos 30 dias)
        const hoje = new Date();
        const trintaDiasAtras = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000);
        
        const dataInicio = document.getElementById('filtroHistoricoDataInicio');
        const dataFim = document.getElementById('filtroHistoricoDataFim');
        
        if (dataInicio) dataInicio.value = trintaDiasAtras.toISOString().split('T')[0];
        if (dataFim) dataFim.value = hoje.toISOString().split('T')[0];
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

            const response = await fetch(`/ti/api/historico/chamados?${params}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            this.chamados = data.chamados || [];
            
            this.renderizarTabela();
            this.atualizarEstatisticas(data.estatisticas || {});
            this.renderizarPaginacao(data.total || 0);

        } catch (error) {
            console.error('❌ Erro ao carregar histórico:', error);
            this.mostrarErro('Erro ao carregar histórico de chamados');
        } finally {
            this.carregando = false;
            this.ocultarLoading();
        }
    }

    /**
     * Renderiza tabela de chamados
     */
    renderizarTabela() {
        const tbody = document.getElementById('tabelaHistoricoChamados');
        if (!tbody) return;

        if (this.chamados.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center text-muted py-4">
                        <i class="fas fa-info-circle fa-2x mb-2"></i><br>
                        Nenhum chamado encontrado com os filtros aplicados.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = this.chamados.map(chamado => this.renderizarLinhaChamado(chamado)).join('');
    }

    /**
     * Renderiza uma linha da tabela
     */
    renderizarLinhaChamado(chamado) {
        const statusColor = this.getStatusColor(chamado.status);
        const prioridadeColor = this.getPriorityColor(chamado.prioridade);
        const podeReabrir = chamado.status === 'Concluido' && chamado.pode_reabrir;
        
        return `
            <tr>
                <td>
                    <strong>${chamado.codigo}</strong>
                    ${chamado.reaberto ? '<span class="badge bg-warning ms-1">REABERTO</span>' : ''}
                </td>
                <td>${chamado.solicitante}</td>
                <td>${chamado.problema}</td>
                <td><span class="badge bg-${statusColor}">${chamado.status}</span></td>
                <td><span class="badge bg-${prioridadeColor}">${chamado.prioridade}</span></td>
                <td>${this.formatarData(chamado.data_abertura)}</td>
                <td>${chamado.data_conclusao ? this.formatarData(chamado.data_conclusao) : '-'}</td>
                <td>
                    ${chamado.numero_reaberturas > 0 ? 
                        `<span class="badge bg-info">${chamado.numero_reaberturas}</span>` : 
                        '<span class="text-muted">-</span>'
                    }
                </td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-info btn-detalhes-chamado-historico" 
                                data-chamado-id="${chamado.id}" 
                                title="Ver detalhes">
                            <i class="fas fa-eye"></i>
                        </button>
                        ${podeReabrir ? `
                            <button class="btn btn-outline-warning btn-reabrir-chamado-historico" 
                                    data-chamado-id="${chamado.id}" 
                                    title="Reabrir chamado">
                                <i class="fas fa-redo"></i>
                            </button>
                        ` : ''}
                        ${chamado.numero_reaberturas > 0 ? `
                            <button class="btn btn-outline-secondary btn-historico-reaberturas" 
                                    data-chamado-id="${chamado.id}" 
                                    title="Histórico de reaberturas">
                                <i class="fas fa-history"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }

    /**
     * Atualiza estatísticas
     */
    atualizarEstatisticas(stats) {
        document.getElementById('totalChamadosHistorico').textContent = stats.total || 0;
        document.getElementById('totalReabertosHistorico').textContent = stats.reabertos || 0;
        document.getElementById('taxaResolucaoHistorico').textContent = `${stats.taxa_resolucao || 0}%`;
        document.getElementById('tempoMedioHistorico').textContent = `${stats.tempo_medio || 0}h`;
    }

    /**
     * Renderiza paginação
     */
    renderizarPaginacao(total) {
        const totalPaginas = Math.ceil(total / this.itensPorPagina);
        const paginacao = document.getElementById('paginacaoHistoricoChamados');
        
        if (!paginacao || totalPaginas <= 1) {
            if (paginacao) paginacao.innerHTML = '';
            return;
        }

        let html = '';
        
        // Botão anterior
        html += `
            <li class="page-item ${this.paginaAtual === 1 ? 'disabled' : ''}">
                <a class="page-link pagina-historico-chamados" data-pagina="${this.paginaAtual - 1}">
                    <i class="fas fa-chevron-left"></i>
                </a>
            </li>
        `;

        // Páginas
        const inicio = Math.max(1, this.paginaAtual - 2);
        const fim = Math.min(totalPaginas, this.paginaAtual + 2);

        if (inicio > 1) {
            html += `<li class="page-item"><a class="page-link pagina-historico-chamados" data-pagina="1">1</a></li>`;
            if (inicio > 2) {
                html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
            }
        }

        for (let i = inicio; i <= fim; i++) {
            html += `
                <li class="page-item ${i === this.paginaAtual ? 'active' : ''}">
                    <a class="page-link pagina-historico-chamados" data-pagina="${i}">${i}</a>
                </li>
            `;
        }

        if (fim < totalPaginas) {
            if (fim < totalPaginas - 1) {
                html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
            }
            html += `<li class="page-item"><a class="page-link pagina-historico-chamados" data-pagina="${totalPaginas}">${totalPaginas}</a></li>`;
        }

        // Botão próximo
        html += `
            <li class="page-item ${this.paginaAtual === totalPaginas ? 'disabled' : ''}">
                <a class="page-link pagina-historico-chamados" data-pagina="${this.paginaAtual + 1}">
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
        const filtros = document.getElementById('filtrosHistoricoChamados');
        if (filtros) {
            filtros.style.display = filtros.style.display === 'none' ? 'block' : 'none';
        }
    }

    /**
     * Aplica filtros
     */
    aplicarFiltros() {
        this.filtros = {
            solicitante: document.getElementById('filtroHistoricoSolicitante')?.value || '',
            problema: document.getElementById('filtroHistoricoProblema')?.value || '',
            status: document.getElementById('filtroHistoricoStatus')?.value || '',
            reaberto: document.getElementById('filtroHistoricoReaberto')?.value || '',
            data_inicio: document.getElementById('filtroHistoricoDataInicio')?.value || '',
            data_fim: document.getElementById('filtroHistoricoDataFim')?.value || '',
            unidade: document.getElementById('filtroHistoricoUnidade')?.value || ''
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
            'filtroHistoricoSolicitante',
            'filtroHistoricoProblema',
            'filtroHistoricoStatus',
            'filtroHistoricoReaberto',
            'filtroHistoricoDataInicio',
            'filtroHistoricoDataFim',
            'filtroHistoricoUnidade'
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
     * Carrega unidades para filtro
     */
    async carregarUnidades() {
        try {
            const response = await fetch('/ti/api/unidades');
            if (response.ok) {
                const data = await response.json();
                const select = document.getElementById('filtroHistoricoUnidade');
                
                if (select && data.unidades) {
                    const options = data.unidades.map(unidade => 
                        `<option value="${unidade.nome}">${unidade.nome}</option>`
                    ).join('');
                    
                    select.innerHTML = '<option value="">Todas</option>' + options;
                }
            }
        } catch (error) {
            console.error('❌ Erro ao carregar unidades:', error);
        }
    }

    /**
     * Abre modal de reabertura
     */
    async abrirModalReabertura(chamadoId) {
        if (window.reaberturaChamados) {
            await window.reaberturaChamados.mostrarModalReabertura(chamadoId);
        } else {
            this.mostrarErro('Sistema de reabertura não disponível');
        }
    }

    /**
     * Mostra detalhes do chamado
     */
    async mostrarDetalhesChamado(chamadoId) {
        try {
            const response = await fetch(`/ti/api/chamados/${chamadoId}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            const chamado = data.chamado;

            const modal = this.criarModalDetalhes(chamado);
            document.body.appendChild(modal);
            
            const bsModal = new bootstrap.Modal(modal);
            bsModal.show();

            // Limpar modal após fechar
            modal.addEventListener('hidden.bs.modal', () => {
                modal.remove();
            });

        } catch (error) {
            console.error('❌ Erro ao carregar detalhes:', error);
            this.mostrarErro('Erro ao carregar detalhes do chamado');
        }
    }

    /**
     * Cria modal de detalhes
     */
    criarModalDetalhes(chamado) {
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.setAttribute('tabindex', '-1');
        modal.innerHTML = `
            <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
                <div class="modal-content bg-dark text-white">
                    <div class="modal-header border-secondary">
                        <h5 class="modal-title">
                            <i class="fas fa-ticket-alt me-2"></i>
                            Detalhes do Chamado ${chamado.codigo}
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row">
                            <div class="col-md-6">
                                <p><strong>Protocolo:</strong> ${chamado.protocolo}</p>
                                <p><strong>Solicitante:</strong> ${chamado.solicitante}</p>
                                <p><strong>Email:</strong> ${chamado.email}</p>
                                <p><strong>Telefone:</strong> ${chamado.telefone}</p>
                                <p><strong>Cargo:</strong> ${chamado.cargo}</p>
                            </div>
                            <div class="col-md-6">
                                <p><strong>Unidade:</strong> ${chamado.unidade}</p>
                                <p><strong>Problema:</strong> ${chamado.problema}</p>
                                <p><strong>Status:</strong> <span class="badge bg-${this.getStatusColor(chamado.status)}">${chamado.status}</span></p>
                                <p><strong>Prioridade:</strong> <span class="badge bg-${this.getPriorityColor(chamado.prioridade)}">${chamado.prioridade}</span></p>
                                ${chamado.internet_item ? `<p><strong>Item Internet:</strong> ${chamado.internet_item}</p>` : ''}
                            </div>
                        </div>
                        
                        <div class="row">
                            <div class="col-md-6">
                                <p><strong>Data Abertura:</strong> ${this.formatarDataCompleta(chamado.data_abertura)}</p>
                                ${chamado.data_primeira_resposta ? `<p><strong>Primeira Resposta:</strong> ${this.formatarDataCompleta(chamado.data_primeira_resposta)}</p>` : ''}
                                ${chamado.data_conclusao ? `<p><strong>Data Conclusão:</strong> ${this.formatarDataCompleta(chamado.data_conclusao)}</p>` : ''}
                            </div>
                            <div class="col-md-6">
                                ${chamado.reaberto ? `
                                    <p><strong>Reabertura:</strong> <span class="badge bg-warning">SIM</span></p>
                                    <p><strong>Nº Reaberturas:</strong> ${chamado.numero_reaberturas}</p>
                                ` : ''}
                                ${chamado.transferido ? `
                                    <p><strong>Transferido:</strong> <span class="badge bg-info">SIM</span></p>
                                    <p><strong>Nº Transferências:</strong> ${chamado.numero_transferencias}</p>
                                ` : ''}
                            </div>
                        </div>

                        ${chamado.descricao ? `
                            <div class="mt-3">
                                <strong>Descrição:</strong>
                                <div class="bg-secondary p-3 rounded mt-2">
                                    ${chamado.descricao.replace(/\n/g, '<br>')}
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
     * Mostra histórico de reaberturas
     */
    async mostrarHistoricoReaberturas(chamadoId) {
        if (window.reaberturaChamados) {
            const reaberturas = await window.reaberturaChamados.carregarHistoricoReaberturas(chamadoId);
            window.reaberturaChamados.renderizarHistoricoReaberturas(reaberturas, 'containerHistoricoReaberturas');
        }
    }

    /**
     * Utilitários
     */
    formatarData(dataString) {
        if (!dataString) return '-';
        const data = new Date(dataString);
        return data.toLocaleDateString('pt-BR');
    }

    formatarDataCompleta(dataString) {
        if (!dataString) return '-';
        const data = new Date(dataString);
        return data.toLocaleDateString('pt-BR') + ' ' + data.toLocaleTimeString('pt-BR');
    }

    getStatusColor(status) {
        const colors = {
            'Aberto': 'primary',
            'Aguardando': 'warning',
            'Concluido': 'success',
            'Cancelado': 'danger'
        };
        return colors[status] || 'secondary';
    }

    getPriorityColor(prioridade) {
        const colors = {
            'Crítica': 'danger',
            'Alta': 'warning',
            'Normal': 'info',
            'Baixa': 'secondary'
        };
        return colors[prioridade] || 'secondary';
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
        const loading = document.getElementById('loadingHistoricoChamados');
        if (loading) loading.style.display = 'block';
    }

    ocultarLoading() {
        const loading = document.getElementById('loadingHistoricoChamados');
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
    // Verificar se estamos na seção de histórico de chamados
    if (document.getElementById('historico-chamados')) {
        window.historicoChamados = new HistoricoChamados();
        console.log('✅ Histórico de chamados inicializado');
    }
});

// Exportar para uso global
window.HistoricoChamados = HistoricoChamados;
