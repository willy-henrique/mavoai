// Teste de conexão PostgreSQL SEM extensão vector
const { Pool } = require('pg');

const config = {
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: '1',
  database: 'mavoai'
};

const pool = new Pool(config);

async function testConnection() {
  console.log('='.repeat(60));
  console.log('TESTE POSTGRESQL SEM EXTENSÃO VECTOR - MAVO.AI');
  console.log('='.repeat(60));
  console.log(`\n🔧 Conectando em: ${config.user}@${config.host}:${config.port}/${config.database}`);
  
  let client;
  try {
    client = await pool.connect();
    console.log('✅ Conexão PostgreSQL estabelecida!');
    
    // Teste 1: Versão
    const versionResult = await client.query('SELECT version()');
    console.log(`\n📊 PostgreSQL: ${versionResult.rows[0].version.split(',')[0]}`);
    
    // Teste 2: Verificar extensão vector
    const vectorResult = await client.query("SELECT * FROM pg_extension WHERE extname = 'vector'");
    if (vectorResult.rows.length > 0) {
      console.log('⚠️  Extensão "vector" ENCONTRADA (pode usar busca semântica)');
    } else {
      console.log('ℹ️  Extensão "vector" NÃO instalada (usando busca textual)');
    }
    
    // Teste 3: Verificar tabelas
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log(`\n📁 Tabelas (${tablesResult.rows.length}):`);
    const expectedTables = ['atendimentos', 'categorias', 'ingestao_logs'];
    
    tablesResult.rows.forEach(row => {
      const status = expectedTables.includes(row.table_name) ? '✅' : '❓';
      console.log(`  ${status} ${row.table_name}`);
    });
    
    // Teste 4: Verificar colunas da tabela atendimentos
    const columnsResult = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'atendimentos' 
      AND table_schema = 'public'
      ORDER BY ordinal_position
    `);
    
    console.log(`\n🔍 Colunas da tabela 'atendimentos' (${columnsResult.rows.length}):`);
    const hasEmbedding = columnsResult.rows.some(col => col.column_name === 'embedding');
    
    columnsResult.rows.forEach(col => {
      const isEmbedding = col.column_name === 'embedding';
      const status = isEmbedding ? (hasEmbedding ? '🔢' : '🚫') : '📝';
      console.log(`  ${status} ${col.column_name} (${col.data_type})`);
    });
    
    if (!hasEmbedding) {
      console.log('\n💡 SEM coluna embedding: O sistema usará busca textual');
    }
    
    // Teste 5: Verificar funções de busca
    const functionsResult = await client.query(`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_schema = 'public' 
      AND routine_name LIKE 'buscar_atendimentos_%'
    `);
    
    console.log(`\n🔎 Funções de busca (${functionsResult.rows.length}):`);
    functionsResult.rows.forEach(func => {
      console.log(`  🔍 ${func.routine_name}`);
    });
    
    // Teste 6: Contar registros
    for (const table of expectedTables) {
      try {
        const countResult = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`  📈 ${table}: ${countResult.rows[0].count} registros`);
      } catch (e) {
        // Tabela não existe
      }
    }
    
    // Teste 7: Testar busca textual
    console.log('\n🧪 Testando busca textual:');
    try {
      // Primeiro verificar se temos dados
      const hasData = await client.query('SELECT COUNT(*) as count FROM atendimentos');
      
      if (parseInt(hasData.rows[0].count) > 0) {
        // Testar busca simples
        const searchResult = await client.query(
          "SELECT * FROM buscar_atendimentos_simples('sistema', 2)"
        );
        
        if (searchResult.rows.length > 0) {
          console.log('  ✅ Busca textual funcionando!');
          console.log(`  📋 Resultados: ${searchResult.rows.length} encontrados`);
        } else {
          console.log('  ⚠️  Busca retornou 0 resultados (poucos dados?)');
        }
      } else {
        console.log('  ℹ️  Sem dados para testar busca');
      }
    } catch (error) {
      console.log(`  ❌ Erro na busca: ${error.message}`);
    }
    
    // Teste 8: Verificar views
    const viewsResult = await client.query(`
      SELECT viewname 
      FROM pg_views 
      WHERE schemaname = 'public' 
      ORDER BY viewname
    `);
    
    if (viewsResult.rows.length > 0) {
      console.log(`\n👁️  Views (${viewsResult.rows.length}):`);
      viewsResult.rows.forEach(row => {
        console.log(`  👁️  ${row.viewname}`);
      });
    }
    
    console.log('\n' + '='.repeat(60));
    
    if (!hasEmbedding && functionsResult.rows.length > 0) {
      console.log('✅ SISTEMA CONFIGURADO COM BUSCA TEXTUAL');
      console.log('='.repeat(60));
      console.log('\n🎯 Funcionalidades disponíveis:');
      console.log('  ✅ Cadastro de atendimentos');
      console.log('  ✅ Busca textual (LIKE/full-text)');
      console.log('  ✅ Dashboard com métricas');
      console.log('  ✅ Sistema de categorias');
      console.log('  ⚠️  Busca semântica (precisa instalar pgvector)');
    } else if (hasEmbedding) {
      console.log('✅ SISTEMA COM BUSCA SEMÂNTICA (VECTOR)');
    } else {
      console.log('⚠️  SISTEMA PARCIALMENTE CONFIGURADO');
      console.log('='.repeat(60));
      console.log('\nExecute o script SQL correto:');
      console.log('  scripts/setup-without-vector.sql');
    }
    
    console.log('\nPróximos passos:');
    console.log('1. Execute: npm run dev');
    console.log('2. Acesse: http://localhost:3000');
    console.log('3. Teste a busca na interface web');
    
  } catch (error) {
    console.error('\n❌ ERRO NA CONEXÃO:', error.message);
    console.log('\n🔧 Solução de problemas:');
    console.log('1. PostgreSQL está rodando?');
    console.log('2. Banco "mavoai" existe?');
    console.log('3. Execute no pgAdmin:');
    console.log('   scripts/setup-without-vector.sql');
    
    process.exit(1);
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

// Executar teste
testConnection().catch(console.error);