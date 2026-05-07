#!/usr/bin/env python3
"""
Script para configurar banco de dados PostgreSQL 18 local para MAVO.AI
Executa via pgAdmin ou conexão direta.
"""

import subprocess
import sys
import os
from pathlib import Path

def run_sql_file(host, port, user, password, database, sql_file):
    """Executa arquivo SQL via psql."""
    print(f"Executando {sql_file}...")
    
    # Comando psql
    cmd = [
        'psql',
        f'host={host}',
        f'port={port}',
        f'user={user}',
        f'dbname={database}',
        '-f', str(sql_file)
    ]
    
    # Configurar senha como variável de ambiente
    env = os.environ.copy()
    env['PGPASSWORD'] = password
    
    try:
        result = subprocess.run(cmd, env=env, capture_output=True, text=True)
        if result.returncode == 0:
            print(f"✓ {sql_file} executado com sucesso")
            if result.stdout:
                print(result.stdout)
            return True
        else:
            print(f"✗ Erro ao executar {sql_file}:")
            print(result.stderr)
            return False
    except FileNotFoundError:
        print("✗ psql não encontrado. Instale o PostgreSQL client ou execute manualmente no pgAdmin.")
        return False

def test_connection(host, port, user, password, database):
    """Testa conexão com PostgreSQL."""
    print(f"Testando conexão com {host}:{port}/{database}...")
    
    cmd = [
        'psql',
        f'host={host}',
        f'port={port}',
        f'user={user}',
        f'dbname={database}',
        '-c', 'SELECT version();'
    ]
    
    env = os.environ.copy()
    env['PGPASSWORD'] = password
    
    try:
        result = subprocess.run(cmd, env=env, capture_output=True, text=True)
        if result.returncode == 0:
            print(f"✓ Conexão estabelecida: {result.stdout.strip()}")
            return True
        else:
            print(f"✗ Falha na conexão: {result.stderr}")
            return False
    except FileNotFoundError:
        print("✗ psql não encontrado")
        return False

def create_database(host, port, user, password, database):
    """Cria banco de dados se não existir."""
    print(f"Criando banco de dados '{database}'...")
    
    # Primeiro conecta ao postgres padrão para criar o banco
    cmd = [
        'psql',
        f'host={host}',
        f'port={port}',
        f'user={user}',
        'dbname=postgres',
        '-c', f'CREATE DATABASE {database};'
    ]
    
    env = os.environ.copy()
    env['PGPASSWORD'] = password
    
    try:
        result = subprocess.run(cmd, env=env, capture_output=True, text=True)
        if result.returncode == 0:
            print(f"✓ Banco '{database}' criado com sucesso")
            return True
        else:
            # Banco pode já existir
            if "already exists" in result.stderr:
                print(f"✓ Banco '{database}' já existe")
                return True
            else:
                print(f"✗ Erro ao criar banco: {result.stderr}")
                return False
    except FileNotFoundError:
        print("✗ psql não encontrado")
        return False

def main():
    """Função principal."""
    print("=" * 60)
    print("CONFIGURAÇÃO POSTGRESQL 18 LOCAL - MAVO.AI")
    print("=" * 60)
    
    # Configurações padrão
    config = {
        'host': 'localhost',
        'port': '5432',
        'user': 'postgres',
        'password': '1',
        'database': 'mavoai'
    }
    
    # Verificar se temos psql
    try:
        subprocess.run(['psql', '--version'], capture_output=True, check=True)
        has_psql = True
    except (FileNotFoundError, subprocess.CalledProcessError):
        has_psql = False
        print("AVISO: psql não encontrado no PATH")
        print("Você precisará executar os scripts manualmente no pgAdmin")
    
    if has_psql:
        # Testar conexão
        if not test_connection(**config):
            print("\nNão foi possível conectar ao PostgreSQL.")
            print("Verifique:")
            print("1. PostgreSQL 18 está instalado e rodando")
            print("2. Serviço PostgreSQL está ativo")
            print("3. Usuário 'postgres' existe com senha '1'")
            print("4. Porta 5432 está aberta")
            return
        
        # Criar banco de dados
        if not create_database(**config):
            print("\nNão foi possível criar o banco de dados.")
            return
        
        # Executar scripts SQL
        script_dir = Path(__file__).parent
        sql_files = [
            script_dir / 'postgres-local-setup.sql'
        ]
        
        print("\nExecutando scripts SQL...")
        for sql_file in sql_files:
            if sql_file.exists():
                if not run_sql_file(**config, sql_file=sql_file):
                    print(f"\nFalha ao executar {sql_file.name}")
                    return
            else:
                print(f"✗ Arquivo não encontrado: {sql_file}")
    
    # Instruções para execução manual
    print("\n" + "=" * 60)
    print("INSTRUÇÕES PARA CONFIGURAÇÃO MANUAL NO PGADMIN:")
    print("=" * 60)
    print("\n1. Abra o pgAdmin 4")
    print("2. Conecte-se ao servidor PostgreSQL 18")
    print("3. Clique com botão direito em 'Databases' → 'Create' → 'Database'")
    print("4. Nome: mavoai, Owner: postgres")
    print("5. Clique com botão direito no banco 'mavoai' → 'Query Tool'")
    print("6. Execute os scripts na ordem:")
    print("   a) scripts/postgres-local-setup.sql")
    
    print("\n" + "=" * 60)
    print("CONFIGURAÇÃO DO .ENV.LOCAL:")
    print("=" * 60)
    print("\nEdite ou crie o arquivo .env.local com:")
    print("""
DATABASE_URL=postgresql://postgres:1@localhost:5432/mavoai
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Chat IA (Groq)
AI_BASE_URL=https://api.groq.com/openai/v1
AI_API_KEY=sua-chave-groq-aqui
AI_CHAT_MODEL=openai/gpt-oss-120b

# Chamadas internas
NEXT_PUBLIC_BASE_URL=http://localhost:3000
""")
    
    print("\n" + "=" * 60)
    print("PRÓXIMOS PASSOS:")
    print("=" * 60)
    print("1. Execute: npm install")
    print("2. Execute: npm run dev")
    print("3. Acesse: http://localhost:3000")
    print("4. Teste: http://localhost:3000/api/health")

if __name__ == '__main__':
    main()