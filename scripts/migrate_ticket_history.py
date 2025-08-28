#!/usr/bin/env python3
"""
Script de migração para garantir estrutura completa do histórico de chamados:
- Cria tabelas de histórico de comunicações e anexos (se faltarem)
- Adiciona colunas no Chamado para reabertura e transferências
Compatível com SQLite e MySQL.
"""
import os
import sys
from datetime import datetime

sys.path.append(os.path.dirname(os.path.abspath(__file__)) + '/..')

from app import app
from database import db
from sqlalchemy import inspect, text


def add_column_if_missing(engine, table, column_def_sql):
    """Adiciona coluna se estiver faltando. column_def_sql exemplo: 'reaberto BOOLEAN DEFAULT 0'"""
    insp = inspect(engine)
    cols = [c['name'] for c in insp.get_columns(table)]
    col_name = column_def_sql.split()[0]
    if col_name in cols:
        return False

    dialect = engine.name
    try:
        if dialect == 'sqlite':
            sql = f"ALTER TABLE {table} ADD COLUMN {column_def_sql}"
        else:
            sql = f"ALTER TABLE {table} ADD COLUMN {column_def_sql}"
        engine.execute(text(sql))
        print(f"✅ Coluna adicionada: {table}.{col_name}")
        return True
    except Exception as e:
        print(f"⚠️  Falha ao adicionar coluna {table}.{col_name}: {e}")
        return False


def ensure_tables():
    """Cria quaisquer tabelas ORM que não existirem (baseado nos models)."""
    db.create_all()
    print("✅ Tabelas ORM garantidas via create_all()")


def migrate_chamado_columns():
    engine = db.engine
    changed = False
    changed |= add_column_if_missing(engine, 'chamado', 'chamado_origem_id INTEGER')
    changed |= add_column_if_missing(engine, 'chamado', 'reaberto BOOLEAN DEFAULT 0')
    changed |= add_column_if_missing(engine, 'chamado', 'numero_reaberturas INTEGER DEFAULT 0')
    changed |= add_column_if_missing(engine, 'chamado', 'transferido BOOLEAN DEFAULT 0')
    changed |= add_column_if_missing(engine, 'chamado', 'numero_transferencias INTEGER DEFAULT 0')
    changed |= add_column_if_missing(engine, 'chamado', 'agente_atual_id INTEGER')
    changed |= add_column_if_missing(engine, 'chamado', 'data_ultima_transferencia DATETIME')
    changed |= add_column_if_missing(engine, 'chamado', 'metadados_extras TEXT')
    if changed:
        print("✅ Colunas do Chamado verificadas/atualizadas")
    else:
        print("ℹ️  Colunas do Chamado já estavam presentes")


def main():
    with app.app_context():
        ensure_tables()
        migrate_chamado_columns()
        print("🎉 Migração concluída")


if __name__ == '__main__':
    main()
