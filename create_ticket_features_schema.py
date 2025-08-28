#!/usr/bin/env python3
"""
Migração do banco de dados para adicionar funcionalidades de reabertura de chamados, histórico de transferências e anexos de tickets.

Este script adiciona as seguintes tabelas e colunas:
1. ChamadoReabertura - Para controlar reaberturas de chamados
2. TransferenciaHistorico - Para histórico detalhado de transferências
3. TicketAnexos - Para anexos enviados via painel
4. Novas colunas para suporte às funcionalidades

Execute este script após backup do banco de dados.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import db, get_brazil_time
from sqlalchemy import text
import json

def criar_tabela_chamado_reabertura():
    """Cria tabela para controle de reaberturas de chamados"""
    try:
        create_table_sql = """
        CREATE TABLE IF NOT EXISTS chamado_reabertura (
            id INTEGER PRIMARY KEY AUTO_INCREMENT,
            chamado_original_id INTEGER NOT NULL,
            chamado_reaberto_id INTEGER NOT NULL,
            usuario_id INTEGER NOT NULL,
            motivo TEXT,
            data_reabertura DATETIME NOT NULL,
            dias_entre_chamados INTEGER,
            problema_similar VARCHAR(255),
            observacoes TEXT,
            status VARCHAR(20) DEFAULT 'ativo',
            
            FOREIGN KEY (chamado_original_id) REFERENCES chamado(id),
            FOREIGN KEY (chamado_reaberto_id) REFERENCES chamado(id),
            FOREIGN KEY (usuario_id) REFERENCES user(id),
            
            INDEX idx_chamado_original (chamado_original_id),
            INDEX idx_chamado_reaberto (chamado_reaberto_id),
            INDEX idx_usuario (usuario_id),
            INDEX idx_data_reabertura (data_reabertura)
        );
        """
        
        with db.engine.connect() as conn:
            conn.execute(text(create_table_sql))
            conn.commit()
        print("✅ Tabela 'chamado_reabertura' criada com sucesso")
        return True

    except Exception as e:
        print(f"❌ Erro ao criar tabela 'chamado_reabertura': {str(e)}")
        return False

def criar_tabela_ticket_anexos():
    """Cria tabela para anexos de tickets enviados pelo painel"""
    try:
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
        
        with db.engine.connect() as conn:
            conn.execute(text(create_table_sql))
            conn.commit()
        print("✅ Tabela 'ticket_anexos' criada com sucesso")
        return True

    except Exception as e:
        print(f"❌ Erro ao criar tabela 'ticket_anexos': {str(e)}")
        return False

def criar_tabela_transferencia_historico():
    """Cria tabela para histórico detalhado de transferências"""
    try:
        create_table_sql = """
        CREATE TABLE IF NOT EXISTS transferencia_historico (
            id INTEGER PRIMARY KEY AUTO_INCREMENT,
            chamado_id INTEGER NOT NULL,
            transferido_de_id INTEGER,
            transferido_para_id INTEGER,
            usuario_transferencia_id INTEGER NOT NULL,
            data_transferencia DATETIME NOT NULL,
            motivo_transferencia TEXT,
            observacoes TEXT,
            status_anterior VARCHAR(50),
            status_novo VARCHAR(50),
            prioridade_anterior VARCHAR(20),
            prioridade_nova VARCHAR(20),
            agente_anterior_id INTEGER,
            agente_novo_id INTEGER,
            tipo_transferencia VARCHAR(50) DEFAULT 'manual',
            notificacoes_enviadas BOOLEAN DEFAULT FALSE,
            metadados JSON,
            
            FOREIGN KEY (chamado_id) REFERENCES chamado(id),
            FOREIGN KEY (transferido_de_id) REFERENCES user(id),
            FOREIGN KEY (transferido_para_id) REFERENCES user(id),
            FOREIGN KEY (usuario_transferencia_id) REFERENCES user(id),
            FOREIGN KEY (agente_anterior_id) REFERENCES agentes_suporte(id),
            FOREIGN KEY (agente_novo_id) REFERENCES agentes_suporte(id),
            
            INDEX idx_chamado (chamado_id),
            INDEX idx_transferido_de (transferido_de_id),
            INDEX idx_transferido_para (transferido_para_id),
            INDEX idx_data_transferencia (data_transferencia),
            INDEX idx_tipo_transferencia (tipo_transferencia)
        );
        """
        
        db.engine.execute(text(create_table_sql))
        print("✅ Tabela 'transferencia_historico' criada com sucesso")
        return True
        
    except Exception as e:
        print(f"❌ Erro ao criar tabela 'transferencia_historico': {str(e)}")
        return False

def adicionar_colunas_chamado():
    """Adiciona novas colunas à tabela chamado para suporte às novas funcionalidades"""
    try:
        # Verificar quais colunas já existem
        result = db.engine.execute(text("DESCRIBE chamado"))
        existing_columns = [row[0] for row in result]
        
        colunas_adicionar = {
            'chamado_origem_id': 'INTEGER DEFAULT NULL COMMENT "ID do chamado original em caso de reabertura"',
            'reaberto': 'BOOLEAN DEFAULT FALSE COMMENT "Indica se este chamado é uma reabertura"',
            'numero_reaberturas': 'INTEGER DEFAULT 0 COMMENT "Número de vezes que foi reaberto"',
            'transferido': 'BOOLEAN DEFAULT FALSE COMMENT "Indica se o chamado foi transferido"',
            'numero_transferencias': 'INTEGER DEFAULT 0 COMMENT "Número de transferências"',
            'agente_atual_id': 'INTEGER DEFAULT NULL COMMENT "ID do agente atualmente responsável"',
            'data_ultima_transferencia': 'DATETIME DEFAULT NULL COMMENT "Data da última transferência"',
            'metadados_extras': 'JSON DEFAULT NULL COMMENT "Metadados extras em formato JSON"'
        }
        
        for coluna, definicao in colunas_adicionar.items():
            if coluna not in existing_columns:
                try:
                    sql = f"ALTER TABLE chamado ADD COLUMN {coluna} {definicao}"
                    db.engine.execute(text(sql))
                    print(f"✅ Coluna '{coluna}' adicionada à tabela chamado")
                except Exception as e:
                    print(f"⚠️ Erro ao adicionar coluna '{coluna}': {str(e)}")
        
        # Adicionar chaves estrangeiras
        try:
            # FK para chamado_origem_id
            if 'chamado_origem_id' not in [fk for fk in existing_columns]:
                db.engine.execute(text("""
                    ALTER TABLE chamado 
                    ADD CONSTRAINT fk_chamado_origem 
                    FOREIGN KEY (chamado_origem_id) REFERENCES chamado(id)
                """))
                print("✅ Chave estrangeira para chamado_origem_id adicionada")
        except Exception as e:
            print(f"⚠️ Erro ao adicionar FK chamado_origem_id: {str(e)}")
            
        try:
            # FK para agente_atual_id
            db.engine.execute(text("""
                ALTER TABLE chamado 
                ADD CONSTRAINT fk_agente_atual 
                FOREIGN KEY (agente_atual_id) REFERENCES agentes_suporte(id)
            """))
            print("✅ Chave estrangeira para agente_atual_id adicionada")
        except Exception as e:
            print(f"⚠️ Erro ao adicionar FK agente_atual_id: {str(e)}")
        
        return True
        
    except Exception as e:
        print(f"❌ Erro ao adicionar colunas à tabela chamado: {str(e)}")
        return False

def criar_indexes_performance():
    """Cria índices para melhorar performance das consultas"""
    try:
        indexes = [
            "CREATE INDEX IF NOT EXISTS idx_chamado_reaberto ON chamado(reaberto)",
            "CREATE INDEX IF NOT EXISTS idx_chamado_transferido ON chamado(transferido)",
            "CREATE INDEX IF NOT EXISTS idx_chamado_agente_atual ON chamado(agente_atual_id)",
            "CREATE INDEX IF NOT EXISTS idx_chamado_origem ON chamado(chamado_origem_id)",
            "CREATE INDEX IF NOT EXISTS idx_chamado_status_prioridade ON chamado(status, prioridade)",
            "CREATE INDEX IF NOT EXISTS idx_chamado_data_problema ON chamado(data_abertura, problema)",
        ]
        
        for index_sql in indexes:
            try:
                db.engine.execute(text(index_sql))
                print(f"✅ Índice criado: {index_sql.split('idx_')[1].split(' ON')[0]}")
            except Exception as e:
                print(f"⚠️ Erro ao criar índice: {str(e)}")
        
        return True
        
    except Exception as e:
        print(f"❌ Erro ao criar índices: {str(e)}")
        return False

def adicionar_configuracoes_anexos():
    """Adiciona configurações para anexos de tickets"""
    try:
        from database import Configuracao
        
        configuracoes_anexos = {
            'ticket_anexos': {
                'ativo': True,
                'max_file_size_mb': 10,
                'max_total_size_mb': 50,
                'allowed_extensions': ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx', 'txt'],
                'auto_compress_images': True,
                'require_description': False,
                'notify_on_upload': True
            },
            'painel_tickets': {
                'allow_attachments': True,
                'max_attachments_per_ticket': 5,
                'attachment_preview': True,
                'auto_save_draft': True,
                'require_subject': True
            }
        }
        
        for chave, valor in configuracoes_anexos.items():
            config_existente = Configuracao.query.filter_by(chave=chave).first()
            if not config_existente:
                config = Configuracao(
                    chave=chave,
                    valor=json.dumps(valor)
                )
                db.session.add(config)
                print(f"✅ Configuração de anexos '{chave}' adicionada")
        
        db.session.commit()
        return True
        
    except Exception as e:
        print(f"❌ Erro ao inserir configurações de anexos: {str(e)}")
        db.session.rollback()
        return False

def inserir_configuracoes_padrao():
    """Insere configurações padrão para as novas funcionalidades"""
    try:
        from database import Configuracao
        
        configuracoes_novas = {
            'reabertura_chamados': {
                'ativo': True,
                'dias_limite': 7,
                'mesmo_problema_apenas': True,
                'mesmo_usuario_apenas': True,
                'notificar_agente': True,
                'notificar_usuario': False,
                'manter_prioridade_original': False,
                'max_reaberturas': 3
            },
            'transferencia_chamados': {
                'ativo': True,
                'requer_motivo': True,
                'notificar_agente_origem': True,
                'notificar_agente_destino': True,
                'notificar_usuario': False,
                'manter_historico': True,
                'transferencia_automatica': False,
                'balanceamento_carga': True
            },
            'notificacoes_historico': {
                'reabertura_email': True,
                'transferencia_email': True,
                'reabertura_popup': True,
                'transferencia_popup': True,
                'consolidar_notificacoes': True,
                'intervalo_consolidacao_min': 5
            }
        }
        
        for chave, valor in configuracoes_novas.items():
            config_existente = Configuracao.query.filter_by(chave=chave).first()
            if not config_existente:
                config = Configuracao(
                    chave=chave,
                    valor=json.dumps(valor)
                )
                db.session.add(config)
                print(f"✅ Configuração '{chave}' adicionada")
        
        db.session.commit()
        return True
        
    except Exception as e:
        print(f"❌ Erro ao inserir configurações padrão: {str(e)}")
        db.session.rollback()
        return False

def executar_migracao():
    """Executa toda a migração"""
    print("🔄 Iniciando migração do banco de dados...")
    print("=" * 60)
    
    sucesso = True
    
    # 1. Criar tabelas
    if not criar_tabela_chamado_reabertura():
        sucesso = False
        
    if not criar_tabela_transferencia_historico():
        sucesso = False
        
    if not criar_tabela_ticket_anexos():
        sucesso = False
    
    # 2. Adicionar colunas
    if not adicionar_colunas_chamado():
        sucesso = False
    
    # 3. Criar índices
    if not criar_indexes_performance():
        sucesso = False
    
    # 4. Inserir configurações
    if not inserir_configuracoes_padrao():
        sucesso = False
        
    if not adicionar_configuracoes_anexos():
        sucesso = False
    
    print("=" * 60)
    if sucesso:
        print("✅ Migração concluída com sucesso!")
        print("\nNovas funcionalidades disponíveis:")
        print("  - Reabertura automática de chamados")
        print("  - Histórico detalhado de transferências")
        print("  - Métricas aprimoradas")
        print("  - Notificações de transferências")
        print("  - Envio de anexos através do painel")
        print("  - Gerenciamento de tickets com anexos")
    else:
        print("❌ Migração concluída com alguns erros.")
        print("Verifique os logs acima para detalhes.")
    
    return sucesso

if __name__ == "__main__":
    # Executar dentro do contexto da aplicação Flask
    from app import app
    
    with app.app_context():
        executar_migracao()
