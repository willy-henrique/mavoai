#!/usr/bin/env node
// ============================================================
// apply-all.js — Aplica todos os scripts SQL do Mavo.AI
// Uso: node training/apply-all.js
// Requer: pg instalado (já está no package.json)
// ============================================================

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Lê .env.local automaticamente
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    // fallback .env
    const fallback = path.join(__dirname, '..', '.env');
    if (fs.existsSync(fallback)) return parseEnv(fs.readFileSync(fallback, 'utf8'));
    return;
  }
  parseEnv(fs.readFileSync(envPath, 'utf8'));
}

function parseEnv(content) {
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:1@localhost:5434/mavoai';

// Scripts em ordem de aplicação
const SCRIPTS = [
  { file: path.join(__dirname, '..', 'scripts', '000_SETUP_COMPLETO.sql'),    name: '000 — Schema completo (tabelas, índices, extensões)' },
  { file: path.join(__dirname, '..', 'scripts', '012_specialist_agents.sql'), name: '012 — Tabela specialist_agents + seed agentes' },
  { file: path.join(__dirname, '..', 'scripts', '013_agent_prompts.sql'),     name: '013 — System prompts dos 6 agentes (v2 com docs reais)' },
  { file: path.join(__dirname, 'seed-cases-all.sql'),                          name: 'seed-cases-all — 25+ casos gerais de treinamento' },
  { file: path.join(__dirname, 'seed-cases-tillit.sql'),                       name: 'seed-cases-tillit — 20 casos técnicos TillitPDV' },
];

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE   = '\x1b[34m';
const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';

async function run() {
  console.log(`\n${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  console.log(`${BOLD}  Mavo.AI — Aplicação de Scripts SQL${RESET}`);
  console.log(`${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n`);
  console.log(`${YELLOW}Banco:${RESET} ${DATABASE_URL.replace(/:([^@]+)@/, ':***@')}\n`);

  const client = new Client({ connectionString: DATABASE_URL });

  try {
    console.log('Conectando ao banco...');
    await client.connect();
    console.log(`${GREEN}✓ Conectado com sucesso!${RESET}\n`);
  } catch (err) {
    console.error(`${RED}✗ Erro ao conectar: ${err.message}${RESET}`);
    console.error(`\nVerifique se o Docker está rodando: docker ps | grep mavoai`);
    process.exit(1);
  }

  let success = 0;
  let failed = 0;

  for (const script of SCRIPTS) {
    process.stdout.write(`Aplicando: ${script.name}...`);

    if (!fs.existsSync(script.file)) {
      console.log(` ${YELLOW}IGNORADO${RESET} (arquivo não encontrado: ${path.basename(script.file)})`);
      continue;
    }

    const sql = fs.readFileSync(script.file, 'utf8');

    try {
      await client.query(sql);
      console.log(` ${GREEN}✓ OK${RESET}`);
      success++;
    } catch (err) {
      console.log(` ${RED}✗ ERRO${RESET}`);
      console.error(`   ${RED}${err.message}${RESET}`);
      failed++;
    }
  }

  // Verificação final
  console.log(`\n${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  console.log(`${BOLD}  Verificação do estado final${RESET}`);
  console.log(`${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n`);

  try {
    // Agentes
    const agentes = await client.query(`
      SELECT domain, name, is_active,
             length(system_prompt) as prompt_chars
      FROM public.specialist_agents
      WHERE tenant_id = 'auge'
      ORDER BY domain
    `);
    console.log(`${BOLD}Agentes especialistas (${agentes.rowCount} encontrados):${RESET}`);
    for (const r of agentes.rows) {
      const status = r.is_active ? GREEN + '●' + RESET : RED + '○' + RESET;
      const chars = r.prompt_chars > 500 ? GREEN + r.prompt_chars + ' chars' + RESET : RED + r.prompt_chars + ' chars (vazio!)' + RESET;
      console.log(`  ${status} ${r.domain.padEnd(12)} | ${r.name.padEnd(25)} | ${chars}`);
    }

    // Casos de treinamento
    const casos = await client.query(`
      SELECT canal, COUNT(*) as total, COUNT(DISTINCT categoria) as categorias
      FROM public.atendimentos
      WHERE canal IN ('seed_training', 'seed_tillit')
      GROUP BY canal
      ORDER BY canal
    `);
    console.log(`\n${BOLD}Casos de treinamento:${RESET}`);
    if (casos.rowCount === 0) {
      console.log(`  ${YELLOW}Nenhum caso seed encontrado — tabela atendimentos pode não existir ainda${RESET}`);
    } else {
      for (const r of casos.rows) {
        console.log(`  ${GREEN}●${RESET} ${r.canal.padEnd(16)} | ${r.total} casos | ${r.categorias} categorias`);
      }
    }

    // Total geral
    try {
      const total = await client.query(`SELECT COUNT(*) FROM public.atendimentos`);
      console.log(`\n  Total na tabela atendimentos: ${BOLD}${total.rows[0].count}${RESET} registros`);
    } catch (e) {
      console.log(`\n  ${YELLOW}Tabela atendimentos ainda não existe — rode os scripts de criação de schema primeiro${RESET}`);
    }

  } catch (err) {
    console.error(`${YELLOW}Aviso na verificação: ${err.message}${RESET}`);
  }

  await client.end();

  console.log(`\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  if (failed === 0) {
    console.log(`${BOLD}${GREEN}  ✓ Tudo aplicado com sucesso! (${success}/${SCRIPTS.length} scripts)${RESET}`);
  } else {
    console.log(`${BOLD}${YELLOW}  ⚠ Concluído com erros: ${success} OK, ${failed} com falha${RESET}`);
  }
  console.log(`${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n`);
}

run().catch(err => {
  console.error(`\n${RED}Erro fatal: ${err.message}${RESET}`);
  process.exit(1);
});
