// enviar_ticket.js

window.openTicketModal = function(chamado) {
    ticketChamadoId.value = chamado.id;
    ticketAssunto.value = `Atualização do Chamado ${chamado.codigo}`;
    modalTicket.classList.add('active');
};



// Variáveis do modal
const modalTicket = document.getElementById('modalTicket');
const formTicket = document.getElementById('formTicket');
const ticketChamadoId = document.getElementById('ticketChamadoId');
const ticketModelo = document.getElementById('ticketModelo');
const ticketAssunto = document.getElementById('ticketAssunto');
const ticketMensagem = document.getElementById('ticketMensagem');
const ticketPrioridade = document.getElementById('ticketPrioridade');
const ticketCopia = document.getElementById('ticketCopia');

// Botões
const btnEnviarTicket = document.getElementById('btnEnviarTicket');
const btnCancelarTicket = document.getElementById('btnCancelarTicket');
const modalTicketClose = document.getElementById('modalTicketClose');

// Função para abrir o modal de ticket
function openTicketModal(chamado) {
    ticketChamadoId.value = chamado.id;
    ticketAssunto.value = `Atualização do Chamado ${chamado.codigo}`;
    modalTicket.classList.add('active');
}

// Função para fechar o modal de ticket
function closeTicketModal() {
    modalTicket.classList.remove('active');
    formTicket.reset();
}

// Função para aplicar modelo de mensagem
function aplicarModeloMensagem(modelo, chamado) {
    const modelos = {
        atualizacao: `
Prezado(a) ${chamado.solicitante},

Seu chamado ${chamado.codigo} foi atualizado.
Status atual: ${chamado.status}

Atenciosamente,
Equipe de Suporte TI
`,
        confirmacao: `
Prezado(a) ${chamado.solicitante},

Confirmamos o recebimento do seu chamado ${chamado.codigo}.
Em breve nossa equipe iniciará o atendimento.

Detalhes do chamado:
- Problema: ${chamado.problema}
- Unidade: ${chamado.unidade}
- Data de abertura: ${chamado.data_abertura}

Manteremos você informado sobre o progresso.

Atenciosamente,
Equipe de Suporte TI
`,
        conclusao: `
Prezado(a) ${chamado.solicitante},

Seu chamado ${chamado.codigo} foi concluído com sucesso.

Resumo do atendimento:
- Problema relatado: ${chamado.problema}
- Data de conclusão: ${new Date().toLocaleString()}

Caso necessite de suporte adicional, não hesite em abrir um novo chamado.

Atenciosamente,
Equipe de Suporte TI
`
    };

    return modelos[modelo] || '';
}

// Event Listeners
ticketModelo.addEventListener('change', function() {
    const chamadoId = ticketChamadoId.value;
    const chamado = chamadosData.find(c => c.id == chamadoId);
    
    if (chamado && this.value) {
        ticketMensagem.value = aplicarModeloMensagem(this.value, chamado);
    }
});

btnEnviarTicket.addEventListener('click', async function() {
    const chamadoId = ticketChamadoId.value;
    
    if (!ticketAssunto.value.trim() || !ticketMensagem.value.trim()) {
        alert('Por favor, preencha todos os campos obrigatórios.');
        return;
    }
    
    try {
        const response = await fetch(`/ti/painel/api/chamados/${chamadoId}/ticket`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                assunto: ticketAssunto.value,
                mensagem: ticketMensagem.value,
                prioridade: ticketPrioridade.checked,
                enviar_copia: ticketCopia.checked,
                modelo: ticketModelo.value
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Erro ao enviar ticket');
        }

        const data = await response.json();
        let successMessage = 'Ticket enviado com sucesso!';

        // Adicionar informação sobre anexos se houver
        if (data.ticket && data.ticket.anexos_enviados > 0) {
            successMessage += `\n\n📎 ${data.ticket.anexos_enviados} anexo(s) incluído(s) no e-mail.`;
        }

        alert(successMessage);
        closeTicketModal();
        
    } catch (error) {
        console.error('Erro ao enviar ticket:', error);
        alert(`Erro ao enviar ticket: ${error.message}`);
    }
});

btnCancelarTicket.addEventListener('click', closeTicketModal);
modalTicketClose.addEventListener('click', closeTicketModal);

// Fechar modal ao clicar fora
modalTicket.addEventListener('click', function(e) {
    if (e.target === this) {
        closeTicketModal();
    }
});

// Atualizar os event listeners dos botões de ticket
function updateTicketButtons() {
    document.querySelectorAll('.btn-ticket-sm, #modalSendTicket').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const chamadoId = this.dataset.id || currentModalChamadoId;
            const chamado = chamadosData.find(c => c.id == chamadoId);
            
            if (chamado) {
                openTicketModal(chamado);
            } else {
                alert('Erro: Chamado não encontrado');
            }
        });
    });
}

// Adicionar ao DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
    updateTicketButtons();
});
