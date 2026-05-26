#!/usr/bin/env python
# -*- coding: utf-8 -*-
# .githooks/pre-commit.py
# Hook de pré-commit multiplataforma em Python para segurança e conformidade.

import sys
import subprocess
import re
import os

# Configuração de encoding padrão UTF-8 para evitar problemas no Windows
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

# Padrões de segredos a serem bloqueados
SECRET_PATTERNS = {
    "AWS Access Key": r"AKIA[0-9A-Z]{16}",
    "AWS Secret Access Key": r"aws_secret_access_key\s*=\s*[A-Za-z0-9/+=]{40}",
    "GitHub Personal Access Token": r"gh[p|o|u|s]_[A-Za-z0-9]{36}",
    "Anthropic API Key": r"sk-ant-api[0-9]{2}-[A-Za-z0-9_-]{90,}",
    "OpenAI API Key": r"sk-(proj-)?[A-Za-z0-9]{40,}",
    "Private Key (SSH/RSA)": r"-----BEGIN [A-Z ]+ PRIVATE KEY-----",
}

# Padrões de arquivos protegidos (nunca devem ser commitados)
PROTECTED_PATHS = [
    r"\.env$",
    r"\.env\.",
    r"secrets/.*",
    r"credentials\.json$",
    r"service-account.*\.json$",
]

def get_staged_files():
    """Retorna a lista de arquivos no stage (staged)."""
    try:
        result = subprocess.run(
            ["git", "diff", "--cached", "--name-only", "--diff-filter=ACM"],
            capture_output=True,
            text=True,
            check=True
        )
        return [f.strip() for f in result.stdout.splitlines() if f.strip()]
    except Exception as e:
        print(f"⚠️ Erro ao listar arquivos do git diff: {e}", file=sys.stderr)
        return []

def scan_file(filepath):
    """Varre um arquivo em busca de segredos e caminhos protegidos."""
    # Verifica se o arquivo é um caminho protegido
    for path_pattern in PROTECTED_PATHS:
        if re.search(path_pattern, filepath):
            print(f"🚫 BLOCKED: O arquivo '{filepath}' está em um caminho protegido e não pode ser commitado.", file=sys.stderr)
            return False

    if not os.path.isfile(filepath):
        return True

    # Ignora arquivos binários grandes ou arquivos de lock
    if filepath.endswith(('.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.tar.gz', '-lock.json', '.lock')):
        return True

    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()

        for name, pattern in SECRET_PATTERNS.items():
            if re.search(pattern, content):
                # Encontrou possível segredo!
                print(f"🚫 BLOCKED: Possível segredo do tipo '{name}' detectado em: {filepath}", file=sys.stderr)
                print("Por favor, remova o segredo ou coloque-o em arquivos .env (ignorado pelo git).", file=sys.stderr)
                return False
    except Exception as e:
        print(f"⚠️ Erro ao ler arquivo {filepath}: {e}", file=sys.stderr)

    return True

def main():
    staged_files = get_staged_files()
    if not staged_files:
        sys.exit(0)

    success = True
    for file in staged_files:
        if not scan_file(file):
            success = False

    if not success:
        print("\n🛑 Commit cancelado por questões de segurança (pre-commit hook).", file=sys.stderr)
        print("Caso seja um falso-positivo e você precise commitar mesmo assim, use: git commit --no-verify", file=sys.stderr)
        sys.exit(1)

    sys.exit(0)

if __name__ == "__main__":
    main()
