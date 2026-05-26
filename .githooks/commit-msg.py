#!/usr/bin/env python
# -*- coding: utf-8 -*-
# .githooks/commit-msg.py
# Hook de commit-msg multiplataforma em Python para garantir conformidade do GSD Flow.

import sys
import re
import os

# Configuração de encoding padrão UTF-8 para evitar problemas no Windows
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

# Regex do Conventional Commit com ID de Observação mandatário [OBS-YYYYMMDD-NN]
# Exemplos válidos:
# feat(auth): [OBS-20260525-01] adiciona login social
# fix: [OBS-20260525-02] corrige vazamento de conexao
COMMIT_PATTERN = r"^(feat|fix|refactor|docs|test|chore|ci|perf|style)(\([a-z0-9_-]+\))?:\s+\[OBS-\d{8}-\d{2}\]\s+.+$"

def main():
    if len(sys.argv) < 2:
        print("⚠️ Erro: Caminho do arquivo de mensagem de commit não fornecido.", file=sys.stderr)
        sys.exit(1)

    commit_msg_filepath = sys.argv[1]
    
    if not os.path.exists(commit_msg_filepath):
        print(f"⚠️ Erro: Arquivo de mensagem de commit não encontrado em '{commit_msg_filepath}'.", file=sys.stderr)
        sys.exit(1)

    try:
        with open(commit_msg_filepath, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()
        
        # Filtra linhas vazias e comentários do git (que começam com #)
        commit_lines = [line.strip() for line in lines if line.strip() and not line.startswith('#')]
        
        if not commit_lines:
            print("🚫 BLOCKED: A mensagem de commit está vazia.", file=sys.stderr)
            sys.exit(1)
            
        commit_msg = commit_lines[0]
        
        # Validação do padrão convencional + ID de observação
        if not re.match(COMMIT_PATTERN, commit_msg, re.IGNORECASE):
            print("\n" + "="*70, file=sys.stderr)
            print("🚫 BLOCKED: Mensagem de commit fora do padrão Anti-Vibe / GSD Flow!", file=sys.stderr)
            print("="*70, file=sys.stderr)
            print("O padrão correto exige Conventional Commit + ID de Observação [OBS-YYYYMMDD-NN].", file=sys.stderr)
            print("\nExemplos válidos:", file=sys.stderr)
            print("  feat(escopo): [OBS-20260525-01] adiciona validação de login", file=sys.stderr)
            print("  fix: [OBS-20260525-02] corrige estouro de pilha", file=sys.stderr)
            print("  docs(readme): [OBS-20260525-03] atualiza guia de setup", file=sys.stderr)
            print("\nTipos permitidos: feat, fix, refactor, docs, test, chore, ci, perf, style", file=sys.stderr)
            print("="*70 + "\n", file=sys.stderr)
            sys.exit(1)
            
        print("✅ Mensagem de commit validada com sucesso pelo dodo-starter-pack!")
        sys.exit(0)

    except Exception as e:
        print(f"⚠️ Erro ao validar mensagem de commit: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
