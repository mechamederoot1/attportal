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

// Elementos de anexos
const fileInputTicket = document.getElementById('fileInputTicket');
const uploadAreaTicket = document.getElementById('uploadAreaTicket');
const anexosListTicket = document.getElementById('anexosListTicket');
const anexosInfoTicket = document.getElementById('anexosInfoTicket');
const totalAnexosTicket = document.getElementById('totalAnexosTicket');
const tamanhoTotalTicket = document.getElementById('tamanhoTotalTicket');

// Limites (devem refletir o backend)
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB

let selectedFiles = [];

// Botões
const btnEnviarTicket = document.getElementById('btnEnviarTicket');
const btnCancelarTicket = document.getElementById('btnCancelarTicket');
const modalTicketClose = document.getElementById('modalTicketClose');

function bytesToMB(bytes) {
    return (bytes / (1024 * 1024)).toFixed(1);
}

function getFileIcon(mime) {
    if (!mime) return 'fas fa-file text-muted';
    if (mime.startsWith('image/')) return 'fas fa-image text-primary';
    if (mime.startsWith('video/')) return 'fas fa-video text-danger';
    if (mime === 'application/pdf') return 'fas fa-file-pdf text-danger';
    if (mime.includes('word') || mime.includes('document')) return 'fas fa-file-word text-primary';
    if (mime.includes('excel') || mime.includes('sheet')) return 'fas fa-file-excel text-success';
    if (mime.includes('powerpoint') || mime.includes('presentation')) return 'fas fa-file-powerpoint text-warning';
    if (mime === 'text/plain') return 'fas fa-file-alt text-secondary';
    return 'fas fa-file text-muted';
}

function renderSelectedFiles() {
    anexosListTicket.innerHTML = '';

    if (selectedFiles.length === 0) {
        anexosInfoTicket.style.display = 'none';
        return;
    }

    anexosInfoTicket.style.display = 'flex';

    let totalSize = selectedFiles.reduce((acc, f) => acc + f.file.size, 0);
    totalAnexosTicket.textContent = `${selectedFiles.length} arquivo(s) selecionado(s)`;
    tamanhoTotalTicket.textContent = `${bytesToMB(totalSize)} MB / 50 MB`;

    selectedFiles.forEach((item, index) => {
        const { file } = item;
        const li = document.createElement('div');
        li.className = 'anexo-item-ticket';

        const icon = document.createElement('i');
        icon.className = getFileIcon(file.type);

        const name = document.createElement('span');
        name.className = 'anexo-nome-ticket';
        name.textContent = file.name;

        const size = document.createElement('span');
        size.className = 'anexo-tamanho-ticket';
        size.textContent = `${bytesToMB(file.size)} MB`;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'anexo-remove-ticket';
        removeBtn.innerHTML = '<i class="fas fa-times"></i>';
        removeBtn.title = 'Remover';
        removeBtn.addEventListener('click', () => {
            selectedFiles.splice(index, 1);
            renderSelectedFiles();
        });

        li.appendChild(icon);
        li.appendChild(name);
        li.appendChild(size);
        li.appendChild(removeBtn);

        // Pré-visualização para imagens
        if (file.type && file.type.startsWith('image/')) {
            const preview = document.createElement('img');
            preview.className = 'anexo-preview-ticket';
            preview.alt = file.name;
            preview.src = URL.createObjectURL(file);
            li.appendChild(preview);
        }

        anexosListTicket.appendChild(li);
    });
}

function addFiles(files) {
    let totalCurrent = selectedFiles.reduce((acc, f) => acc + f.file.size, 0);
    for (const file of files) {
        if (file.size > MAX_FILE_SIZE) {
            alert(`Arquivo "${file.name}" excede 10MB.`);
            continue;
        }
        if (totalCurrent + file.size > MAX_TOTAL_SIZE) {
            alert('Limite total de 50MB excedido.');
            continue;
        }
        selectedFiles.push({ file });
        totalCurrent += file.size;
    }
    renderSelectedFiles();
}

// Drag & Drop
if (uploadAreaTicket) {
    ['dragenter', 'dragover'].forEach(evt => uploadAreaTicket.addEventListener(evt, e => {
        e.preventDefault();
        e.stopPropagation();
        uploadAreaTicket.classList.add('drag-over');
    }));
    ['dragleave', 'drop'].forEach(evt => uploadAreaTicket.addEventListener(evt, e => {
        e.preventDefault();
        e.stopPropagation();
        if (evt === 'drop') return; // keep class until drop handled
        uploadAreaTicket.classList.remove('drag-over');
    }));
    uploadAreaTicket.addEventListener('drop', e => {
        uploadAreaTicket.classList.remove('drag-over');
        const files = e.dataTransfer?.files || [];
        addFiles(files);
    });
}

// Input change
if (fileInputTicket) {
    fileInputTicket.addEventListener('change', e => {
        addFiles(e.target.files || []);
        // limpar input para permitir re-selecionar mesmos arquivos no futuro
        e.target.value = '';
    });
}

// Abrir/Fechar modal
function openTicketModal(chamado) {
    ticketChamadoId.value = chamado.id;
    ticketAssunto.value = `Atualização do Chamado ${chamado.codigo}`;
    modalTicket.classList.add('active');
}

function closeTicketModal() {
    modalTicket.classList.remove('active');
    formTicket.reset();
    selectedFiles = [];
    renderSelectedFiles();
}

// Modelos de mensagem
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

// Eventos
ticketModelo?.addEventListener('change', function() {
    const chamadoId = ticketChamadoId.value;
    const chamado = (window.chamadosData || []).find(c => c.id == chamadoId);
    if (chamado && this.value) {
        ticketMensagem.value = aplicarModeloMensagem(this.value, chamado);
    }
});

btnEnviarTicket?.addEventListener('click', async function() {
    const chamadoId = ticketChamadoId.value;

    if (!ticketAssunto.value.trim() || !ticketMensagem.value.trim()) {
        alert('Por favor, preencha todos os campos obrigatórios.');
        return;
    }

    // Validar limite total antes do envio
    const totalSize = selectedFiles.reduce((acc, f) => acc + f.file.size, 0);
    if (totalSize > MAX_TOTAL_SIZE) {
        alert('Limite total de 50MB excedido.');
        return;
    }

    try {
        const formData = new FormData();
        formData.append('assunto', ticketAssunto.value);
        formData.append('mensagem', ticketMensagem.value);
        formData.append('prioridade', String(!!ticketPrioridade.checked));
        formData.append('enviar_copia', String(!!ticketCopia.checked));
        formData.append('modelo', ticketModelo.value || '');

        selectedFiles.forEach(({ file }) => formData.append('anexos', file));

        const response = await fetch(`/ti/painel/api/chamados/${chamadoId}/ticket`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            let msg = 'Erro ao enviar ticket';
            try { const err = await response.json(); if (err && err.error) msg = err.error; } catch {}
            throw new Error(msg);
        }

        await response.json();
        alert('Ticket enviado com sucesso!');
        closeTicketModal();
    } catch (error) {
        console.error('Erro ao enviar ticket:', error);
        alert(`Erro ao enviar ticket: ${error.message}`);
    }
});

btnCancelarTicket?.addEventListener('click', closeTicketModal);
modalTicketClose?.addEventListener('click', closeTicketModal);

// Fechar modal ao clicar fora
modalTicket?.addEventListener('click', function(e) {
    if (e.target === this) closeTicketModal();
});

// Atualizar os event listeners dos botões de ticket
function updateTicketButtons() {
    document.querySelectorAll('.btn-ticket-sm, #modalSendTicket').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const chamadoId = this.dataset.id || window.currentModalChamadoId;
            const chamado = (window.chamadosData || []).find(c => c.id == chamadoId);
            if (chamado) {
                openTicketModal(chamado);
            } else {
                alert('Erro: Chamado não encontrado');
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', function() {
    updateTicketButtons();
});
