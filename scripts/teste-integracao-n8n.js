// Teste de integração n8n - MAVO.AI
const axios = require('axios');
require('dotenv').config({ path: '.env.local' });

console.log('='.repeat(60));
console.log('🧪 TESTE DE INTEGRAÇÃO N8N - MAVO.AI');
console.log('='.repeat(60));

// Configurações
const config = {
  mavoaiUrl: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
  n8nWebhookUrl: process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook-test/03651a89-8f3b-4635-a06d-e97157750352',
  n8nToken: process.env.N8N_WEBHOOK_TOKEN || '9e24439a849860fd74f93190df8b5ebb8c2bc7922beceba5020b8a335f45e3e1',
  willtalkTriageUrl: process.env.WILLTALK_TRIAGE_URL || 'http://localhost:4002/api/webhooks/n8n/ticket-upsert',
  willtalkReplyUrl: process.env.WILLTALK_REPLY_WEBHOOK_URL || 'http://localhost:4002/api/webhooks/cerebro/reply',
  autoReplyEnabled: process.env.WILLTALK_AUTO_REPLY_ENABLED === 'true',
  cerebroToken: process.env.CEREBRO_INTERNAL_TOKEN || 'internal_secret_token_123'
};

console.log('\n📋 CONFIGURAÇÃO:');
console.log(`   MAVO.AI URL: ${config.mavoaiUrl}`);
console.log(`   n8n Webhook: ${config.n8nWebhookUrl}`);
console.log(`   WillTalk Triage: ${config.willtalkTriageUrl}`);
console.log(`   Auto-reply: ${config.autoReplyEnabled ? '✅ HABILITADO' : '❌ DESABILITADO'}`);

// Testar endpoint de ingestão MAVO.AI
async function testarIngestaoMAVOAI() {
  console.log('\n1. 🧪 Testando endpoint de ingestão MAVO.AI...');
  
  const payload = {
    ticket_id: `TEST-N8N-${Date.now()}`,
    cliente: 'Cliente Teste n8n',
    mensagens: 'Impressora térmica não imprime cupom fiscal, apenas faz barulho',
    canal: 'whatsapp',
    tecnico: 'n8n',
    data_evento: new Date().toISOString(),
    cliente_telefone: '5511999999999'
  };
  
  try {
    const response = await axios.post(
      `${config.mavoaiUrl}/api/ingestao/willtalk`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.n8nToken}`
        },
        timeout: 10000
      }
    );
    
    console.log(`   ✅ Status: ${response.status}`);
    console.log(`   📊 Response: ${JSON.stringify(response.data, null, 2)}`);
    return true;
  } catch (error) {
    console.log(`   ❌ Erro: ${error.message}`);
    if (error.response) {
      console.log(`      Status: ${error.response.status}`);
      console.log(`      Data: ${JSON.stringify(error.response.data)}`);
    }
    return false;
  }
}

// Testar webhook n8n (simulado)
async function testarWebhookN8N() {
  console.log('\n2. 🔗 Testando webhook n8n (simulado)...');
  
  const payload = {
    ticket_id: `WT-TEST-${Date.now()}`,
    cliente: 'Teste Integração n8n',
    mensagem: 'Sistema lento para emitir NFC-e, timeout após 30 segundos',
    cliente_telefone: '5511999999999',
    canal: 'whatsapp',
    timestamp: new Date().toISOString()
  };
  
  try {
    const response = await axios.post(
      config.n8nWebhookUrl,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-N8N-Token': config.n8nToken
        },
        timeout: 5000
      }
    );
    
    console.log(`   ✅ Status: ${response.status}`);
    console.log(`   📊 Response: ${response.data}`);
    return true;
  } catch (error) {
    console.log(`   ⚠️  Webhook n8n não respondeu (pode não estar rodando)`);
    console.log(`      Erro: ${error.message}`);
    console.log(`\n   💡 Para testar n8n localmente:`);
    console.log(`      docker run -it --rm --name n8n -p 5678:5678 n8nio/n8n`);
    return false;
  }
}

// Testar endpoint de triagem WillTalk
async function testarTriagemWillTalk() {
  console.log('\n3. 🤖 Testando endpoint de triagem WillTalk...');
  
  const payload = {
    ticketId: `TRIAGE-TEST-${Date.now()}`,
    customerName: 'Cliente Triagem Teste',
    customerPhone: '5511999999999',
    message: 'Balança não conecta ao sistema, erro dispositivo não encontrado',
    channel: 'whatsapp',
    timestamp: new Date().toISOString()
  };
  
  try {
    const response = await axios.post(
      config.willtalkTriageUrl,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.n8nToken}`
        },
        timeout: 5000
      }
    );
    
    console.log(`   ✅ Status: ${response.status}`);
    console.log(`   📊 Response: ${JSON.stringify(response.data, null, 2)}`);
    return true;
  } catch (error) {
    console.log(`   ⚠️  WillTalk não respondeu (pode não estar rodando na porta 4002)`);
    console.log(`      Erro: ${error.message}`);
    return false;
  }
}

// Verificar configuração do ambiente
function verificarConfiguracao() {
  console.log('\n4. ⚙️  Verificando configuração do ambiente...');
  
  const problemas = [];
  
  if (!config.n8nToken || config.n8nToken === '9e24439a849860fd74f93190df8b5ebb8c2bc7922beceba5020b8a335f45e3e1') {
    problemas.push('Token n8n está hardcoded - considere usar variável de ambiente');
  }
  
  if (!config.cerebroToken || config.cerebroToken === 'internal_secret_token_123') {
    problemas.push('Token interno está com valor padrão - altere para produção');
  }
  
  if (!config.autoReplyEnabled) {
    problemas.push('Auto-reply está desabilitado - para testes, defina WILLTALK_AUTO_REPLY_ENABLED=true');
  }
  
  if (problemas.length === 0) {
    console.log('   ✅ Configuração OK');
    return true;
  } else {
    console.log('   ⚠️  Problemas encontrados:');
    problemas.forEach(p => console.log(`      • ${p}`));
    return false;
  }
}

// Executar todos os testes
async function executarTestes() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 EXECUTANDO TESTES DE INTEGRAÇÃO N8N...');
  console.log('='.repeat(60));
  
  const resultados = {
    ingestao: await testarIngestaoMAVOAI(),
    webhook: await testarWebhookN8N(),
    triagem: await testarTriagemWillTalk(),
    config: verificarConfiguracao()
  };
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMO DOS TESTES N8N:');
  console.log('='.repeat(60));
  
  console.log(`\n✅ Ingestão MAVO.AI: ${resultados.ingestao ? 'FUNCIONANDO' : 'FALHOU'}`);
  console.log(`✅ Webhook n8n: ${resultados.webhook ? 'RESPONDE' : 'NÃO RESPONDE'}`);
  console.log(`✅ Triagem WillTalk: ${resultados.triagem ? 'RESPONDE' : 'NÃO RESPONDE'}`);
  console.log(`✅ Configuração: ${resultados.config ? 'OK' : 'PROBLEMAS'}`);
  
  console.log('\n' + '='.repeat(60));
  
  if (resultados.ingestao) {
    console.log('🎯 INTEGRAÇÃO N8N CONFIGURADA!');
    console.log('\n🔧 PRÓXIMOS PASSOS:');
    console.log('   1. Instale e inicie o n8n:');
    console.log('      docker run -it --rm --name n8n -p 5678:5678 n8nio/n8n');
    console.log('   2. Importe o workflow: docs/n8n-workflow-willtalk-ingestao.json');
    console.log('   3. Configure variáveis no n8n:');
    console.log('      • MAVOAI_URL: http://localhost:3000');
    console.log('      • MAVOAI_TOKEN: seu_token');
    console.log('      • WILLTALK_URL: http://localhost:4002');
    console.log('   4. Teste com mensagem real do WhatsApp');
  } else {
    console.log('❌ PROBLEMAS NA INTEGRAÇÃO');
    console.log('\n🔧 SOLUÇÃO:');
    console.log('   • Verifique se MAVO.AI está rodando: npm run dev');
    console.log('   • Verifique se PostgreSQL está rodando');
    console.log('   • Verifique tokens no .env.local');
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('🤖 N8N PRONTO PARA ORQUESTRAR O MAVO.AI!');
  console.log('='.repeat(60));
}

// Executar
executarTestes().catch(console.error);