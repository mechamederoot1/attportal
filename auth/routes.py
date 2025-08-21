from flask import render_template, redirect, url_for, flash, request, jsonify, current_app
from flask_login import login_user, logout_user, current_user, login_required
from database import db, User, Chamado, Unidade, AgenteSuporte
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
import secrets
import string
from datetime import datetime
from . import auth_bp

def get_user_redirect_url(user):
    """
    Determina para onde redirecionar o usuário após o login baseado no seu perfil
    """
    # 1. Administradores vão para o painel administrativo
    if user.nivel_acesso == 'Administrador':
        return url_for('ti.painel')

    # 2. Verificar se é agente de suporte ativo
    agente = AgenteSuporte.query.filter_by(usuario_id=user.id, ativo=True).first()
    if agente:
        return url_for('ti.painel_agente')

    # 3. Usuários do setor de TI vão para a página do TI
    if 'TI' in user.setores:
        return url_for('ti.index')

    # 4. Outros usuários vão para a página inicial
    return url_for('main.index')

def nivel_acesso_requerido(nivel_minimo):
    """
    Decorador para verificar nível de acesso do usuário.
    Níveis: Gestor (1) < Gerente (2) < Gerente Regional (3) < Administrador (4)
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not current_user.is_authenticated:
                flash('Faça login para acessar esta página.', 'warning')
                return redirect(url_for('auth.login', next=request.url))
            
            niveis = {
                'Gestor': 1,
                'Gerente': 2,
                'Gerente Regional': 3,
                'Administrador': 4
            }
            
            nivel_usuario = niveis.get(current_user.nivel_acesso, 0)
            nivel_necessario = niveis.get(nivel_minimo, 0)
            
            if nivel_usuario < nivel_necessario:
                flash('Você não tem permissão para acessar esta página.', 'danger')
                return redirect(url_for('main.index'))
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def validar_senha(senha):
    """
    Valida a força da senha.
    Retorna (bool, str) - (senha é válida, mensagem de erro)
    """
    if len(senha) < 8:
        return False, 'A senha deve ter pelo menos 8 caracteres.'
    
    if not any(c.isupper() for c in senha):
        return False, 'A senha deve conter pelo menos uma letra maiúscula.'
    
    if not any(c.islower() for c in senha):
        return False, 'A senha deve conter pelo menos uma letra minúscula.'
    
    if not any(c.isdigit() for c in senha):
        return False, 'A senha deve conter pelo menos um número.'
    
    return True, ''

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('main.index'))
    
    if request.method == 'POST':
        usuario = request.form.get('usuario', '').strip()
        senha = request.form.get('senha', '')
        lembrar = request.form.get('lembrar', False)
        
        if not usuario or not senha:
            flash('Por favor, preencha todos os campos.', 'danger')
            return render_template('login.html')
        
        user = User.query.filter_by(usuario=usuario).first()
        
        if user and user.check_password(senha):
            if user.bloqueado:
                flash('Sua conta está bloqueada. Entre em contato com o administrador.', 'danger')
                current_app.logger.warning(f'Tentativa de login em conta bloqueada: {usuario}')
                return render_template('login.html')
            
            if user.alterar_senha_primeiro_acesso:
                return render_template('login.html', alterar_senha=True, usuario=user.usuario)
            
            login_user(user, remember=bool(lembrar))

            # Registrar último acesso
            user.ultimo_acesso = datetime.utcnow()
            db.session.commit()

            current_app.logger.info(f'Login bem-sucedido: {usuario}')

            # Verificar se existe uma página específica solicitada
            next_page = request.args.get('next')
            if next_page and next_page.startswith('/'):  # Previne redirect malicioso
                return redirect(next_page)

            # Redirecionamento inteligente baseado no tipo de usuário
            redirect_url = get_user_redirect_url(user)
            return redirect(redirect_url)
        else:
            current_app.logger.warning(f'Tentativa de login falha: {usuario}')
            flash('Usuário ou senha inválidos', 'danger')
    
    return render_template('login.html')

@auth_bp.route('/first_login', methods=['POST'])
def first_login():
    usuario = request.form.get('usuario')
    nova_senha = request.form.get('nova_senha')
    confirmar_senha = request.form.get('confirmar_senha')
    
    user = User.query.filter_by(usuario=usuario).first()
    if not user:
        flash('Usuário não encontrado', 'danger')
        return redirect(url_for('auth.login'))
    
    if not nova_senha or nova_senha != confirmar_senha:
        flash('As senhas não coincidem', 'danger')
        return render_template('login.html', alterar_senha=True, usuario=usuario)
    
    senha_valida, mensagem = validar_senha(nova_senha)
    if not senha_valida:
        flash(mensagem, 'danger')
        return render_template('login.html', alterar_senha=True, usuario=usuario)
    
    try:
        user.senha_hash = generate_password_hash(nova_senha)
        user.alterar_senha_primeiro_acesso = False
        db.session.commit()
        
        current_app.logger.info(f'Senha alterada com sucesso para usuário: {usuario}')
        flash('Senha alterada com sucesso. Faça login com sua nova senha.', 'success')
        return redirect(url_for('auth.login'))
    
    except Exception as e:
        current_app.logger.error(f'Erro ao alterar senha: {str(e)}')
        db.session.rollback()
        flash('Erro ao alterar senha. Tente novamente.', 'danger')
        return render_template('login.html', alterar_senha=True, usuario=usuario)

@auth_bp.route('/logout')
@login_required
def logout():
    reason = request.args.get('reason')

    if current_user.is_authenticated:
        usuario = current_user.usuario
        logout_user()

        if reason == 'timeout':
            current_app.logger.info(f'Logout por timeout de sessão: {usuario}')
            flash('Sua sessão foi encerrada por inatividade (15 minutos). Faça login novamente.', 'warning')
        else:
            current_app.logger.info(f'Logout bem-sucedido: {usuario}')
            flash('Você foi desconectado com sucesso.', 'info')

    return redirect(url_for('auth.login'))

@auth_bp.route('/perfil')
@login_required
def perfil():
    return render_template('perfil.html')

@auth_bp.route('/alterar_senha', methods=['POST'])
@login_required
def alterar_senha():
    senha_atual = request.form.get('senha_atual')
    nova_senha = request.form.get('nova_senha')
    confirmar_senha = request.form.get('confirmar_senha')

    if not current_user.check_password(senha_atual):
        flash('Senha atual incorreta', 'danger')
        return redirect(url_for('auth.perfil'))

    if nova_senha != confirmar_senha:
        flash('As novas senhas não coincidem', 'danger')
        return redirect(url_for('auth.perfil'))

    senha_valida, mensagem = validar_senha(nova_senha)
    if not senha_valida:
        flash(mensagem, 'danger')
        return redirect(url_for('auth.perfil'))

    try:
        current_user.senha_hash = generate_password_hash(nova_senha)
        db.session.commit()
        flash('Senha alterada com sucesso', 'success')
        current_app.logger.info(f'Senha alterada com sucesso para usuário: {current_user.usuario}')
    except Exception as e:
        current_app.logger.error(f'Erro ao alterar senha: {str(e)}')
        db.session.rollback()
        flash('Erro ao alterar senha', 'danger')

    return redirect(url_for('auth.perfil'))

@auth_bp.route('/extend_session', methods=['POST'])
@login_required
def extend_session():
    """Endpoint para estender a sessão do usuário"""
    try:
        from flask import session
        from datetime import datetime

        # Atualizar última atividade na sessão
        session['_last_activity'] = datetime.utcnow().timestamp()

        current_app.logger.info(f'Sessão estendida para usuário: {current_user.usuario}')

        return jsonify({
            'success': True,
            'message': 'Sessão estendida com sucesso',
            'timestamp': datetime.utcnow().isoformat()
        })
    except Exception as e:
        current_app.logger.error(f'Erro ao estender sessão: {str(e)}')
        return jsonify({
            'success': False,
            'message': 'Erro ao estender sessão'
        }), 500
