#!/usr/bin/env python3
"""
Migração específica para anexos de tickets - Execute via Flask app context
"""

from database import db
from sqlalchemy import text
import json

def executar_migracao_ticket_anexos():
    """Executa a migração para criar tabela de anexos de tickets"""
    print("🔄 Iniciando migração da tabela ticket_anexos...")
    
    try:
        # SQL para criar a tabela ticket_anexos
        create_table_sql = """
        CREATE TABLE IF NOT EXISTS ticket_anexos (
            id INTEGER PRIMARY KEY AUTO_INCREMENT,
            chamado_id INTEGER NOT NULL,
            nome_original VARCHAR(255) NOT NULL,
            nome_arquivo VARCHAR(255) NOT NULL,
            caminho_arquivo VARCHAR(500) NOT NULL,
            tamanho_bytes BIGINT NOT NULL,
            tipo_mime VARCHAR(100) NOT NULL,
            extensao VARCHAR(10) NOT NULL,
            hash_arquivo VARCHAR(64),
            data_upload DATETIME NOT NULL,
            usuario_upload_id INTEGER NOT NULL,
            descricao TEXT,
            ativo BOOLEAN DEFAULT TRUE,
            origem VARCHAR(50) DEFAULT 'painel',
            
            FOREIGN KEY (chamado_id) REFERENCES chamado(id),
            FOREIGN KEY (usuario_upload_id) REFERENCES user(id),
            
            INDEX idx_chamado_ticket_anexos (chamado_id),
            INDEX idx_usuario_ticket_anexos (usuario_upload_id),
            INDEX idx_data_upload_ticket_anexos (data_upload),
            INDEX idx_origem_ticket_anexos (origem)
        );
        """
        
        # Executar SQL
        db.engine.execute(text(create_table_sql))
        
        print("✅ Tabela 'ticket_anexos' criada com sucesso!")
        
        # Adicionar configurações padrão para anexos
        from database import Configuracao
        
        config_anexos = {
            'ticket_anexos': {
                'ativo': True,
                'max_file_size_mb': 10,
                'max_total_size_mb': 50,
                'allowed_extensions': ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx', 'txt'],
                'auto_compress_images': True,
                'require_description': False,
                'notify_on_upload': True
            }
        }
        
        # Verificar se configuração já existe
        config_existente = Configuracao.query.filter_by(chave='ticket_anexos').first()
        if not config_existente:
            config = Configuracao(
                chave='ticket_anexos',
                valor=json.dumps(config_anexos['ticket_anexos'])
            )
            db.session.add(config)
            db.session.commit()
            print("✅ Configurações de anexos adicionadas")
        else:
            print("ℹ️ Configurações de anexos já existem")
        
        print("\n🎉 Migração concluída com sucesso!")
        print("A tabela ticket_anexos está pronta para uso.")
        
        return True
        
    except Exception as e:
        print(f"❌ Erro durante a migração: {str(e)}")
        db.session.rollback()
        return False

if __name__ == "__main__":
    print("⚠️ Execute este script através do contexto da aplicação Flask")
    print("Exemplo: python3 -c \"from app import app; from migrate_ticket_attachments import executar_migracao_ticket_anexos; app.app_context().push(); executar_migracao_ticket_anexos()\"")
