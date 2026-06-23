/**
 * scripts/update-agent-prompts-v5.mjs  — DEPRECADO
 *
 * Este script mantinha uma SEGUNDA cópia (divergente) dos prompts dos agentes
 * especialistas e os aplicava via API com IDs e token hardcoded. Isso criava
 * duas fontes de verdade que saíam de sincronia.
 *
 * A FONTE CANÔNICA agora é scripts/seed-especialistas.mjs, que:
 *   - grava direto no banco (idempotente, ON CONFLICT por domínio);
 *   - inclui prompts + keywords + prioridade de TODOS os 6 agentes;
 *   - não depende de token de API hardcoded.
 *
 * Para semear/atualizar os prompts, rode:
 *     node scripts/seed-especialistas.mjs
 */

console.error(
  [
    "",
    "⚠️  update-agent-prompts-v5.mjs foi DEPRECADO.",
    "    A fonte canônica dos prompts é scripts/seed-especialistas.mjs.",
    "",
    "    Rode:  node scripts/seed-especialistas.mjs",
    "",
  ].join("\n"),
)
process.exit(1)
