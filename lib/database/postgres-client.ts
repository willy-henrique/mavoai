import { Pool } from 'pg';

// Configuração para PostgreSQL 18 local
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:1@localhost:5433/mavoai',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Tipos para o sistema
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
  embedding?: number[];
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
      COUNT(*) FILTER (WHERE embedding IS NOT NULL) as atendimentos_com_embedding,
      COUNT(DISTINCT categoria) as categorias_utilizadas,
      MIN(created_at) as primeiro_atendimento,
      MAX(created_at) as ultimo_atendimento
    FROM atendimentos
  `);
  return result.rows[0];
}

export async function buscarSemantica(queryEmbedding: number[], limit = 3) {
  const result = await query(
    `SELECT * FROM buscar_atendimentos_semanticos($1, $2)`,
    [`[${queryEmbedding.join(',')}]`, limit]
  );
  return result.rows;
}

// Testar conexão
export async function testConnection() {
  try {
    const result = await query('SELECT NOW() as time, version() as version');
    return {
      success: true,
      time: result.rows[0].time,
      version: result.rows[0].version
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}

const postgresClient = {
  query,
  getAtendimentos,
  getAtendimentoById,
  createAtendimento,
  updateAtendimento,
  deleteAtendimento,
  getCategorias,
  getDashboardMetrics,
  buscarSemantica,
  testConnection
};

export default postgresClient;
