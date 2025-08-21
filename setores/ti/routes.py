import os
import os
import random
import string
from datetime import datetime, timedelta
from flask import Blueprint, render_template, request, jsonify, current_app, flash, redirect, url_for
from flask_login import LoginManager, login_required, current_user
from auth.auth_helpers import setor_required
from database import db, Chamado, User, Unidade, ProblemaReportado, ItemInternet, seed_unidades, get_brazil_time
import requests
from msal import ConfidentialClientApplication

ti_bp = Blueprint('ti', __name__, template_folder='templates')

# Configurações do Microsoft Graph API obtidas das variáveis de ambiente
CLIENT_ID = os.getenv('CLIENT_ID')
CLIENT_SECRET = os.getenv('CLIENT_SECRET')
TENANT_ID = os.getenv('TENANT_ID')
USER_ID = os.getenv('USER_ID')
EMAIL_TI = os.getenv('EMAIL_TI', 'ti@academiaevoque.com.br')

# Verificar se as variáveis de ambiente estão configuradas (não obrigatórias para desenvolvimento)
EMAIL_ENABLED = all([CLIENT_ID, CLIENT_SECRET, TENANT_ID, USER_ID])

if EMAIL_ENABLED:
    SCOPES = ["https://graph.microsoft.com/.default"]
    ENDPOINT = f"https://graph.microsoft.com/v1.0/users/{USER_ID}/sendMail"
    print("✅ Configurações de email Microsoft Graph carregadas")
else:
    SCOPES = []
    ENDPOINT = None
    print("⚠️  Email desabilitado: Variáveis de ambiente do Microsoft Graph não configuradas")

def get_access_token():
    if not EMAIL_ENABLED:
        current_app.logger.warning("⚠️  Tentativa de obter token com email desabilitado")
        return None

    try:
        current_app.logger.info(f"🔄 Configurando MSAL Client...")
        current_app.logger.info(f"🔑 CLIENT_ID: {CLIENT_ID[:8]}...")
        current_app.logger.info(f"🏢 TENANT_ID: {TENANT_ID}")
        current_app.logger.info(f"🌐 Authority: https://login.microsoftonline.com/{TENANT_ID}")

        app = ConfidentialClientApplication(
            client_id=CLIENT_ID,
            client_credential=CLIENT_SECRET,
            authority=f"https://login.microsoftonline.com/{TENANT_ID}"
        )

        current_app.logger.info(f"📋 Scopes: {SCOPES}")
        current_app.logger.info("🔄 Solicitando token...")

        result = app.acquire_token_for_client(scopes=SCOPES)

        current_app.logger.info(f"📥 Resultado recebido: {list(result.keys())}")

        if "access_token" in result:
            current_app.logger.info("✅ Token obtido com sucesso!")
            return result["access_token"]
        else:
            current_app.logger.error(f"❌ Erro ao obter token:")
            current_app.logger.error(f"   - Error: {result.get('error', 'N/A')}")
            current_app.logger.error(f"   - Error Description: {result.get('error_description', 'N/A')}")
            current_app.logger.error(f"   - Error Codes: {result.get('error_codes', 'N/A')}")
            current_app.logger.error(f"   - Correlation ID: {result.get('correlation_id', 'N/A')}")
            return None
    except Exception as e:
        current_app.logger.error(f"❌ Exceção ao obter token: {str(e)}")
        import traceback
        current_app.logger.error(f"🔍 Stack trace: {traceback.format_exc()}")
        return None

def testar_configuracao_email():
    """Função para testar se as configurações de e-mail estão funcionando"""
    try:
        current_app.logger.info("🔍 Testando configurações de e-mail...")
        current_app.logger.info(f"EMAIL_ENABLED: {EMAIL_ENABLED}")
        current_app.logger.info(f"CLIENT_ID presente: {'Sim' if CLIENT_ID else 'Não'}")
        current_app.logger.info(f"CLIENT_SECRET presente: {'Sim' if CLIENT_SECRET else 'Não'}")
        current_app.logger.info(f"TENANT_ID: {TENANT_ID}")
        current_app.logger.info(f"USER_ID: {USER_ID}")
        current_app.logger.info(f"EMAIL_TI: {EMAIL_TI}")

        # Verificar se todas as variáveis estão presentes
        if not all([CLIENT_ID, CLIENT_SECRET, TENANT_ID, USER_ID]):
            current_app.logger.error("❌ Variáveis de ambiente obrigatórias não configuradas")
            missing = []
            if not CLIENT_ID: missing.append("CLIENT_ID")
            if not CLIENT_SECRET: missing.append("CLIENT_SECRET")
            if not TENANT_ID: missing.append("TENANT_ID")
            if not USER_ID: missing.append("USER_ID")
            current_app.logger.error(f"❌ Variáveis faltando: {', '.join(missing)}")
            return False

        if EMAIL_ENABLED:
            current_app.logger.info("🔄 Tentando obter token...")
            token = get_access_token()
            if token:
                current_app.logger.info("✅ Token obtido com sucesso! Sistema de e-mail funcionando")
                current_app.logger.info(f"🔑 Token: {token[:20]}...")
                return True
            else:
                current_app.logger.error("❌ Falha ao obter token")
                return False
        else:
            current_app.logger.warning("⚠️ Sistema de e-mail desabilitado")
            return False
    except Exception as e:
        current_app.logger.error(f"❌ Erro ao testar configurações: {str(e)}")
        import traceback
        current_app.logger.error(f"🔍 Stack trace: {traceback.format_exc()}")
        return False

def enviar_email(assunto, corpo, destinatarios=None):
    if destinatarios is None:
        destinatarios = [EMAIL_TI]

    current_app.logger.info(f"📧 === INICIANDO ENVIO DE EMAIL ===")
    current_app.logger.info(f"📧 Destinatários: {destinatarios}")
    current_app.logger.info(f"📋 Assunto: {assunto}")
    current_app.logger.info(f"📄 Tamanho do corpo: {len(corpo)} caracteres")

    token = get_access_token()
    if not token:
        current_app.logger.error("❌ Token não obtido, não é possível enviar e-mail")
        return False

    current_app.logger.info(f"🔑 Token obtido: {token[:20]}...")
    current_app.logger.info(f"🌐 Endpoint: {ENDPOINT}")

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    email_data = {
        "message": {
            "subject": assunto,
            "body": {
                "contentType": "Text",
                "content": corpo
            },
            "toRecipients": [
                {"emailAddress": {"address": addr}} for addr in destinatarios
            ]
        },
        "saveToSentItems": "false"
    }

    current_app.logger.info(f"📦 Email data preparado para: {[r['emailAddress']['address'] for r in email_data['message']['toRecipients']]}")

    try:
        response = requests.post(ENDPOINT, headers=headers, json=email_data)
        if response.status_code == 202:
            current_app.logger.info("���� E-mail enviado com sucesso!")
            return True
        else:
            current_app.logger.error(f"❌ Falha ao enviar e-mail. Status: {response.status_code}")
            return False
    except Exception as e:
        current_app.logger.error(f"❌ Erro na requisição: {str(e)}")
        return False

def gerar_codigo_chamado():
    ultimo_chamado = Chamado.query.order_by(Chamado.id.desc()).first()
    if ultimo_chamado and ultimo_chamado.codigo.startswith("EVQ-"):
        try:
            ultimo_numero = int(ultimo_chamado.codigo.split("-")[1])
        except:
            ultimo_numero = 0
    else:
        ultimo_numero = 0
    
    novo_numero = ultimo_numero + 1
    numero_formatado = str(novo_numero).zfill(4)
    return f"EVQ-{numero_formatado}"

def gerar_protocolo():
    # Usar horário do Brasil para gerar protocolo
    data_brazil = get_brazil_time()
    data_str = data_brazil.strftime("%Y%m%d")
    count = Chamado.query.filter(Chamado.protocolo.like(f"{data_str}-%")).count()
    novo_num = count + 1
    return f"{data_str}-{novo_num}"

@ti_bp.route('/test-email')
@login_required
@setor_required('ti')
def test_email():
    """Rota para testar envio de e-mail"""
    try:
        # Testar configurações
        config_ok = testar_configuracao_email()

        if config_ok:
            # Tentar enviar e-mail de teste
            assunto = "Teste de E-mail - Sistema Evoque"
            corpo = f"""
Este é um e-mail de teste do sistema Evoque Fitness.

Dados do teste:
- Data/Hora: {get_brazil_time().strftime('%d/%m/%Y %H:%M:%S')}
- Usuário: {current_user.nome} {current_user.sobrenome}
- E-mail do usuário: {current_user.email}

Se você recebeu este e-mail, o sistema está funcionando corretamente!

---
Sistema de Suporte TI - Evoque Fitness
"""

            resultado = enviar_email(assunto, corpo, [current_user.email])

            if resultado:
                return jsonify({
                    'success': True,
                    'message': f'E-mail de teste enviado com sucesso para {current_user.email}'
                })
            else:
                return jsonify({
                    'success': False,
                    'message': 'Falha ao enviar e-mail de teste'
                })
        else:
            return jsonify({
                'success': False,
                'message': 'Configurações de e-mail não estão funcionando'
            })

    except Exception as e:
        current_app.logger.error(f"Erro no teste de e-mail: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'Erro durante teste: {str(e)}'
        })

@ti_bp.route('/')
@login_required
@setor_required('ti')
def index():
    try:
        # Buscar chamados do usuário logado usando o relacionamento
        meus_chamados = Chamado.query.filter_by(usuario_id=current_user.id).order_by(Chamado.data_abertura.desc()).all()
        
        # Se não encontrar chamados pelo usuario_id, buscar pelo email (fallback para dados antigos)
        if not meus_chamados:
            meus_chamados = Chamado.query.filter_by(email=current_user.email).order_by(Chamado.data_abertura.desc()).all()
            
            # Vincular esses chamados ao usuário atual
            for chamado in meus_chamados:
                if not chamado.usuario_id:
                    chamado.usuario_id = current_user.id
            
            if meus_chamados:
                db.session.commit()
        
        return render_template('index.html', meus_chamados=meus_chamados)
    except Exception as e:
        current_app.logger.error(f"Erro ao buscar chamados do usuário: {str(e)}")
        flash("Ocorreu um erro ao carregar seu histórico de chamados.", "danger")
        return render_template('index.html', meus_chamados=[])

@ti_bp.route('/painel')
@login_required
@setor_required('ti')
def painel():
    if not current_user.tem_permissao('Administrador'):
        flash('Você não tem permissão para acessar o painel administrativo.', 'danger')
        return redirect(url_for('ti.index'))
    return render_template('painel.html')

@ti_bp.route('/painel-agente')
@login_required
@setor_required('ti')
def painel_agente():
    """Painel específico para agentes de suporte"""
    # Verificar se o usuário é um agente de suporte
    from database import AgenteSuporte
    agente = AgenteSuporte.query.filter_by(usuario_id=current_user.id, ativo=True).first()

    if not agente:
        flash('Você não está registrado como agente de suporte.', 'warning')
        return redirect(url_for('ti.index'))

    return render_template('painel_agente.html', agente=agente)

@ti_bp.route('/abrir-chamado', methods=['GET', 'POST'])
@login_required
@setor_required('ti')
def abrir_chamado():
    try:
        unidades = Unidade.query.order_by(Unidade.nome).all()
        problemas = ProblemaReportado.query.filter_by(ativo=True).order_by(ProblemaReportado.nome).all()
        # Filtro ativo opcional para ItemInternet (pode não existir em dados antigos)
        try:
            itens_internet = ItemInternet.query.filter_by(ativo=True).order_by(ItemInternet.nome).all()
        except:
            itens_internet = ItemInternet.query.order_by(ItemInternet.nome).all()

        # Log de debug
        current_app.logger.info(f"📊 Dados carregados - Unidades: {len(unidades)}, Problemas: {len(problemas)}, Itens: {len(itens_internet)}")

        if not unidades:
            current_app.logger.info("🔄 Nenhuma unidade encontrada, executando seed_unidades()")
            seed_unidades()
            unidades = Unidade.query.order_by(Unidade.nome).all()
            problemas = ProblemaReportado.query.filter_by(ativo=True).order_by(ProblemaReportado.nome).all()
            # Filtro ativo opcional para ItemInternet (pode não existir em dados antigos)
            try:
                itens_internet = ItemInternet.query.filter_by(ativo=True).order_by(ItemInternet.nome).all()
            except:
                itens_internet = ItemInternet.query.order_by(ItemInternet.nome).all()
            current_app.logger.info(f"📊 Após seed - Unidades: {len(unidades)}, Problemas: {len(problemas)}, Itens: {len(itens_internet)}")
            
        if request.method == 'POST':
            try:
                codigo_gerado = gerar_codigo_chamado()
                protocolo_gerado = gerar_protocolo()

                dados_chamado = {
                    'nome_solicitante': request.form['nome_solicitante'],
                    'cargo': request.form['cargo'],
                    'email': request.form['email'],
                    'telefone': request.form['telefone'],
                    'unidade_id': request.form['unidade'],
                    'problema_id': request.form['problema'],
                    'internet_item_id': request.form.get('internet_item', ''),
                    'descricao': request.form.get('descricao', ''),
                    'data_visita_str': request.form.get('data_visita', '').strip(),
                    'prioridade': request.form.get('prioridade', 'Normal')
                }

                unidade_obj = Unidade.query.get(dados_chamado['unidade_id'])
                problema_obj = ProblemaReportado.query.get(dados_chamado['problema_id'])
                
                if not unidade_obj or not problema_obj:
                    return jsonify({
                        'status': 'error',
                        'message': 'Unidade ou problema inválido.'
                    }), 400

                unidade_nome_completo = unidade_obj.nome
                problema_nome = problema_obj.nome
                
                internet_item_nome = ""
                if dados_chamado['internet_item_id']:
                    item_obj = ItemInternet.query.get(dados_chamado['internet_item_id'])
                    internet_item_nome = item_obj.nome if item_obj else ""

                data_visita = None
                if dados_chamado['data_visita_str']:
                    try:
                        data_visita = datetime.strptime(dados_chamado['data_visita_str'], '%Y-%m-%d').date()
                    except ValueError:
                        return jsonify({
                            'status': 'error',
                            'message': 'Formato de data inválido. Use AAAA-MM-DD.'
                        }), 400

                descricao_completa = dados_chamado['descricao']
                if problema_nome == 'Internet' and internet_item_nome:
                    descricao_completa = f"Item: {internet_item_nome}\nDescrição: {descricao_completa}"

                # Usar horário do Brasil para data de abertura
                data_abertura_brazil = get_brazil_time()

                novo_chamado = Chamado(
                    codigo=codigo_gerado,
                    protocolo=protocolo_gerado,
                    solicitante=dados_chamado['nome_solicitante'],
                    cargo=dados_chamado['cargo'],
                    email=dados_chamado['email'],
                    telefone=dados_chamado['telefone'],
                    unidade=unidade_nome_completo,
                    problema=problema_nome,
                    internet_item=internet_item_nome,
                    descricao=descricao_completa,
                    data_visita=data_visita,
                    status='Aberto',
                    prioridade=dados_chamado['prioridade'],
                    data_abertura=data_abertura_brazil.replace(tzinfo=None),
                    usuario_id=current_user.id  # Vincular ao usuário logado
                )

                db.session.add(novo_chamado)
                db.session.commit()

                if hasattr(current_app, 'socketio'):
                    current_app.socketio.emit('novo_chamado', {
                        'id': novo_chamado.id,
                        'codigo': codigo_gerado,
                        'protocolo': protocolo_gerado,
                        'solicitante': dados_chamado['nome_solicitante'],
                        'problema': problema_nome,
                        'unidade': unidade_nome_completo,
                        'status': 'Aberto',
                        'data_abertura': data_abertura_brazil.isoformat(),
                        'prioridade': dados_chamado['prioridade']
                    })

                visita_tecnica_texto = (
                    f"Sim, agendada para {data_visita.strftime('%d/%m/%Y')}"
                    if data_visita else "Não requisitada"
                )

                internet_item_texto = (
                    f"\nItem de Internet: {internet_item_nome}"
                    if problema_nome == 'Internet' and internet_item_nome
                    else ""
                )

                corpo_email = f"""
Seu chamado foi registrado com sucesso! Aqui estão os detalhes:

Chamado: {codigo_gerado}
Protocolo: {protocolo_gerado}
Prioridade: {dados_chamado['prioridade']}
Nome do solicitante: {dados_chamado['nome_solicitante']}
Cargo: {dados_chamado['cargo']}
Unidade: {unidade_nome_completo}
E-mail: {dados_chamado['email']}
Telefone: {dados_chamado['telefone']}
Problema reportado: {problema_nome}{internet_item_texto}
Descrição: {dados_chamado['descricao']}
Visita técnica: {visita_tecnica_texto}

⚠️ Caso precise acompanhar o status do chamado, utilize o código acima.

Atenciosamente,
Suporte Evoque!

Por favor, não responda este e-mail, essa é uma mensagem automática!
"""
                destinatarios = [dados_chamado['email'], EMAIL_TI]
                assunto_email = f"ACADEMIA EVOQUE - CHAMADO #{codigo_gerado}"

                sucesso_email = enviar_email(assunto_email, corpo_email, destinatarios)
                if not sucesso_email:
                    current_app.logger.warning(f"Falha ao enviar e-mail para o chamado {codigo_gerado}")

                return jsonify({
                    'status': 'success',
                    'codigo_chamado': codigo_gerado,
                    'protocolo_chamado': protocolo_gerado,
                    'notificacao_data': {
                        'id': novo_chamado.id,
                        'codigo': codigo_gerado,
                        'solicitante': dados_chamado['nome_solicitante'],
                        'problema': problema_nome,
                        'data_abertura': data_abertura_brazil.strftime('%d/%m/%Y %H:%M:%S')
                    }
                })

            except Exception as e:
                db.session.rollback()
                current_app.logger.error(f"Erro ao salvar chamado: {str(e)}")
                return jsonify({
                    'status': 'error',
                    'message': 'Erro ao abrir chamado. Tente novamente.'
                }), 500

        # Pré-preencher dados do usuário logado
        usuario_data = {
            'nome': f"{current_user.nome} {current_user.sobrenome}",
            'email': current_user.email
        }

        return render_template('abrir_chamado.html', 
                             unidades=unidades, 
                             problemas=problemas, 
                             itens_internet=itens_internet,
                             usuario_data=usuario_data)
    
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Erro ao processar página de chamados: {str(e)}")
        return render_template('abrir_chamado.html', unidades=[], problemas=[], itens_internet=[], 
                              error_message="Erro ao carregar unidades. Por favor, tente novamente mais tarde.")

@ti_bp.route('/api/meus-chamados')
@login_required
@setor_required('ti')
def api_meus_chamados():
    try:
        page = request.args.get('page', 1, type=int)
        per_page = 5  # 5 itens por página
        
        # Buscar chamados do usuário logado com paginação
        chamados_query = Chamado.query.filter_by(usuario_id=current_user.id).order_by(Chamado.data_abertura.desc())
        
        # Se não encontrar pelo usuario_id, buscar pelo email (fallback)
        if chamados_query.count() == 0:
            chamados_query = Chamado.query.filter_by(email=current_user.email).order_by(Chamado.data_abertura.desc())
        
        chamados_paginados = chamados_query.paginate(
            page=page, 
            per_page=per_page, 
            error_out=False
        )
        
        chamados_list = []
        for chamado in chamados_paginados.items:
            data_abertura_brazil = chamado.get_data_abertura_brazil()
            chamados_list.append({
                'id': chamado.id,
                'codigo': chamado.codigo,
                'protocolo': chamado.protocolo,
                'solicitante': chamado.solicitante,
                'problema': chamado.problema,
                'unidade': chamado.unidade,
                'status': chamado.status,
                'prioridade': chamado.prioridade,
                'data_abertura': data_abertura_brazil.strftime('%d/%m/%Y %H:%M') if data_abertura_brazil else 'Não informado',
                'descricao': chamado.descricao or 'Sem descrição',
                'data_visita': chamado.data_visita.strftime('%d/%m/%Y') if chamado.data_visita else None
            })
        
        return jsonify({
            'chamados': chamados_list,
            'pagination': {
                'page': chamados_paginados.page,
                'pages': chamados_paginados.pages,
                'per_page': chamados_paginados.per_page,
                'total': chamados_paginados.total,
                'has_next': chamados_paginados.has_next,
                'has_prev': chamados_paginados.has_prev
            }
        })
    except Exception as e:
        current_app.logger.error(f"Erro ao buscar chamados do usuário: {str(e)}")
        return jsonify({'error': 'Erro interno no servidor'}), 500

@ti_bp.route('/ver-meus-chamados', methods=['GET', 'POST'])
@login_required
@setor_required('ti')
def ver_meus_chamados():
    if request.method == 'POST':
        codigo = request.form.get('codigo', '').strip().upper()
        
        if not codigo:
            return jsonify({
                'status': 'error',
                'message': 'Código não informado.'
            }), 400

        if not codigo.startswith('EVQ-'):
            codigo = f"EVQ-{codigo.zfill(4)}"

        try:
            # Buscar chamado do usuário logado
            chamado = Chamado.query.filter_by(
                codigo=codigo, 
                usuario_id=current_user.id
            ).first()
            
            # Se não encontrar pelo usuario_id, buscar pelo email (fallback)
            if not chamado:
                chamado = Chamado.query.filter_by(
                    codigo=codigo,
                    email=current_user.email
                ).first()
            
            if not chamado:
                return jsonify({
                    'status': 'error',
                    'message': 'Chamado não encontrado ou você não tem permissão para visualizá-lo.'
                }), 404

            # Converter data de abertura para timezone do Brasil
            data_abertura_brazil = chamado.get_data_abertura_brazil()
            data_abertura_str = data_abertura_brazil.strftime('%d/%m/%Y %H:%M') if data_abertura_brazil else 'Não informado'

            resultado = {
                'tipo': 'chamado',
                'codigo_chamado': chamado.codigo,
                'protocolo': chamado.protocolo,
                'prioridade': chamado.prioridade,
                'status': chamado.status,
                'nome_solicitante': chamado.solicitante,
                'email': chamado.email or 'Não informado',
                'cargo': chamado.cargo,
                'telefone': chamado.telefone or 'Não informado',
                'unidade': chamado.unidade or 'Não informado',
                'problema_reportado': chamado.problema,
                'internet_item': chamado.internet_item or 'Não informado',
                'descricao': chamado.descricao or 'Sem descrição',
                'data_abertura': data_abertura_str,
                'visita_tecnica': 'Sim' if chamado.data_visita else 'Não requisitada',
                'data_visita_tecnica': chamado.data_visita.strftime('%d/%m/%Y') if chamado.data_visita else 'Não agendada',
            }
            
            return jsonify({
                'status': 'success',
                'resultado': resultado
            })

        except Exception as e:
            current_app.logger.error(f"Erro ao buscar chamado: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': 'Erro interno no servidor.'
            }), 500

    return render_template('ver_meus_chamados.html')

@ti_bp.errorhandler(404)
def not_found_error(error):
    return render_template('errors/404.html'), 404

@ti_bp.errorhandler(500)
def internal_error(error):
    db.session.rollback()
    return render_template('errors/500.html'), 500

from .painel import painel_bp
ti_bp.register_blueprint(painel_bp, url_prefix='/painel')

# Registrar blueprints de agentes, grupos, auditoria e rotas avançadas
from .agentes import agentes_bp
from .grupos import grupos_bp
from .auditoria import auditoria_bp
from .rotas import rotas_bp
from .agente_api import agente_api_bp
ti_bp.register_blueprint(agentes_bp, url_prefix='/painel')
ti_bp.register_blueprint(grupos_bp, url_prefix='/painel')
ti_bp.register_blueprint(auditoria_bp, url_prefix='/painel')
ti_bp.register_blueprint(rotas_bp, url_prefix='/painel')
ti_bp.register_blueprint(agente_api_bp, url_prefix='/painel')

@ti_bp.route('/debug/dados')
@login_required
@setor_required('ti')
def debug_dados():
    """Rota de debug para verificar dados do banco"""
    try:
        unidades = Unidade.query.all()
        problemas = ProblemaReportado.query.all()
        itens_internet = ItemInternet.query.all()

        dados_debug = {
            'unidades': {
                'total': len(unidades),
                'lista': [{'id': u.id, 'nome': u.nome} for u in unidades[:5]]  # Primeiras 5
            },
            'problemas': {
                'total': len(problemas),
                'lista': [{'id': p.id, 'nome': p.nome, 'prioridade': p.prioridade_padrao, 'ativo': p.ativo} for p in problemas]
            },
            'itens_internet': {
                'total': len(itens_internet),
                'lista': [{'id': i.id, 'nome': i.nome, 'ativo': i.ativo} for i in itens_internet]
            }
        }

        return jsonify(dados_debug)

    except Exception as e:
        return jsonify({'error': str(e)})

@ti_bp.route('/api/chamados/recentes')
@login_required
@setor_required('ti')
def chamados_recentes():
    try:
        cinco_minutos_atras = get_brazil_time() - timedelta(minutes=5)
        chamados_recentes = Chamado.query.filter(
            Chamado.data_abertura >= cinco_minutos_atras.replace(tzinfo=None)
        ).order_by(Chamado.data_abertura.desc()).all()
        
        chamados_list = []
        for c in chamados_recentes:
            data_abertura_brazil = c.get_data_abertura_brazil()
            chamados_list.append({
                'id': c.id,
                'codigo': c.codigo,
                'solicitante': c.solicitante,
                'problema': c.problema,
                'data_abertura': data_abertura_brazil.strftime('%d/%m/%Y %H:%M:%S') if data_abertura_brazil else None,
                'status': c.status
            })
        
        return jsonify(chamados_list)
    except Exception as e:
        current_app.logger.error(f"Erro ao buscar chamados recentes: {str(e)}")
        return jsonify({'error': 'Erro interno no servidor'}), 500
               
@ti_bp.route('/ajuda')
@login_required
@setor_required('ti')
def ajuda():
    faqs = [
        ("Como abrir um novo chamado?",
         "<ol><li>Acesse o menu 'Abrir Chamado'</li><li>Preencha todos os campos obrigatórios</li><li>Clique em 'Enviar'</li><li>Anote o número do protocolo para acompanhamento</li></ol>"),
        ("Como acompanhar um chamado existente?",
         "<ol><li>Acesse o menu 'Meus Chamados'</li><li>Digite o número do protocolo</li><li>Clique em 'Buscar'</li><li>Você verá o status atual e histórico</li></ol>"),
        ("O que fazer se esquecer o número do protocolo?",
         "<ul><li>Verifique seu e-mail - enviamos uma confirmação</li><li>Contate o suporte TI com seus dados</li><li>Forneça data aproximada e detalhes do problema</li></ul>"),
        ("Quanto tempo leva para um chamado ser atendido?",
         "<p>O tempo varia conforme a prioridade:</p><ul><li><strong>Crítico</strong>: 1 hora</li><li><strong>Alta</strong>: 4 horas</li><li><strong>Normal</strong>: 24 horas</li><li><strong>Baixa</strong>: 72 horas</li></ul>"),
        ("Como classificar a prioridade do meu chamado?",
         "<p>Use estas diretrizes:</p><ul><li><strong>Crítico</strong>: Sistema totalmente inoperante</li><li><strong>Alta</strong>: Funcionalidade principal afetada</li><li><strong>Normal</strong>: Problema não impede operação</li><li><strong>Baixa</strong>: Dúvida ou melhoria</li></ul>"),
        ("Posso anexar arquivos ao chamado?",
         "<p>Sim, na versão premium do sistema. Atualmente você pode:</p><ul><li>Descrever detalhadamente o problema</li><li>Incluir prints na descrição</li><li>Enviar arquivos posteriormente por e-mail</li></ul>")
    ]
    return render_template('ajuda.html', faqs=faqs)

# ==================== NOVAS FUNCIONALIDADES - REABERTURA E TRANSFERÊNCIA ====================

@ti_bp.route('/api/chamados/verificar-reabertura', methods=['POST'])
@login_required
@setor_required('ti')
def verificar_reabertura():
    """Verifica se um novo chamado pode ser convertido em reabertura"""
    try:
        data = request.get_json()
        email = data.get('email')
        problema = data.get('problema')
        dias_limite = data.get('dias_limite', 7)

        if not email or not problema:
            return jsonify({
                'status': 'error',
                'message': 'Email e problema são obrigatórios'
            }), 400

        # Buscar chamados similares concluídos nos últimos X dias
        from datetime import timedelta
        limite_data = get_brazil_time() - timedelta(days=dias_limite)

        chamados_similares = Chamado.query.filter(
            Chamado.email == email,
            Chamado.problema == problema,
            Chamado.status.in_(['Concluido', 'Cancelado']),
            Chamado.data_conclusao >= limite_data.replace(tzinfo=None)
        ).order_by(Chamado.data_conclusao.desc()).all()

        if chamados_similares:
            chamado_candidato = chamados_similares[0]
            pode_reabrir, motivo = chamado_candidato.pode_ser_reaberto(dias_limite)

            return jsonify({
                'status': 'success',
                'pode_reabrir': pode_reabrir,
                'chamado_original': {
                    'id': chamado_candidato.id,
                    'codigo': chamado_candidato.codigo,
                    'protocolo': chamado_candidato.protocolo,
                    'data_conclusao': chamado_candidato.data_conclusao.strftime('%d/%m/%Y %H:%M') if chamado_candidato.data_conclusao else None,
                    'problema': chamado_candidato.problema,
                    'descricao': chamado_candidato.descricao
                },
                'motivo': motivo,
                'dias_desde_conclusao': (get_brazil_time().replace(tzinfo=None) - chamado_candidato.data_conclusao).days if chamado_candidato.data_conclusao else None
            })
        else:
            return jsonify({
                'status': 'success',
                'pode_reabrir': False,
                'motivo': 'Nenhum chamado similar encontrado no período especificado'
            })

    except Exception as e:
        current_app.logger.error(f"Erro ao verificar reabertura: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'Erro interno: {str(e)}'
        }), 500

@ti_bp.route('/api/chamados/reabrir', methods=['POST'])
@login_required
@setor_required('ti')
def reabrir_chamado():
    """Reabre um chamado existente"""
    try:
        data = request.get_json()
        chamado_original_id = data.get('chamado_original_id')
        motivo = data.get('motivo', '')
        observacoes_adicionais = data.get('observacoes_adicionais', '')

        if not chamado_original_id:
            return jsonify({
                'status': 'error',
                'message': 'ID do chamado original é obrigatório'
            }), 400

        chamado_original = Chamado.query.get(chamado_original_id)
        if not chamado_original:
            return jsonify({
                'status': 'error',
                'message': 'Chamado original não encontrado'
            }), 404

        # Verificar permissões - apenas o próprio usuário ou administradores
        if chamado_original.usuario_id != current_user.id and not current_user.tem_permissao('Administrador'):
            return jsonify({
                'status': 'error',
                'message': 'Você não tem permissão para reabrir este chamado'
            }), 403

        # Reabrir o chamado
        novo_chamado, resultado = chamado_original.reabrir_chamado(
            usuario_id=current_user.id,
            motivo=f"{motivo}\n\nObservações adicionais: {observacoes_adicionais}" if observacoes_adicionais else motivo
        )

        if novo_chamado:
            # Notificar via Socket.IO
            if hasattr(current_app, 'socketio'):
                current_app.socketio.emit('chamado_reaberto', {
                    'novo_chamado': {
                        'id': novo_chamado.id,
                        'codigo': novo_chamado.codigo,
                        'protocolo': novo_chamado.protocolo,
                        'solicitante': novo_chamado.solicitante
                    },
                    'chamado_original': {
                        'id': chamado_original.id,
                        'codigo': chamado_original.codigo,
                        'protocolo': chamado_original.protocolo
                    }
                })

            # Log da ação
            from database import registrar_log_acao
            registrar_log_acao(
                usuario_id=current_user.id,
                acao='Reabertura de chamado',
                categoria='chamado',
                detalhes=f'Chamado {chamado_original.codigo} reaberto como {novo_chamado.codigo}',
                recurso_afetado=novo_chamado.id,
                tipo_recurso='chamado',
                ip_address=request.remote_addr,
                user_agent=request.headers.get('User-Agent')
            )

            return jsonify({
                'status': 'success',
                'message': resultado,
                'novo_chamado': {
                    'id': novo_chamado.id,
                    'codigo': novo_chamado.codigo,
                    'protocolo': novo_chamado.protocolo,
                    'status': novo_chamado.status,
                    'data_abertura': novo_chamado.data_abertura.strftime('%d/%m/%Y %H:%M') if novo_chamado.data_abertura else None
                }
            })
        else:
            return jsonify({
                'status': 'error',
                'message': resultado
            }), 400

    except Exception as e:
        current_app.logger.error(f"Erro ao reabrir chamado: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'Erro interno: {str(e)}'
        }), 500

@ti_bp.route('/api/chamados/<int:chamado_id>/reaberturas', methods=['GET'])
@login_required
@setor_required('ti')
def obter_reaberturas(chamado_id):
    """Obtém histórico de reaberturas de um chamado"""
    try:
        chamado = Chamado.query.get(chamado_id)
        if not chamado:
            return jsonify({
                'status': 'error',
                'message': 'Chamado não encontrado'
            }), 404

        # Verificar permissões
        if not current_user.tem_permissao('Administrador') and chamado.usuario_id != current_user.id:
            return jsonify({
                'status': 'error',
                'message': 'Sem permissão para visualizar este chamado'
            }), 403

        reaberturas = chamado.get_reaberturas()

        reaberturas_data = []
        for reabertura in reaberturas:
            reaberturas_data.append({
                'id': reabertura.id,
                'chamado_reaberto': {
                    'id': reabertura.chamado_reaberto.id,
                    'codigo': reabertura.chamado_reaberto.codigo,
                    'protocolo': reabertura.chamado_reaberto.protocolo,
                    'status': reabertura.chamado_reaberto.status
                },
                'usuario': {
                    'id': reabertura.usuario.id,
                    'nome': f"{reabertura.usuario.nome} {reabertura.usuario.sobrenome}"
                },
                'data_reabertura': reabertura.get_data_reabertura_brazil().strftime('%d/%m/%Y %H:%M:%S') if reabertura.data_reabertura else None,
                'dias_entre_chamados': reabertura.dias_entre_chamados,
                'motivo': reabertura.motivo,
                'observacoes': reabertura.observacoes,
                'status': reabertura.status
            })

        return jsonify({
            'status': 'success',
            'reaberturas': reaberturas_data,
            'total': len(reaberturas_data)
        })

    except Exception as e:
        current_app.logger.error(f"Erro ao obter reaberturas: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'Erro interno: {str(e)}'
        }), 500

@ti_bp.route('/api/chamados/<int:chamado_id>/transferir', methods=['POST'])
@login_required
@setor_required('ti')
def transferir_chamado(chamado_id):
    """Transfere um chamado para outro agente"""
    try:
        data = request.get_json()
        agente_destino_id = data.get('agente_destino_id')
        motivo = data.get('motivo', '')
        observacoes = data.get('observacoes', '')

        if not agente_destino_id:
            return jsonify({
                'status': 'error',
                'message': 'Agente de destino é obrigatório'
            }), 400

        chamado = Chamado.query.get(chamado_id)
        if not chamado:
            return jsonify({
                'status': 'error',
                'message': 'Chamado não encontrado'
            }), 404

        # Verificar se o usuário tem permissão para transferir
        if not current_user.tem_permissao('Administrador') and not current_user.eh_agente_suporte_ativo():
            return jsonify({
                'status': 'error',
                'message': 'Você não tem permissão para transferir chamados'
            }), 403

        # Verificar se o agente de destino existe e está ativo
        from database import AgenteSuporte
        agente_destino = AgenteSuporte.query.get(agente_destino_id)
        if not agente_destino or not agente_destino.ativo:
            return jsonify({
                'status': 'error',
                'message': 'Agente de destino inválido ou inativo'
            }), 400

        # Verificar se o agente pode receber mais chamados
        if not agente_destino.pode_receber_chamado():
            return jsonify({
                'status': 'error',
                'message': f'Agente {agente_destino.usuario.nome} já atingiu o limite de chamados simultâneos'
            }), 400

        # Executar transferência
        transferencia, resultado = chamado.transferir_para_agente(
            agente_id=agente_destino_id,
            usuario_transferencia_id=current_user.id,
            motivo=motivo,
            observacoes=observacoes
        )

        if transferencia:
            # Notificar via Socket.IO
            if hasattr(current_app, 'socketio'):
                current_app.socketio.emit('chamado_transferido', {
                    'chamado': {
                        'id': chamado.id,
                        'codigo': chamado.codigo,
                        'protocolo': chamado.protocolo
                    },
                    'agente_anterior': {
                        'id': transferencia.agente_anterior.id if transferencia.agente_anterior else None,
                        'nome': f"{transferencia.agente_anterior.usuario.nome} {transferencia.agente_anterior.usuario.sobrenome}" if transferencia.agente_anterior else 'Não atribuído'
                    },
                    'agente_novo': {
                        'id': agente_destino.id,
                        'nome': f"{agente_destino.usuario.nome} {agente_destino.usuario.sobrenome}"
                    },
                    'motivo': motivo
                })

            # Log da ação
            from database import registrar_log_acao
            registrar_log_acao(
                usuario_id=current_user.id,
                acao='Transferência de chamado',
                categoria='chamado',
                detalhes=f'Chamado {chamado.codigo} transferido para {agente_destino.usuario.nome}',
                recurso_afetado=chamado.id,
                tipo_recurso='chamado',
                ip_address=request.remote_addr,
                user_agent=request.headers.get('User-Agent')
            )

            return jsonify({
                'status': 'success',
                'message': resultado,
                'transferencia': {
                    'id': transferencia.id,
                    'agente_destino': {
                        'id': agente_destino.id,
                        'nome': f"{agente_destino.usuario.nome} {agente_destino.usuario.sobrenome}",
                        'email': agente_destino.usuario.email
                    },
                    'data_transferencia': transferencia.get_data_transferencia_brazil().strftime('%d/%m/%Y %H:%M:%S'),
                    'motivo': motivo
                }
            })
        else:
            return jsonify({
                'status': 'error',
                'message': resultado
            }), 400

    except Exception as e:
        current_app.logger.error(f"Erro ao transferir chamado: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'Erro interno: {str(e)}'
        }), 500

@ti_bp.route('/api/chamados/<int:chamado_id>/transferencias', methods=['GET'])
@login_required
@setor_required('ti')
def obter_transferencias(chamado_id):
    """Obtém histórico de transferências de um chamado"""
    try:
        chamado = Chamado.query.get(chamado_id)
        if not chamado:
            return jsonify({
                'status': 'error',
                'message': 'Chamado não encontrado'
            }), 404

        # Verificar permissões
        if not current_user.tem_permissao('Administrador') and not current_user.eh_agente_suporte_ativo():
            return jsonify({
                'status': 'error',
                'message': 'Sem permissão para visualizar histórico de transferências'
            }), 403

        transferencias = chamado.get_historico_transferencias()

        transferencias_data = []
        for transferencia in transferencias:
            transferencias_data.append({
                'id': transferencia.id,
                'data_transferencia': transferencia.get_data_transferencia_brazil().strftime('%d/%m/%Y %H:%M:%S'),
                'agente_anterior': {
                    'id': transferencia.agente_anterior.id if transferencia.agente_anterior else None,
                    'nome': f"{transferencia.agente_anterior.usuario.nome} {transferencia.agente_anterior.usuario.sobrenome}" if transferencia.agente_anterior else 'Não atribuído',
                    'email': transferencia.agente_anterior.usuario.email if transferencia.agente_anterior else None
                },
                'agente_novo': {
                    'id': transferencia.agente_novo.id if transferencia.agente_novo else None,
                    'nome': f"{transferencia.agente_novo.usuario.nome} {transferencia.agente_novo.usuario.sobrenome}" if transferencia.agente_novo else 'Não atribuído',
                    'email': transferencia.agente_novo.usuario.email if transferencia.agente_novo else None
                },
                'usuario_transferencia': {
                    'id': transferencia.usuario_transferencia.id,
                    'nome': f"{transferencia.usuario_transferencia.nome} {transferencia.usuario_transferencia.sobrenome}"
                },
                'motivo_transferencia': transferencia.motivo_transferencia,
                'observacoes': transferencia.observacoes,
                'tipo_transferencia': transferencia.tipo_transferencia,
                'status_anterior': transferencia.status_anterior,
                'status_novo': transferencia.status_novo,
                'prioridade_anterior': transferencia.prioridade_anterior,
                'prioridade_nova': transferencia.prioridade_nova,
                'tempo_entre_transferencias': transferencia.get_tempo_entre_transferencia()
            })

        return jsonify({
            'status': 'success',
            'transferencias': transferencias_data,
            'total': len(transferencias_data),
            'chamado': {
                'id': chamado.id,
                'codigo': chamado.codigo,
                'numero_transferencias': chamado.numero_transferencias,
                'agente_atual': {
                    'id': chamado.agente_atual_id,
                    'nome': f"{chamado.agente_atribuido[0].agente.usuario.nome} {chamado.agente_atribuido[0].agente.usuario.sobrenome}" if chamado.agente_atribuido else None
                } if chamado.agente_atual_id else None
            }
        })

    except Exception as e:
        current_app.logger.error(f"Erro ao obter transferências: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'Erro interno: {str(e)}'
        }), 500

@ti_bp.route('/api/agentes/disponiveis', methods=['GET'])
@login_required
@setor_required('ti')
def obter_agentes_disponiveis():
    """Obtém lista de agentes disponíveis para transferência"""
    try:
        if not current_user.tem_permissao('Administrador') and not current_user.eh_agente_suporte_ativo():
            return jsonify({
                'status': 'error',
                'message': 'Sem permissão para visualizar agentes'
            }), 403

        from database import AgenteSuporte
        agentes = AgenteSuporte.query.filter_by(ativo=True).all()

        agentes_data = []
        for agente in agentes:
            chamados_ativos = agente.get_chamados_ativos()
            pode_receber = agente.pode_receber_chamado()

            agentes_data.append({
                'id': agente.id,
                'usuario': {
                    'id': agente.usuario.id,
                    'nome': f"{agente.usuario.nome} {agente.usuario.sobrenome}",
                    'email': agente.usuario.email
                },
                'nivel_experiencia': agente.nivel_experiencia,
                'especialidades': agente.especialidades_list,
                'chamados_ativos': chamados_ativos,
                'max_chamados_simultaneos': agente.max_chamados_simultaneos,
                'pode_receber_chamado': pode_receber,
                'disponibilidade_percentual': round((1 - (chamados_ativos / agente.max_chamados_simultaneos)) * 100, 1) if agente.max_chamados_simultaneos > 0 else 0
            })

        # Ordenar por disponibilidade
        agentes_data.sort(key=lambda x: x['disponibilidade_percentual'], reverse=True)

        return jsonify({
            'status': 'success',
            'agentes': agentes_data,
            'total': len(agentes_data)
        })

    except Exception as e:
        current_app.logger.error(f"Erro ao obter agentes disponíveis: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'Erro interno: {str(e)}'
        }), 500
