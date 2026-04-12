<p align="center">
  <img src="favicon.png" alt="Pilates Manager Logo" width="120"/>
</p>

<h1 align="center">Sistema de Gestão - Pilates Manager - Dr. Giovana</h1>

<p align="center">
  <img src="https://img.shields.io/badge/Status-Concluído-success?style=for-the-badge&logo=check" alt="Status">
  <img src="https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white" alt="HTML5">
  <img src="https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white" alt="CSS3">
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript">
</p>

<p align="center">
  <b>🚀 Acesse o sistema online: <a href="https://rvitorfb.github.io/sistema-pilates-maneger/">Pilates Manager Online</a></b>
</p>

<p align="center">
  Um sistema web completo, responsivo e de alta performance criado para a gestão de estúdios de Pilates. <br>Desenvolvido com foco no controle de agenda, evolução clínica de pacientes e gestão financeira, operando 100% localmente no navegador.
</p>

<hr>

## ✨ Funcionalidades

<table>
  <tr>
    <td>👥 <b>Gestão de Alunos</b></td>
    <td>Cadastro completo de alunos, controle de planos e frequência semanal (1x, 2x ou 3x), com cálculo automático baseado na tabela de mensalidades.</td>
  </tr>
  <tr>
    <td>⏱️ <b>Painel Ao Vivo</b></td>
    <td>Monitoramento em tempo real das aulas atuais e futuras. Controle ágil de presenças (P/F), sincronização instantânea de reposições e sistema para adiantar turmas.</td>
  </tr>
  <tr>
    <td>📅 <b>Agenda Dinâmica</b></td>
    <td>Configuração de turmas com limites fixos de alunos. Sistema inteligente de <b>Reposições e Extras</b> que permite alocações sob demanda, independentes da lotação fixa da turma.</td>
  </tr>
  <tr>
    <td>📈 <b>Evolução Clínica</b></td>
    <td>Prontuário detalhado em linha do tempo (timeline) para cada aluno, com filtro por período e geração de relatórios mensais em PDF otimizados para impressão.</td>
  </tr>
  <tr>
    <td>💰 <b>Controle Financeiro</b></td>
    <td>Gestão de status de pagamentos (Pago, Pendente, Atrasado) categorizados por mês de referência, com tabela de preços global configurável e exportação em PDF.</td>
  </tr>
  <tr>
    <td>💾 <b>Backup Local e JSON</b></td>
    <td>Banco de dados embarcado via <b>IndexedDB</b> garantindo velocidade extrema e persistência, com ferramenta integrada para exportar e importar toda a base de dados em <code>.json</code>.</td>
  </tr>
</table>

## 📱 Destaque Técnico: Relatórios Nativos e Arquitetura

O sistema resolve um problema clássico da geração de relatórios clínicos no navegador utilizando <b>CSS Print Media Queries</b> (`@media print`). A interface da aplicação é totalmente reestruturada na hora da impressão, ocultando menus e botões. Além disso, a regra `@page { margin: 0; }` foi aplicada para forçar a remoção de metadados indesejados gerados pelo navegador (como link da página, data e número de folhas), entregando um PDF extremamente limpo e profissional gerado 100% no *client-side*. 

A arquitetura <b>Offline-First</b> baseada em banco de dados NoSQL (IndexedDB) elimina a latência de requisições web, tornando o sistema ultrarrápido.

## 🚀 Como Executar o Projeto

Por ser um sistema *Single Page Application* (SPA) estático, você não precisa de um servidor complexo ou banco de dados rodando por trás.

### 🌐 Demo Online
O sistema está disponível para uso imediato em: [https://rvitorfb.github.io/sistema-pilates-maneger/](https://rvitorfb.github.io/sistema-pilates-maneger/)

### 💻 Execução Local
1. Faça o clone deste repositório:
   ```bash
   git clone [https://github.com/RVitorFb/pilates-manager.git](https://github.com/RVitorFb/pilates-manager.git)
   ```
2. Navegue até a pasta do projeto.
3. Abra o arquivo `index.html` diretamente em qualquer navegador moderno (Chrome, Edge, Firefox).

---
**Desenvolvido por [Raul Vitor](https://github.com/RVitorFb)**
