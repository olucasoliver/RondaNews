// ==================== DADOS INICIAIS ====================
let userData = JSON.parse(localStorage.getItem('userData')) || {
    nome: 'João Silva',
    email: 'joao@redacao.com',
    cargo: 'Repórter',
    telefone: '',
    redacao: '',
    notificacoes: true
};

let apuracoes = JSON.parse(localStorage.getItem('apuracoes')) || [
    { id: 1, titulo: "Checker Diário Oficial", fonte: "Sindicato", descricao: "Apuração sobre negociação coletiva", classificacao: "andamento", link: "", autor: "Ana Silva", data: new Date(Date.now() - 7200000).toISOString() },
    { id: 2, titulo: "Monitoramento Câmara", fonte: "Prefeitura", descricao: "Acompanhamento de votação", classificacao: "quente", link: "", autor: "Carlos Santos", data: new Date(Date.now() - 3600000).toISOString() },
    { id: 3, titulo: "Verificação de dados", fonte: "Governo", descricao: "Conferência de relatórios", classificacao: "concluida", link: "", autor: "Maria Oliveira", data: new Date(Date.now() - 10800000).toISOString() }
];

let rondas = JSON.parse(localStorage.getItem('rondas')) || [
    { id: 1, nome: "Monitoramento Diário Oficial", descricao: "Acompanhar publicações diárias", periodicidade: "diaria", status: "ativa" },
    { id: 2, nome: "Checagem Semanal", descricao: "Verificação de fontes", periodicidade: "semanal", status: "ativa" }
];

let fontes = JSON.parse(localStorage.getItem('fontes')) || [
    { id: 1, nome: "Sindicato dos Jornalistas", tipo: "orgao", contato: "(11) 3232-3232", confianca: "alta", obs: "Fonte principal" },
    { id: 2, nome: "Portal da Transparência", tipo: "site", contato: "https://transparencia.gov.br", confianca: "alta", obs: "" }
];

let feedItems = JSON.parse(localStorage.getItem('feedItems')) || [
    { id: 1, autor: "Ana Silva", tempo: "2h atrás", conteudo: "Verifiquei datas do relatório preliminar", anexo: "PDF" },
    { id: 2, autor: "Carlos Santos", tempo: "3h atrás", conteudo: "Nova informação confirmada", anexo: null }
];

// ==================== INICIALIZAÇÃO ====================
document.addEventListener('DOMContentLoaded', () => {
    carregarPerfil();
    renderizarTudo();
    setupNavegacao();
});

function renderizarTudo() {
    renderApuracoes();
    renderFeed();
    updateCounts();
    renderRondas();
    renderFontes();
    renderRegistros();
}

// ==================== NAVEGAÇÃO ENTRE PÁGINAS ====================
function setupNavegacao() {
    const menuItems = document.querySelectorAll('.menu-item');
    
    menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.getAttribute('data-page');
            
            // Remove active de todos
            menuItems.forEach(mi => mi.classList.remove('active'));
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            
            // Adiciona active no atual
            item.classList.add('active');
            document.getElementById(`page-${page}`).classList.add('active');
        });
    });
}

// ==================== PERFIL ====================
function carregarPerfil() {
    document.getElementById('user-name-display').textContent = userData.nome;
    document.getElementById('user-role-display').textContent = userData.cargo;
    document.getElementById('user-avatar').textContent = getIniciais(userData.nome);
    
    // Preenche formulário
    document.getElementById('perfil-nome').value = userData.nome;
    document.getElementById('perfil-email').value = userData.email;
    document.getElementById('perfil-cargo').value = userData.cargo;
    document.getElementById('perfil-telefone').value = userData.telefone;
    document.getElementById('perfil-redacao').value = userData.redacao;
    document.getElementById('perfil-notificacoes').checked = userData.notificacoes;
}

function salvarPerfil(event) {
    event.preventDefault();
    
    userData = {
        nome: document.getElementById('perfil-nome').value,
        email: document.getElementById('perfil-email').value,
        cargo: document.getElementById('perfil-cargo').value,
        telefone: document.getElementById('perfil-telefone').value,
        redacao: document.getElementById('perfil-redacao').value,
        notificacoes: document.getElementById('perfil-notificacoes').checked
    };
    
    localStorage.setItem('userData', JSON.stringify(userData));
    carregarPerfil();
    alert('✅ Perfil salvo com sucesso!');
}

function getIniciais(nome) {
    return nome.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
}

function limparDados() {
    if (confirm('⚠️ Tem certeza? Todos os dados serão apagados!')) {
        localStorage.clear();
        location.reload();
    }
}

// ==================== APURAÇÕES ====================
function renderApuracoes() {
    const columns = {
        andamento: document.getElementById('column-andamento'),
        quente: document.getElementById('column-quente'),
        concluida: document.getElementById('column-concluida')
    };
    
    Object.values(columns).forEach(col => col.innerHTML = '');
    
    apuracoes.forEach(apuracao => {
        const card = createCard(apuracao);
        columns[apuracao.classificacao].appendChild(card);
    });
}

function createCard(apuracao) {
    const div = document.createElement('div');
    div.className = `card ${apuracao.classificacao}`;
    div.innerHTML = `
        <div class="card-title">${apuracao.titulo}</div>
        <div class="card-source">Fonte: ${apuracao.fonte}</div>
        <div class="card-description">${apuracao.descricao}</div>
        <div class="card-meta">
            <span>${formatDate(apuracao.data)}</span>
            <span>${apuracao.autor}</span>
        </div>
        <div class="card-actions">
            ${getActionButtons(apuracao)}
        </div>
    `;
    return div;
}

function getActionButtons(apuracao) {
    if (apuracao.classificacao === 'andamento') {
        return `
            <button class="btn-small" onclick="moveCard(${apuracao.id}, 'factual')">Marcar Factual</button>
            <button class="btn-small" onclick="moveCard(${apuracao.id}, 'concluida')">Concluir</button>
        `;
    } else if (apuracao.classificacao === 'factual') {
        return `
            <button class="btn-small" onclick="moveCard(${apuracao.id}, 'andamento')">Voltar</button>
            <button class="btn-small" onclick="moveCard(${apuracao.id}, 'concluida')">Concluir</button>
        `;
    } else {
        return `<button class="btn-small" onclick="moveCard(${apuracao.id}, 'andamento')">↻ Reabrir</button>`;
    }
}

function moveCard(id, novaClassificacao) {
    const apuracao = apuracoes.find(a => a.id === id);
    if (apuracao) {
        const labels = { andamento: 'Em Andamento', quente: 'Pista Quente', concluida: 'Concluída' };
        apuracao.classificacao = novaClassificacao;
        saveData();
        renderApuracoes();
        updateCounts();
        addToFeed(userData.nome, `Moveu "${apuracao.titulo}" para ${labels[novaClassificacao]}`);
    }
}

function openModalApuracao() {
    document.getElementById('modal-apuracao').classList.add('active');
}

function salvarApuracao(event) {
    event.preventDefault();
    
    const novaApuracao = {
        id: Date.now(),
        titulo: document.getElementById('apuracao-titulo').value,
        fonte: document.getElementById('apuracao-fonte').value,
        descricao: document.getElementById('apuracao-descricao').value,
        classificacao: document.getElementById('apuracao-classificacao').value,
        link: document.getElementById('apuracao-link').value,
        autor: userData.nome,
        data: new Date().toISOString()
    };
    
    apuracoes.push(novaApuracao);
    saveData();
    renderApuracoes();
    updateCounts();
    addToFeed(userData.nome, `Criou nova apuração: "${novaApuracao.titulo}"`);
    closeModal('modal-apuracao');
    event.target.reset();
}

// ==================== RONDAS ====================
function renderRondas() {
    const list = document.getElementById('rondas-list');
    if (!list) return;
    
    list.innerHTML = '';
    
    const search = document.getElementById('search-rondas')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('filter-status')?.value || '';
    
    rondas.filter(r => {
        const matchSearch = r.nome.toLowerCase().includes(search);
        const matchStatus = !statusFilter || r.status === statusFilter;
        return matchSearch && matchStatus;
    }).forEach(ronda => {
        const div = document.createElement('div');
        div.className = 'ronda-item';
        div.innerHTML = `
            <div class="ronda-info">
                <h3>${ronda.nome}</h3>
                <div class="ronda-meta">${ronda.descricao} • ${getPeriodicidadeLabel(ronda.periodicidade)}</div>
            </div>
            <span class="ronda-status ${ronda.status}">${ronda.status === 'ativa' ? '✅ Ativa' : '⏸️ Pausada'}</span>
        `;
        list.appendChild(div);
    });
}

function getPeriodicidadeLabel(p) {
    const labels = { diaria: 'Diária', semanal: 'Semanal', quinzenal: 'Quinzenal', mensal: 'Mensal', unica: 'Única' };
    return labels[p];
}

function openModalRonda() {
    document.getElementById('modal-ronda').classList.add('active');
}

function salvarRonda(event) {
    event.preventDefault();
    
    const novaRonda = {
        id: Date.now(),
        nome: document.getElementById('ronda-nome').value,
        descricao: document.getElementById('ronda-descricao').value,
        periodicidade: document.getElementById('ronda-periodicidade').value,
        status: document.getElementById('ronda-status').value
    };
    
    rondas.push(novaRonda);
    localStorage.setItem('rondas', JSON.stringify(rondas));
    renderRondas();
    closeModal('modal-ronda');
    event.target.reset();
    addToFeed(userData.nome, `Criou nova ronda: "${novaRonda.nome}"`);
}

// ==================== FONTES ====================
function renderFontes() {
    const list = document.getElementById('fontes-list');
    if (!list) return;
    
    list.innerHTML = '';
    
    const search = document.getElementById('search-fontes')?.value.toLowerCase() || '';
    const tipoFilter = document.getElementById('filter-tipo')?.value || '';
    
    fontes.filter(f => {
        const matchSearch = f.nome.toLowerCase().includes(search);
        const matchTipo = !tipoFilter || f.tipo === tipoFilter;
        return matchSearch && matchTipo;
    }).forEach(fonte => {
        const div = document.createElement('div');
        div.className = 'fonte-card';
        div.innerHTML = `
            <div class="fonte-header">
                <div class="fonte-nome">${fonte.nome}</div>
                <span class="fonte-tipo">${getTipoLabel(fonte.tipo)}</span>
            </div>
            <div class="fonte-contato">📞 ${fonte.contato || 'Não informado'}</div>
            <div class="fonte-confianca">
                <strong>Confiança:</strong>
                <span class="confianca-${fonte.confianca}">${getConfiancaLabel(fonte.confianca)}</span>
            </div>
            ${fonte.obs ? `<div style="margin-top:8px;font-size:12px;color:#718096;">${fonte.obs}</div>` : ''}
        `;
        list.appendChild(div);
    });
}

function getTipoLabel(tipo) {
    const labels = { pessoa: 'Pessoa', orgao: 'Órgão', site: 'Site', 'rede-social': 'Rede Social', documento: 'Documento' };
    return labels[tipo] || tipo;
}

function getConfiancaLabel(confianca) {
    const labels = { alta: '🟢 Alta', media: '🟡 Média', baixa: '🔴 Baixa' };
    return labels[confianca];
}

function toggleCampoDocumento() {
    const tipo = document.getElementById('fonte-tipo').value;
    const campo = document.getElementById('campo-documento');
    campo.style.display = tipo === 'documento' ? 'block' : 'none';
}

function openModalFonte() {
    document.getElementById('modal-fonte').classList.add('active');
}

function salvarFonte(event) {
    event.preventDefault();
    
    const novaFonte = {
        id: Date.now(),
        nome: document.getElementById('fonte-nome').value,
        tipo: document.getElementById('fonte-tipo').value,
        contato: document.getElementById('fonte-contato').value,
        confianca: document.getElementById('fonte-confianca').value,
        link: document.getElementById('fonte-link').value,
        obs: document.getElementById('fonte-obs').value
    };
    
    fontes.push(novaFonte);
    localStorage.setItem('fontes', JSON.stringify(fontes));
    renderFontes();
    closeModal('modal-fonte');
    event.target.reset();
    addToFeed(userData.nome, `Adicionou nova fonte: "${novaFonte.nome}"`);
}

// ==================== REGISTROS ====================
function renderRegistros() {
    const list = document.getElementById('registros-list');
    if (!list) return;
    
    list.innerHTML = '';
    
    apuracoes.sort((a, b) => new Date(b.data) - new Date(a.data)).forEach(ap => {
        const div = document.createElement('div');
        div.className = 'registro-item';
        div.innerHTML = `
            <div class="registro-header">
                <div class="registro-titulo">${ap.titulo}</div>
                <div class="registro-data">${formatDate(ap.data)}</div>
            </div>
            <div>${ap.descricao}</div>
            <div style="margin-top:8px;font-size:12px;color:#718096;">
                Fonte: ${ap.fonte} • Por: ${ap.autor} • Status: ${getClassificacaoLabel(ap.classificacao)}
            </div>
        `;
        list.appendChild(div);
    });
}

function getClassificacaoLabel(c) {
    const labels = { andamento: 'Em Andamento', quente: 'Pista Quente', concluida: 'Concluída' };
    return labels[c];
}

function exportarRegistros() {
    const dados = {
        data: new Date().toISOString(),
        usuario: userData.nome,
        apuracoes: apuracoes,
        rondas: rondas,
        fontes: fontes
    };
    
    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-ronda-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
}

// ==================== FEED ====================
function renderFeed() {
    const list = document.getElementById('feed-list');
    if (!list) return;
    
    list.innerHTML = '';
    
    feedItems.slice().reverse().forEach(item => {
        const div = document.createElement('div');
        div.className = 'feed-item';
        div.innerHTML = `
            <div class="feed-header">
                <span class="feed-author">${item.autor}</span>
                <span class="feed-time">${item.tempo}</span>
            </div>
            <div class="feed-content">${item.conteudo}</div>
            ${item.anexo ? `<div class="feed-attachment">📎 ${item.anexo}</div>` : ''}
        `;
        list.appendChild(div);
    });
}

function addToFeed(autor, conteudo, anexo = null) {
    const newItem = {
        id: Date.now(),
        autor: autor,
        tempo: "Agora",
        conteudo: conteudo,
        anexo: anexo
    };
    
    feedItems.push(newItem);
    localStorage.setItem('feedItems', JSON.stringify(feedItems));
    renderFeed();
}

// ==================== UTILITÁRIOS ====================
function updateCounts() {
    document.getElementById('count-andamento').textContent = apuracoes.filter(a => a.classificacao === 'andamento').length;
    document.getElementById('count-quente').textContent = apuracoes.filter(a => a.classificacao === 'quente').length;
    document.getElementById('count-concluida').textContent = apuracoes.filter(a => a.classificacao === 'concluida').length;
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function saveData() {
    localStorage.setItem('apuracoes', JSON.stringify(apuracoes));
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 60) return `${minutes}min atrás`;
    if (hours < 24) return `${hours}h atrás`;
    return date.toLocaleDateString('pt-BR');
}

// Fechar modal ao clicar fora
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('active');
    }
}

// Filtros
document.addEventListener('input', (e) => {
    if (e.target.id === 'search-rondas' || e.target.id === 'filter-status') renderRondas();
    if (e.target.id === 'search-fontes' || e.target.id === 'filter-tipo') renderFontes();
});
