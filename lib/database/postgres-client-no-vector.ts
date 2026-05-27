import { Pool } from 'pg';

// Configuração para PostgreSQL 18 local SEM extensão vector
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:1@localhost:5433/mavoai',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Tipos para o sistema (sem embedding)
export interface Atendimento {
  id: string;
  ticket_externo?: string;
  canal?: string;
  cliente: string;
  tecnico: string;
  data_atendimento: Date;
  texto_original: string;
  resumo_problema?: string;
  resumo?: string;
  categoria?: string;
  problema?: string;
  causa?: string;
  solucao?: string;
  embedding?: Buffer | number[]; // Buffer para BYTEA, array para vector
  processado: boolean;
  created_at: Date;
  updated_at: Date;
  categoria_id?: string;
}

export interface Categoria {
  id: string;
  nome: string;
  descricao?: string;
  created_at: Date;
}

export interface IngestaoLog {
  id: string;
  origem: string;
  status: string;
  payload?: any;
  detalhes?: any;
  created_at: Date;
}

// Funções CRUD básicas
export async function query(text: string, params?: any[]) {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

export async function getAtendimentos(limit = 50, offset = 0) {
  const result = await query(
    `SELECT * FROM atendimentos 
     ORDER BY created_at DESC 
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return result.rows;
}

export async function getAtendimentoById(id: string) {
  const result = await query(
    'SELECT * FROM atendimentos WHERE id = $1',
    [id]
  );
  return result.rows[0];
}

export async function createAtendimento(data: Partial<Atendimento>) {
  const result = await query(
    `INSERT INTO atendimentos (
      cliente, tecnico, texto_original, categoria,
      problema, causa, solucao, processado
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`,
    [
      data.cliente,
      data.tecnico,
      data.texto_original,
      data.categoria,
      data.problema,
      data.causa,
      data.solucao,
      data.processado || false
    ]
  );
  return result.rows[0];
}

export async function updateAtendimento(id: string, data: Partial<Atendimento>) {
  const fields = [];
  const values = [];
  let paramCount = 1;

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && key !== 'id') {
      fields.push(`${key} = $${paramCount}`);
      values.push(value);
      paramCount++;
    }
  }

  if (fields.length === 0) {
    return getAtendimentoById(id);
  }

  values.push(id);
  const queryText = `
    UPDATE atendimentos 
    SET ${fields.join(', ')} 
    WHERE id = $${paramCount} 
    RETURNING *
  `;

  const result = await query(queryText, values);
  return result.rows[0];
}

export async function deleteAtendimento(id: string) {
  const result = await query(
    'DELETE FROM atendimentos WHERE id = $1 RETURNING *',
    [id]
  );
  return result.rows[0];
}

export async function getCategorias() {
  const result = await query(
    'SELECT * FROM categorias ORDER BY nome'
  );
  return result.rows;
}

export async function getDashboardMetrics() {
  const result = await query(`
    SELECT 
      COUNT(*) as total_atendimentos,
      COUNT(DISTINCT cliente) as clientes_unicos,
      COUNT(DISTINCT tecnico) as tecnicos_ativos,
      COUNT(*) FILTER (WHERE processado = true) as atendimentos_processados,
      0 as atendimentos_com_embedding, -- Sem vector
      COUNT(DISTINCT categoria) as categorias_utilizadas,
      MIN(created_at) as primeiro_atendimento,
      MAX(created_at) as ultimo_atendimento
    FROM atendimentos
  `);
  return result.rows[0];
}

// Busca textual (substitui busca semântica sem vector)
export async function buscarTextual(queryText: string, limit = 5) {
  const result = await query(
    `SELECT * FROM buscar_atendimentos_simples($1, $2)`,
    [queryText, limit]
  );
  return result.rows;
}

// Busca full-text (mais avançada)
export async function buscarFullText(queryText: string, limit = 3) {
  try {
    const result = await query(
      `SELECT * FROM buscar_atendimentos_textual($1, $2)`,
      [queryText, limit]
    );
    return result.rows;
  } catch {
    // Fallback para busca simples se full-text não funcionar
    return buscarTextual(queryText, limit);
  }
}

// Busca por similaridade textual (LIKE em múltiplos campos)
export async function buscarSimilaridade(queryText: string, limit = 5) {
  const result = await query(
    `SELECT 
      id,
      COALESCE(resumo_problema, problema, resumo, LEFT(texto_original, 200)) as resumo_problema,
      causa,
      solucao,
      categoria,
      texto_original,
      created_at
    FROM atendimentos 
    WHERE 
      texto_original ILIKE '%' || $1 || '%' OR
      problema ILIKE '%' || $1 || '%' OR
      solucao ILIKE '%' || $1 || '%' OR
      causa ILIKE '%' || $1 || '%' OR
      categoria ILIKE '%' || $1 || '%'
    ORDER BY created_at DESC
    LIMIT $2`,
    [queryText, limit]
  );
  return result.rows;
}

// Estatísticas por categoria
export async function getCategoriaStats() {
  const result = await query(`
    SELECT 
      COALESCE(categoria, 'Não categorizado') AS categoria,
      COUNT(*) AS total,
      ROUND(COUNT(*) * 100.0 / NULLIF((SELECT COUNT(*) FROM atendimentos), 0), 2) AS percentual,
      AVG(LENGTH(texto_original))::INT AS avg_tamanho_texto,
      MIN(created_at) AS primeiro,
      MAX(created_at) AS ultimo
    FROM atendimentos
    GROUP BY categoria
    ORDER BY total DESC
  `);
  return result.rows;
}

// Testar conexão
export async function testConnection() {
  try {
    const result = await query('SELECT NOW() as time, version() as version');
    
    // Verificar se temos as funções de busca
    const functionsResult = await query(`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_schema = 'public' 
      AND routine_name LIKE 'buscar_atendimentos_%'
    `);
    
    const hasSearchFunctions = functionsResult.rows.length > 0;
    
    return {
      success: true,
      time: result.rows[0].time,
      version: result.rows[0].version,
      hasSearchFunctions,
      searchFunctions: functionsResult.rows.map(r => r.routine_name)
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}

// Verificar estrutura do banco
export async function checkDatabaseStructure() {
  try {
    const tablesResult = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    const atendimentosColumns = await query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'atendimentos' 
      AND table_schema = 'public'
      ORDER BY ordinal_position
    `);
    
    const hasEmbeddingColumn = atendimentosColumns.rows.some(
      (col: any) => col.column_name === 'embedding'
    );
    
    return {
      tables: tablesResult.rows.map((r: any) => r.table_name),
      atendimentosColumns: atendimentosColumns.rows,
      hasEmbeddingColumn,
      status: hasEmbeddingColumn ? 'COM_VECTOR' : 'SEM_VECTOR'
    };
  } catch (error: any) {
    return {
      error: error.message,
      status: 'ERROR'
    };
  }
}

const postgresClientNoVector = {
  query,
  getAtendimentos,
  getAtendimentoById,
  createAtendimento,
  updateAtendimento,
  deleteAtendimento,
  getCategorias,
  getDashboardMetrics,
  buscarTextual,
  buscarFullText,
  buscarSimilaridade,
  getCategoriaStats,
  testConnection,
  checkDatabaseStructure
};

export default postgresClientNoVector;
