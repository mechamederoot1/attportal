/**
 * Reabertura de Chamados - Sistema Evoque Fitness
 * 
 * Este módulo gerencia a funcionalidade de reabertura automática de chamados,
 * verificando chamados similares e permitindo que usuários reabram chamados
 * concluídos dentro do prazo estabelecido.
 */

class ReaberturaChamados {
    constructor() {
        this.diasLimite = 7; // Configuração padrão
        this.cache = new Map();
        this.init();
    }

    init() {
        console.log('🔄 Inicializando sistema de reabertura de chamados...');
        this.carregarConfiguracoes();
        this.bindEvents();
    }

    /**
     * Carrega configurações de reabertura do servidor
     */
    async carregarConfiguracoes() {
        try {
            const response = await fetch('/ti/api/configuracoes/reabertura');
            if (response.ok) {
                const config = await response.json();
                this.diasLimite = config.dias_limite || 7;
                console.log(`✅ Configurações carregadas: ${this.diasLimite} dias limite`);
            }
        } catch (error) {
            console.warn('⚠️ Usando configurações padrão para reabertura:', error);
        }
    }

    /**
     * Vincula eventos do sistema
     */
    bindEvents() {
        // Event listener para verificação automática durante abertura de chamado
        document.addEventListener('formulario_chamado_preenchido', (event) => {
            this.verificarReaberturaAutomatica(event.detail);
        });

        // Event listener para botões de reabertura
        document.addEventListener('click', (event) => {
            if (event.target.matches('.btn-reabrir-chamado')) {
                event.preventDefault();
                const chamadoId = event.target.dataset.chamadoId;
                this.mostrarModalReabertura(chamadoId);
            }
        });
    }

    /**
     * Verifica se um novo chamado pode ser convertido em reabertura
     */
    async verificarReaberturaAutomatica(dadosChamado) {
        try {
            const { email, problema } = dadosChamado;
            
            if (!email || !problema) {
                return false;
            }

            // Verificar cache primeiro
            const cacheKey = `${email}_${problema}`;
            if (this.cache.has(cacheKey)) {
                const cacheData = this.cache.get(cacheKey);
                if (Date.now() - cacheData.timestamp < 300000) { // 5 minutos
                    return this.processarResultadoVerificacao(cacheData.data);
                }
            }

            const response = await fetch('/ti/api/chamados/verificar-reabertura', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCSRFToken()
                },
                body: JSON.stringify({
                    email: email,
                    problema: problema,
                    dias_limite: this.diasLimite
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            
            // Atualizar cache
            this.cache.set(cacheKey, {
                data: data,
                timestamp: Date.now()
            });

            return this.processarResultadoVerificacao(data);

        } catch (error) {
            console.error('❌ Erro ao verificar reabertura:', error);
            return false;
        }
    }

    /**
     * Processa resultado da verificação de reabertura
     */
    processarResultadoVerificacao(data) {
        if (data.pode_reabrir && data.chamado_original) {
            this.mostrarSugestaoReabertura(data);
            return true;
        }
        return false;
    }

    /**
     * Mostra sugestão de reabertura para o usuário
     */
    mostrarSugestaoReabertura(data) {
        const { chamado_original, dias_desde_conclusao } = data;
        
        const modal = this.criarModalSugestao(chamado_original, dias_desde_conclusao);
        document.body.appendChild(modal);
        
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();

        // Event listeners para o modal
        modal.querySelector('.btn-aceitar-reabertura').addEventListener('click', () => {
            bsModal.hide();
            this.executarReabertura(chamado_original.id);
        });

        modal.querySelector('.btn-recusar-reabertura').addEventListener('click', () => {
            bsModal.hide();
            this.continuarNovoChamado();
        });

        // Limpar modal após fechar
        modal.addEventListener('hidden.bs.modal', () => {
            modal.remove();
        });
    }

    /**
     * Cria modal de sugestão de reabertura
     */
    criarModalSugestao(chamadoOriginal, diasDesdeConclusao) {
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.setAttribute('tabindex', '-1');
        modal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content bg-dark text-white">
                    <div class="modal-header border-secondary">
                        <h5 class="modal-title">
                            <i class="fas fa-redo text-warning me-2"></i>
                            Reabertura de Chamado Detectada
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="alert alert-info d-flex align-items-center">
                            <i class="fas fa-info-circle me-2"></i>
                            <div>
                                Encontramos um chamado similar que foi concluído há <strong>${diasDesdeConclusao} dia${diasDesdeConclusao !== 1 ? 's' : ''}</strong>.
                                Você gostaria de reabrir o chamado anterior ao invés de criar um novo?
                            </div>
                        </div>
                        
                        <div class="card bg-secondary">
                            <div class="card-header">
                                <h6 class="mb-0">Chamado Encontrado:</h6>
                            </div>
                            <div class="card-body">
                                <div class="row">
                                    <div class="col-md-6">
                                        <strong>Código:</strong> ${chamadoOriginal.codigo}<br>
                                        <strong>Protocolo:</strong> ${chamadoOriginal.protocolo}
                                    </div>
                                    <div class="col-md-6">
                                        <strong>Problema:</strong> ${chamadoOriginal.problema}<br>
                                        <strong>Concluído em:</strong> ${chamadoOriginal.data_conclusao}
                                    </div>
                                </div>
                                ${chamadoOriginal.descricao ? `
                                    <div class="mt-2">
                                        <strong>Descrição anterior:</strong>
                                        <p class="text-muted small">${chamadoOriginal.descricao}</p>
                                    </div>
                                ` : ''}
                            </div>
                        </div>

                        <div class="mt-3">
                            <label for="motivo-reabertura" class="form-label">Motivo da reabertura (opcional):</label>
                            <textarea class="form-control bg-dark text-white border-secondary" 
                                      id="motivo-reabertura" 
                                      rows="3" 
                                      placeholder="Descreva por que está reabrindo este chamado..."></textarea>
                        </div>
                    </div>
                    <div class="modal-footer border-secondary">
                        <button type="button" class="btn btn-secondary btn-recusar-reabertura">
                            <i class="fas fa-plus me-1"></i>Criar Novo Chamado
                        </button>
                        <button type="button" class="btn btn-warning btn-aceitar-reabertura">
                            <i class="fas fa-redo me-1"></i>Reabrir Chamado Anterior
                        </button>
                    </div>
                </div>
            </div>
        `;
        return modal;
    }

    /**
     * Executa a reabertura do chamado
     */
    async executarReabertura(chamadoOriginalId) {
        try {
            this.mostrarLoading('Reabrindo chamado...');

            const motivo = document.getElementById('motivo-reabertura')?.value || '';

            const response = await fetch('/ti/api/chamados/reabrir', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCSRFToken()
                },
                body: JSON.stringify({
                    chamado_original_id: chamadoOriginalId,
                    motivo: motivo,
                    observacoes_adicionais: 'Reabertura automática pelo sistema'
                })
            });

            const data = await response.json();

            if (data.status === 'success') {
                this.mostrarSucesso('Chamado reaberto com sucesso!', data.novo_chamado);
                this.limparFormularioChamado();
            } else {
                this.mostrarErro(data.message);
            }

        } catch (error) {
            console.error('❌ Erro ao reabrir chamado:', error);
            this.mostrarErro('Erro interno. Tente novamente.');
        } finally {
            this.ocultarLoading();
        }
    }

    /**
     * Mostra modal para reabertura manual
     */
    async mostrarModalReabertura(chamadoId) {
        try {
            const chamado = await this.buscarDetalhesChamado(chamadoId);
            if (!chamado) {
                this.mostrarErro('Chamado não encontrado');
                return;
            }

            const modal = this.criarModalReaberturaManual(chamado);
            document.body.appendChild(modal);
            
            const bsModal = new bootstrap.Modal(modal);
            bsModal.show();

            // Event listeners
            modal.querySelector('.btn-confirmar-reabertura').addEventListener('click', async () => {
                const motivo = modal.querySelector('#motivo-reabertura-manual').value;
                const observacoes = modal.querySelector('#observacoes-reabertura').value;

                bsModal.hide();
                await this.executarReaberturaManual(chamadoId, motivo, observacoes);
            });

            // Limpar modal após fechar
            modal.addEventListener('hidden.bs.modal', () => {
                modal.remove();
            });

        } catch (error) {
            console.error('❌ Erro ao mostrar modal de reabertura:', error);
            this.mostrarErro('Erro ao carregar detalhes do chamado');
        }
    }

    /**
     * Cria modal para reabertura manual
     */
    criarModalReaberturaManual(chamado) {
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.setAttribute('tabindex', '-1');
        modal.innerHTML = `
            <div class="modal-dialog modal-lg">
                <div class="modal-content bg-dark text-white">
                    <div class="modal-header border-secondary">
                        <h5 class="modal-title">
                            <i class="fas fa-redo text-warning me-2"></i>
                            Reabrir Chamado ${chamado.codigo}
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row">
                            <div class="col-md-6">
                                <strong>Protocolo:</strong> ${chamado.protocolo}<br>
                                <strong>Solicitante:</strong> ${chamado.solicitante}<br>
                                <strong>Problema:</strong> ${chamado.problema}
                            </div>
                            <div class="col-md-6">
                                <strong>Status:</strong> <span class="badge bg-success">${chamado.status}</span><br>
                                <strong>Prioridade:</strong> ${chamado.prioridade}<br>
                                <strong>Concluído em:</strong> ${chamado.data_conclusao || 'N/A'}
                            </div>
                        </div>

                        <div class="mt-3">
                            <label for="motivo-reabertura-manual" class="form-label">
                                Motivo da reabertura <span class="text-danger">*</span>
                            </label>
                            <textarea class="form-control bg-dark text-white border-secondary" 
                                      id="motivo-reabertura-manual" 
                                      rows="3" 
                                      required
                                      placeholder="Explique por que este chamado precisa ser reaberto..."></textarea>
                        </div>

                        <div class="mt-3">
                            <label for="observacoes-reabertura" class="form-label">Observações adicionais (opcional)</label>
                            <textarea class="form-control bg-dark text-white border-secondary" 
                                      id="observacoes-reabertura" 
                                      rows="2" 
                                      placeholder="Informações adicionais sobre a reabertura..."></textarea>
                        </div>

                        <div class="alert alert-warning mt-3">
                            <i class="fas fa-exclamation-triangle me-2"></i>
                            <strong>Atenção:</strong> A reabertura criará um novo chamado vinculado ao original, 
                            mantendo o histórico de atendimento.
                        </div>
                    </div>
                    <div class="modal-footer border-secondary">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                            <i class="fas fa-times me-1"></i>Cancelar
                        </button>
                        <button type="button" class="btn btn-warning btn-confirmar-reabertura">
                            <i class="fas fa-redo me-1"></i>Confirmar Reabertura
                        </button>
                    </div>
                </div>
            </div>
        `;
        return modal;
    }

    /**
     * Executa reabertura manual
     */
    async executarReaberturaManual(chamadoId, motivo, observacoes) {
        if (!motivo.trim()) {
            this.mostrarErro('Motivo da reabertura é obrigatório');
            return;
        }

        try {
            this.mostrarLoading('Reabrindo chamado...');

            const response = await fetch('/ti/api/chamados/reabrir', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCSRFToken()
                },
                body: JSON.stringify({
                    chamado_original_id: chamadoId,
                    motivo: motivo,
                    observacoes_adicionais: observacoes
                })
            });

            const data = await response.json();

            if (data.status === 'success') {
                this.mostrarSucesso('Chamado reaberto com sucesso!', data.novo_chamado);
                
                // Atualizar interface se necessário
                if (typeof atualizarListaChamados === 'function') {
                    atualizarListaChamados();
                }
            } else {
                this.mostrarErro(data.message);
            }

        } catch (error) {
            console.error('❌ Erro ao reabrir chamado:', error);
            this.mostrarErro('Erro interno. Tente novamente.');
        } finally {
            this.ocultarLoading();
        }
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
     * Carrega histórico de reaberturas de um chamado
     */
    async carregarHistoricoReaberturas(chamadoId) {
        try {
            const response = await fetch(`/ti/api/chamados/${chamadoId}/reaberturas`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            return data.reaberturas || [];

        } catch (error) {
            console.error('❌ Erro ao carregar histórico de reaberturas:', error);
            return [];
        }
    }

    /**
     * Renderiza histórico de reaberturas na interface
     */
    renderizarHistoricoReaberturas(reaberturas, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (reaberturas.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="fas fa-info-circle fa-2x mb-2"></i>
                    <p>Nenhuma reabertura encontrada para este chamado.</p>
                </div>
            `;
            return;
        }

        const html = reaberturas.map(reabertura => `
            <div class="card bg-secondary mb-3">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h6 class="mb-0">
                        <i class="fas fa-redo text-warning me-2"></i>
                        Reabertura #${reabertura.id}
                    </h6>
                    <span class="badge bg-info">${reabertura.status}</span>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-8">
                            <p><strong>Novo chamado:</strong> 
                                <a href="#" class="text-primary" onclick="visualizarChamado(${reabertura.chamado_reaberto.id})">
                                    ${reabertura.chamado_reaberto.codigo}
                                </a>
                                <span class="badge bg-${this.getStatusColor(reabertura.chamado_reaberto.status)} ms-2">
                                    ${reabertura.chamado_reaberto.status}
                                </span>
                            </p>
                            <p><strong>Solicitado por:</strong> ${reabertura.usuario.nome}</p>
                            ${reabertura.motivo ? `<p><strong>Motivo:</strong> ${reabertura.motivo}</p>` : ''}
                        </div>
                        <div class="col-md-4 text-end">
                            <p><strong>Data:</strong> ${reabertura.data_reabertura}</p>
                            <p><strong>Dias entre chamados:</strong> ${reabertura.dias_entre_chamados}</p>
                        </div>
                    </div>
                    ${reabertura.observacoes ? `
                        <div class="mt-2">
                            <strong>Observações:</strong>
                            <p class="text-muted small">${reabertura.observacoes}</p>
                        </div>
                    ` : ''}
                </div>
            </div>
        `).join('');

        container.innerHTML = html;
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

    mostrarLoading(mensagem = 'Carregando...') {
        // Implementar indicador de loading
        console.log('🔄', mensagem);
    }

    ocultarLoading() {
        // Ocultar indicador de loading
        console.log('✅ Loading ocultado');
    }

    mostrarSucesso(mensagem, dados = null) {
        // Implementar notificação de sucesso
        console.log('✅', mensagem, dados);
        
        // Mostrar toast ou notificação
        if (typeof mostrarNotificacao === 'function') {
            mostrarNotificacao(mensagem, 'success');
        }
    }

    mostrarErro(mensagem) {
        // Implementar notificação de erro
        console.error('❌', mensagem);
        
        // Mostrar toast ou notificação
        if (typeof mostrarNotificacao === 'function') {
            mostrarNotificacao(mensagem, 'error');
        }
    }

    continuarNovoChamado() {
        // Implementar lógica para continuar com novo chamado
        console.log('📝 Continuando com novo chamado...');
    }

    limparFormularioChamado() {
        // Implementar limpeza do formulário
        const form = document.getElementById('form-novo-chamado');
        if (form) {
            form.reset();
        }
    }
}

// Inicializar quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    window.reaberturaChamados = new ReaberturaChamados();
    console.log('✅ Sistema de reabertura de chamados inicializado');
});

// Exportar para uso global
window.ReaberturaChamados = ReaberturaChamados;
