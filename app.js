// ==================== SUPABASE CONFIG ====================
const SUPABASE_URL = 'https://netijtuznlvmunvcugvc.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ldGlqdHV6bmx2bXVudmN1Z3ZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5OTczNzksImV4cCI6MjA5NjU3MzM3OX0.hi3T_X4UvMVvRhVCG3VOtfnK4m44cLHuBUEKif0kKe4'

const { createClient } = supabase
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

// ==================== ESTADO ====================
let currentUser      = null
let userData         = {}
let apuracoes        = []
let rondas           = []
let fontes           = []
let feedItems        = []
let editandoId       = null
let editandoFonteId  = null
let editandoRondaId  = null
let paginaAtual      = 0
const POR_PAGINA     = 20

// ==================== INICIALIZAÇÃO ====================
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await db.auth.getSession()
    if (session) { currentUser = session.user; await iniciarApp() }
    else mostrarTela('tela-login')

    db.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN')  { currentUser = session.user; await iniciarApp() }
        if (event === 'SIGNED_OUT') { currentUser = null; mostrarTela('tela-login') }
    })
})

async function iniciarApp() {
    const salvo = JSON.parse(localStorage.getItem(`userData_${currentUser.id}`)) || {}
    userData = {
        nome:         salvo.nome         || currentUser.user_metadata?.nome || currentUser.email.split('@')[0],
        email:        currentUser.email,
        cargo:        salvo.cargo        || 'Repórter',
        telefone:     salvo.telefone     || '',
        redacao:      salvo.redacao      || '',
        notificacoes: salvo.notificacoes !== undefined ? salvo.notificacoes : true
    }
    mostrarTela('tela-app')
    carregarPerfil()
    setupNavegacao()
    await carregarTudo()
    setupRealtime()
    pedirPermissaoNotificacao()
}

// ==================== CONTROLE DE TELAS ====================
function mostrarTela(id) {
    document.querySelectorAll('.tela').forEach(t => t.classList.remove('active'))
    document.getElementById(id).classList.add('active')
}

// ==================== AUTH ====================
async function fazerLogin(event) {
    event.preventDefault()
    const email = document.getElementById('login-email').value
    const senha = document.getElementById('login-senha').value
    const btn   = document.getElementById('btn-login')
    const erro  = document.getElementById('login-erro')
    btn.textContent = 'Entrando...'; btn.disabled = true; erro.textContent = ''
    const { error } = await db.auth.signInWithPassword({ email, password: senha })
    if (error) { erro.textContent = traduzirErroAuth(error.message); btn.textContent = 'Entrar'; btn.disabled = false }
}

async function fazerCadastro(event) {
    event.preventDefault()
    const nome  = document.getElementById('cadastro-nome').value
    const email = document.getElementById('cadastro-email').value
    const senha = document.getElementById('cadastro-senha').value
    const btn   = document.getElementById('btn-cadastro')
    const erro  = document.getElementById('cadastro-erro')
    const ok    = document.getElementById('cadastro-ok')
    btn.textContent = 'Criando conta...'; btn.disabled = true; erro.textContent = ''; ok.textContent = ''
    const { data, error } = await db.auth.signUp({ email, password: senha, options: { data: { nome } } })
    if (error) { erro.textContent = traduzirErroAuth(error.message); btn.textContent = 'Criar conta'; btn.disabled = false; return }
    if (data.user) localStorage.setItem(`userData_${data.user.id}`, JSON.stringify({ nome, cargo: 'Repórter', redacao: '' }))
    ok.textContent = '✅ Conta criada! Já pode entrar.'; btn.textContent = 'Criar conta'; btn.disabled = false
}

async function fazerLogout() { await db.auth.signOut() }

function traduzirErroAuth(msg) {
    if (msg.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.'
    if (msg.includes('Email not confirmed'))        return 'Confirme seu e-mail antes de entrar.'
    if (msg.includes('User already registered'))    return 'Este e-mail já está cadastrado.'
    if (msg.includes('Password should be'))         return 'A senha deve ter pelo menos 6 caracteres.'
    return msg
}

function alternarParaCadastro() { mostrarTela('tela-cadastro') }
function alternarParaLogin()    { mostrarTela('tela-login') }

// ==================== NOTIFICAÇÕES DO NAVEGADOR ====================
function pedirPermissaoNotificacao() {
    if (!('Notification' in window)) return
    if (Notification.permission === 'default') {
        Notification.requestPermission()
    }
}

function dispararNotificacao(titulo, corpo) {
    if (!('Notification' in window)) return
    if (Notification.permission !== 'granted') return
    if (document.hasFocus()) return // só notifica se a aba estiver em segundo plano
    new Notification(titulo, { body: corpo, icon: '📋' })
}

// ==================== REALTIME ====================
function setupRealtime() {
    db.channel('feed-realtime')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'feed_items' }, (payload) => {
            if (!feedItems.find(f => f.id === payload.new.id)) {
                feedItems.unshift(payload.new)
                renderFeed()
                // Notifica posts manuais de outros usuários
                if (payload.new.autor !== userData.nome) {
                    dispararNotificacao('Mural da Redação', `${payload.new.autor}: ${payload.new.conteudo}`)
                }
            }
        }).subscribe()

    db.channel('apuracoes-insert')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'apuracoes' }, (payload) => {
            if (!apuracoes.find(a => a.id === payload.new.id)) {
                apuracoes.unshift(payload.new)
                atualizarFiltroAutores()
                renderApuracoes(); renderRegistros()
                // Notifica nova apuração urgente ou qualquer nova de outro usuário
                if (payload.new.autor !== userData.nome) {
                    const prefixo = payload.new.urgente ? '🔴 URGENTE — ' : ''
                    dispararNotificacao(`${prefixo}Nova apuração`, `${payload.new.autor}: ${payload.new.titulo}`)
                }
            }
        }).subscribe()

    db.channel('apuracoes-update')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'apuracoes' }, (payload) => {
            const idx = apuracoes.findIndex(a => a.id === payload.new.id)
            if (idx !== -1) { apuracoes[idx] = payload.new; renderApuracoes(); renderRegistros() }
        }).subscribe()

    db.channel('apuracoes-delete')
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'apuracoes' }, (payload) => {
            apuracoes = apuracoes.filter(a => a.id !== payload.old.id)
            atualizarFiltroAutores()
            renderApuracoes(); renderRegistros()
        }).subscribe()
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

// ==================== PERFIL ====================
function carregarPerfil() {
    document.getElementById('user-name-display').textContent = userData.nome
    document.getElementById('user-role-display').textContent = userData.cargo
    document.getElementById('user-avatar').textContent       = getIniciais(userData.nome)
    document.getElementById('perfil-nome').value             = userData.nome
    document.getElementById('perfil-email').value            = userData.email
    document.getElementById('perfil-cargo').value            = userData.cargo
    document.getElementById('perfil-telefone').value         = userData.telefone
    document.getElementById('perfil-redacao').value          = userData.redacao
    document.getElementById('perfil-notificacoes').checked   = userData.notificacoes
}

function salvarPerfil(event) {
    event.preventDefault()
    userData = {
        nome:         document.getElementById('perfil-nome').value,
        email:        userData.email,
        cargo:        document.getElementById('perfil-cargo').value,
        telefone:     document.getElementById('perfil-telefone').value,
        redacao:      document.getElementById('perfil-redacao').value,
        notificacoes: document.getElementById('perfil-notificacoes').checked
    }
    localStorage.setItem(`userData_${currentUser.id}`, JSON.stringify(userData))
    carregarPerfil()
    alert('✅ Perfil salvo!')
}

function limparDados() {
    if (confirm('Apagar seu perfil local? Os dados da redação ficam no servidor.')) {
        localStorage.removeItem(`userData_${currentUser.id}`)
        location.reload()
    }
}

function getIniciais(nome) {
    return nome.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)
}

// ==================== CARREGAMENTO GERAL ====================
async function carregarTudo() {
    await Promise.all([carregarApuracoes(), carregarRondas(), carregarFontes(), carregarFeed()])
    updateCounts()
    renderRegistros()
    atualizarFiltroAutores()
}

// ==================== APURAÇÕES ====================
async function carregarApuracoes() {
    const { data, error } = await db.from('apuracoes').select('*').order('created_at', { ascending: false })
    if (error) { console.error(error); return }
    apuracoes = data
    renderApuracoes()
}

function atualizarFiltroAutores() {
    const select = document.getElementById('filter-autor')
    if (!select) return
    const autores = [...new Set(apuracoes.map(a => a.autor))].sort()
    const atual   = select.value
    select.innerHTML = '<option value="">Todos os autores</option>'
    autores.forEach(a => {
        const opt = document.createElement('option')
        opt.value = a; opt.textContent = a
        if (a === atual) opt.selected = true
        select.appendChild(opt)
    })
}

function renderApuracoes() {
    const autorFiltro  = document.getElementById('filter-autor')?.value || ''
    const buscaKanban  = document.getElementById('search-kanban')?.value.toLowerCase() || ''
    const columns = {
        andamento: document.getElementById('column-andamento'),
        quente:    document.getElementById('column-quente'),
        concluida: document.getElementById('column-concluida')
    }
    Object.values(columns).forEach(col => col.innerHTML = '')

    let visiveis = apuracoes
    if (autorFiltro) visiveis = visiveis.filter(a => a.autor === autorFiltro)
    if (buscaKanban) visiveis = visiveis.filter(a =>
        a.titulo.toLowerCase().includes(buscaKanban) ||
        a.descricao.toLowerCase().includes(buscaKanban) ||
        a.fonte.toLowerCase().includes(buscaKanban)
    )

    // Urgentes sempre primeiro
    visiveis = [...visiveis].sort((a, b) => (b.urgente ? 1 : 0) - (a.urgente ? 1 : 0))

    const fatia = visiveis.slice(0, (paginaAtual + 1) * POR_PAGINA)
    fatia.forEach(ap => {
        const col = columns[ap.classificacao]
        if (col) col.appendChild(createCard(ap))
    })

    const kanban = document.querySelector('.kanban-board')
    kanban?.querySelector('.btn-carregar-mais')?.remove()
    if (visiveis.length > fatia.length) {
        const btn = document.createElement('button')
        btn.className   = 'btn-secondary btn-carregar-mais'
        btn.textContent = `Carregar mais (${visiveis.length - fatia.length} restantes)`
        btn.style.cssText = 'width:100%;margin-top:12px;font-size:12px;grid-column:1/-1;'
        btn.onclick = () => { paginaAtual++; renderApuracoes() }
        kanban?.appendChild(btn)
    }

    updateCounts(visiveis)
}

function createCard(ap) {
    const div = document.createElement('div')
    div.className = `card ${ap.classificacao}${ap.urgente ? ' urgente' : ''}`

    const tempoParado  = ap.classificacao !== 'concluida' ? getTempoParado(ap.created_at) : null
    const alertaParado = tempoParado && tempoParado.horas >= 4
        ? `<div class="card-alerta">⚠️ Parado há ${tempoParado.texto}</div>`
        : tempoParado
            ? `<div class="card-tempo-parado">🕐 ${tempoParado.texto} sem movimentação</div>`
            : ''

    const badgeUrgente = ap.urgente ? `<span class="badge-urgente">🔴 URGENTE</span>` : ''

    div.innerHTML = `
        <div class="card-title">${badgeUrgente}${ap.titulo}</div>
        <div class="card-source">Fonte: ${ap.fonte}</div>
        <div class="card-description">${ap.descricao}</div>
        ${alertaParado}
        <div class="card-meta">
            <span>${formatDate(ap.created_at)}</span>
            <span>${ap.autor}</span>
        </div>
        <div class="card-actions">
            ${getActionButtons(ap)}
            <button class="btn-small btn-editar" onclick="abrirEdicao(${ap.id})">✏️ Editar</button>
            <button class="btn-small btn-deletar" onclick="deletarApuracao(${ap.id}, '${ap.titulo.replace(/'/g, "\\'")}')">🗑️</button>
        </div>
    `
    return div
}

function getTempoParado(created_at) {
    const diff  = Date.now() - new Date(created_at)
    const horas = Math.floor(diff / 3600000)
    const dias  = Math.floor(horas / 24)
    if (horas < 1) return null
    return { horas, texto: dias >= 1 ? `${dias}d` : `${horas}h` }
}

function getActionButtons(ap) {
    if (ap.classificacao === 'andamento') return `
        <button class="btn-small" onclick="moveCard(${ap.id}, 'quente')">Marcar Factual</button>
        <button class="btn-small" onclick="confirmarConcluir(${ap.id})">Concluir</button>`
    if (ap.classificacao === 'quente') return `
        <button class="btn-small" onclick="moveCard(${ap.id}, 'andamento')">Voltar</button>
        <button class="btn-small" onclick="confirmarConcluir(${ap.id})">Concluir</button>`
    return `<button class="btn-small" onclick="moveCard(${ap.id}, 'andamento')">↻ Reabrir</button>`
}

function confirmarConcluir(id) {
    const ap = apuracoes.find(a => a.id === id)
    if (!ap) return
    if (confirm(`Marcar "${ap.titulo}" como Concluída?`)) moveCard(id, 'concluida')
}

async function moveCard(id, novaClassificacao) {
    const labels   = { andamento: 'Em Andamento', quente: 'Factual', concluida: 'Concluída' }
    const apuracao = apuracoes.find(a => a.id === id)
    if (!apuracao) return
    const { error } = await db.from('apuracoes').update({ classificacao: novaClassificacao }).eq('id', id)
    if (error) { alert('Erro: ' + error.message); return }
    apuracao.classificacao = novaClassificacao
    renderApuracoes()
    await addToFeed(userData.nome, `Moveu "${apuracao.titulo}" para ${labels[novaClassificacao]}`)
}

function openModalApuracao() {
    editandoId = null
    document.getElementById('form-apuracao').reset()
    document.getElementById('apuracao-urgente').checked          = false
    document.getElementById('modal-apuracao-titulo').textContent = 'Novo Registro de Apuração'
    document.getElementById('btn-salvar-apuracao').textContent   = 'Salvar Registro'
    document.getElementById('modal-apuracao').classList.add('active')
}

function abrirEdicao(id) {
    const ap = apuracoes.find(a => a.id === id)
    if (!ap) return
    editandoId = id
    document.getElementById('apuracao-titulo').value            = ap.titulo
    document.getElementById('apuracao-fonte').value             = ap.fonte
    document.getElementById('apuracao-descricao').value         = ap.descricao
    document.getElementById('apuracao-classificacao').value     = ap.classificacao
    document.getElementById('apuracao-link').value              = ap.link || ''
    document.getElementById('apuracao-urgente').checked         = ap.urgente || false
    document.getElementById('modal-apuracao-titulo').textContent = 'Editar Apuração'
    document.getElementById('btn-salvar-apuracao').textContent   = 'Salvar Alterações'
    document.getElementById('modal-apuracao').classList.add('active')
}

async function salvarApuracao(event) {
    event.preventDefault()
    const dados = {
        titulo:        document.getElementById('apuracao-titulo').value,
        fonte:         document.getElementById('apuracao-fonte').value,
        descricao:     document.getElementById('apuracao-descricao').value,
        classificacao: document.getElementById('apuracao-classificacao').value,
        link:          document.getElementById('apuracao-link').value || null,
        urgente:       document.getElementById('apuracao-urgente').checked
    }
    if (editandoId) {
        const { data, error } = await db.from('apuracoes').update(dados).eq('id', editandoId).select().single()
        if (error) { alert('Erro ao editar: ' + error.message); return }
        const idx = apuracoes.findIndex(a => a.id === editandoId)
        if (idx !== -1) apuracoes[idx] = data
        await addToFeed(userData.nome, `Editou a apuração: "${data.titulo}"`)
    } else {
        dados.autor = userData.nome
        const { data, error } = await db.from('apuracoes').insert([dados]).select().single()
        if (error) { alert('Erro ao salvar: ' + error.message); return }
        apuracoes.unshift(data)
        atualizarFiltroAutores()
        const prefixo = dados.urgente ? '🔴 URGENTE — ' : ''
        await addToFeed(userData.nome, `${prefixo}Criou nova apuração: "${data.titulo}"`)
    }
    renderApuracoes(); renderRegistros()
    closeModal('modal-apuracao'); event.target.reset(); editandoId = null
}

async function deletarApuracao(id, titulo) {
    if (!confirm(`Deletar "${titulo}"? Esta ação não pode ser desfeita.`)) return
    const { error } = await db.from('apuracoes').delete().eq('id', id)
    if (error) { alert('Erro ao deletar: ' + error.message); return }
    apuracoes = apuracoes.filter(a => a.id !== id)
    atualizarFiltroAutores(); renderApuracoes(); renderRegistros()
    await addToFeed(userData.nome, `Removeu a apuração: "${titulo}"`)
}

// ==================== RONDAS ====================
async function carregarRondas() {
    const { data, error } = await db.from('rondas').select('*').order('created_at', { ascending: false })
    if (error) { console.error(error); return }
    rondas = data; renderRondas()
}

function renderRondas() {
    const list = document.getElementById('rondas-list')
    if (!list) return
    list.innerHTML = ''
    const search = document.getElementById('search-rondas')?.value.toLowerCase() || ''
    const filtro = document.getElementById('filter-status')?.value || ''
    const filtradas = rondas.filter(r => r.nome.toLowerCase().includes(search) && (!filtro || r.status === filtro))
    if (!filtradas.length) { list.innerHTML = '<p style="color:#a0aec0;padding:16px;">Nenhuma ronda encontrada.</p>'; return }
    filtradas.forEach(ronda => {
        const div = document.createElement('div')
        div.className = 'ronda-item'
        div.innerHTML = `
            <div class="ronda-info">
                <h3>${ronda.nome}</h3>
                <div class="ronda-meta">${ronda.descricao || ''} • ${getPeriodicidadeLabel(ronda.periodicidade)}</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
                <span class="ronda-status ${ronda.status}">${ronda.status.charAt(0).toUpperCase() + ronda.status.slice(1)}</span>
                <button class="btn-small btn-editar" onclick="abrirEdicaoRonda(${ronda.id})">✏️</button>
                <button class="btn-small btn-deletar" onclick="deletarRonda(${ronda.id}, '${ronda.nome.replace(/'/g, "\\'")}')">🗑️</button>
            </div>
        `
        list.appendChild(div)
    })
}

function getPeriodicidadeLabel(p) {
    return { diaria: 'Diária', semanal: 'Semanal', quinzenal: 'Quinzenal', mensal: 'Mensal', unica: 'Única' }[p] || p
}

function openModalRonda() {
    editandoRondaId = null
    document.getElementById('form-ronda').reset()
    document.getElementById('modal-ronda-titulo').textContent = 'Nova Ronda de Apuração'
    document.getElementById('btn-salvar-ronda').textContent   = 'Criar Ronda'
    document.getElementById('modal-ronda').classList.add('active')
}

function abrirEdicaoRonda(id) {
    const ronda = rondas.find(r => r.id === id)
    if (!ronda) return
    editandoRondaId = id
    document.getElementById('ronda-nome').value          = ronda.nome
    document.getElementById('ronda-descricao').value     = ronda.descricao || ''
    document.getElementById('ronda-periodicidade').value = ronda.periodicidade
    document.getElementById('ronda-status').value        = ronda.status
    document.getElementById('modal-ronda-titulo').textContent = 'Editar Ronda'
    document.getElementById('btn-salvar-ronda').textContent   = 'Salvar Alterações'
    document.getElementById('modal-ronda').classList.add('active')
}

async function salvarRonda(event) {
    event.preventDefault()
    const dados = {
        nome:          document.getElementById('ronda-nome').value,
        descricao:     document.getElementById('ronda-descricao').value,
        periodicidade: document.getElementById('ronda-periodicidade').value,
        status:        document.getElementById('ronda-status').value
    }
    if (editandoRondaId) {
        const { data, error } = await db.from('rondas').update(dados).eq('id', editandoRondaId).select().single()
        if (error) { alert('Erro ao editar: ' + error.message); return }
        const idx = rondas.findIndex(r => r.id === editandoRondaId)
        if (idx !== -1) rondas[idx] = data
        await addToFeed(userData.nome, `Editou a ronda: "${data.nome}"`)
    } else {
        const { data, error } = await db.from('rondas').insert([dados]).select().single()
        if (error) { alert('Erro: ' + error.message); return }
        rondas.unshift(data)
        await addToFeed(userData.nome, `Criou nova ronda: "${data.nome}"`)
    }
    renderRondas(); closeModal('modal-ronda'); event.target.reset(); editandoRondaId = null
}

async function deletarRonda(id, nome) {
    if (!confirm(`Deletar a ronda "${nome}"? Esta ação não pode ser desfeita.`)) return
    const { error } = await db.from('rondas').delete().eq('id', id)
    if (error) { alert('Erro ao deletar: ' + error.message); return }
    rondas = rondas.filter(r => r.id !== id); renderRondas()
    await addToFeed(userData.nome, `Removeu a ronda: "${nome}"`)
}

// ==================== FONTES ====================
async function carregarFontes() {
    const { data, error } = await db.from('fontes').select('*').order('created_at', { ascending: false })
    if (error) { console.error(error); return }
    fontes = data; renderFontes()
}

function renderFontes() {
    const list = document.getElementById('fontes-list')
    if (!list) return
    list.innerHTML = ''
    const search = document.getElementById('search-fontes')?.value.toLowerCase() || ''
    const filtro = document.getElementById('filter-tipo')?.value || ''
    const filtradas = fontes.filter(f => f.nome.toLowerCase().includes(search) && (!filtro || f.tipo === filtro))
    if (!filtradas.length) { list.innerHTML = '<p style="color:#a0aec0;padding:16px;">Nenhum contato encontrado.</p>'; return }
    filtradas.forEach(fonte => {
        const div = document.createElement('div')
        div.className = 'fonte-card'
        div.innerHTML = `
            <div class="fonte-header">
                <div class="fonte-nome">${fonte.nome}</div>
                <span class="fonte-tipo">${getTipoLabel(fonte.tipo)}</span>
            </div>
            <div class="fonte-contato">📞 ${fonte.contato || 'Não informado'}</div>
            <div class="fonte-confianca"><strong>Confiança:</strong> <span class="confianca-${fonte.confianca}">${getConfiancaLabel(fonte.confianca)}</span></div>
            ${fonte.obs ? `<div style="margin-top:8px;font-size:12px;color:#718096;">${fonte.obs}</div>` : ''}
            <div class="card-actions" style="margin-top:12px;">
                <button class="btn-small btn-editar" onclick="abrirEdicaoFonte(${fonte.id})">✏️ Editar</button>
                <button class="btn-small btn-deletar" onclick="deletarFonte(${fonte.id}, '${fonte.nome.replace(/'/g, "\\'")}')">🗑️</button>
            </div>
        `
        list.appendChild(div)
    })
}

function getTipoLabel(tipo) {
    return { pessoa: 'Pessoa', orgao: 'Órgão', site: 'Site', 'rede-social': 'Rede Social', documento: 'Documento' }[tipo] || tipo
}

function getConfiancaLabel(c) {
    return { alta: '🟢 Alta', media: '🟡 Média', baixa: '🔴 Baixa' }[c]
}

function toggleCampoDocumento() {
    document.getElementById('campo-documento').style.display =
        document.getElementById('fonte-tipo').value === 'documento' ? 'block' : 'none'
}

function openModalFonte() {
    editandoFonteId = null
    document.getElementById('form-fonte').reset()
    document.getElementById('campo-documento').style.display  = 'none'
    document.getElementById('modal-fonte-titulo').textContent = 'Novo Contato/Fonte'
    document.getElementById('btn-salvar-fonte').textContent   = 'Salvar Contato'
    document.getElementById('modal-fonte').classList.add('active')
}

function abrirEdicaoFonte(id) {
    const fonte = fontes.find(f => f.id === id)
    if (!fonte) return
    editandoFonteId = id
    document.getElementById('fonte-nome').value      = fonte.nome
    document.getElementById('fonte-tipo').value      = fonte.tipo
    document.getElementById('fonte-contato').value   = fonte.contato || ''
    document.getElementById('fonte-confianca').value = fonte.confianca
    document.getElementById('fonte-link').value      = fonte.link || ''
    document.getElementById('fonte-obs').value       = fonte.obs || ''
    document.getElementById('campo-documento').style.display  = fonte.tipo === 'documento' ? 'block' : 'none'
    document.getElementById('modal-fonte-titulo').textContent = 'Editar Contato/Fonte'
    document.getElementById('btn-salvar-fonte').textContent   = 'Salvar Alterações'
    document.getElementById('modal-fonte').classList.add('active')
}

async function salvarFonte(event) {
    event.preventDefault()
    const dados = {
        nome:      document.getElementById('fonte-nome').value,
        tipo:      document.getElementById('fonte-tipo').value,
        contato:   document.getElementById('fonte-contato').value,
        confianca: document.getElementById('fonte-confianca').value,
        link:      document.getElementById('fonte-link').value || null,
        obs:       document.getElementById('fonte-obs').value
    }
    if (editandoFonteId) {
        const { data, error } = await db.from('fontes').update(dados).eq('id', editandoFonteId).select().single()
        if (error) { alert('Erro ao editar: ' + error.message); return }
        const idx = fontes.findIndex(f => f.id === editandoFonteId)
        if (idx !== -1) fontes[idx] = data
        await addToFeed(userData.nome, `Atualizou contato: "${data.nome}"`)
    } else {
        const { data, error } = await db.from('fontes').insert([dados]).select().single()
        if (error) { alert('Erro ao salvar: ' + error.message); return }
        fontes.unshift(data)
        await addToFeed(userData.nome, `Adicionou nova fonte: "${data.nome}"`)
    }
    renderFontes(); closeModal('modal-fonte'); event.target.reset(); editandoFonteId = null
}

async function deletarFonte(id, nome) {
    if (!confirm(`Deletar "${nome}"? Esta ação não pode ser desfeita.`)) return
    const { error } = await db.from('fontes').delete().eq('id', id)
    if (error) { alert('Erro ao deletar: ' + error.message); return }
    fontes = fontes.filter(f => f.id !== id); renderFontes()
    await addToFeed(userData.nome, `Removeu o contato: "${nome}"`)
}

// ==================== REGISTROS ====================
function renderRegistros() {
    const list = document.getElementById('registros-list')
    if (!list) return
    list.innerHTML = ''
    ;[...apuracoes].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).forEach(ap => {
        const div = document.createElement('div')
        div.className = 'registro-item'
        div.innerHTML = `
            <div class="registro-header">
                <div class="registro-titulo">${ap.urgente ? '🔴 ' : ''}${ap.titulo}</div>
                <div class="registro-data">${formatDate(ap.created_at)}</div>
            </div>
            <div>${ap.descricao}</div>
            <div style="margin-top:8px;font-size:12px;color:#718096;">
                Fonte: ${ap.fonte} • Por: ${ap.autor} • Status: ${{ andamento: 'Em Andamento', quente: 'Factual', concluida: 'Concluída' }[ap.classificacao]}
            </div>
        `
        list.appendChild(div)
    })
}

function exportarRegistros() {
    const blob = new Blob([JSON.stringify({ data: new Date().toISOString(), usuario: userData.nome, apuracoes, rondas, fontes }, null, 2)], { type: 'application/json' })
    const a    = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `backup-ronda-${new Date().toISOString().split('T')[0]}.json` })
    a.click()
}

// ==================== FEED ====================
async function carregarFeed() {
    const { data, error } = await db.from('feed_items').select('*').order('created_at', { ascending: false }).limit(30)
    if (error) { console.error(error); return }
    feedItems = data; renderFeed()
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
    const { error } = await db.from('feed_items').insert([{ autor, conteudo, anexo }])
    if (error) console.error(error)
}

async function postarNoMural(event) {
    event.preventDefault()
    const input = document.getElementById('mural-input')
    const texto = input.value.trim()
    if (!texto) return
    await addToFeed(userData.nome, texto)
    input.value = ''
}

// ==================== UTILITÁRIOS ====================
function updateCounts(lista) {
    const base = lista || apuracoes
    document.getElementById('count-andamento').textContent = base.filter(a => a.classificacao === 'andamento').length
    document.getElementById('count-quente').textContent    = base.filter(a => a.classificacao === 'quente').length
    document.getElementById('count-concluida').textContent = base.filter(a => a.classificacao === 'concluida').length
}

function closeModal(id) { document.getElementById(id).classList.remove('active') }

function formatDate(ds) {
    const d = new Date(ds), now = new Date(), diff = now - d
    const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000)
    if (m < 1)  return 'Agora'
    if (m < 60) return `${m}min atrás`
    if (h < 24) return `${h}h atrás`
    return d.toLocaleDateString('pt-BR')
}

window.onclick = e => { if (e.target.classList.contains('modal')) e.target.classList.remove('active') }

document.addEventListener('input', e => {
    if (e.target.id === 'search-rondas'  || e.target.id === 'filter-status') renderRondas()
    if (e.target.id === 'search-fontes'  || e.target.id === 'filter-tipo')   renderFontes()
    if (e.target.id === 'filter-autor'   || e.target.id === 'search-kanban') { paginaAtual = 0; renderApuracoes() }
})
