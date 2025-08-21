/**
 * Transferências de Chamados - Sistema Evoque Fitness
 * 
 * Este módulo gerencia a funcionalidade de transferência de chamados entre agentes,
 * incluindo histórico de transferências, balanceamento de carga e notificações.
 */

class TransferenciasChamados {
    constructor() {
        this.agentesDisponiveis = [];
        this.transferenciasCache = new Map();
        this.intervalosAtualizacao = new Map();
        this.init();
    }

    init() {
        console.log('🔄 Inicializando sistema de transferências...');
        this.carregarAgentesDisponiveis();
        this.bindEvents();
        this.iniciarAtualizacaoPeriodica();
    }

    /**
     * Vincula eventos do sistema
     */
    bindEvents() {
        // Event listeners para botões de transferência
        document.addEventListener('click', (event) => {
            if (event.target.matches('.btn-transferir-chamado')) {
                event.preventDefault();
                const chamadoId = event.target.dataset.chamadoId;
                this.mostrarModalTransferencia(chamadoId);
            }

            if (event.target.matches('.btn-historico-transferencias')) {
                event.preventDefault();
                const chamadoId = event.target.dataset.chamadoId;
                this.mostrarHistoricoTransferencias(chamadoId);
            }

            if (event.target.matches('.btn-atualizar-agentes')) {
                event.preventDefault();
                this.carregarAgentesDisponiveis(true);
            }
        });

        // Event listener para seleção de agente
        document.addEventListener('change', (event) => {
            if (event.target.matches('#agente-destino-select')) {
                this.atualizarInfoAgenteSelecionado(event.target.value);
            }
        });

        // Socket.IO para atualizações em tempo real
        if (window.socket) {
            window.socket.on('chamado_transferido', (data) => {
                this.processarNotificacaoTransferencia(data);
            });

            window.socket.on('agente_disponibilidade_alterada', (data) => {
                this.atualizarDisponibilidadeAgente(data);
            });
        }
    }

    /**
     * Carrega lista de agentes disponíveis
     */
    async carregarAgentesDisponiveis(forcarAtualizacao = false) {
        try {
            if (!forcarAtualizacao && this.agentesDisponiveis.length > 0) {
                return this.agentesDisponiveis;
            }

            this.mostrarLoading('Carregando agentes...');

            const response = await fetch('/ti/api/agentes/disponiveis');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            this.agentesDisponiveis = data.agentes || [];

            console.log(`✅ ${this.agentesDisponiveis.length} agentes carregados`);
            this.atualizarIndicadoresDisponibilidade();

            return this.agentesDisponiveis;

        } catch (error) {
            console.error('❌ Erro ao carregar agentes:', error);
            this.mostrarErro('Erro ao carregar lista de agentes');
            return [];
        } finally {
            this.ocultarLoading();
        }
    }

    /**
     * Mostra modal de transferência
     */
    async mostrarModalTransferencia(chamadoId) {
        try {
            const [chamado, agentes] = await Promise.all([
                this.buscarDetalhesChamado(chamadoId),
                this.carregarAgentesDisponiveis()
            ]);

            if (!chamado) {
                this.mostrarErro('Chamado não encontrado');
                return;
            }

            const modal = this.criarModalTransferencia(chamado, agentes);
            document.body.appendChild(modal);
            
            const bsModal = new bootstrap.Modal(modal);
            bsModal.show();

            // Event listeners para o modal
            modal.querySelector('.btn-confirmar-transferencia').addEventListener('click', async () => {
                await this.executarTransferencia(modal, chamadoId, bsModal);
            });

            // Limpar modal após fechar
            modal.addEventListener('hidden.bs.modal', () => {
                modal.remove();
            });

        } catch (error) {
            console.error('❌ Erro ao mostrar modal de transferência:', error);
            this.mostrarErro('Erro ao carregar modal de transferência');
        }
    }

    /**
     * Cria modal de transferência
     */
    criarModalTransferencia(chamado, agentes) {
        const agenteAtual = chamado.agente_atual || { nome: 'Não atribuído', id: null };
        
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.setAttribute('tabindex', '-1');
        modal.innerHTML = `
            <div class="modal-dialog modal-lg">
                <div class="modal-content bg-dark text-white">
                    <div class="modal-header border-secondary">
                        <h5 class="modal-title">
                            <i class="fas fa-exchange-alt text-info me-2"></i>
                            Transferir Chamado ${chamado.codigo}
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <!-- Informações do Chamado -->
                        <div class="card bg-secondary mb-3">
                            <div class="card-header">
                                <h6 class="mb-0">Informações do Chamado</h6>
                            </div>
                            <div class="card-body">
                                <div class="row">
                                    <div class="col-md-6">
                                        <strong>Protocolo:</strong> ${chamado.protocolo}<br>
                                        <strong>Solicitante:</strong> ${chamado.solicitante}<br>
                                        <strong>Problema:</strong> ${chamado.problema}
                                    </div>
                                    <div class="col-md-6">
                                        <strong>Status:</strong> <span class="badge bg-${this.getStatusColor(chamado.status)}">${chamado.status}</span><br>
                                        <strong>Prioridade:</strong> <span class="badge bg-${this.getPriorityColor(chamado.prioridade)}">${chamado.prioridade}</span><br>
                                        <strong>Agente Atual:</strong> ${agenteAtual.nome}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Seleção de Agente -->
                        <div class="mb-3">
                            <label for="agente-destino-select" class="form-label">
                                Transferir para <span class="text-danger">*</span>
                            </label>
                            <select class="form-select bg-dark text-white border-secondary" id="agente-destino-select" required>
                                <option value="">Selecione um agente...</option>
                                ${agentes.map(agente => `
                                    <option value="${agente.id}" 
                                            data-disponibilidade="${agente.disponibilidade_percentual}"
                                            data-chamados-ativos="${agente.chamados_ativos}"
                                            data-max-chamados="${agente.max_chamados_simultaneos}"
                                            ${!agente.pode_receber_chamado ? 'disabled' : ''}
                                            ${agente.id === agenteAtual.id ? 'disabled' : ''}>
                                        ${agente.usuario.nome} 
                                        (${agente.chamados_ativos}/${agente.max_chamados_simultaneos}) 
                                        - ${agente.disponibilidade_percentual}% disponível
                                        ${!agente.pode_receber_chamado ? ' [LOTADO]' : ''}
                                        ${agente.id === agenteAtual.id ? ' [ATUAL]' : ''}
                                    </option>
                                `).join('')}
                            </select>
                        </div>

                        <!-- Informações do Agente Selecionado -->
                        <div id="info-agente-selecionado" class="card bg-dark border-info mb-3" style="display: none;">
                            <div class="card-body">
                                <!-- Será preenchido dinamicamente -->
                            </div>
                        </div>

                        <!-- Motivo da Transferência -->
                        <div class="mb-3">
                            <label for="motivo-transferencia" class="form-label">
                                Motivo da transferência <span class="text-danger">*</span>
                            </label>
                            <select class="form-select bg-dark text-white border-secondary mb-2" id="motivo-transferencia-select">
                                <option value="">Selecione um motivo...</option>
                                <option value="Especialização técnica">Especialização técnica necessária</option>
                                <option value="Balanceamento de carga">Balanceamento de carga</option>
                                <option value="Ausência do agente">Agente atual ausente</option>
                                <option value="Escalação">Escalação para nível superior</option>
                                <option value="Conflito de agenda">Conflito de agenda</option>
                                <option value="Outro">Outro motivo</option>
                            </select>
                            <textarea class="form-control bg-dark text-white border-secondary" 
                                      id="motivo-transferencia" 
                                      rows="3" 
                                      required
                                      placeholder="Descreva o motivo da transferência..."></textarea>
                        </div>

                        <!-- Observações -->
                        <div class="mb-3">
                            <label for="observacoes-transferencia" class="form-label">Observações adicionais (opcional)</label>
                            <textarea class="form-control bg-dark text-white border-secondary" 
                                      id="observacoes-transferencia" 
                                      rows="2" 
                                      placeholder="Informações adicionais para o novo agente..."></textarea>
                        </div>

                        <!-- Configurações -->
                        <div class="row">
                            <div class="col-md-6">
                                <div class="form-check">
                                    <input class="form-check-input" type="checkbox" id="notificar-agente-origem" checked>
                                    <label class="form-check-label" for="notificar-agente-origem">
                                        Notificar agente de origem
                                    </label>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="form-check">
                                    <input class="form-check-input" type="checkbox" id="notificar-agente-destino" checked>
                                    <label class="form-check-label" for="notificar-agente-destino">
                                        Notificar agente de destino
                                    </label>
                                </div>
                            </div>
                        </div>

                        <div class="alert alert-info mt-3">
                            <i class="fas fa-info-circle me-2"></i>
                            <strong>Dica:</strong> A transferência manterá todo o histórico do chamado e notificará os agentes envolvidos.
                        </div>
                    </div>
                    <div class="modal-footer border-secondary">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                            <i class="fas fa-times me-1"></i>Cancelar
                        </button>
                        <button type="button" class="btn btn-info btn-confirmar-transferencia">
                            <i class="fas fa-exchange-alt me-1"></i>Confirmar Transferência
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Event listener para preenchimento automático do motivo
        const motivoSelect = modal.querySelector('#motivo-transferencia-select');
        const motivoTextarea = modal.querySelector('#motivo-transferencia');
        
        motivoSelect.addEventListener('change', () => {
            if (motivoSelect.value && motivoSelect.value !== 'Outro') {
                motivoTextarea.value = motivoSelect.value;
            } else if (motivoSelect.value === 'Outro') {
                motivoTextarea.value = '';
                motivoTextarea.focus();
            }
        });

        return modal;
    }

    /**
     * Atualiza informações do agente selecionado
     */
    atualizarInfoAgenteSelecionado(agenteId) {
        const infoContainer = document.getElementById('info-agente-selecionado');
        if (!infoContainer || !agenteId) {
            infoContainer.style.display = 'none';
            return;
        }

        const agente = this.agentesDisponiveis.find(a => a.id == agenteId);
        if (!agente) return;

        const especialidades = agente.especialidades.length > 0 
            ? agente.especialidades.join(', ') 
            : 'Nenhuma especialidade definida';

        infoContainer.innerHTML = `
            <div class="card-body">
                <h6 class="card-title">
                    <i class="fas fa-user me-2"></i>
                    ${agente.usuario.nome}
                </h6>
                <div class="row">
                    <div class="col-md-6">
                        <p><strong>Email:</strong> ${agente.usuario.email}</p>
                        <p><strong>Nível:</strong> ${agente.nivel_experiencia}</p>
                        <p><strong>Especialidades:</strong> ${especialidades}</p>
                    </div>
                    <div class="col-md-6">
                        <p><strong>Chamados ativos:</strong> ${agente.chamados_ativos}/${agente.max_chamados_simultaneos}</p>
                        <p><strong>Disponibilidade:</strong> 
                            <span class="badge bg-${this.getDisponibilidadeColor(agente.disponibilidade_percentual)}">
                                ${agente.disponibilidade_percentual}%
                            </span>
                        </p>
                        <div class="progress" style="height: 6px;">
                            <div class="progress-bar bg-${this.getDisponibilidadeColor(agente.disponibilidade_percentual)}" 
                                 style="width: ${100 - agente.disponibilidade_percentual}%"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        infoContainer.style.display = 'block';
    }

    /**
     * Executa a transferência
     */
    async executarTransferencia(modal, chamadoId, bsModal) {
        try {
            const agenteDestinoId = modal.querySelector('#agente-destino-select').value;
            const motivo = modal.querySelector('#motivo-transferencia').value.trim();
            const observacoes = modal.querySelector('#observacoes-transferencia').value.trim();

            // Validações
            if (!agenteDestinoId) {
                this.mostrarErro('Selecione um agente de destino');
                return;
            }

            if (!motivo) {
                this.mostrarErro('Motivo da transferência é obrigatório');
                return;
            }

            this.mostrarLoading('Transferindo chamado...');

            const response = await fetch(`/ti/api/chamados/${chamadoId}/transferir`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCSRFToken()
                },
                body: JSON.stringify({
                    agente_destino_id: agenteDestinoId,
                    motivo: motivo,
                    observacoes: observacoes
                })
            });

            const data = await response.json();

            if (data.status === 'success') {
                bsModal.hide();
                this.mostrarSucesso('Chamado transferido com sucesso!');
                
                // Atualizar interface
                this.atualizarInterfaceAposTransferencia(chamadoId, data.transferencia);
                
                // Limpar cache
                this.transferenciasCache.delete(chamadoId);
                
                // Recarregar agentes para atualizar disponibilidade
                setTimeout(() => this.carregarAgentesDisponiveis(true), 1000);
            } else {
                this.mostrarErro(data.message);
            }

        } catch (error) {
            console.error('❌ Erro ao transferir chamado:', error);
            this.mostrarErro('Erro interno. Tente novamente.');
        } finally {
            this.ocultarLoading();
        }
    }

    /**
     * Mostra histórico de transferências
     */
    async mostrarHistoricoTransferencias(chamadoId) {
        try {
            this.mostrarLoading('Carregando histórico...');

            const transferencias = await this.carregarHistoricoTransferencias(chamadoId);
            const modal = this.criarModalHistoricoTransferencias(chamadoId, transferencias);
            
            document.body.appendChild(modal);
            
            const bsModal = new bootstrap.Modal(modal);
            bsModal.show();

            // Limpar modal após fechar
            modal.addEventListener('hidden.bs.modal', () => {
                modal.remove();
            });

        } catch (error) {
            console.error('❌ Erro ao mostrar histórico:', error);
            this.mostrarErro('Erro ao carregar histórico de transferências');
        } finally {
            this.ocultarLoading();
        }
    }

    /**
     * Carrega histórico de transferências
     */
    async carregarHistoricoTransferencias(chamadoId) {
        try {
            // Verificar cache primeiro
            if (this.transferenciasCache.has(chamadoId)) {
                const cache = this.transferenciasCache.get(chamadoId);
                if (Date.now() - cache.timestamp < 60000) { // 1 minuto
                    return cache.data;
                }
            }

            const response = await fetch(`/ti/api/chamados/${chamadoId}/transferencias`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            const transferencias = data.transferencias || [];

            // Atualizar cache
            this.transferenciasCache.set(chamadoId, {
                data: transferencias,
                timestamp: Date.now()
            });

            return transferencias;

        } catch (error) {
            console.error('❌ Erro ao carregar transferências:', error);
            return [];
        }
    }

    /**
     * Cria modal de histórico de transferências
     */
    criarModalHistoricoTransferencias(chamadoId, transferencias) {
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.setAttribute('tabindex', '-1');
        modal.innerHTML = `
            <div class="modal-dialog modal-xl">
                <div class="modal-content bg-dark text-white">
                    <div class="modal-header border-secondary">
                        <h5 class="modal-title">
                            <i class="fas fa-history text-info me-2"></i>
                            Histórico de Transferências
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        ${this.renderizarHistoricoTransferencias(transferencias)}
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
     * Renderiza histórico de transferências
     */
    renderizarHistoricoTransferencias(transferencias) {
        if (transferencias.length === 0) {
            return `
                <div class="text-center text-muted py-4">
                    <i class="fas fa-info-circle fa-2x mb-2"></i>
                    <p>Nenhuma transferência encontrada para este chamado.</p>
                </div>
            `;
        }

        return `
            <div class="timeline">
                ${transferencias.map((transferencia, index) => `
                    <div class="timeline-item">
                        <div class="timeline-marker bg-info">
                            <i class="fas fa-exchange-alt"></i>
                        </div>
                        <div class="timeline-content">
                            <div class="card bg-secondary">
                                <div class="card-header d-flex justify-content-between align-items-center">
                                    <h6 class="mb-0">
                                        Transferência #${transferencias.length - index}
                                    </h6>
                                    <span class="badge bg-info">${transferencia.tipo_transferencia}</span>
                                </div>
                                <div class="card-body">
                                    <div class="row">
                                        <div class="col-md-6">
                                            <p><strong>De:</strong> ${transferencia.agente_anterior.nome || 'Não atribuído'}</p>
                                            <p><strong>Para:</strong> ${transferencia.agente_novo.nome || 'Não atribuído'}</p>
                                            <p><strong>Transferido por:</strong> ${transferencia.usuario_transferencia.nome}</p>
                                        </div>
                                        <div class="col-md-6">
                                            <p><strong>Data:</strong> ${transferencia.data_transferencia}</p>
                                            <p><strong>Status:</strong> 
                                                ${transferencia.status_anterior} → ${transferencia.status_novo}
                                            </p>
                                            <p><strong>Prioridade:</strong> 
                                                ${transferencia.prioridade_anterior} → ${transferencia.prioridade_nova}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    ${transferencia.motivo_transferencia ? `
                                        <div class="mt-2">
                                            <strong>Motivo:</strong>
                                            <p class="text-muted">${transferencia.motivo_transferencia}</p>
                                        </div>
                                    ` : ''}
                                    
                                    ${transferencia.observacoes ? `
                                        <div class="mt-2">
                                            <strong>Observações:</strong>
                                            <p class="text-muted small">${transferencia.observacoes}</p>
                                        </div>
                                    ` : ''}
                                    
                                    ${transferencia.tempo_entre_transferencias ? `
                                        <div class="mt-2">
                                            <small class="text-info">
                                                <i class="fas fa-clock me-1"></i>
                                                ${transferencia.tempo_entre_transferencias}h desde última transferência
                                            </small>
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
            
            <style>
                .timeline {
                    position: relative;
                    padding-left: 30px;
                }
                
                .timeline::before {
                    content: '';
                    position: absolute;
                    left: 15px;
                    top: 0;
                    bottom: 0;
                    width: 2px;
                    background: var(--bs-info);
                }
                
                .timeline-item {
                    position: relative;
                    margin-bottom: 20px;
                }
                
                .timeline-marker {
                    position: absolute;
                    left: -22px;
                    top: 10px;
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
                    margin-left: 20px;
                }
            </style>
        `;
    }

    /**
     * Busca detalhes de um chamado
     */
    async buscarDetalhesChamado(chamadoId) {
        try {
            const response = await fetch(`/ti/api/chamados/${chamadoId}`);
            if (response.ok) {
                const data = await response.json();
                return data.chamado;
            }
            return null;
        } catch (error) {
            console.error('❌ Erro ao buscar detalhes do chamado:', error);
            return null;
        }
    }

    /**
     * Atualiza interface após transferência
     */
    atualizarInterfaceAposTransferencia(chamadoId, transferencia) {
        // Atualizar card do chamado se visível
        const chamadoCard = document.querySelector(`[data-chamado-id="${chamadoId}"]`);
        if (chamadoCard) {
            const agenteInfo = chamadoCard.querySelector('.agente-info');
            if (agenteInfo) {
                agenteInfo.innerHTML = `
                    <i class="fas fa-user me-1"></i>
                    ${transferencia.agente_destino.nome}
                `;
            }
        }

        // Atualizar lista de chamados se função existir
        if (typeof atualizarListaChamados === 'function') {
            atualizarListaChamados();
        }
    }

    /**
     * Atualiza indicadores de disponibilidade
     */
    atualizarIndicadoresDisponibilidade() {
        const indicadores = document.querySelectorAll('.indicador-disponibilidade-agente');
        indicadores.forEach(indicador => {
            const agenteId = indicador.dataset.agenteId;
            const agente = this.agentesDisponiveis.find(a => a.id == agenteId);
            
            if (agente) {
                indicador.className = `indicador-disponibilidade-agente badge bg-${this.getDisponibilidadeColor(agente.disponibilidade_percentual)}`;
                indicador.textContent = `${agente.disponibilidade_percentual}%`;
            }
        });
    }

    /**
     * Processa notificação de transferência via Socket.IO
     */
    processarNotificacaoTransferencia(data) {
        console.log('📨 Notificação de transferência recebida:', data);
        
        // Limpar cache para o chamado transferido
        this.transferenciasCache.delete(data.chamado.id);
        
        // Atualizar lista de agentes
        this.carregarAgentesDisponiveis(true);
        
        // Mostrar notificação
        this.mostrarNotificacao(
            `Chamado ${data.chamado.codigo} transferido para ${data.agente_novo.nome}`,
            'info'
        );
    }

    /**
     * Atualiza disponibilidade de um agente específico
     */
    atualizarDisponibilidadeAgente(data) {
        const agenteIndex = this.agentesDisponiveis.findIndex(a => a.id === data.agente_id);
        if (agenteIndex !== -1) {
            this.agentesDisponiveis[agenteIndex].chamados_ativos = data.chamados_ativos;
            this.agentesDisponiveis[agenteIndex].disponibilidade_percentual = data.disponibilidade_percentual;
            this.agentesDisponiveis[agenteIndex].pode_receber_chamado = data.pode_receber_chamado;
            
            this.atualizarIndicadoresDisponibilidade();
        }
    }

    /**
     * Inicia atualização periódica de dados
     */
    iniciarAtualizacaoPeriodica() {
        // Atualizar agentes a cada 2 minutos
        setInterval(() => {
            this.carregarAgentesDisponiveis(true);
        }, 120000);

        // Limpar cache de transferências a cada 5 minutos
        setInterval(() => {
            this.transferenciasCache.clear();
        }, 300000);
    }

    /**
     * Renderiza widget de transferências rápidas
     */
    renderizarWidgetTransferenciasRapidas(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = `
            <div class="card bg-dark">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h6 class="mb-0">
                        <i class="fas fa-exchange-alt me-2"></i>
                        Transferências Rápidas
                    </h6>
                    <button class="btn btn-outline-info btn-sm btn-atualizar-agentes">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                </div>
                <div class="card-body">
                    <div id="agentes-rapidos">
                        ${this.renderizarAgentesRapidos()}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Renderiza lista de agentes para transferência rápida
     */
    renderizarAgentesRapidos() {
        if (this.agentesDisponiveis.length === 0) {
            return '<p class="text-muted">Carregando agentes...</p>';
        }

        return this.agentesDisponiveis
            .filter(agente => agente.pode_receber_chamado)
            .slice(0, 5)
            .map(agente => `
                <div class="d-flex justify-content-between align-items-center mb-2 p-2 border rounded">
                    <div>
                        <strong>${agente.usuario.nome}</strong><br>
                        <small class="text-muted">${agente.nivel_experiencia}</small>
                    </div>
                    <div class="text-end">
                        <span class="badge bg-${this.getDisponibilidadeColor(agente.disponibilidade_percentual)}">
                            ${agente.disponibilidade_percentual}%
                        </span><br>
                        <small class="text-muted">${agente.chamados_ativos}/${agente.max_chamados_simultaneos}</small>
                    </div>
                </div>
            `).join('');
    }

    /**
     * Utilitários
     */
    getCSRFToken() {
        return document.querySelector('meta[name=csrf-token]')?.getAttribute('content') || '';
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

    getDisponibilidadeColor(percentual) {
        if (percentual >= 70) return 'success';
        if (percentual >= 40) return 'warning';
        return 'danger';
    }

    mostrarLoading(mensagem = 'Carregando...') {
        console.log('🔄', mensagem);
    }

    ocultarLoading() {
        console.log('✅ Loading ocultado');
    }

    mostrarSucesso(mensagem) {
        console.log('✅', mensagem);
        if (typeof mostrarNotificacao === 'function') {
            mostrarNotificacao(mensagem, 'success');
        }
    }

    mostrarErro(mensagem) {
        console.error('❌', mensagem);
        if (typeof mostrarNotificacao === 'function') {
            mostrarNotificacao(mensagem, 'error');
        }
    }

    mostrarNotificacao(mensagem, tipo) {
        console.log(`${tipo === 'error' ? '❌' : '📨'}`, mensagem);
        if (typeof mostrarNotificacao === 'function') {
            mostrarNotificacao(mensagem, tipo);
        }
    }
}

// Inicializar quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    window.transferenciasChamados = new TransferenciasChamados();
    console.log('✅ Sistema de transferências inicializado');
});

// Exportar para uso global
window.TransferenciasChamados = TransferenciasChamados;
