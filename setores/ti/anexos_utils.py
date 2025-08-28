"""
Utilitários para manipulação de anexos de chamados
"""
import os
import uuid
import hashlib
from datetime import datetime
from werkzeug.utils import secure_filename

# Configurações de anexos
ANEXOS_CONFIG = {
    'UPLOAD_FOLDER': 'uploads/chamados',
    'MAX_FILE_SIZE': 10 * 1024 * 1024,  # 10MB por arquivo
    'MAX_TOTAL_SIZE': 50 * 1024 * 1024,  # 50MB total por chamado
    'ALLOWED_EXTENSIONS': {
        'images': ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'],
        'videos': ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv'],
        'documents': ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt']
    },
    'ALLOWED_MIME_TYPES': [
        # Imagens
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 
        'image/webp', 'image/bmp',
        # Vídeos
        'video/mp4', 'video/avi', 'video/quicktime', 'video/x-ms-wmv',
        'video/x-flv', 'video/webm', 'video/x-matroska',
        # Documentos
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain'
    ]
}

def is_allowed_file(filename, file_content_type):
    """Verifica se o arquivo é permitido baseado na extensão e tipo MIME"""
    if not filename or '.' not in filename:
        return False, "Arquivo deve ter uma extensão"
    
    extension = filename.rsplit('.', 1)[1].lower()
    all_extensions = []
    for ext_list in ANEXOS_CONFIG['ALLOWED_EXTENSIONS'].values():
        all_extensions.extend(ext_list)
    
    if extension not in all_extensions:
        return False, f"Extensão '{extension}' não permitida"
    
    if file_content_type not in ANEXOS_CONFIG['ALLOWED_MIME_TYPES']:
        return False, f"Tipo de arquivo '{file_content_type}' não permitido"
    
    return True, "Arquivo permitido"

def generate_unique_filename(original_filename):
    """Gera um nome único para o arquivo"""
    # Extrair extensão
    if '.' in original_filename:
        extension = original_filename.rsplit('.', 1)[1].lower()
    else:
        extension = ''
    
    # Gerar nome único
    unique_id = str(uuid.uuid4())
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    
    if extension:
        unique_filename = f"{timestamp}_{unique_id}.{extension}"
    else:
        unique_filename = f"{timestamp}_{unique_id}"
    
    return unique_filename

def calculate_file_hash(file_path):
    """Calcula o hash SHA-256 do arquivo"""
    hash_sha256 = hashlib.sha256()
    try:
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_sha256.update(chunk)
        return hash_sha256.hexdigest()
    except Exception:
        return None

def create_upload_directory(base_path=None):
    """Cria o diretório de upload se não existir"""
    if base_path is None:
        base_path = ANEXOS_CONFIG['UPLOAD_FOLDER']
    
    try:
        os.makedirs(base_path, exist_ok=True)
        return True, base_path
    except Exception as e:
        return False, f"Erro ao criar diretório: {str(e)}"

def validate_file_size(file_size, chamado_id=None):
    """Valida o tamanho do arquivo"""
    # Verificar tamanho individual do arquivo
    if file_size > ANEXOS_CONFIG['MAX_FILE_SIZE']:
        max_size_mb = ANEXOS_CONFIG['MAX_FILE_SIZE'] / (1024 * 1024)
        return False, f"Arquivo muito grande. Máximo permitido: {max_size_mb:.1f}MB"
    
    # Se um chamado_id for fornecido, verificar tamanho total
    if chamado_id:
        from database import Chamado
        chamado = Chamado.query.get(chamado_id)
        if chamado:
            tamanho_atual = chamado.get_tamanho_total_anexos()
            limite_total = ANEXOS_CONFIG['MAX_TOTAL_SIZE']
            
            if (tamanho_atual + file_size) > limite_total:
                limite_mb = limite_total / (1024 * 1024)
                atual_mb = tamanho_atual / (1024 * 1024)
                return False, f"Limite total de anexos excedido. Limite: {limite_mb:.1f}MB, Atual: {atual_mb:.1f}MB"
    
    return True, "Tamanho válido"

def get_file_type_category(mime_type):
    """Retorna a categoria do tipo de arquivo"""
    if mime_type.startswith('image/'):
        return 'image'
    elif mime_type.startswith('video/'):
        return 'video'
    elif mime_type in [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain'
    ]:
        return 'document'
    else:
        return 'other'

def save_uploaded_file(file, chamado_id, usuario_id, descricao=None):
    """Salva um arquivo enviado e cria o registro no banco"""
    from database import db, ChamadoAnexo
    from flask import current_app
    
    try:
        # Validar arquivo
        is_valid, message = is_allowed_file(file.filename, file.content_type)
        if not is_valid:
            return False, message, None
        
        # Validar tamanho
        file.seek(0, 2)  # Ir para o final do arquivo
        file_size = file.tell()
        file.seek(0)  # Voltar ao início
        
        is_valid_size, size_message = validate_file_size(file_size, chamado_id)
        if not is_valid_size:
            return False, size_message, None
        
        # Criar diretório de upload
        success, upload_path = create_upload_directory()
        if not success:
            return False, upload_path, None
        
        # Gerar nome único para o arquivo
        unique_filename = generate_unique_filename(file.filename)
        file_path = os.path.join(upload_path, unique_filename)
        
        # Salvar arquivo
        file.save(file_path)
        
        # Calcular hash
        file_hash = calculate_file_hash(file_path)
        
        # Extrair extensão
        extension = ''
        if '.' in file.filename:
            extension = file.filename.rsplit('.', 1)[1].lower()
        
        # Criar registro no banco
        anexo = ChamadoAnexo(
            chamado_id=chamado_id,
            nome_original=secure_filename(file.filename),
            nome_arquivo=unique_filename,
            caminho_arquivo=file_path,
            tamanho_bytes=file_size,
            tipo_mime=file.content_type,
            extensao=extension,
            hash_arquivo=file_hash,
            usuario_upload_id=usuario_id,
            descricao=descricao
        )
        
        db.session.add(anexo)
        db.session.commit()
        
        current_app.logger.info(f"Anexo salvo com sucesso: {file.filename} para chamado {chamado_id}")
        return True, "Arquivo enviado com sucesso", anexo
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Erro ao salvar anexo: {str(e)}")
        return False, f"Erro interno: {str(e)}", None

def delete_attachment(anexo_id, usuario_id):
    """Remove um anexo (soft delete)"""
    from database import db, ChamadoAnexo
    from flask import current_app
    
    try:
        anexo = ChamadoAnexo.query.get(anexo_id)
        if not anexo:
            return False, "Anexo não encontrado"
        
        # Verificar permissões - apenas o usuário que enviou ou admin pode deletar
        from flask_login import current_user
        if anexo.usuario_upload_id != usuario_id and not current_user.tem_permissao('Administrador'):
            return False, "Sem permissão para remover este anexo"
        
        # Soft delete
        anexo.ativo = False
        db.session.commit()
        
        current_app.logger.info(f"Anexo removido: {anexo.nome_original} (ID: {anexo_id}) por usuário {usuario_id}")
        return True, "Anexo removido com sucesso"
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Erro ao remover anexo: {str(e)}")
        return False, f"Erro interno: {str(e)}"

def get_attachment_url(anexo_id):
    """Gera URL para download/visualiza��ão do anexo"""
    from flask import url_for
    return url_for('ti.download_anexo', anexo_id=anexo_id)

def format_file_size(size_bytes):
    """Formata tamanho de arquivo para exibição"""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    else:
        return f"{size_bytes / (1024 * 1024 * 1024):.1f} GB"

def get_file_icon_class(mime_type):
    """Retorna a classe CSS do ícone FontAwesome para o tipo de arquivo"""
    if mime_type.startswith('image/'):
        return 'fas fa-image text-primary'
    elif mime_type.startswith('video/'):
        return 'fas fa-video text-danger'
    elif mime_type == 'application/pdf':
        return 'fas fa-file-pdf text-danger'
    elif 'word' in mime_type or 'document' in mime_type:
        return 'fas fa-file-word text-primary'
    elif 'excel' in mime_type or 'sheet' in mime_type:
        return 'fas fa-file-excel text-success'
    elif 'powerpoint' in mime_type or 'presentation' in mime_type:
        return 'fas fa-file-powerpoint text-warning'
    elif mime_type == 'text/plain':
        return 'fas fa-file-alt text-secondary'
    else:
        return 'fas fa-file text-muted'

def cleanup_orphaned_files():
    """Remove arquivos órfãos (sem registro no banco ou marcados como removidos)"""
    from database import ChamadoAnexo
    from flask import current_app
    import glob
    
    try:
        upload_path = ANEXOS_CONFIG['UPLOAD_FOLDER']
        if not os.path.exists(upload_path):
            return True, "Diretório de upload não existe"
        
        # Listar todos os arquivos no diretório
        all_files = glob.glob(os.path.join(upload_path, '*'))
        
        # Obter nomes de arquivos ativos no banco
        anexos_ativos = ChamadoAnexo.query.filter_by(ativo=True).all()
        arquivos_ativos = {anexo.nome_arquivo for anexo in anexos_ativos}
        
        files_removed = 0
        for file_path in all_files:
            filename = os.path.basename(file_path)
            if filename not in arquivos_ativos:
                try:
                    os.remove(file_path)
                    files_removed += 1
                    current_app.logger.info(f"Arquivo órfão removido: {filename}")
                except Exception as e:
                    current_app.logger.error(f"Erro ao remover arquivo órfão {filename}: {str(e)}")
        
        return True, f"{files_removed} arquivos órfãos removidos"
        
    except Exception as e:
        current_app.logger.error(f"Erro na limpeza de arquivos órfãos: {str(e)}")
        return False, f"Erro na limpeza: {str(e)}"

def get_attachment_statistics():
    """Retorna estatísticas sobre anexos do sistema"""
    from database import ChamadoAnexo, db
    
    try:
        # Consultas básicas
        total_anexos = ChamadoAnexo.query.filter_by(ativo=True).count()
        
        # Tamanho total
        result = db.session.query(db.func.sum(ChamadoAnexo.tamanho_bytes)).filter_by(ativo=True).scalar()
        tamanho_total = result or 0
        
        # Anexos por tipo
        anexos_imagem = ChamadoAnexo.query.filter(
            ChamadoAnexo.ativo == True,
            ChamadoAnexo.tipo_mime.like('image/%')
        ).count()
        
        anexos_video = ChamadoAnexo.query.filter(
            ChamadoAnexo.ativo == True,
            ChamadoAnexo.tipo_mime.like('video/%')
        ).count()
        
        anexos_documento = ChamadoAnexo.query.filter(
            ChamadoAnexo.ativo == True,
            ChamadoAnexo.tipo_mime.in_([
                'application/pdf',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'application/vnd.ms-powerpoint',
                'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                'text/plain'
            ])
        ).count()
        
        return {
            'total_anexos': total_anexos,
            'tamanho_total': tamanho_total,
            'tamanho_total_formatado': format_file_size(tamanho_total),
            'anexos_imagem': anexos_imagem,
            'anexos_video': anexos_video,
            'anexos_documento': anexos_documento,
            'anexos_outros': total_anexos - anexos_imagem - anexos_video - anexos_documento
        }
        
    except Exception as e:
        return {
            'erro': f"Erro ao obter estatísticas: {str(e)}"
        }
