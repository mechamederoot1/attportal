/**
 * Histórico Completo de Chamados - Sistema Evoque Fitness
 * 
 * Este módulo gerencia a interface do histórico completo de chamados com cards
 * detalhados, timeline de eventos, comunicações e anexos.
 */

class HistoricoCompletoManager {
    constructor() {
        this.chamados = [];
        this.filtros = {};
        this.paginaAtual = 1;
        this.itensPorPagina = 12;
        this.carregando = false;
        this.init();
    }

    init() {
        console.log('🔄 Inicializando histórico completo de chamados...');
        this.bindEvents();
        this.inicializarFiltros();
        this.carregarDados();
    }

    /**
     * Vincula eventos da interface
     */
    bindEvents() {
        // Botões principais
        document.getElementById('btnAtualizarHistorico')?.addEventListener('click', () => {
            this.carregarDados(true);
        });

        document.getElementById('btnFiltrosHistorico')?.addEventListener('click', () => {
            this.toggleFiltros();
        });

        document.getElementById('btnFiltrarHistorico')?.addEventListener('click', () => {
            this.aplicarFiltros();
        });

        document.getElementById('btnLimparFiltrosHistorico')?.addEventListener('click', () => {
            this.limparFiltros();
        });

        // Event delegation para ações dos cards
        document.addEventListener('click', (event) => {
            if (event.target.matches('.btn-expandir-chamado') || event.target.closest('.btn-expandir-chamado')) {
                event.preventDefault();
                const btn = event.target.closest('.btn-expandir-chamado');
                const chamadoId = btn.dataset.chamadoId;
                this.toggleDetalhesChamado(chamadoId);
            }

            if (event.target.matches('.btn-timeline-chamado') || event.target.closest('.btn-timeline-chamado')) {
                event.preventDefault();
                const btn = event.target.closest('.btn-timeline-chamado');
                const chamadoId = btn.dataset.chamadoId;
                this.mostrarTimelineChamado(chamadoId);
            }

            if (event.target.matches('.btn-anexos-chamado') || event.target.closest('.btn-anexos-chamado')) {
                event.preventDefault();
                const btn = event.target.closest('.btn-anexos-chamado');
                const chamadoId = btn.dataset.chamadoId;
                this.mostrarAnexosChamado(chamadoId);
            }
        });

        // Navegação de páginas
        document.addEventListener('click', (event) => {
            if (event.target.matches('.pagina-historico')) {
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

            const response = await fetch(`/ti/painel/api/historico/chamados/completo?${params}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            this.chamados = data.chamados || [];
            
            this.renderizarCards();
            this.atualizarEstatisticas(data.estatisticas || {});
            this.renderizarPaginacao(data.paginacao || {});

        } catch (error) {
            console.error('❌ Erro ao carregar histórico:', error);
            this.mostrarErro('Erro ao carregar histórico de chamados');
        } finally {
            this.carregando = false;
            this.ocultarLoading();
        }
    }

    /**
     * Renderiza cards dos chamados
     */
    renderizarCards() {
        const container = document.getElementById('cardsHistoricoChamados');
        if (!container) return;

        if (this.chamados.length === 0) {
            container.innerHTML = `
                <div class="col-12">
                    <div class="card">
                        <div class="card-body text-center py-5">
                            <i class="fas fa-info-circle fa-3x text-muted mb-3"></i>
                            <h5 class="text-muted">Nenhum chamado encontrado</h5>
                            <p class="text-muted">Tente ajustar os filtros ou verificar novamente mais tarde.</p>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        container.innerHTML = this.chamados.map(chamado => this.criarCardChamado(chamado)).join('');
    }

    /**
     * Cria card para um chamado
     */
    criarCardChamado(chamado) {
        const statusColor = this.getStatusColor(chamado.status);
        const prioridadeColor = this.getPriorityColor(chamado.prioridade);
        const tempoAbertura = this.calcularTempoDecorrido(chamado.data_abertura);
        
        return `
            <div class="col-xl-4 col-lg-6 mb-4">
                <div class="card chamado-card h-100" data-chamado-id="${chamado.id}">
                    <div class="card-header d-flex justify-content-between align-items-start">
                        <div>
                            <h6 class="mb-1">
                                <span class="badge bg-${statusColor} me-2">${chamado.codigo}</span>
                                ${chamado.reaberto ? '<span class="badge bg-warning">REABERTO</span>' : ''}
                            </h6>
                            <small class="text-muted">${chamado.protocolo}</small>
                        </div>
                        <div class="text-end">
                            <span class="badge bg-${prioridadeColor}">${chamado.prioridade}</span>
                        </div>
                    </div>
                    
                    <div class="card-body">
                        <div class="mb-3">
                            <h6 class="card-title mb-1">${chamado.solicitante}</h6>
                            <small class="text-muted">${chamado.cargo} • ${chamado.unidade}</small>
                        </div>
                        
                        <div class="mb-3">
                            <p class="card-text problem-text">
                                <i class="fas fa-tools me-2 text-warning"></i>
                                ${chamado.problema}
                            </p>
                            ${chamado.internet_item ? `
                                <small class="text-info">
                                    <i class="fas fa-wifi me-1"></i>${chamado.internet_item}
                                </small>
                            ` : ''}
                        </div>

                        ${chamado.descricao ? `
                            <div class="mb-3">
                                <p class="card-text description-text">
                                    ${this.truncateText(chamado.descricao, 100)}
                                </p>
                            </div>
                        ` : ''}

                        <div class="chamado-stats mb-3">
                            <div class="row text-center">
                                <div class="col-4">
                                    <small class="text-muted d-block">Timeline</small>
                                    <span class="badge bg-info">${chamado.timeline?.length || 0}</span>
                                </div>
                                <div class="col-4">
                                    <small class="text-muted d-block">Comunicações</small>
                                    <span class="badge bg-secondary">${chamado.total_comunicacoes || 0}</span>
                                </div>
                                <div class="col-4">
                                    <small class="text-muted d-block">Anexos</small>
                                    <span class="badge bg-success">${chamado.total_anexos || 0}</span>
                                </div>
                            </div>
                        </div>

                        <div class="chamado-datas">
                            <div class="d-flex justify-content-between align-items-center mb-2">
                                <small class="text-muted">
                                    <i class="fas fa-calendar-plus me-1"></i>
                                    Aberto: ${this.formatarDataHora(chamado.data_abertura)}
                                </small>
                                <small class="text-muted">${tempoAbertura}</small>
                            </div>
                            
                            ${chamado.data_primeira_resposta ? `
                                <div class="d-flex justify-content-between align-items-center mb-2">
                                    <small class="text-info">
                                        <i class="fas fa-reply me-1"></i>
                                        1ª Resposta: ${this.formatarDataHora(chamado.data_primeira_resposta)}
                                    </small>
                                </div>
                            ` : ''}
                            
                            ${chamado.data_conclusao ? `
                                <div class="d-flex justify-content-between align-items-center">
                                    <small class="text-${statusColor}">
                                        <i class="fas fa-check-circle me-1"></i>
                                        ${chamado.status}: ${this.formatarDataHora(chamado.data_conclusao)}
                                    </small>
                                    <small class="text-muted">${this.calcularTempoResolucao(chamado.data_abertura, chamado.data_conclusao)}</small>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                    
                    <div class="card-footer">
                        <div class="d-flex justify-content-between">
                            <div class="btn-group btn-group-sm">
                                <button class="btn btn-outline-info btn-expandir-chamado" 
                                        data-chamado-id="${chamado.id}" 
                                        title="Ver detalhes completos">
                                    <i class="fas fa-eye"></i> Detalhes
                                </button>
                                <button class="btn btn-outline-primary btn-timeline-chamado" 
                                        data-chamado-id="${chamado.id}" 
                                        title="Ver timeline">
                                    <i class="fas fa-history"></i> Timeline
                                </button>
                                ${chamado.total_anexos > 0 ? `
                                    <button class="btn btn-outline-success btn-anexos-chamado" 
                                            data-chamado-id="${chamado.id}" 
                                            title="Ver anexos">
                                        <i class="fas fa-paperclip"></i> Anexos
                                    </button>
                                ` : ''}
                            </div>
                            <span class="badge bg-${statusColor} align-self-center">${chamado.status}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Toggle detalhes do chamado
     */
    toggleDetalhesChamado(chamadoId) {
        const chamado = this.chamados.find(c => c.id == chamadoId);
        if (!chamado) return;

        const modal = this.criarModalDetalhes(chamado);
        document.body.appendChild(modal);
        
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();

        // Limpar modal após fechar
        modal.addEventListener('hidden.bs.modal', () => {
            modal.remove();
        });
    }

    /**
     * Mostra timeline detalhada do chamado
     */
    mostrarTimelineChamado(chamadoId) {
        const chamado = this.chamados.find(c => c.id == chamadoId);
        if (!chamado) return;

        const modal = this.criarModalTimeline(chamado);
        document.body.appendChild(modal);
        
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();

        // Limpar modal após fechar
        modal.addEventListener('hidden.bs.modal', () => {
            modal.remove();
        });
    }

    /**
     * Mostra anexos do chamado
     */
    mostrarAnexosChamado(chamadoId) {
        const chamado = this.chamados.find(c => c.id == chamadoId);
        if (!chamado || !chamado.anexos?.length) return;

        const modal = this.criarModalAnexos(chamado);
        document.body.appendChild(modal);
        
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();

        // Limpar modal após fechar
        modal.addEventListener('hidden.bs.modal', () => {
            modal.remove();
        });
    }

    /**
     * Cria modal de detalhes completos
     */
    criarModalDetalhes(chamado) {
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.setAttribute('tabindex', '-1');
        modal.innerHTML = `
            <div class="modal-dialog modal-xl">
                <div class="modal-content bg-dark text-white">
                    <div class="modal-header border-secondary">
                        <h5 class="modal-title">
                            <i class="fas fa-ticket-alt me-2"></i>
                            Detalhes Completos - ${chamado.codigo}
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row">
                            <div class="col-md-6">
                                <h6><i class="fas fa-user me-2"></i>Informações do Solicitante</h6>
                                <table class="table table-dark table-sm">
                                    <tr><td><strong>Nome:</strong></td><td>${chamado.solicitante}</td></tr>
                                    <tr><td><strong>Cargo:</strong></td><td>${chamado.cargo}</td></tr>
                                    <tr><td><strong>Email:</strong></td><td>${chamado.email}</td></tr>
                                    <tr><td><strong>Telefone:</strong></td><td>${chamado.telefone || 'Não informado'}</td></tr>
                                    <tr><td><strong>Unidade:</strong></td><td>${chamado.unidade}</td></tr>
                                </table>
                            </div>
                            <div class="col-md-6">
                                <h6><i class="fas fa-info-circle me-2"></i>Informações do Chamado</h6>
                                <table class="table table-dark table-sm">
                                    <tr><td><strong>Código:</strong></td><td>${chamado.codigo}</td></tr>
                                    <tr><td><strong>Protocolo:</strong></td><td>${chamado.protocolo}</td></tr>
                                    <tr><td><strong>Status:</strong></td><td><span class="badge bg-${this.getStatusColor(chamado.status)}">${chamado.status}</span></td></tr>
                                    <tr><td><strong>Prioridade:</strong></td><td><span class="badge bg-${this.getPriorityColor(chamado.prioridade)}">${chamado.prioridade}</span></td></tr>
                                    <tr><td><strong>Problema:</strong></td><td>${chamado.problema}</td></tr>
                                    ${chamado.internet_item ? `<tr><td><strong>Item Internet:</strong></td><td>${chamado.internet_item}</td></tr>` : ''}
                                </table>
                            </div>
                        </div>
                        
                        <div class="row mt-3">
                            <div class="col-md-6">
                                <h6><i class="fas fa-clock me-2"></i>Datas Importantes</h6>
                                <table class="table table-dark table-sm">
                                    <tr><td><strong>Abertura:</strong></td><td>${this.formatarDataCompleta(chamado.data_abertura)}</td></tr>
                                    ${chamado.data_primeira_resposta ? `<tr><td><strong>1ª Resposta:</strong></td><td>${this.formatarDataCompleta(chamado.data_primeira_resposta)}</td></tr>` : ''}
                                    ${chamado.data_conclusao ? `<tr><td><strong>Conclusão:</strong></td><td>${this.formatarDataCompleta(chamado.data_conclusao)}</td></tr>` : ''}
                                    ${chamado.data_visita ? `<tr><td><strong>Visita Técnica:</strong></td><td>${this.formatarData(chamado.data_visita)}</td></tr>` : ''}
                                </table>
                            </div>
                            <div class="col-md-6">
                                <h6><i class="fas fa-chart-bar me-2"></i>Estatísticas</h6>
                                <table class="table table-dark table-sm">
                                    <tr><td><strong>Eventos na Timeline:</strong></td><td><span class="badge bg-info">${chamado.timeline?.length || 0}</span></td></tr>
                                    <tr><td><strong>Comunicações:</strong></td><td><span class="badge bg-secondary">${chamado.total_comunicacoes || 0}</span></td></tr>
                                    <tr><td><strong>Anexos:</strong></td><td><span class="badge bg-success">${chamado.total_anexos || 0}</span></td></tr>
                                    ${chamado.numero_reaberturas > 0 ? `<tr><td><strong>Reaberturas:</strong></td><td><span class="badge bg-warning">${chamado.numero_reaberturas}</span></td></tr>` : ''}
                                    ${chamado.numero_transferencias > 0 ? `<tr><td><strong>Transferências:</strong></td><td><span class="badge bg-info">${chamado.numero_transferencias}</span></td></tr>` : ''}
                                </table>
                            </div>
                        </div>

                        ${chamado.descricao ? `
                            <div class="mt-4">
                                <h6><i class="fas fa-file-text me-2"></i>Descrição do Problema</h6>
                                <div class="bg-secondary p-3 rounded">
                                    ${chamado.descricao.replace(/\n/g, '<br>')}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    <div class="modal-footer border-secondary">
                        <button type="button" class="btn btn-info" onclick="this.closest('.modal').querySelector('[data-bs-dismiss=\"modal\"]').click(); window.historicoCompleto.mostrarTimelineChamado('${chamado.id}')">
                            <i class="fas fa-history me-1"></i>Ver Timeline
                        </button>
                        ${chamado.total_anexos > 0 ? `
                            <button type="button" class="btn btn-success" onclick="this.closest('.modal').querySelector('[data-bs-dismiss=\"modal\"]').click(); window.historicoCompleto.mostrarAnexosChamado('${chamado.id}')">
                                <i class="fas fa-paperclip me-1"></i>Ver Anexos
                            </button>
                        ` : ''}
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
     * Cria modal de timeline
     */
    criarModalTimeline(chamado) {
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.setAttribute('tabindex', '-1');
        
        const timelineHtml = chamado.timeline?.map(evento => `
            <div class="timeline-item">
                <div class="timeline-marker bg-${evento.cor}">
                    <i class="fas ${evento.icone}"></i>
                </div>
                <div class="timeline-content">
                    <div class="timeline-header">
                        <h6 class="mb-1">${evento.titulo}</h6>
                        <small class="text-muted">${this.formatarDataCompleta(evento.data)}</small>
                    </div>
                    <p class="mb-1">${evento.descricao}</p>
                    ${evento.detalhes ? `
                        <details class="mt-2">
                            <summary class="text-info" style="cursor: pointer;">Ver detalhes</summary>
                            <div class="mt-2 p-2 bg-secondary rounded">
                                ${Object.entries(evento.detalhes).map(([key, value]) => 
                                    `<small><strong>${key.replace(/_/g, ' ')}:</strong> ${value}</small><br>`
                                ).join('')}
                            </div>
                        </details>
                    ` : ''}
                </div>
            </div>
        `).join('') || '<p class="text-muted">Nenhum evento registrado na timeline.</p>';

        modal.innerHTML = `
            <div class="modal-dialog modal-lg">
                <div class="modal-content bg-dark text-white">
                    <div class="modal-header border-secondary">
                        <h5 class="modal-title">
                            <i class="fas fa-history me-2"></i>
                            Timeline - ${chamado.codigo}
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="timeline-container">
                            ${timelineHtml}
                        </div>
                    </div>
                    <div class="modal-footer border-secondary">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                            <i class="fas fa-times me-1"></i>Fechar
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Adicionar estilos da timeline
        const style = document.createElement('style');
        style.textContent = `
            .timeline-container {
                position: relative;
                padding-left: 30px;
            }
            .timeline-container::before {
                content: '';
                position: absolute;
                left: 15px;
                top: 0;
                bottom: 0;
                width: 2px;
                background: #6c757d;
            }
            .timeline-item {
                position: relative;
                margin-bottom: 2rem;
            }
            .timeline-marker {
                position: absolute;
                left: -22px;
                top: 0;
                width: 30px;
                height: 30px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 12px;
            }
            .timeline-content {
                background: #343a40;
                padding: 1rem;
                border-radius: 8px;
                border-left: 4px solid #6c757d;
            }
        `;
        modal.appendChild(style);

        return modal;
    }

    /**
     * Cria modal de anexos
     */
    criarModalAnexos(chamado) {
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.setAttribute('tabindex', '-1');
        
        const anexosHtml = chamado.anexos?.map(anexo => `
            <div class="col-md-6 mb-3">
                <div class="card bg-secondary">
                    <div class="card-body">
                        <div class="d-flex align-items-center">
                            <div class="me-3">
                                <i class="fas ${this.getFileIcon(anexo.tipo_arquivo)} fa-2x text-info"></i>
                            </div>
                            <div class="flex-grow-1">
                                <h6 class="mb-1">${anexo.nome_original}</h6>
                                <small class="text-muted">
                                    ${anexo.tamanho_formatado} • ${anexo.tipo_arquivo}
                                </small><br>
                                <small class="text-muted">
                                    Enviado por ${anexo.usuario_upload} em ${this.formatarDataCompleta(anexo.data_upload)}
                                </small>
                            </div>
                            <div>
                                <button class="btn btn-outline-info btn-sm" onclick="window.open('/ti/download-anexo/${anexo.id}', '_blank')">
                                    <i class="fas fa-download"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `).join('') || '<p class="text-muted">Nenhum anexo encontrado.</p>';

        modal.innerHTML = `
            <div class="modal-dialog modal-lg">
                <div class="modal-content bg-dark text-white">
                    <div class="modal-header border-secondary">
                        <h5 class="modal-title">
                            <i class="fas fa-paperclip me-2"></i>
                            Anexos - ${chamado.codigo} (${chamado.total_anexos} arquivo${chamado.total_anexos !== 1 ? 's' : ''})
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row">
                            ${anexosHtml}
                        </div>
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
     * Atualiza estatísticas
     */
    atualizarEstatisticas(stats) {
        document.getElementById('totalChamadosHistorico').textContent = stats.total || 0;
        document.getElementById('concluidosHistorico').textContent = stats.concluidos || 0;
        document.getElementById('reabertosHistorico').textContent = stats.reabertos || 0;
        document.getElementById('tempoMedioHistorico').textContent = stats.tempo_medio || '0h';
    }

    /**
     * Renderiza paginação
     */
    renderizarPaginacao(paginacao) {
        const container = document.getElementById('paginacaoHistoricoChamados');
        if (!container || !paginacao.total_paginas || paginacao.total_paginas <= 1) {
            if (container) container.innerHTML = '';
            return;
        }

        let html = '';
        
        // Botão anterior
        html += `
            <li class="page-item ${!paginacao.tem_anterior ? 'disabled' : ''}">
                <a class="page-link pagina-historico" data-pagina="${paginacao.pagina_atual - 1}">
                    <i class="fas fa-chevron-left"></i>
                </a>
            </li>
        `;

        // Páginas
        const inicio = Math.max(1, paginacao.pagina_atual - 2);
        const fim = Math.min(paginacao.total_paginas, paginacao.pagina_atual + 2);

        for (let i = inicio; i <= fim; i++) {
            html += `
                <li class="page-item ${i === paginacao.pagina_atual ? 'active' : ''}">
                    <a class="page-link pagina-historico" data-pagina="${i}">${i}</a>
                </li>
            `;
        }

        // Botão próximo
        html += `
            <li class="page-item ${!paginacao.tem_proximo ? 'disabled' : ''}">
                <a class="page-link pagina-historico" data-pagina="${paginacao.pagina_atual + 1}">
                    <i class="fas fa-chevron-right"></i>
                </a>
            </li>
        `;

        container.innerHTML = html;
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
        const filtros = document.getElementById('painelFiltrosHistorico');
        if (filtros) {
            const isVisible = filtros.style.display !== 'none';
            filtros.style.display = isVisible ? 'none' : 'block';
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
            prioridade: document.getElementById('filtroHistoricoPrioridade')?.value || '',
            unidade: document.getElementById('filtroHistoricoUnidade')?.value || '',
            data_inicio: document.getElementById('filtroHistoricoDataInicio')?.value || '',
            data_fim: document.getElementById('filtroHistoricoDataFim')?.value || ''
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
            'filtroHistoricoPrioridade',
            'filtroHistoricoUnidade',
            'filtroHistoricoDataInicio',
            'filtroHistoricoDataFim'
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
     * Utilitários de formatação
     */
    formatarData(dataString) {
        if (!dataString) return '-';
        const data = new Date(dataString);
        return data.toLocaleDateString('pt-BR');
    }

    formatarDataHora(dataString) {
        if (!dataString) return '-';
        const data = new Date(dataString);
        return data.toLocaleDateString('pt-BR') + ' ' + data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    formatarDataCompleta(dataString) {
        if (!dataString) return '-';
        const data = new Date(dataString);
        return data.toLocaleDateString('pt-BR') + ' às ' + data.toLocaleTimeString('pt-BR');
    }

    calcularTempoDecorrido(dataInicio) {
        if (!dataInicio) return '-';
        const inicio = new Date(dataInicio);
        const agora = new Date();
        const diff = agora - inicio;
        
        const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
        const horas = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        
        if (dias > 0) {
            return `há ${dias}d ${horas}h`;
        } else if (horas > 0) {
            return `há ${horas}h`;
        } else {
            const minutos = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            return `há ${minutos}min`;
        }
    }

    calcularTempoResolucao(dataInicio, dataFim) {
        if (!dataInicio || !dataFim) return '-';
        const inicio = new Date(dataInicio);
        const fim = new Date(dataFim);
        const diff = fim - inicio;
        
        const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
        const horas = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        
        if (dias > 0) {
            return `${dias}d ${horas}h`;
        } else {
            return `${horas}h`;
        }
    }

    truncateText(text, maxLength) {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
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

    getFileIcon(tipoArquivo) {
        const icons = {
            'Imagem': 'fa-image',
            'Vídeo': 'fa-video',
            'Documento': 'fa-file-alt',
            'PDF': 'fa-file-pdf',
            'Excel': 'fa-file-excel',
            'Word': 'fa-file-word',
            'PowerPoint': 'fa-file-powerpoint'
        };
        return icons[tipoArquivo] || 'fa-file';
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
        } else {
            alert(mensagem);
        }
    }
}

// Inicializar quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    // Verificar se estamos na seção de histórico de chamados
    if (document.getElementById('historico-chamados')) {
        window.historicoCompleto = new HistoricoCompletoManager();
        console.log('✅ Histórico completo de chamados inicializado');
    }
});

// Exportar para uso global
window.HistoricoCompletoManager = HistoricoCompletoManager;
