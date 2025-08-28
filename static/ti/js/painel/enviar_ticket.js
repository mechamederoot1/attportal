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
    clearTicketAttachments();
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
        // Se tem arquivos selecionados, usar FormData para envio multipart
        if (selectedTicketFiles.length > 0) {
            await enviarTicketComAnexos(chamadoId);
        } else {
            // Usar função original se não há anexos
            await enviarTicketSemAnexos(chamadoId);
        }

    } catch (error) {
        console.error('Erro ao enviar ticket:', error);
        alert(`Erro ao enviar ticket: ${error.message}`);
    }
});

// Função para enviar ticket sem anexos
async function enviarTicketSemAnexos(chamadoId) {
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
    alert('Ticket enviado com sucesso!');
    closeTicketModal();
}

// Função para enviar ticket com anexos
async function enviarTicketComAnexos(chamadoId) {
    const formData = new FormData();

    // Adicionar campos do formulário
    formData.append('assunto', ticketAssunto.value);
    formData.append('mensagem', ticketMensagem.value);
    formData.append('prioridade', ticketPrioridade.checked);
    formData.append('enviar_copia', ticketCopia.checked);
    formData.append('modelo', ticketModelo.value);

    // Adicionar arquivos
    selectedTicketFiles.forEach((file, index) => {
        formData.append('anexos', file);
    });

    const response = await fetch(`/ti/painel/api/chamados/${chamadoId}/ticket-com-anexos`, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao enviar ticket');
    }

    const data = await response.json();
    alert('Ticket enviado com sucesso!');
    closeTicketModal();
}

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

// ==================== FUNCIONALIDADE DE ANEXOS ====================

let selectedTicketFiles = [];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_TYPES = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp',
    'video/mp4', 'video/avi', 'video/quicktime', 'video/x-ms-wmv', 'video/x-flv',
    'video/webm', 'video/x-matroska',
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain'
];

// Configurar drag and drop para anexos de ticket
function setupTicketAttachments() {
    const uploadArea = document.getElementById('uploadAreaTicket');
    const anexosSection = document.getElementById('anexosSectionTicket');
    const fileInput = document.getElementById('fileInputTicket');
    const anexosList = document.getElementById('anexosListTicket');
    const anexosInfo = document.getElementById('anexosInfoTicket');

    if (!uploadArea || !fileInput) return;

    // Eventos de drag and drop
    uploadArea.addEventListener('dragover', handleTicketDragOver);
    uploadArea.addEventListener('dragleave', handleTicketDragLeave);
    uploadArea.addEventListener('drop', handleTicketDrop);

    // Evento de seleção de arquivos
    fileInput.addEventListener('change', handleTicketFileSelect);
}

function handleTicketDragOver(e) {
    e.preventDefault();
    document.getElementById('anexosSectionTicket').classList.add('dragover');
}

function handleTicketDragLeave(e) {
    e.preventDefault();
    const anexosSection = document.getElementById('anexosSectionTicket');
    if (!anexosSection.contains(e.relatedTarget)) {
        anexosSection.classList.remove('dragover');
    }
}

function handleTicketDrop(e) {
    e.preventDefault();
    document.getElementById('anexosSectionTicket').classList.remove('dragover');

    const files = Array.from(e.dataTransfer.files);
    addTicketFiles(files);
}

function handleTicketFileSelect(e) {
    const files = Array.from(e.target.files);
    addTicketFiles(files);
}

function addTicketFiles(files) {
    for (let file of files) {
        if (validateTicketFile(file)) {
            // Verificar se já não foi adicionado
            const alreadyExists = selectedTicketFiles.some(f =>
                f.name === file.name && f.size === file.size
            );

            if (!alreadyExists) {
                selectedTicketFiles.push(file);
            }
        }
    }

    updateTicketFilesList();
    updateTicketInfo();
}

function validateTicketFile(file) {
    // Verificar tipo
    if (!ALLOWED_TYPES.includes(file.type)) {
        alert(`Tipo de arquivo não permitido: ${file.name}\nTipos aceitos: Imagens, Vídeos, Documentos`);
        return false;
    }

    // Verificar tamanho individual
    if (file.size > MAX_FILE_SIZE) {
        alert(`Arquivo muito grande: ${file.name}\nTamanho máximo: 10MB`);
        return false;
    }

    // Verificar tamanho total
    const currentTotalSize = selectedTicketFiles.reduce((total, f) => total + f.size, 0);
    if (currentTotalSize + file.size > MAX_TOTAL_SIZE) {
        alert(`Limite total de arquivos excedido.\nMáximo: 50MB por ticket`);
        return false;
    }

    return true;
}

function removeTicketFile(index) {
    selectedTicketFiles.splice(index, 1);
    updateTicketFilesList();
    updateTicketInfo();
}

function updateTicketFilesList() {
    const anexosList = document.getElementById('anexosListTicket');
    if (!anexosList) return;

    anexosList.innerHTML = '';

    selectedTicketFiles.forEach((file, index) => {
        const fileItem = createTicketFileItem(file, index);
        anexosList.appendChild(fileItem);
    });
}

function createTicketFileItem(file, index) {
    const item = document.createElement('div');
    item.className = 'anexo-item-ticket';

    const icon = getTicketFileIcon(file.type);
    const size = formatTicketFileSize(file.size);

    item.innerHTML = `
        <div class="anexo-info-ticket">
            <div class="anexo-icon-ticket">
                <i class="${icon}"></i>
            </div>
            <div class="anexo-details-ticket">
                <div class="anexo-nome-ticket">${file.name}</div>
                <div class="anexo-tamanho-ticket">${size}</div>
            </div>
        </div>
        <div class="anexo-actions-ticket">
            <button type="button" class="btn-remove-ticket" onclick="removeTicketFile(${index})" title="Remover arquivo">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;

    return item;
}

function getTicketFileIcon(mimeType) {
    if (mimeType.startsWith('image/')) {
        return 'fas fa-image';
    } else if (mimeType.startsWith('video/')) {
        return 'fas fa-video';
    } else if (mimeType === 'application/pdf') {
        return 'fas fa-file-pdf';
    } else if (mimeType.includes('word') || mimeType.includes('document')) {
        return 'fas fa-file-word';
    } else if (mimeType.includes('excel') || mimeType.includes('sheet')) {
        return 'fas fa-file-excel';
    } else if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) {
        return 'fas fa-file-powerpoint';
    } else if (mimeType === 'text/plain') {
        return 'fas fa-file-alt';
    } else {
        return 'fas fa-file';
    }
}

function formatTicketFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

function updateTicketInfo() {
    const totalFiles = selectedTicketFiles.length;
    const totalSize = selectedTicketFiles.reduce((total, file) => total + file.size, 0);
    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(1);

    const anexosInfo = document.getElementById('anexosInfoTicket');
    if (!anexosInfo) return;

    if (totalFiles > 0) {
        anexosInfo.style.display = 'flex';
        document.getElementById('totalAnexosTicket').textContent =
            `${totalFiles} arquivo(s) selecionado(s)`;
        document.getElementById('tamanhoTotalTicket').textContent =
            `${totalSizeMB} MB / 50 MB`;
    } else {
        anexosInfo.style.display = 'none';
    }
}

function clearTicketAttachments() {
    selectedTicketFiles = [];
    updateTicketFilesList();
    updateTicketInfo();

    // Limpar input de arquivo
    const fileInput = document.getElementById('fileInputTicket');
    if (fileInput) {
        fileInput.value = '';
    }
}

// Expor funções globalmente
window.removeTicketFile = removeTicketFile;

// ==================== FIM DA FUNCIONALIDADE DE ANEXOS ====================

// Adicionar ao DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
    updateTicketButtons();
    setupTicketAttachments();
});
