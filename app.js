// ==================== SUPABASE CONFIG ====================
const SUPABASE_URL = 'https://netijtuznlvmunvcugvc.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ldGlqdHV6bmx2bXVudmN1Z3ZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5OTczNzksImV4cCI6MjA5NjU3MzM3OX0.hi3T_X4UvMVvRhVCG3VOtfnK4m44cLHuBUEKif0kKe4'

const { createClient } = supabase
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

// ==================== ESTADO LOCAL (cache) ====================
let userData = JSON.parse(localStorage.getItem('userData')) || {
    nome: 'Redação',
    email: '',
    cargo: 'Repórter',
    telefone: '',
    redacao: 'TV Morena / Morena FM',
    notificacoes: true
}

let apuracoes = []
let rondas    = []
let fontes    = []
let feedItems = []

// ==================== INICIALIZAÇÃO ====================
document.addEventListener('DOMContentLoaded', async () => {
    carregarPerfil()
    setupNavegacao()
    await carregarTudo()
    setupRealtimeFeed()
})

async function carregarTudo() {
    await Promise.all([
        carregarApuracoes(),
        carregarRondas(),
        carregarFontes(),
        carregarFeed()
    ])
    updateCounts()
    renderRegistros()
}

// ==================== REALTIME - Feed ao vivo ====================
function setupRealtimeFeed() {
    db.channel('feed-realtime')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'feed_items'
        }, (payload) => {
            // Adiciona novo item ao cache e re-renderiza sem buscar tudo de novo
            feedItems.unshift(payload.new)
            renderFeed()
        })
        .subscribe()
}

// ==================== NAVEGAÇÃO ====================
function setupNavegacao() {
    const menuItems = document.querySelectorAll('.menu-item')
    
    menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault()
            const page = item.getAttribute('data-page')
            
            menuItems.forEach(mi => mi.classList.remove('active'))
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
            
            item.classList.add('active')
            document.getElementById(`page-${page}`).classList.add('active')
        })
    })
}

// ==================== PERFIL (localStorage — dados pessoais do usuário) ====================
function carregarPerfil() {
    document.getElementById('user-name-display').textContent = userData.nome
    document.getElementById('user-role-display').textContent = userData.cargo
    document.getElementById('user-avatar').textContent = getIniciais(userData.nome)
    
    document.getElementById('perfil-nome').value          = userData.nome
    document.getElementById('perfil-email').value         = userData.email
    document.getElementById('perfil-cargo').value         = userData.cargo
    document.getElementById('perfil-telefone').value      = userData.telefone
    document.getElementById('perfil-redacao').value       = userData.redacao
    document.getElementById('perfil-notificacoes').checked = userData.notificacoes
}

function salvarPerfil(event) {
    event.preventDefault()
    
    userData = {
        nome:          document.getElementById('perfil-nome').value,
        email:         document.getElementById('perfil-email').value,
        cargo:         document.getElementById('perfil-cargo').value,
        telefone:      document.getElementById('perfil-telefone').value,
        redacao:       document.getElementById('perfil-redacao').value,
        notificacoes:  document.getElementById('perfil-notificacoes').checked
    }
    
    localStorage.setItem('userData', JSON.stringify(userData))
    carregarPerfil()
    alert('✅ Perfil salvo com sucesso!')
}

function limparDados() {
    if (confirm('⚠️ Tem certeza? Isso apaga apenas seu perfil local. Os dados da redação ficam no servidor.')) {
        localStorage.clear()
        location.reload()
    }
}

function getIniciais(nome) {
    return nome.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)
}

// ==================== APURAÇÕES ====================
async function carregarApuracoes() {
    const { data, error } = await db
        .from('apuracoes')
        .select('*')
        .order('created_at', { ascending: false })
    
    if (error) { console.error('Erro ao carregar apurações:', error); return }
    
    apuracoes = data
    renderApuracoes()
}

function renderApuracoes() {
    const columns = {
        andamento: document.getElementById('column-andamento'),
        quente:    document.getElementById('column-quente'),
        concluida: document.getElementById('column-concluida')
    }
    
    Object.values(columns).forEach(col => col.innerHTML = '')
    
    apuracoes.forEach(apuracao => {
        const col = columns[apuracao.classificacao]
        if (col) col.appendChild(createCard(apuracao))
    })
    
    updateCounts()
}

function createCard(apuracao) {
    const div = document.createElement('div')
    div.className = `card ${apuracao.classificacao}`
    div.innerHTML = `
        <div class="card-title">${apuracao.titulo}</div>
        <div class="card-source">Fonte: ${apuracao.fonte}</div>
        <div class="card-description">${apuracao.descricao}</div>
        <div class="card-meta">
            <span>${formatDate(apuracao.created_at)}</span>
            <span>${apuracao.autor}</span>
        </div>
        <div class="card-actions">
            ${getActionButtons(apuracao)}
        </div>
    `
    return div
}

function getActionButtons(apuracao) {
    if (apuracao.classificacao === 'andamento') {
        return `
            <button class="btn-small" onclick="moveCard(${apuracao.id}, 'quente')">Marcar Factual</button>
            <button class="btn-small" onclick="moveCard(${apuracao.id}, 'concluida')">Concluir</button>
        `
    } else if (apuracao.classificacao === 'quente') {
        return `
            <button class="btn-small" onclick="moveCard(${apuracao.id}, 'andamento')">Voltar</button>
            <button class="btn-small" onclick="moveCard(${apuracao.id}, 'concluida')">Concluir</button>
        `
    } else {
        return `<button class="btn-small" onclick="moveCard(${apuracao.id}, 'andamento')">↻ Reabrir</button>`
    }
}

async function moveCard(id, novaClassificacao) {
    const labels = { andamento: 'Em Andamento', quente: 'Factual', concluida: 'Concluída' }
    const apuracao = apuracoes.find(a => a.id === id)
    if (!apuracao) return
    
    const { error } = await db
        .from('apuracoes')
        .update({ classificacao: novaClassificacao })
        .eq('id', id)
    
    if (error) { alert('Erro ao mover card: ' + error.message); return }
    
    apuracao.classificacao = novaClassificacao
    renderApuracoes()
    await addToFeed(userData.nome, `Moveu "${apuracao.titulo}" para ${labels[novaClassificacao]}`)
}

function openModalApuracao() {
    document.getElementById('modal-apuracao').classList.add('active')
}

async function salvarApuracao(event) {
    event.preventDefault()
    
    const novaApuracao = {
        titulo:         document.getElementById('apuracao-titulo').value,
        fonte:          document.getElementById('apuracao-fonte').value,
        descricao:      document.getElementById('apuracao-descricao').value,
        classificacao:  document.getElementById('apuracao-classificacao').value,
        link:           document.getElementById('apuracao-link').value || null,
        autor:          userData.nome
    }
    
    const { data, error } = await db
        .from('apuracoes')
        .insert([novaApuracao])
        .select()
        .single()
    
    if (error) { alert('Erro ao salvar apuração: ' + error.message); return }
    
    apuracoes.unshift(data)
    renderApuracoes()
    await addToFeed(userData.nome, `Criou nova apuração: "${data.titulo}"`)
    closeModal('modal-apuracao')
    event.target.reset()
}

// ==================== RONDAS ====================
async function carregarRondas() {
    const { data, error } = await db
        .from('rondas')
        .select('*')
        .order('created_at', { ascending: false })
    
    if (error) { console.error('Erro ao carregar rondas:', error); return }
    
    rondas = data
    renderRondas()
}

function renderRondas() {
    const list = document.getElementById('rondas-list')
    if (!list) return
    
    list.innerHTML = ''
    
    const search       = document.getElementById('search-rondas')?.value.toLowerCase() || ''
    const statusFilter = document.getElementById('filter-status')?.value || ''
    
    const filtradas = rondas.filter(r => {
        const matchSearch = r.nome.toLowerCase().includes(search)
        const matchStatus = !statusFilter || r.status === statusFilter
        return matchSearch && matchStatus
    })
    
    if (filtradas.length === 0) {
        list.innerHTML = '<p style="color:#a0aec0;padding:16px;">Nenhuma ronda encontrada.</p>'
        return
    }
    
    filtradas.forEach(ronda => {
        const div = document.createElement('div')
        div.className = 'ronda-item'
        div.innerHTML = `
            <div class="ronda-info">
                <h3>${ronda.nome}</h3>
                <div class="ronda-meta">${ronda.descricao || ''} • ${getPeriodicidadeLabel(ronda.periodicidade)}</div>
            </div>
            <span class="ronda-status ${ronda.status}">${ronda.status.charAt(0).toUpperCase() + ronda.status.slice(1)}</span>
        `
        list.appendChild(div)
    })
}

function getPeriodicidadeLabel(p) {
    const labels = { diaria: 'Diária', semanal: 'Semanal', quinzenal: 'Quinzenal', mensal: 'Mensal', unica: 'Única' }
    return labels[p] || p
}

function openModalRonda() {
    document.getElementById('modal-ronda').classList.add('active')
}

async function salvarRonda(event) {
    event.preventDefault()
    
    const novaRonda = {
        nome:          document.getElementById('ronda-nome').value,
        descricao:     document.getElementById('ronda-descricao').value,
        periodicidade: document.getElementById('ronda-periodicidade').value,
        status:        document.getElementById('ronda-status').value
    }
    
    const { data, error } = await db
        .from('rondas')
        .insert([novaRonda])
        .select()
        .single()
    
    if (error) { alert('Erro ao salvar ronda: ' + error.message); return }
    
    rondas.unshift(data)
    renderRondas()
    closeModal('modal-ronda')
    event.target.reset()
    await addToFeed(userData.nome, `Criou nova ronda: "${data.nome}"`)
}

// ==================== FONTES ====================
async function carregarFontes() {
    const { data, error } = await db
        .from('fontes')
        .select('*')
        .order('created_at', { ascending: false })
    
    if (error) { console.error('Erro ao carregar fontes:', error); return }
    
    fontes = data
    renderFontes()
}

function renderFontes() {
    const list = document.getElementById('fontes-list')
    if (!list) return
    
    list.innerHTML = ''
    
    const search     = document.getElementById('search-fontes')?.value.toLowerCase() || ''
    const tipoFilter = document.getElementById('filter-tipo')?.value || ''
    
    const filtradas = fontes.filter(f => {
        const matchSearch = f.nome.toLowerCase().includes(search)
        const matchTipo   = !tipoFilter || f.tipo === tipoFilter
        return matchSearch && matchTipo
    })
    
    if (filtradas.length === 0) {
        list.innerHTML = '<p style="color:#a0aec0;padding:16px;">Nenhum contato encontrado.</p>'
        return
    }
    
    filtradas.forEach(fonte => {
        const div = document.createElement('div')
        div.className = 'fonte-card'
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
        `
        list.appendChild(div)
    })
}

function getTipoLabel(tipo) {
    const labels = { pessoa: 'Pessoa', orgao: 'Órgão', site: 'Site', 'rede-social': 'Rede Social', documento: 'Documento' }
    return labels[tipo] || tipo
}

function getConfiancaLabel(confianca) {
    const labels = { alta: '🟢 Alta', media: '🟡 Média', baixa: '🔴 Baixa' }
    return labels[confianca]
}

function toggleCampoDocumento() {
    const tipo  = document.getElementById('fonte-tipo').value
    const campo = document.getElementById('campo-documento')
    campo.style.display = tipo === 'documento' ? 'block' : 'none'
}

function openModalFonte() {
    document.getElementById('modal-fonte').classList.add('active')
}

async function salvarFonte(event) {
    event.preventDefault()
    
    const novaFonte = {
        nome:      document.getElementById('fonte-nome').value,
        tipo:      document.getElementById('fonte-tipo').value,
        contato:   document.getElementById('fonte-contato').value,
        confianca: document.getElementById('fonte-confianca').value,
        link:      document.getElementById('fonte-link').value || null,
        obs:       document.getElementById('fonte-obs').value
    }
    
    const { data, error } = await db
        .from('fontes')
        .insert([novaFonte])
        .select()
        .single()
    
    if (error) { alert('Erro ao salvar fonte: ' + error.message); return }
    
    fontes.unshift(data)
    renderFontes()
    closeModal('modal-fonte')
    event.target.reset()
    await addToFeed(userData.nome, `Adicionou nova fonte: "${data.nome}"`)
}

// ==================== REGISTROS ====================
function renderRegistros() {
    const list = document.getElementById('registros-list')
    if (!list) return
    
    list.innerHTML = ''
    
    const ordenadas = [...apuracoes].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    
    ordenadas.forEach(ap => {
        const div = document.createElement('div')
        div.className = 'registro-item'
        div.innerHTML = `
            <div class="registro-header">
                <div class="registro-titulo">${ap.titulo}</div>
                <div class="registro-data">${formatDate(ap.created_at)}</div>
            </div>
            <div>${ap.descricao}</div>
            <div style="margin-top:8px;font-size:12px;color:#718096;">
                Fonte: ${ap.fonte} • Por: ${ap.autor} • Status: ${getClassificacaoLabel(ap.classificacao)}
            </div>
        `
        list.appendChild(div)
    })
}

function getClassificacaoLabel(c) {
    const labels = { andamento: 'Em Andamento', quente: 'Factual', concluida: 'Concluída' }
    return labels[c]
}

function exportarRegistros() {
    const dados = {
        data:      new Date().toISOString(),
        usuario:   userData.nome,
        apuracoes: apuracoes,
        rondas:    rondas,
        fontes:    fontes
    }
    
    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `backup-ronda-${new Date().toISOString().split('T')[0]}.json`
    a.click()
}

// ==================== FEED / MURAL DA REDAÇÃO ====================
async function carregarFeed() {
    const { data, error } = await db
        .from('feed_items')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30)
    
    if (error) { console.error('Erro ao carregar feed:', error); return }
    
    feedItems = data
    renderFeed()
}

function renderFeed() {
    const list = document.getElementById('feed-list')
    if (!list) return
    
    list.innerHTML = ''
    
    feedItems.forEach(item => {
        const div = document.createElement('div')
        div.className = 'feed-item'
        div.innerHTML = `
            <div class="feed-header">
                <span class="feed-author">${item.autor}</span>
                <span class="feed-time">${formatDate(item.created_at)}</span>
            </div>
            <div class="feed-content">${item.conteudo}</div>
            ${item.anexo ? `<div class="feed-attachment">📎 ${item.anexo}</div>` : ''}
        `
        list.appendChild(div)
    })
}

async function addToFeed(autor, conteudo, anexo = null) {
    const novoItem = { autor, conteudo, anexo }
    
    const { error } = await db
        .from('feed_items')
        .insert([novoItem])
    
    if (error) console.error('Erro ao salvar no feed:', error)
    // O realtime listener cuida de atualizar a UI automaticamente
}

// ==================== UTILITÁRIOS ====================
function updateCounts() {
    document.getElementById('count-andamento').textContent = apuracoes.filter(a => a.classificacao === 'andamento').length
    document.getElementById('count-quente').textContent    = apuracoes.filter(a => a.classificacao === 'quente').length
    document.getElementById('count-concluida').textContent = apuracoes.filter(a => a.classificacao === 'concluida').length
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active')
}

function formatDate(dateString) {
    const date    = new Date(dateString)
    const now     = new Date()
    const diff    = now - date
    const minutes = Math.floor(diff / 60000)
    const hours   = Math.floor(diff / 3600000)
    
    if (minutes < 1)  return 'Agora'
    if (minutes < 60) return `${minutes}min atrás`
    if (hours < 24)   return `${hours}h atrás`
    return date.toLocaleDateString('pt-BR')
}

// Fechar modal ao clicar fora
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('active')
    }
}

// Filtros em tempo real
document.addEventListener('input', (e) => {
    if (e.target.id === 'search-rondas' || e.target.id === 'filter-status') renderRondas()
    if (e.target.id === 'search-fontes' || e.target.id === 'filter-tipo')   renderFontes()
})
