# Script para adicionar o modelo de anexos ao database.py

# Nova classe para adicionar após a classe Chamado:

class ChamadoAnexo(db.Model):
    """Tabela para armazenar anexos dos chamados"""
    __tablename__ = 'chamado_anexos'
    
    id = db.Column(db.Integer, primary_key=True)
    chamado_id = db.Column(db.Integer, db.ForeignKey('chamado.id'), nullable=False)
    nome_original = db.Column(db.String(255), nullable=False)
    nome_arquivo = db.Column(db.String(255), nullable=False)  # Nome único no sistema
    caminho_arquivo = db.Column(db.String(500), nullable=False)
    tamanho_bytes = db.Column(db.BigInteger, nullable=False)
    tipo_mime = db.Column(db.String(100), nullable=False)
    extensao = db.Column(db.String(10), nullable=False)
    hash_arquivo = db.Column(db.String(64), nullable=True)  # SHA-256 para verificação
    data_upload = db.Column(db.DateTime, default=lambda: get_brazil_time().replace(tzinfo=None))
    usuario_upload_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    descricao = db.Column(db.Text, nullable=True)  # Descrição opcional do anexo
    ativo = db.Column(db.Boolean, default=True)  # Para soft delete
    
    # Relacionamentos
    chamado = db.relationship('Chamado', backref='anexos')
    usuario_upload = db.relationship('User', backref='anexos_enviados')
    
    def __repr__(self):
        return f'<ChamadoAnexo {self.nome_original} - Chamado {self.chamado_id}>'
    
    def get_tamanho_formatado(self):
        """Retorna o tamanho do arquivo em formato legível"""
        if self.tamanho_bytes < 1024:
            return f"{self.tamanho_bytes} B"
        elif self.tamanho_bytes < 1024 * 1024:
            return f"{self.tamanho_bytes / 1024:.1f} KB"
        elif self.tamanho_bytes < 1024 * 1024 * 1024:
            return f"{self.tamanho_bytes / (1024 * 1024):.1f} MB"
        else:
            return f"{self.tamanho_bytes / (1024 * 1024 * 1024):.1f} GB"
    
    def get_data_upload_brazil(self):
        """Retorna data de upload no timezone do Brasil"""
        if self.data_upload:
            if self.data_upload.tzinfo:
                return self.data_upload.astimezone(BRAZIL_TZ)
            else:
                return BRAZIL_TZ.localize(self.data_upload)
        return None
    
    def is_image(self):
        """Verifica se o arquivo é uma imagem"""
        image_types = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp']
        return self.tipo_mime.lower() in image_types
    
    def is_video(self):
        """Verifica se o arquivo é um vídeo"""
        video_types = ['video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/webm', 'video/mkv']
        return self.tipo_mime.lower() in video_types
    
    def is_document(self):
        """Verifica se o arquivo é um documento"""
        document_types = [
            'application/pdf', 
            'application/msword', 
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/plain'
        ]
        return self.tipo_mime.lower() in document_types
    
    def get_tipo_arquivo(self):
        """Retorna o tipo do arquivo de forma amigável"""
        if self.is_image():
            return 'Imagem'
        elif self.is_video():
            return 'Vídeo'
        elif self.is_document():
            return 'Documento'
        else:
            return 'Arquivo'
    
    def get_icone_arquivo(self):
        """Retorna o ícone FontAwesome apropriado para o tipo de arquivo"""
        if self.is_image():
            return 'fas fa-image'
        elif self.is_video():
            return 'fas fa-video'
        elif self.tipo_mime == 'application/pdf':
            return 'fas fa-file-pdf'
        elif 'word' in self.tipo_mime or 'document' in self.tipo_mime:
            return 'fas fa-file-word'
        elif 'excel' in self.tipo_mime or 'sheet' in self.tipo_mime:
            return 'fas fa-file-excel'
        elif 'powerpoint' in self.tipo_mime or 'presentation' in self.tipo_mime:
            return 'fas fa-file-powerpoint'
        elif self.tipo_mime == 'text/plain':
            return 'fas fa-file-alt'
        else:
            return 'fas fa-file'
    
    def to_dict(self):
        """Converte o anexo para dicionário"""
        return {
            'id': self.id,
            'chamado_id': self.chamado_id,
            'nome_original': self.nome_original,
            'nome_arquivo': self.nome_arquivo,
            'tamanho_bytes': self.tamanho_bytes,
            'tamanho_formatado': self.get_tamanho_formatado(),
            'tipo_mime': self.tipo_mime,
            'extensao': self.extensao,
            'data_upload': self.get_data_upload_brazil().strftime('%d/%m/%Y %H:%M:%S') if self.data_upload else None,
            'usuario_upload': f"{self.usuario_upload.nome} {self.usuario_upload.sobrenome}",
            'descricao': self.descricao,
            'tipo_arquivo': self.get_tipo_arquivo(),
            'icone': self.get_icone_arquivo(),
            'is_image': self.is_image(),
            'is_video': self.is_video(),
            'is_document': self.is_document()
        }

# Métodos para adicionar à classe Chamado:

def get_anexos_ativos(self):
    """Retorna todos os anexos ativos do chamado"""
    return ChamadoAnexo.query.filter_by(
        chamado_id=self.id, 
        ativo=True
    ).order_by(ChamadoAnexo.data_upload.desc()).all()

def get_total_anexos(self):
    """Retorna o número total de anexos ativos"""
    return ChamadoAnexo.query.filter_by(
        chamado_id=self.id, 
        ativo=True
    ).count()

def get_anexos_por_tipo(self, tipo):
    """Retorna anexos filtrados por tipo (imagem, video, documento)"""
    anexos = self.get_anexos_ativos()
    if tipo == 'imagem':
        return [a for a in anexos if a.is_image()]
    elif tipo == 'video':
        return [a for a in anexos if a.is_video()]
    elif tipo == 'documento':
        return [a for a in anexos if a.is_document()]
    else:
        return anexos

def get_tamanho_total_anexos(self):
    """Retorna o tamanho total de todos os anexos em bytes"""
    anexos = self.get_anexos_ativos()
    return sum(anexo.tamanho_bytes for anexo in anexos)

def pode_adicionar_anexo(self, tamanho_arquivo, limite_total_mb=50):
    """Verifica se é possível adicionar um anexo baseado no limite de tamanho"""
    limite_total_bytes = limite_total_mb * 1024 * 1024
    tamanho_atual = self.get_tamanho_total_anexos()
    return (tamanho_atual + tamanho_arquivo) <= limite_total_bytes

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
    import uuid
    import os
    
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
    import hashlib
    
    hash_sha256 = hashlib.sha256()
    try:
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_sha256.update(chunk)
        return hash_sha256.hexdigest()
    except Exception:
        return None
