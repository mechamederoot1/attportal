import os
import sys
import hashlib
from datetime import datetime

from flask import Flask

# Importa a aplicação e modelos
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from app import app  # noqa: E402
from database import db, Chamado, ChamadoAnexo, User  # noqa: E402

UPLOAD_DIR = 'uploads/chamados'


def sha256_file(path: str) -> str | None:
    try:
        h = hashlib.sha256()
        with open(path, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                h.update(chunk)
        return h.hexdigest()
    except Exception:
        return None


def ensure_upload_dir():
    os.makedirs(UPLOAD_DIR, exist_ok=True)


def reindex_attachments():
    """
    Valida e corrige registros de anexos para garantir:
    - Caminho existente -> atualiza tamanho e hash
    - Caminho inexistente -> marca como inativo (ativo=False)
    - usuario_upload_id nulo -> atribui usuário admin se existir
    - data_upload nula -> preenche com agora (mantendo timezone naive)
    - tipo_mime/extensao vazios -> tenta inferir pela extensão
    Retorna um resumo com contagens e problemas corrigidos.
    """
    ensure_upload_dir()

    total = 0
    fixed_size = 0
    fixed_hash = 0
    marked_inactive = 0
    fixed_meta = 0
    fixed_user = 0
    fixed_date = 0

    # Usuário admin (fallback para registros sem usuário)
    admin_user = User.query.filter_by(usuario='admin').first()

    for anexo in ChamadoAnexo.query.all():
        total += 1

        # Se chamado foi removido, desativar anexo
        if anexo.chamado_id and not Chamado.query.get(anexo.chamado_id):
            if anexo.ativo:
                anexo.ativo = False
                marked_inactive += 1
            continue

        path = anexo.caminho_arquivo
        if not path or not os.path.isabs(path):
            # Normaliza para caminho absoluto relativo ao projeto
            path = os.path.join(UPLOAD_DIR, os.path.basename(anexo.nome_arquivo or ''))

        if not os.path.exists(path):
            if anexo.ativo:
                anexo.ativo = False
                marked_inactive += 1
        else:
            # Atualiza tamanho se divergente
            real_size = os.path.getsize(path)
            if anexo.tamanho_bytes != real_size:
                anexo.tamanho_bytes = real_size
                fixed_size += 1

            # Atualiza hash se ausente
            if not anexo.hash_arquivo:
                file_hash = sha256_file(path)
                if file_hash:
                    anexo.hash_arquivo = file_hash
                    fixed_hash += 1

            # Garante caminho salvo normalizado
            if anexo.caminho_arquivo != path:
                anexo.caminho_arquivo = path
                fixed_meta += 1

            # Preenche tipo_mime/extensao se ausente
            if not anexo.extensao and anexo.nome_original and '.' in anexo.nome_original:
                anexo.extensao = anexo.nome_original.rsplit('.', 1)[1].lower()
                fixed_meta += 1

        # Usuário do upload
        if not anexo.usuario_upload_id and admin_user:
            anexo.usuario_upload_id = admin_user.id
            fixed_user += 1

        # Data do upload
        if not anexo.data_upload:
            anexo.data_upload = datetime.now()
            fixed_date += 1

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return {
            'status': 'error',
            'message': f'Erro ao salvar alterações: {str(e)}'
        }

    # Estatísticas por chamado (para conferência)
    por_chamado = {}
    for anexo in ChamadoAnexo.query.filter_by(ativo=True).all():
        por_chamado.setdefault(anexo.chamado_id, 0)
        por_chamado[anexo.chamado_id] += 1

    return {
        'status': 'success',
        'total_anexos_avaliados': total,
        'corrigidos_tamanho': fixed_size,
        'corrigidos_hash': fixed_hash,
        'marcados_inativos': marked_inactive,
        'corrigidos_metadados': fixed_meta,
        'corrigidos_usuario_upload': fixed_user,
        'corrigidos_data_upload': fixed_date,
        'chamados_com_anexos': len(por_chamado),
        'amostra_contagem_por_chamado': dict(list(por_chamado.items())[:10])
    }


if __name__ == '__main__':
    with app.app_context():
        result = reindex_attachments()
        print(result)
