// Teste rápido do sistema MAVO.AI
const { Pool } = require('pg');

console.log('='.repeat(60));
console.log('🧪 TESTE RÁPIDO MAVO.AI - VERIFICAÇÃO DO SISTEMA');
console.log('='.repeat(60));

// Testar conexão com PostgreSQL
async function testarPostgreSQL() {
  console.log('\n1. 🔗 Testando conexão PostgreSQL...');
  
  const pool = new Pool({
    connectionString: 'postgresql://postgres:1@localhost:5432/mavoai'
  });
  
  try {
    const client = await pool.connect();
    
    // Testar tabelas
    const tabelas = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log(`   ✅ Tabelas encontradas: ${tabelas.rows.length}`);
    tabelas.rows.forEach(t => console.log(`      📋 ${t.table_name}`));
    
    // Testar funções de busca
    const funcoes = await client.query(`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_schema = 'public' 
      AND routine_name LIKE 'buscar_atendimentos_%'
    `);
    
    console.log(`\n   🔍 Funções de busca: ${funcoes.rows.length}`);
    funcoes.rows.forEach(f => console.log(`      🔎 ${f.routine_name}`));
    
    // Testar busca simples
    console.log('\n   🧪 Testando busca por "sistema"...');
    const busca = await client.query(`
      SELECT * FROM buscar_atendimentos_simples('sistema', 2)
    `);
    
    console.log(`      📊 Resultados: ${busca.rows.length}`);
    if (busca.rows.length > 0) {
      busca.rows.forEach((r, i) => {
        console.log(`      ${i+1}. ${r.resumo_problema?.substring(0, 50)}...`);
      });
    }
    
    // Dashboard
    console.log('\n   📈 Dashboard metrics:');
    const dashboard = await client.query('SELECT * FROM dashboard_metrics');
    const metrics = dashboard.rows[0];
    console.log(`      👥 Clientes únicos: ${metrics.clientes_unicos}`);
    console.log(`      👨‍💻 Técnicos ativos: ${metrics.tecnicos_ativos}`);
    console.log(`      📋 Total atendimentos: ${metrics.total_atendimentos}`);
    
    client.release();
    await pool.end();
    
    return true;
  } catch (error) {
    console.log(`   ❌ Erro PostgreSQL: ${error.message}`);
    return false;
  }
}

// Testar se o servidor Next.js está rodando
async function testarServidorNext() {
  console.log('\n2. 🌐 Testando servidor Next.js...');
  
  try {
    // Tentar várias portas
    const ports = [3000, 3001, 3002, 3003];
    
    for (const port of ports) {
      try {
        const { execSync } = require('child_process');
        const result = execSync(`curl -s -o /dev/null -w "%{http_code}" http://localhost:${port}/api/health || echo "FAIL"`, { 
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore']
        }).trim();
        
        if (result === '200' || result === 'OK') {
          console.log(`   ✅ Servidor rodando na porta ${port}`);
          console.log(`      🔗 Health check: http://localhost:${port}/api/health`);
          console.log(`      🌐 Interface: http://localhost:${port}`);
          return port;
        }
      } catch {
        // Porta não responde, continuar
      }
    }
    
    console.log('   ⚠️  Servidor Next.js não encontrado nas portas 3000-3003');
    console.log('      Execute: npm run dev');
    return null;
  } catch (error) {
    console.log(`   ❌ Erro: ${error.message}`);
    return null;
  }
}

// Testar configuração do projeto
function testarConfiguracao() {
  console.log('\n3. ⚙️  Verificando configuração do projeto...');
  
  try {
    const fs = require('fs');
    const path = require('path');
    
    // Verificar arquivos essenciais
    const arquivos = [
      '.env.local',
      'package.json',
      'app/page.tsx',
      'lib/database/postgres-client-no-vector.ts'
    ];
    
    let arquivosOk = 0;
    arquivos.forEach(arquivo => {
      if (fs.existsSync(path.join(__dirname, arquivo))) {
        console.log(`   ✅ ${arquivo}`);
        arquivosOk++;
      } else {
        console.log(`   ❌ ${arquivo} (não encontrado)`);
      }
    });
    
    // Verificar dependências
    console.log(`\n   📦 Dependências: ${arquivosOk}/${arquivos.length} arquivos OK`);
    
    return arquivosOk === arquivos.length;
  } catch (error) {
    console.log(`   ❌ Erro: ${error.message}`);
    return false;
  }
}

// Executar todos os testes
async function executarTestes() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 EXECUTANDO TESTES COMPLETOS...');
  console.log('='.repeat(60));
  
  const resultados = {
    postgres: await testarPostgreSQL(),
    servidor: await testarServidorNext(),
    config: testarConfiguracao()
  };
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMO DOS TESTES:');
  console.log('='.repeat(60));
  
  console.log(`\n✅ PostgreSQL: ${resultados.postgres ? 'CONECTADO' : 'FALHOU'}`);
  console.log(`✅ Servidor Next.js: ${resultados.servidor ? `RODANDO (porta ${resultados.servidor})` : 'NÃO ENCONTRADO'}`);
  console.log(`✅ Configuração: ${resultados.config ? 'OK' : 'PROBLEMAS'}`);
  
  console.log('\n' + '='.repeat(60));
  
  if (resultados.postgres && resultados.config) {
    if (resultados.servidor) {
      console.log('🎉 MAVO.AI 100% OPERACIONAL!');
      console.log('\n🔗 ACESSE AGORA:');
      console.log(`   Interface: http://localhost:${resultados.servidor}`);
      console.log(`   API Health: http://localhost:${resultados.servidor}/api/health`);
    } else {
      console.log('⚠️  BANCO CONFIGURADO, MAS SERVIDOR NÃO ESTÁ RODANDO');
      console.log('\n🚀 PARA INICIAR:');
      console.log('   cd C:\\willydev\\chat-inteligente');
      console.log('   npm run dev');
      console.log('\n📌 O servidor iniciará na porta 3000 ou 3001');
    }
  } else {
    console.log('❌ PROBLEMAS DETECTADOS');
    console.log('\n🔧 SOLUÇÃO:');
    
    if (!resultados.postgres) {
      console.log('   • Execute no pgAdmin: scripts/MAVOAI_DEFINITIVO.sql');
      console.log('   • Verifique conexão: postgres/1@localhost:5432/mavoai');
    }
    
    if (!resultados.config) {
      console.log('   • Verifique se os arquivos do projeto estão completos');
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('🧠 MAVO.AI - Cérebro operacional pronto para aprender!');
  console.log('='.repeat(60));
}

// Executar
executarTestes().catch(console.error);
