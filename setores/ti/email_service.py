import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from flask import current_app
import logging
from jinja2 import Template

logger = logging.getLogger(__name__)

class EmailService:
    def __init__(self):
        self.smtp_server = os.getenv('MICROSOFT_GRAPH_SMTP_SERVER', 'smtp-mail.outlook.com')
        self.smtp_port = int(os.getenv('MICROSOFT_GRAPH_SMTP_PORT', '587'))
        self.email_username = os.getenv('MICROSOFT_GRAPH_USERNAME')
        self.email_password = os.getenv('MICROSOFT_GRAPH_PASSWORD')
        self.from_email = os.getenv('MICROSOFT_GRAPH_USERNAME')
        
    def enviar_email(self, destinatario, assunto, corpo_html, corpo_texto=None):
        """Envia um email usando as configurações do Microsoft Graph"""
        try:
            if not all([self.email_username, self.email_password]):
                logger.error("Credenciais de email não configuradas")
                return False
                
            # Criar mensagem
            msg = MIMEMultipart('alternative')
            msg['From'] = self.from_email
            msg['To'] = destinatario
            msg['Subject'] = assunto
            
            # Adicionar versão texto se fornecida
            if corpo_texto:
                parte_texto = MIMEText(corpo_texto, 'plain', 'utf-8')
                msg.attach(parte_texto)
            
            # Adicionar versão HTML
            parte_html = MIMEText(corpo_html, 'html', 'utf-8')
            msg.attach(parte_html)
            
            # Conectar e enviar
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.email_username, self.email_password)
                server.send_message(msg)
                
            logger.info(f"Email enviado com sucesso para {destinatario}")
            return True
            
        except Exception as e:
            logger.error(f"Erro ao enviar email para {destinatario}: {str(e)}")
            return False

    def notificar_agente_atribuido(self, chamado, agente):
        """Envia notificação quando um agente é atribuído a um chamado"""
        try:
            template_html = Template("""
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background-color: #007bff; color: white; padding: 20px; text-align: center; }
                    .content { background-color: #f8f9fa; padding: 20px; }
                    .info-box { background-color: white; padding: 15px; margin: 10px 0; border-left: 4px solid #007bff; }
                    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
                    .btn { background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🎯 Agente Atribuído ao Seu Chamado</h1>
                    </div>
                    
                    <div class="content">
                        <p>Olá <strong>{{ chamado.solicitante }}</strong>,</p>
                        
                        <p>Temos uma ótima notícia! Um agente de suporte foi atribuído ao seu chamado:</p>
                        
                        <div class="info-box">
                            <h3>📋 Detalhes do Chamado</h3>
                            <p><strong>Código:</strong> {{ chamado.codigo }}</p>
                            <p><strong>Protocolo:</strong> {{ chamado.protocolo }}</p>
                            <p><strong>Problema:</strong> {{ chamado.problema }}</p>
                            <p><strong>Prioridade:</strong> {{ chamado.prioridade }}</p>
                            <p><strong>Status:</strong> {{ chamado.status }}</p>
                        </div>
                        
                        <div class="info-box">
                            <h3>👨‍💻 Agente Responsável</h3>
                            <p><strong>Nome:</strong> {{ agente.nome }}</p>
                            <p><strong>Nível:</strong> {{ agente.nivel_experiencia|title }}</p>
                            <p><strong>Especialidades:</strong> {{ especialidades_texto }}</p>
                        </div>
                        
                        <div class="info-box">
                            <h3>📞 Próximos Passos</h3>
                            <p>{{ agente.nome }} irá analisar seu chamado e entrará em contato em breve. Você pode acompanhar o progresso do chamado através do sistema.</p>
                            <p>Se tiver alguma dúvida adicional ou informação que possa ajudar na resolução, responda este email.</p>
                        </div>
                        
                        <p style="text-align: center; margin: 30px 0;">
                            <a href="#" class="btn">Acompanhar Chamado</a>
                        </p>
                    </div>
                    
                    <div class="footer">
                        <p>Este é um email automático do sistema de suporte da Evoque Fitness.</p>
                        <p>Data: {{ data_atual }}</p>
                    </div>
                </div>
            </body>
            </html>
            """)
            
            # Preparar dados para o template
            especialidades_texto = ', '.join(agente.especialidades_list) if agente.especialidades_list else 'Suporte Geral'
            
            from database import get_brazil_time
            data_atual = get_brazil_time().strftime('%d/%m/%Y às %H:%M')
            
            corpo_html = template_html.render(
                chamado=chamado,
                agente=agente,
                especialidades_texto=especialidades_texto,
                data_atual=data_atual
            )
            
            # Versão texto
            corpo_texto = f"""
Olá {chamado.solicitante},

Um agente de suporte foi atribuído ao seu chamado!

DETALHES DO CHAMADO:
- Código: {chamado.codigo}
- Protocolo: {chamado.protocolo}
- Problema: {chamado.problema}
- Prioridade: {chamado.prioridade}

AGENTE RESPONSÁVEL:
- Nome: {agente.nome}
- Nível: {agente.nivel_experiencia.title()}
- Especialidades: {especialidades_texto}

{agente.nome} irá analisar seu chamado e entrará em contato em breve.

---
Sistema de Suporte Evoque Fitness
{data_atual}
            """
            
            assunto = f"🎯 Agente Atribuído - Chamado {chamado.codigo}"
            
            return self.enviar_email(chamado.email, assunto, corpo_html, corpo_texto)
            
        except Exception as e:
            logger.error(f"Erro ao gerar notificação de agente atribuído: {str(e)}")
            return False

    def enviar_email_massa(self, destinatarios, assunto, corpo_html, corpo_texto=None):
        """Envia email em massa para múltiplos destinatários"""
        sucessos = 0
        falhas = 0
        
        for destinatario in destinatarios:
            email = destinatario.get('email') if isinstance(destinatario, dict) else destinatario
            if self.enviar_email(email, assunto, corpo_html, corpo_texto):
                sucessos += 1
            else:
                falhas += 1
                
        return {'sucessos': sucessos, 'falhas': falhas}

# Instância global do serviço
email_service = EmailService()
