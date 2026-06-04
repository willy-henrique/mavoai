/**
 * GET /api/v2/cerebro/openapi
 *
 * Retorna a especificação OpenAPI 3.1 completa da API do Cérebro Mavo AI.
 * Sem autenticação — é documentação pública.
 */

import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const base = `${url.protocol}//${url.host}`

  const spec = {
    openapi: "3.1.0",
    info: {
      title: "Mavo AI — Cérebro API",
      version: "2.0.0",
      description:
        "API completa do Cérebro Operacional Mavo AI. Cobre ingestão de dados, busca semântica RAG, " +
        "orquestrador multiagente WillTalk, configuração de agentes e gestão de conhecimento.",
      contact: { email: "dev@mavo.ai" },
    },
    servers: [{ url: base, description: "Servidor atual" }],

    components: {
      securitySchemes: {
        BearerInternal: {
          type: "http",
          scheme: "bearer",
          description: "Token interno admin: CEREBRO_INTERNAL_TOKEN",
        },
        BearerApiKey: {
          type: "http",
          scheme: "bearer",
          description: "API Key do tenant: gerada via POST /api/v1/keys",
        },
        BearerIngest: {
          type: "http",
          scheme: "bearer",
          description: "Token de ingestão: CEREBRO_INGEST_TOKEN",
        },
      },
      schemas: {
        AgentId: {
          type: "string",
          enum: ["orchestrator", "triage", "investigation", "resolution", "vision", "curator", "handoff"],
        },
        AgentConfig: {
          type: "object",
          properties: {
            agent_id: { $ref: "#/components/schemas/AgentId" },
            tenant_id: { type: "string" },
            enabled: { type: "boolean" },
            system_prompt: { type: "string", nullable: true },
            params: { type: "object", description: "Parâmetros específicos do agente" },
            defaults: { type: "object", description: "Valores padrão imutáveis" },
            updated_at: { type: "string", format: "date-time" },
          },
        },
        TrainingExample: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            agent_id: { $ref: "#/components/schemas/AgentId" },
            tenant_id: { type: "string" },
            label: { type: "string", nullable: true },
            input: { type: "string" },
            expected_output: { type: "string", nullable: true },
            notes: { type: "string", nullable: true },
            active: { type: "boolean" },
            created_at: { type: "string", format: "date-time" },
          },
        },
        SearchResult: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            resumo_problema: { type: "string" },
            causa: { type: "string", nullable: true },
            solucao: { type: "string", nullable: true },
            similaridade: { type: "number", minimum: 0, maximum: 1 },
            estrategia: { type: "string", enum: ["vetorial", "textual"] },
          },
        },
        HealthStatus: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["healthy", "degraded", "unhealthy"] },
            postgres: { type: "boolean" },
            groq: { type: "boolean" },
            embedding: { type: "boolean" },
            checks: {
              type: "object",
              properties: {
                postgres: { type: "object", properties: { ok: { type: "boolean" }, latency_ms: { type: "number" } } },
                ai_chat: { type: "object", properties: { ok: { type: "boolean" }, provider: { type: "string" }, model: { type: "string" }, latency_ms: { type: "number" } } },
                embedding: { type: "object", properties: { ok: { type: "boolean" }, latency_ms: { type: "number" } } },
              },
            },
          },
        },
        Error: {
          type: "object",
          properties: { error: { type: "string" }, message: { type: "string" } },
        },
      },
    },

    paths: {
      // ── Saúde & Diagnóstico ────────────────────────────────────────────────────
      "/api/health": {
        get: {
          tags: ["Sistema"],
          summary: "Health check completo",
          description: "Verifica PostgreSQL, LLM (Groq/xAI) e Embedding. Latência incluída.",
          responses: {
            "200": {
              description: "Status dos serviços",
              content: { "application/json": { schema: { $ref: "#/components/schemas/HealthStatus" } } },
            },
          },
        },
      },
      "/api/metricas": {
        get: {
          tags: ["Sistema"],
          summary: "Métricas operacionais",
          description: "Total de atendimentos, processados, pendentes, cobertura de embedding, últimas ingestões.",
          responses: {
            "200": { description: "Objeto de métricas" },
          },
        },
      },
      "/api/config": {
        get: {
          tags: ["Sistema"],
          summary: "Configuração do sistema",
          description: "Retorna variáveis de ambiente públicas e feature flags.",
          responses: {
            "200": { description: "Config do sistema" },
          },
        },
      },

      // ── Ingestão ───────────────────────────────────────────────────────────────
      "/api/ingestao/willtalk": {
        post: {
          tags: ["Ingestão"],
          summary: "Ingestão de ticket WillTalk",
          security: [{ BearerIngest: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["ticket_id", "cliente", "mensagem"],
                  properties: {
                    ticket_id: { type: "string" },
                    cliente: { type: "string" },
                    tecnico: { type: "string" },
                    mensagem: { type: "string" },
                    canal: { type: "string" },
                    organization_id: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Atendimento processado" },
            "401": { description: "Não autorizado", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/api/v1/ingest": {
        post: {
          tags: ["Ingestão"],
          summary: "Ingestão v1 (multiformat)",
          security: [{ BearerApiKey: [] }],
          description: "Recebe registros de qualquer fonte (ticket, chat, documento). Aceita batch.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["records"],
                  properties: {
                    records: { type: "array", items: { type: "object" } },
                    tenant_id: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Registros processados" },
            "401": { description: "Não autorizado" },
          },
        },
      },

      // ── Busca & RAG ────────────────────────────────────────────────────────────
      "/api/busca-semantica": {
        post: {
          tags: ["Busca & RAG"],
          summary: "Busca semântica (legacy)",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["texto"],
                  properties: {
                    texto: { type: "string" },
                    limite: { type: "integer", default: 5 },
                    tenant_id: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Resultados semânticos",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      resultados: { type: "array", items: { $ref: "#/components/schemas/SearchResult" } },
                      tipo_busca: { type: "string", enum: ["semantica", "textual"] },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/v1/search": {
        post: {
          tags: ["Busca & RAG"],
          summary: "Busca semântica v1",
          security: [{ BearerApiKey: [] }],
          description: "Busca vetorial ou textual com suporte a multi-tenant e filtros.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["query"],
                  properties: {
                    query: { type: "string" },
                    tenant_id: { type: "string" },
                    limit: { type: "integer", default: 5, maximum: 20 },
                    strategy: { type: "string", enum: ["auto", "semantic", "textual"], default: "auto" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Resultados e estratégia usada" },
          },
        },
      },
      "/api/resposta-assistida": {
        post: {
          tags: ["Busca & RAG"],
          summary: "Resposta assistida (RAG + LLM)",
          description: "Gera resposta textual enriquecida com contexto da base de conhecimento.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["pergunta"],
                  properties: {
                    pergunta: { type: "string" },
                    tenant_id: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Resposta gerada + fontes" },
          },
        },
      },
      "/api/v1/query": {
        post: {
          tags: ["Busca & RAG"],
          summary: "Query conversacional v1",
          security: [{ BearerApiKey: [] }],
          description: "RAG completo com histórico de conversa e resposta em streaming ou JSON.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["message"],
                  properties: {
                    message: { type: "string" },
                    conversation_id: { type: "string" },
                    tenant_id: { type: "string" },
                    stream: { type: "boolean", default: false },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Resposta + fontes + conversation_id" },
          },
        },
      },

      // ── Orquestrador ───────────────────────────────────────────────────────────
      "/api/orquestrador/v1/mensagem": {
        post: {
          tags: ["Orquestrador"],
          summary: "Processa mensagem via orquestrador multiagente",
          security: [{ BearerIngest: [] }],
          description:
            "Ponto de entrada principal do WillTalk. Executa o pipeline completo: " +
            "seleção de empresa → menu → triagem → investigação → resolução autônoma (N tentativas) → handoff humano.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["platform", "organization_id", "event_id", "conversation_id", "cliente", "mensagem", "business_hours_open", "conversation", "queues"],
                  properties: {
                    platform: { type: "string", example: "willtalk" },
                    organization_id: { type: "string" },
                    event_id: { type: "string" },
                    conversation_id: { type: "string" },
                    cliente: {
                      type: "object",
                      properties: { nome: { type: "string" }, telefone: { type: "string" } },
                    },
                    mensagem: { type: "string" },
                    media_url: { type: "string", nullable: true },
                    mime_type: { type: "string", nullable: true },
                    business_hours_open: { type: "boolean" },
                    conversation: {
                      type: "object",
                      description: "Estado persistido da conversa entre chamadas",
                    },
                    queues: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          menu_option: { type: "integer" },
                          name: { type: "string" },
                          is_active: { type: "boolean" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Resultado do orquestrador",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      reply_text: { type: "string" },
                      triage_completed: { type: "boolean" },
                      queue_id: { type: "string", nullable: true },
                      reason: { type: "string" },
                      agent_handoff_summary: { type: "string", nullable: true },
                      resolution_active: { type: "boolean" },
                      resolution_attempts: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
      },

      // ── Agentes — Configuração & Treinamento ───────────────────────────────────
      "/api/v1/agents": {
        get: {
          tags: ["Agentes"],
          summary: "Lista todos os agentes com config atual",
          security: [{ BearerInternal: [] }],
          parameters: [{ name: "tenant_id", in: "query", schema: { type: "string" }, description: "ID do tenant (default: 'default')" }],
          responses: {
            "200": {
              description: "Lista de agentes",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      agents: { type: "array", items: { $ref: "#/components/schemas/AgentConfig" } },
                      total: { type: "integer" },
                      active: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/v1/agents/{agentId}": {
        get: {
          tags: ["Agentes"],
          summary: "Retorna config do agente",
          security: [{ BearerInternal: [] }],
          parameters: [
            { name: "agentId", in: "path", required: true, schema: { $ref: "#/components/schemas/AgentId" } },
            { name: "tenant_id", in: "query", schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Config atual + defaults", content: { "application/json": { schema: { $ref: "#/components/schemas/AgentConfig" } } } },
            "404": { description: "Agente não encontrado" },
          },
        },
        put: {
          tags: ["Agentes"],
          summary: "Atualiza config do agente (PATCH semântico)",
          security: [{ BearerInternal: [] }],
          parameters: [
            { name: "agentId", in: "path", required: true, schema: { $ref: "#/components/schemas/AgentId" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    tenant_id: { type: "string" },
                    enabled: { type: "boolean" },
                    system_prompt: { type: "string", nullable: true, description: "null para remover o override" },
                    params: { type: "object", description: "Apenas os campos que deseja sobrescrever" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Config atualizada" },
          },
        },
        delete: {
          tags: ["Agentes"],
          summary: "Restaura defaults (remove config do banco)",
          security: [{ BearerInternal: [] }],
          parameters: [
            { name: "agentId", in: "path", required: true, schema: { $ref: "#/components/schemas/AgentId" } },
            { name: "tenant_id", in: "query", schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Config removida, defaults restaurados" },
          },
        },
      },
      "/api/v1/agents/{agentId}/test": {
        post: {
          tags: ["Agentes"],
          summary: "Executa agente com input de teste (playground)",
          security: [{ BearerInternal: [] }],
          parameters: [
            { name: "agentId", in: "path", required: true, schema: { $ref: "#/components/schemas/AgentId" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["message"],
                  properties: {
                    message: { type: "string", description: "Mensagem de entrada para o agente" },
                    tenant_id: { type: "string" },
                    queue_name: { type: "string", description: "Para agentes de resolução" },
                    queues: { type: "array", description: "Para agente de triagem" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Resultado do agente",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      agent_id: { type: "string" },
                      output: { type: "object" },
                      latency_ms: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/v1/agents/{agentId}/training": {
        get: {
          tags: ["Agentes"],
          summary: "Lista exemplos de treinamento do agente",
          security: [{ BearerInternal: [] }],
          parameters: [
            { name: "agentId", in: "path", required: true, schema: { $ref: "#/components/schemas/AgentId" } },
            { name: "tenant_id", in: "query", schema: { type: "string" } },
            { name: "include_inactive", in: "query", schema: { type: "boolean" } },
          ],
          responses: {
            "200": {
              description: "Exemplos de treinamento",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      examples: { type: "array", items: { $ref: "#/components/schemas/TrainingExample" } },
                      total: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ["Agentes"],
          summary: "Adiciona exemplo de treinamento",
          security: [{ BearerInternal: [] }],
          parameters: [
            { name: "agentId", in: "path", required: true, schema: { $ref: "#/components/schemas/AgentId" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["input"],
                  properties: {
                    input: { type: "string", description: "Exemplo de entrada" },
                    expected_output: { type: "string", description: "Saída esperada (para fine-tuning futuro)" },
                    label: { type: "string", description: "Rótulo curto do exemplo" },
                    notes: { type: "string" },
                    tenant_id: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Exemplo criado" },
          },
        },
      },
      "/api/v1/agents/{agentId}/training/{exampleId}": {
        put: {
          tags: ["Agentes"],
          summary: "Edita exemplo de treinamento",
          security: [{ BearerInternal: [] }],
          parameters: [
            { name: "agentId", in: "path", required: true, schema: { $ref: "#/components/schemas/AgentId" } },
            { name: "exampleId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/TrainingExample" } } } },
          responses: { "200": { description: "Exemplo atualizado" } },
        },
        delete: {
          tags: ["Agentes"],
          summary: "Desativa exemplo de treinamento (soft-delete)",
          security: [{ BearerInternal: [] }],
          parameters: [
            { name: "agentId", in: "path", required: true, schema: { $ref: "#/components/schemas/AgentId" } },
            { name: "exampleId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: { "200": { description: "Exemplo desativado" } },
        },
      },

      // ── Conhecimento ───────────────────────────────────────────────────────────
      "/api/knowledge/text": {
        post: {
          tags: ["Conhecimento"],
          summary: "Importa texto para a base RAG",
          security: [{ BearerInternal: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["text"],
                  properties: {
                    text: { type: "string" },
                    tenant_id: { type: "string" },
                    category: { type: "string" },
                    source: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Texto indexado" } },
        },
      },
      "/api/knowledge/upload": {
        post: {
          tags: ["Conhecimento"],
          summary: "Upload de arquivo (PDF, TXT) para a base RAG",
          security: [{ BearerInternal: [] }],
          requestBody: {
            required: true,
            content: { "multipart/form-data": { schema: { type: "object", properties: { file: { type: "string", format: "binary" }, tenant_id: { type: "string" } } } } },
          },
          responses: { "200": { description: "Arquivo indexado" } },
        },
      },
      "/api/knowledge/stats": {
        get: {
          tags: ["Conhecimento"],
          summary: "Estatísticas da base RAG",
          security: [{ BearerInternal: [] }],
          responses: { "200": { description: "Total de chunks, cobertura de embedding, por tenant" } },
        },
      },

      // ── API Keys ───────────────────────────────────────────────────────────────
      "/api/v1/keys": {
        get: {
          tags: ["API Keys"],
          summary: "Lista API keys do tenant",
          security: [{ BearerInternal: [] }],
          parameters: [{ name: "tenant_id", in: "query", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Lista de keys (sem o token bruto)" } },
        },
        post: {
          tags: ["API Keys"],
          summary: "Cria nova API key",
          security: [{ BearerInternal: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["tenant_id", "name"],
                  properties: {
                    tenant_id: { type: "string" },
                    name: { type: "string" },
                    scopes: { type: "array", items: { type: "string" }, default: ["query", "search"] },
                    rate_limit_per_min: { type: "integer", default: 60 },
                    expires_at: { type: "string", format: "date-time", nullable: true },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Key criada — token bruto retornado UMA vez" },
          },
        },
        delete: {
          tags: ["API Keys"],
          summary: "Desativa API key",
          security: [{ BearerInternal: [] }],
          parameters: [{ name: "id", in: "query", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Key desativada" } },
        },
      },

      // ── Feedback & Curadoria ───────────────────────────────────────────────────
      "/api/v1/feedback": {
        post: {
          tags: ["Feedback"],
          summary: "Registra feedback de resolução",
          security: [{ BearerApiKey: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["conversation_id", "resolution_worked"],
                  properties: {
                    conversation_id: { type: "string" },
                    resolution_worked: { type: "boolean" },
                    notes: { type: "string" },
                    tenant_id: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Feedback registrado" } },
        },
      },
      "/api/v1/curator": {
        post: {
          tags: ["Feedback"],
          summary: "Curadoria manual de conversa",
          security: [{ BearerInternal: [] }],
          description: "Extrai problema/causa/solução de uma conversa e indexa na base RAG.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["conversation_id"],
                  properties: {
                    conversation_id: { type: "string" },
                    tenant_id: { type: "string" },
                    force: { type: "boolean", default: false },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Curadoria executada" } },
        },
      },
    },

    tags: [
      { name: "Sistema", description: "Health, métricas e configuração do sistema" },
      { name: "Ingestão", description: "Entrada de dados (tickets, chats, documentos)" },
      { name: "Busca & RAG", description: "Busca semântica e geração aumentada por recuperação" },
      { name: "Orquestrador", description: "Pipeline multiagente WillTalk" },
      { name: "Agentes", description: "Configuração, treinamento e teste dos agentes do Cérebro" },
      { name: "Conhecimento", description: "Gestão da base de conhecimento RAG" },
      { name: "API Keys", description: "Gestão de chaves de acesso externas" },
      { name: "Feedback", description: "Feedback de resolução e curadoria automática" },
    ],
  }

  return NextResponse.json(spec, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  })
}
