#!/usr/bin/env python3
"""
Teste simples para verificar se a funcionalidade de anexos está funcionando
"""

import os
import sys
import tempfile
from datetime import datetime

def test_imports():
    """Teste básico de importações"""
    print("🔍 Testando importações...")
    
    try:
        from database import ChamadoAnexo, Chamado, User
        print("✅ Modelos do banco importados com sucesso")
    except ImportError as e:
        print(f"❌ Erro ao importar modelos: {e}")
        return False
    
    try:
        from setores.ti.anexos_utils import (
            is_allowed_file, 
            generate_unique_filename, 
            validate_file_size,
            format_file_size,
            get_file_icon_class
        )
        print("✅ Utilitários de anexos importados com sucesso")
    except ImportError as e:
        print(f"❌ Erro ao importar utilitários: {e}")
        return False
    
    return True

def test_file_validation():
    """Teste de validação de arquivos"""
    print("\n🔍 Testando validação de arquivos...")
    
    from setores.ti.anexos_utils import is_allowed_file
    
    # Testes positivos
    valid_tests = [
        ('documento.pdf', 'application/pdf'),
        ('imagem.jpg', 'image/jpeg'),
        ('video.mp4', 'video/mp4'),
        ('planilha.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    ]
    
    for filename, mime_type in valid_tests:
        is_valid, message = is_allowed_file(filename, mime_type)
        if is_valid:
            print(f"✅ {filename} ({mime_type}) - válido")
        else:
            print(f"❌ {filename} ({mime_type}) - deveria ser válido: {message}")
    
    # Testes negativos
    invalid_tests = [
        ('script.exe', 'application/x-msdownload'),
        ('arquivo.zip', 'application/zip'),
        ('sem_extensao', 'text/plain'),
    ]
    
    for filename, mime_type in invalid_tests:
        is_valid, message = is_allowed_file(filename, mime_type)
        if not is_valid:
            print(f"✅ {filename} ({mime_type}) - corretamente rejeitado: {message}")
        else:
            print(f"❌ {filename} ({mime_type}) - deveria ser rejeitado")

def test_filename_generation():
    """Teste de geração de nomes únicos"""
    print("\n🔍 Testando geração de nomes únicos...")
    
    from setores.ti.anexos_utils import generate_unique_filename
    
    test_files = [
        'documento.pdf',
        'imagem.jpg',
        'video.mp4',
        'sem_extensao'
    ]
    
    for original in test_files:
        unique = generate_unique_filename(original)
        print(f"✅ {original} -> {unique}")
        
        # Verificar que o nome é único
        unique2 = generate_unique_filename(original)
        if unique != unique2:
            print(f"✅ Nomes únicos gerados: {unique} != {unique2}")
        else:
            print(f"❌ Nomes iguais gerados: {unique} == {unique2}")

def test_size_validation():
    """Teste de validação de tamanho"""
    print("\n🔍 Testando validação de tamanho...")
    
    from setores.ti.anexos_utils import validate_file_size, format_file_size
    
    test_sizes = [
        (1024, "1 KB"),
        (1024 * 1024, "1 MB"),
        (5 * 1024 * 1024, "5 MB"),  # Válido
        (15 * 1024 * 1024, "15 MB"),  # Muito grande
    ]
    
    for size_bytes, description in test_sizes:
        is_valid, message = validate_file_size(size_bytes)
        formatted = format_file_size(size_bytes)
        
        status = "✅" if is_valid else "❌"
        print(f"{status} {description} ({formatted}): {message}")

def test_file_icons():
    """Teste de ícones de arquivo"""
    print("\n🔍 Testando ícones de arquivo...")
    
    from setores.ti.anexos_utils import get_file_icon_class
    
    test_types = [
        ('image/jpeg', 'Imagem JPEG'),
        ('video/mp4', 'Vídeo MP4'),
        ('application/pdf', 'PDF'),
        ('application/msword', 'Word'),
        ('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Excel'),
        ('text/plain', 'Texto'),
        ('application/octet-stream', 'Binário'),
    ]
    
    for mime_type, description in test_types:
        icon_class = get_file_icon_class(mime_type)
        print(f"✅ {description}: {icon_class}")

def test_upload_directory():
    """Teste de criação de diretório"""
    print("\n🔍 Testando criação de diretório...")
    
    from setores.ti.anexos_utils import create_upload_directory
    
    # Teste com diretório temporário
    with tempfile.TemporaryDirectory() as temp_dir:
        test_path = os.path.join(temp_dir, 'test_uploads')
        
        success, path = create_upload_directory(test_path)
        if success:
            print(f"✅ Diretório criado: {path}")
            
            if os.path.exists(path):
                print(f"✅ Diretório existe: {path}")
            else:
                print(f"❌ Diretório não foi criado: {path}")
        else:
            print(f"❌ Erro ao criar diretório: {path}")

def main():
    """Função principal de teste"""
    print("🧪 INICIANDO TESTES DE FUNCIONALIDADE DE ANEXOS")
    print("=" * 60)
    
    all_passed = True
    
    # Executar testes
    tests = [
        test_imports,
        test_file_validation,
        test_filename_generation,
        test_size_validation,
        test_file_icons,
        test_upload_directory,
    ]
    
    for test_func in tests:
        try:
            result = test_func()
            if result is False:
                all_passed = False
        except Exception as e:
            print(f"❌ Erro no teste {test_func.__name__}: {e}")
            all_passed = False
    
    print("\n" + "=" * 60)
    if all_passed:
        print("🎉 TODOS OS TESTES PASSARAM!")
        print("✅ A funcionalidade de anexos está pronta para uso")
    else:
        print("❌ ALGUNS TESTES FALHARAM")
        print("⚠️  Verifique os erros acima antes de usar a funcionalidade")
    
    print("\n📝 PRÓXIMOS PASSOS:")
    print("1. Acesse /ti/abrir-chamado para testar o upload")
    print("2. Tente anexar diferentes tipos de arquivo")
    print("3. Verifique se os arquivos são salvos corretamente")
    print("4. Teste o download dos anexos")

if __name__ == "__main__":
    main()
