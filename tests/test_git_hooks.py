# -*- coding: utf-8 -*-
# tests/test_git_hooks.py
# Suíte de testes unitários para os hooks do dodo-starter-pack

import sys
import os
import pytest
import re

# Adiciona o diretório .githooks ao path para permitir importação direta
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '.githooks')))

import importlib
pre_commit = importlib.import_module("pre-commit")
commit_msg = importlib.import_module("commit-msg")

# ==========================================
# 1. Testes para pre-commit.py
# ==========================================

@pytest.mark.parametrize("secret, expected", [
    ("AKIA1234567890ABCDEF", True),                                             # AWS Access Key
    ("aws_secret_access_key = aBcdEfGhIjKlMnOpQrStUvWxYz0123456789aBcd", True), # AWS Secret
    ("sk-ant-api03-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890_abcdefghijklmnopqrstuvwxyz1", True), # Anthropic
    ("sk-proj-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ", True),               # OpenAI Modern Key
    ("ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ", True),                         # GitHub PAT
    ("-----BEGIN RSA PRIVATE KEY-----", True),                                  # Private Key
    ("Este é um texto comum sem segredos e sem chaves de API", False),
    ("def soma(a, b): return a + b", False),
])
def test_pre_commit_secret_detection(secret, expected):
    """Garante que segredos reais sejam casados pelas regexes de segurança."""
    matched = False
    for name, pattern in pre_commit.SECRET_PATTERNS.items():
        if re.search(pattern, secret):
            matched = True
            break
    assert matched == expected


@pytest.mark.parametrize("filepath, expected", [
    (".env", False),
    (".env.production", False),
    ("secrets/credentials.json", False),
    ("service-account.json", False),
    ("src/index.js", True),
    ("main.py", True),
    ("styles/style.css", True),
    ("templates/index.html", True),
])
def test_pre_commit_protected_paths(filepath, expected):
    """Valida se caminhos protegidos e secretos são interceptados de forma correta."""
    # Simula a validação de caminhos protegidos no pre-commit
    is_allowed = True
    for path_pattern in pre_commit.PROTECTED_PATHS:
        if re.search(path_pattern, filepath):
            is_allowed = False
            break
    assert is_allowed == expected


# ==========================================
# 2. Testes para commit-msg.py
# ==========================================

@pytest.mark.parametrize("msg, expected", [
    ("feat(api): [OBS-20260525-01] adiciona validação de login", True),
    ("fix: [OBS-20260525-02] corrige vazamento de memoria", True),
    ("chore(deps): [OBS-20260525-03] atualiza pacotes", True),
    ("docs: [OBS-20260525-99] atualiza manual de onboarding", True),
    ("refactor(core): [OBS-12345678-01] limpa imports nao utilizados", True),
    
    # Falhas induzidas (sem ID, formato errado)
    ("feat(api): adiciona validação de login", False),                        # Sem OBS ID
    ("fix: [OBS-20260525-01]", False),                                         # Sem mensagem
    ("ajuste de bugs diversos [OBS-20260525-01]", False),                       # Sem Conventional Commit prefix
    ("invalid_prefix: [OBS-20260525-01] teste de prefixo", False),              # Prefixo inválido
    ("feat: [OBS-2026052-01] ano do ID inválido (7 dígitos)", False),           # ID inválido
])
def test_commit_msg_validation(msg, expected):
    """Valida se o formato Conventional Commit + ID de Observação é rigidamente exigido."""
    matched = bool(re.match(commit_msg.COMMIT_PATTERN, msg, re.IGNORECASE))
    assert matched == expected
