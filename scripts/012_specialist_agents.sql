-- ============================================================
-- 012_specialist_agents.sql
-- Agentes especialistas por domínio — roteados pelo IA Router
-- ============================================================

CREATE TABLE IF NOT EXISTS public.specialist_agents (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      TEXT        NOT NULL DEFAULT 'auge',
  domain         TEXT        NOT NULL,    -- 'tef','pdv','fiscal','estoque','hardware','geral'
  name           TEXT        NOT NULL,
  description    TEXT,
  system_prompt  TEXT        NOT NULL DEFAULT '',
  keywords       TEXT[]      NOT NULL DEFAULT '{}',
  -- Override de modelo (NULL = usa o config global)
  model_base_url TEXT,
  model_name     TEXT,
  -- Prioridade maior = preferido em caso de empate
  priority       INT         NOT NULL DEFAULT 0,
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, domain)
);

CREATE INDEX IF NOT EXISTS specialist_agents_tenant_idx
  ON public.specialist_agents (tenant_id, is_active);

-- Seed com agentes padrão para tenant auge
INSERT INTO public.specialist_agents (tenant_id, domain, name, description, keywords, priority)
VALUES
  ('auge', 'fiscal',    'Agente Fiscal',        'NF-e, NFC-e, SEFAZ, certificado digital, rejeições fiscais', ARRAY['nfe','nfce','nota fiscal','sefaz','certificado','rejeição','danfe','xml','cfop','cst','icms'], 10),
  ('auge', 'pdv',       'Agente PDV',           'Frente de caixa, cupom, sangria, suprimento, impressora fiscal', ARRAY['pdv','caixa','cupom','sangria','suprimento','ecf','sat','mfe','impressora','bematech'], 10),
  ('auge', 'tef',       'Agente TEF',           'Terminal de pagamento, operadora, Stone, Cielo, GetNet, GP', ARRAY['tef','stone','cielo','getnet','gp','pagamento','cartão','pinpad','adquirente','gerenciador'], 10),
  ('auge', 'estoque',   'Agente Estoque',       'Inventário, movimentações, grade, saldo, entrada de mercadoria', ARRAY['estoque','inventário','produto','grade','saldo','ncm','ean','entrada','saída','transferência'], 8),
  ('auge', 'hardware',  'Agente Hardware',      'Equipamentos, balança, leitor, impressora, computador, rede', ARRAY['impressora','balança','leitor','scanner','computador','rede','driver','usb','serial','suporte'], 8),
  ('auge', 'integracao','Agente Integração',    'APIs, webhooks, sincronização entre sistemas', ARRAY['api','webhook','integração','sincronização','erp','xml','json','rest','sefaz web'], 7)
ON CONFLICT (tenant_id, domain) DO NOTHING;
