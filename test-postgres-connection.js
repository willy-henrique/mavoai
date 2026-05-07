// Teste de conexão PostgreSQL para MAVO.AI
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
  console.log('TESTE DE CONEXÃO POSTGRESQL - MAVO.AI');
  console.log('='.repeat(60));
  console.log(`\nTentando conectar em: ${config.user}@${config.host}:${config.port}/${config.database}`);
  
  let client;
  try {
    // Tentar conexão
    client = await pool.connect();
    console.log('✅ Conexão estabelecida com sucesso!');
    
    // Teste 1: Versão do PostgreSQL
    const versionResult = await client.query('SELECT version()');
    console.log(`\n📊 PostgreSQL: ${versionResult.rows[0].version.split(',')[0]}`);
    
    // Teste 2: Verificar extensão vector
    const vectorResult = await client.query("SELECT * FROM pg_extension WHERE extname = 'vector'");
    if (vectorResult.rows.length > 0) {
      console.log('✅ Extensão "vector" instalada (para embeddings)');
    } else {
      console.log('⚠️  Extensão "vector" não encontrada. Execute: CREATE EXTENSION IF NOT EXISTS vector;');
    }
    
    // Teste 3: Listar tabelas
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log(`\n📁 Tabelas encontradas (${tablesResult.rows.length}):`);
    const expectedTables = ['atendimentos', 'categorias', 'ingestao_logs'];
    
    tablesResult.rows.forEach(row => {
      const status = expectedTables.includes(row.table_name) ? '✅' : '❓';
      console.log(`  ${status} ${row.table_name}`);
    });
    
    // Teste 4: Contar registros
    for (const table of expectedTables) {
      try {
        const countResult = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`  📈 ${table}: ${countResult.rows[0].count} registros`);
      } catch (e) {
        // Tabela não existe ainda
      }
    }
    
    // Teste 5: Verificar categorias padrão
    try {
      const categoriesResult = await client.query('SELECT COUNT(*) as count FROM categorias');
      console.log(`\n🏷️  Categorias: ${categoriesResult.rows[0].count} cadastradas`);
      
      if (categoriesResult.rows[0].count > 0) {
        const sampleResult = await client.query('SELECT nome FROM categorias LIMIT 3');
        console.log(`  Exemplos: ${sampleResult.rows.map(r => r.nome).join(', ')}...`);
      }
    } catch (e) {
      console.log('⚠️  Tabela "categorias" não encontrada');
    }
    
    // Teste 6: Verificar views
    const viewsResult = await client.query(`
      SELECT viewname 
      FROM pg_views 
      WHERE schemaname = 'public' 
      ORDER BY viewname
    `);
    
    if (viewsResult.rows.length > 0) {
      console.log(`\n👁️  Views encontradas (${viewsResult.rows.length}):`);
      viewsResult.rows.forEach(row => {
        console.log(`  👁️  ${row.viewname}`);
      });
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ CONEXÃO E BANCO DE DADOS VALIDADOS COM SUCESSO!');
    console.log('='.repeat(60));
    console.log('\nPróximos passos:');
    console.log('1. Execute: npm run dev');
    console.log('2. Acesse: http://localhost:3000');
    console.log('3. Teste: http://localhost:3000/api/health');
    
  } catch (error) {
    console.error('\n❌ ERRO NA CONEXÃO:', error.message);
    console.log('\nSolução de problemas:');
    console.log('1. Verifique se PostgreSQL 18 está rodando');
    console.log('2. Confirme credenciais: usuário=postgres, senha=1');
    console.log('3. Banco "mavoai" existe?');
    console.log('4. Porta 5432 está aberta?');
    console.log('\nPara criar o banco manualmente:');
    console.log('1. Abra pgAdmin');
    console.log('2. Conecte como postgres/1');
    console.log('3. Execute: CREATE DATABASE mavoai;');
    console.log('4. Execute o script: scripts/postgres-local-setup.sql');
    
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