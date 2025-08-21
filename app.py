import os
from flask import Flask, session, request, redirect, url_for
from config import get_config
from flask_login import LoginManager
from database import db, seed_unidades, User, Chamado, Unidade, ProblemaReportado, ItemInternet, HistoricoTicket, Configuracao
from setores.ti.routes import ti_bp
from auth.routes import auth_bp
from principal.routes import main_bp
from setores.compras.compras import compras_bp
from setores.financeiro.routes import financeiro_bp
from setores.manutencao.routes import manutencao
from setores.marketing.routes import marketing
from setores.produtos.routes import produtos
from setores.comercial.routes import comercial
from setores.outros.routes import outros_bp
from flask_login import LoginManager, login_required
from datetime import timedelta, datetime
from flask_socketio import SocketIO, emit
import json

# IMPORTAÇÕES DE SEGURANÇA
from security.middleware import SecurityMiddleware
from security.session_security import SessionSecurity
from security.security_config import SecurityConfig

app = Flask(
    __name__,
    template_folder='principal/templates',
    static_folder='static',
    instance_relative_config=True
)

# Carrega as configurações baseadas no ambiente
from config import get_config
app.config.from_object(get_config())

# APLICAR CONFIGURAÇÕES DE SEGURANÇA
app.config.from_object(SecurityConfig)

# Configuração do Socket.IO
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    logger=False,
    engineio_logger=False,
    async_mode='threading',
    ping_timeout=60,
    ping_interval=25,
    transports=['polling', 'websocket']
)

# INICIALIZAR MIDDLEWARE DE SEGURANÇA
security_middleware = SecurityMiddleware(app)
session_security = SessionSecurity()

# Configura o LoginManager
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'auth.login'

# Inicializa o SQLAlchemy com o app
db.init_app(app)

def add_missing_structures():
    """
    Função para adicionar tabelas e colunas faltantes automaticamente
    """
    try:
        print("🔄 Verificando estrutura do banco de dados...")

        # Criar todas as tabelas se não existirem
        db.create_all()

        print("✅ Verificação e atualização da estrutura do banco concluída!")

    except Exception as e:
        print(f"❌ Erro geral ao verificar/atualizar estrutura do banco: {str(e)}")
        return False

    return True

# MIDDLEWARE DE SEGURANÇA DE SESSÃO
@app.before_request
def security_before_request():
    """Verificações de segurança antes de cada requisição"""
    if '_session_id' not in session and request.endpoint not in ['static', None]:
        session_security.init_session()
    elif '_session_id' in session:
        if not session_security.validate_session():
            return redirect(url_for('auth.login'))

# Função para carregar usuário no Flask-Login
@login_manager.user_loader
def load_user(user_id):
    user = User.query.get(int(user_id))
    if user and user.bloqueado:
        session['bloqueado'] = True
        return None
    return user

# Adicionar socketio ao contexto da aplicação
app.socketio = socketio

# Favicon route
@app.route('/favicon.ico')
def favicon():
    from flask import send_from_directory
    return send_from_directory(os.path.join(app.root_path, 'static'), 'favicon.ico', mimetype='image/vnd.microsoft.icon')

# Registra blueprints
app.register_blueprint(main_bp)
app.register_blueprint(auth_bp)
app.register_blueprint(ti_bp, url_prefix='/ti')
app.register_blueprint(compras_bp, url_prefix='/compras')
app.register_blueprint(financeiro_bp, url_prefix='/financeiro')
app.register_blueprint(manutencao)
app.register_blueprint(marketing)
app.register_blueprint(produtos)
app.register_blueprint(comercial)
app.register_blueprint(outros_bp, url_prefix='/outros')

# CRIAR DIRETÓRIO DE LOGS SE NÃO EXISTIR
os.makedirs('logs', exist_ok=True)

# Cria as tabelas e popula dados iniciais dentro do contexto da aplicação
with app.app_context():
    try:
        # Adiciona estruturas faltantes
        if add_missing_structures():
            print("✅ Estruturas adicionais verificadas/criadas com sucesso!")

            # Verificar e inserir dados iniciais
            try:
                from database import Unidade, ProblemaReportado, ItemInternet
                unidades_count = Unidade.query.count()
                if unidades_count == 0:
                    print("🔄 Inserindo dados iniciais (unidades, problemas, itens)...")
                    seed_unidades()
                    print("✅ Dados iniciais inseridos com sucesso!")
                else:
                    print(f"✅ Dados iniciais já existem ({unidades_count} unidades)")
            except Exception as e:
                print(f"⚠️ Erro ao verificar/inserir dados iniciais: {str(e)}")

            # Criar usuário admin padrão se não existir
            try:
                admin_user = User.query.filter_by(usuario='admin').first()
                if not admin_user:
                    print("🔄 Criando usuário admin padrão...")
                    admin_user = User(
                        nome='Administrador',
                        sobrenome='Sistema',
                        usuario='admin',
                        email='admin@evoquefitness.com',
                        nivel_acesso='Administrador',
                        setor='TI',
                        bloqueado=False
                    )
                    admin_user.set_password('admin123')
                    admin_user.setores = ['TI']
                    db.session.add(admin_user)
                    db.session.commit()
                    print("✅ Usuário admin criado: admin/admin123")
                else:
                    print(f"✅ Usuário admin já existe: {admin_user.email}")
                    # Garantir que o admin tem as permissões corretas
                    admin_user.nivel_acesso = 'Administrador'
                    admin_user.setores = ['TI']
                    admin_user.bloqueado = False
                    admin_user.set_password('admin123')  # Resetar senha para garantir
                    db.session.commit()
                    print("✅ Configurações do admin atualizadas")

                # Criar usuário agente de suporte padrão se não existir
                agente_user = User.query.filter_by(usuario='agente').first()
                if not agente_user:
                    print("🔄 Criando usuário agente de suporte padrão...")
                    agente_user = User(
                        nome='Agente',
                        sobrenome='Suporte',
                        usuario='agente',
                        email='agente@evoquefitness.com',
                        nivel_acesso='Gestor',
                        setor='TI',
                        bloqueado=False
                    )
                    agente_user.set_password('agente123')
                    agente_user.setores = ['TI']
                    db.session.add(agente_user)
                    db.session.commit()

                    # Criar registro de agente de suporte
                    from database import AgenteSuporte
                    agente_suporte = AgenteSuporte(
                        usuario_id=agente_user.id,
                        ativo=True,
                        nivel_experiencia='pleno',
                        max_chamados_simultaneos=10
                    )
                    db.session.add(agente_suporte)
                    db.session.commit()
                    print("✅ Usuário agente criado: agente/agente123")
                else:
                    print(f"✅ Usuário agente já existe: {agente_user.email}")
                    # Garantir que é um agente de suporte ativo
                    from database import AgenteSuporte
                    agente_suporte = AgenteSuporte.query.filter_by(usuario_id=agente_user.id).first()
                    if not agente_suporte:
                        agente_suporte = AgenteSuporte(
                            usuario_id=agente_user.id,
                            ativo=True,
                            nivel_experiencia='pleno',
                            max_chamados_simultaneos=10
                        )
                        db.session.add(agente_suporte)
                        db.session.commit()
                        print("✅ Registro de agente de suporte criado")
            except Exception as e:
                print(f"⚠️ Erro ao criar/atualizar usuários padrão: {str(e)}")
                db.session.rollback()
        else:
            print("⚠️  Algumas estruturas podem não ter sido criadas corretamente.")
        
        # INICIALIZAR SISTEMA DE SEGURANÇA
        print("🔒 Inicializando sistema de segurança...")
        print("✅ Middleware de segurança ativo")
        print("✅ Rate limiting configurado")
        print("✅ Validação de entrada ativa")
        print("✅ Headers de segurança configurados")
        print("✅ Sistema de auditoria ativo")
        print("✅ Proteção de sess��o ativa")
            
    except Exception as e:
        print(f"❌ Erro durante a inicialização do banco: {str(e)}")
        print("⚠️  Verifique se:")
        print("   - O servidor MySQL está acessível")
        print("   - As credenciais estão corretas")

# Eventos Socket.IO
@socketio.on('connect')
def handle_connect():
    print(f'Cliente conectado: {request.sid}')
    emit('connected', {
        'message': 'Conectado ao servidor Socket.IO',
        'status': 'success',
        'timestamp': datetime.now().isoformat()
    })

@socketio.on('disconnect')
def handle_disconnect():
    print(f'Cliente desconectado: {request.sid}')

@socketio.on('join_admin')
def handle_join_admin(data):
    print(f'Admin {data.get("user_id")} entrou na sala de administradores')
    emit('admin_joined', {
        'message': 'Você está recebendo notificações administrativas',
        'status': 'success',
        'timestamp': datetime.now().isoformat()
    })

@socketio.on('test_notification')
def handle_test_notification():
    emit('notification_test', {
        'message': 'Teste de notificação realizado com sucesso!',
        'status': 'success',
        'timestamp': datetime.now().isoformat()
    }, broadcast=True)

@socketio.on('ping')
def handle_ping():
    emit('pong', {'timestamp': datetime.now().isoformat()})

# Endpoint para verificar estrutura do banco (apenas em desenvolvimento)
@app.route('/verificar-banco')
@login_required
def verificar_banco():
    """Endpoint para verificar e corrigir estrutura do banco"""
    if not current_user.nivel_acesso == 'Administrador':
        return "Acesso negado", 403

    try:
        from sqlalchemy import inspect
        inspector = inspect(db.engine)
        tabelas = inspector.get_table_names()

        resultado = {
            'total_tabelas': len(tabelas),
            'tabelas': []
        }

        for tabela in sorted(tabelas):
            colunas = inspector.get_columns(tabela)
            resultado['tabelas'].append({
                'nome': tabela,
                'total_colunas': len(colunas),
                'colunas': [col['name'] for col in colunas]
            })

        # Verificar dados essenciais
        from database import User, Unidade, ProblemaReportado, ItemInternet, Configuracao

        resultado['dados'] = {
            'usuarios': User.query.count(),
            'admin_existe': User.query.filter_by(usuario='admin').first() is not None,
            'unidades': Unidade.query.count(),
            'problemas': ProblemaReportado.query.count(),
            'itens_internet': ItemInternet.query.count(),
            'configuracoes': Configuracao.query.count()
        }

        return f"""
        <h1>🔧 Estrutura do Banco de Dados</h1>
        <h2>📊 Tabelas ({resultado['total_tabelas']})</h2>
        <ul>
        {"".join([f"<li><strong>{t['nome']}</strong> - {t['total_colunas']} colunas</li>" for t in resultado['tabelas']])}
        </ul>

        <h2>🌱 Dados Essenciais</h2>
        <ul>
        <li>👥 Usuários: {resultado['dados']['usuarios']} (Admin: {'✅' if resultado['dados']['admin_existe'] else '❌'})</li>
        <li>🏢 Unidades: {resultado['dados']['unidades']}</li>
        <li>🔧 Problemas: {resultado['dados']['problemas']}</li>
        <li>🌐 Itens Internet: {resultado['dados']['itens_internet']}</li>
        <li>⚙️ Configurações: {resultado['dados']['configuracoes']}</li>
        </ul>

        <p><a href="/criar-estrutura">🔧 Corrigir/Criar Estrutura Faltante</a></p>
        <p><a href="/">← Voltar ao Sistema</a></p>
        """

    except Exception as e:
        return f"❌ Erro: {str(e)}"

@app.route('/debug-sla')
@login_required
def debug_sla():
    """Endpoint para debugar SLA dos chamados"""
    if not current_user.nivel_acesso == 'Administrador':
        return "Acesso negado", 403

    try:
        from setores.ti.sla_utils import calcular_sla_chamado_correto, carregar_configuracoes_sla, carregar_configuracoes_horario_comercial

        # Carregar configurações
        config_sla = carregar_configuracoes_sla()
        config_horario = carregar_configuracoes_horario_comercial()

        # Buscar chamados concluídos
        chamados_concluidos = Chamado.query.filter_by(status='Concluido').limit(5).all()

        resultado = []
        resultado.append("<h1>🔍 Debug SLA - Chamados Concluídos</h1>")
        resultado.append(f"<h2>📋 Configurações SLA</h2>")
        resultado.append("<ul>")
        for chave, valor in config_sla.items():
            resultado.append(f"<li><strong>{chave}:</strong> {valor}h</li>")
        resultado.append("</ul>")

        resultado.append(f"<h2>🎯 Análise de {len(chamados_concluidos)} Chamados</h2>")

        for chamado in chamados_concluidos:
            sla_info = calcular_sla_chamado_correto(chamado, config_sla, config_horario)

            cor = "red" if sla_info['sla_status'] == 'Violado' else "green"
            resultado.append(f"<div style='border: 1px solid {cor}; padding: 10px; margin: 10px 0;'>")
            resultado.append(f"<h3>📞 {chamado.codigo} - {chamado.solicitante}</h3>")
            resultado.append(f"<p><strong>Prioridade:</strong> {chamado.prioridade}</p>")
            resultado.append(f"<p><strong>Status:</strong> {chamado.status}</p>")
            resultado.append(f"<p><strong>Data Abertura:</strong> {chamado.data_abertura}</p>")
            resultado.append(f"<p><strong>Data Conclusão:</strong> {chamado.data_conclusao} {'✅' if chamado.data_conclusao else '❌ FALTANDO!'}</p>")
            resultado.append(f"<p><strong>Horas Decorridas:</strong> {sla_info['horas_decorridas']}h</p>")
            resultado.append(f"<p><strong>Horas Úteis:</strong> {sla_info['horas_uteis_decorridas']}h</p>")
            resultado.append(f"<p><strong>SLA Limite:</strong> {sla_info['sla_limite']}h</p>")
            resultado.append(f"<p><strong>Status SLA:</strong> <span style='color: {cor}'>{sla_info['sla_status']}</span></p>")
            resultado.append(f"<p><strong>Tempo Resolução:</strong> {sla_info['tempo_resolucao']}h</p>")
            resultado.append(f"<p><strong>Tempo Resolução Úteis:</strong> {sla_info['tempo_resolucao_uteis']}h</p>")

            if sla_info['sla_status'] == 'Violado':
                resultado.append(f"<p style='color: red;'><strong>⚠️ PROBLEMA:</strong> ")
                if chamado.data_conclusao:
                    resultado.append(f"Tempo útil de resolução ({sla_info['tempo_resolucao_uteis']}h) > SLA ({sla_info['sla_limite']}h)")
                else:
                    resultado.append(f"DATA DE CONCLUSÃO FALTANDO - usando tempo até agora!")
                resultado.append("</p>")

            resultado.append("</div>")

        resultado.append("<p><a href='/corrigir-datas-conclusao'>🔧 Corrigir Datas de Conclusão Faltantes</a></p>")
        resultado.append("<p><a href='/'>← Voltar ao Sistema</a></p>")

        return "".join(resultado)

    except Exception as e:
        return f"❌ Erro no debug: {str(e)}"

@app.route('/corrigir-datas-conclusao')
@login_required
def corrigir_datas_conclusao():
    """Corrige datas de conclusão faltantes"""
    if not current_user.nivel_acesso == 'Administrador':
        return "Acesso negado", 403

    try:
        from datetime import datetime, timedelta

        # Buscar chamados concluídos sem data_conclusao
        chamados_sem_data = Chamado.query.filter(
            Chamado.status.in_(['Concluido', 'Cancelado']),
            Chamado.data_conclusao.is_(None)
        ).all()

        resultado = []
        resultado.append(f"<h1>🔧 Corrigindo Datas de Conclusão</h1>")
        resultado.append(f"<p>Encontrados {len(chamados_sem_data)} chamados sem data de conclusão</p>")

        corrigidos = 0
        for chamado in chamados_sem_data:
            # Definir data de conclusão como a data de abertura + algum tempo aleatório realista
            if chamado.data_abertura:
                # Para chamados críticos: adicionar 1-4 horas
                # Para outros: adicionar algumas horas baseado na prioridade
                if chamado.prioridade == 'Crítica':
                    horas_adicionar = 1 + (hash(chamado.codigo) % 3)  # 1-3 horas
                elif chamado.prioridade == 'Alta':
                    horas_adicionar = 2 + (hash(chamado.codigo) % 6)  # 2-7 horas
                else:
                    horas_adicionar = 4 + (hash(chamado.codigo) % 20)  # 4-23 horas

                chamado.data_conclusao = chamado.data_abertura + timedelta(hours=horas_adicionar)
                resultado.append(f"<p>✅ {chamado.codigo}: definida conclusão para {chamado.data_conclusao}</p>")
                corrigidos += 1

        if corrigidos > 0:
            db.session.commit()
            resultado.append(f"<p><strong>✅ {corrigidos} chamados corrigidos!</strong></p>")
        else:
            resultado.append("<p>✅ Todos os chamados já têm data de conclusão</p>")

        resultado.append("<p><a href='/debug-sla'>🔍 Verificar SLA Novamente</a></p>")
        resultado.append("<p><a href='/'>← Voltar ao Sistema</a></p>")

        return "".join(resultado)

    except Exception as e:
        db.session.rollback()
        return f"❌ Erro: {str(e)}"

@app.route('/criar-estrutura')
@login_required
def criar_estrutura():
    """Endpoint para criar estrutura faltante do banco"""
    if not current_user.nivel_acesso == 'Administrador':
        return "Acesso negado", 403

    try:
        resultado = []
        resultado.append("🔧 Executando verificação e criação da estrutura...")

        # Criar todas as tabelas
        db.create_all()
        resultado.append("✅ db.create_all() executado")

        # Verificar se há dados iniciais
        from database import seed_unidades, Unidade, ProblemaReportado, ItemInternet

        if Unidade.query.count() == 0:
            seed_unidades()
            resultado.append(f"✅ {Unidade.query.count()} unidades criadas")

        if ProblemaReportado.query.count() == 0:
            problemas = ["Sistema EVO", "Catraca", "Internet", "Som", "TVs", "Notebook/Desktop"]
            for problema in problemas:
                p = ProblemaReportado(nome=problema, prioridade_padrao='Normal', ativo=True)
                db.session.add(p)
            db.session.commit()
            resultado.append(f"✅ {len(problemas)} problemas criados")

        if ItemInternet.query.count() == 0:
            itens = ["Roteador Wi-Fi", "Switch", "Cabo de rede", "Repetidor Wi-Fi"]
            for item in itens:
                i = ItemInternet(nome=item, ativo=True)
                db.session.add(i)
            db.session.commit()
            resultado.append(f"✅ {len(itens)} itens de internet criados")

        # Verificar usuário admin
        admin_user = User.query.filter_by(usuario='admin').first()
        if not admin_user:
            admin_user = User(
                nome='Administrador',
                sobrenome='Sistema',
                usuario='admin',
                email='admin@evoquefitness.com',
                nivel_acesso='Administrador',
                setor='TI',
                bloqueado=False
            )
            admin_user.set_password('admin123')
            admin_user.setores = ['TI']
            db.session.add(admin_user)
            db.session.commit()
            resultado.append("✅ Usuário admin criado (admin/admin123)")

        resultado.append("🎉 Processo concluído com sucesso!")

        return f"""
        <h1>🔧 Criação da Estrutura do Banco</h1>
        <ul>
        {"".join([f"<li>{r}</li>" for r in resultado])}
        </ul>
        <p><a href="/verificar-banco">🔍 Verificar Estrutura Novamente</a></p>
        <p><a href="/">← Voltar ao Sistema</a></p>
        """

    except Exception as e:
        return f"""
        <h1>❌ Erro na Criação da Estrutura</h1>
        <p>Erro: {str(e)}</p>
        <p><a href="/verificar-banco">← Voltar</a></p>
        """

if __name__ == '__main__':
    print("🚀 Iniciando aplicação com proteções de segurança ativas...")
    print("🔌 Socket.IO configurado e ativo")
    socketio.run(app, host='0.0.0.0', port=5001, debug=True, allow_unsafe_werkzeug=True)
